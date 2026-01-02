import { z } from 'zod'
import { ComponentContext } from './context'
import { getNextInstanceId, popIdContext, pushIdContext } from './id'
import { tracker } from './tracker'
import type {
  ComponentNode,
  Simplify,
  ToPropsSignal,
  ToReader,
  ToSignal,
  VNode,
} from './types'

export class ComponentBuilder<P = {}, S = {}, D = {}, H = {}> {
  private schema?: z.ZodObject<any>
  private states: Array<{ key: string; valueOrFn: any }> = []
  private deriveds: Array<{ key: string; depKeys: string[]; fn: Function }> = []
  private handlers: Array<{ key: string; depKeys: string[]; fn: Function }> = []
  private renderFn?: (args: any) => VNode

  constructor(public name: string) {}

  props<T extends z.ZodRawShape>(shape: T) {
    this.schema = z.object(shape)
    return this as unknown as ComponentBuilder<z.infer<z.ZodObject<T>>, S, D, H>
  }

  state<K extends string, V>(
    key: K,
    valueOrFn: V | ((props: ToPropsSignal<P>) => V)
  ) {
    this.states.push({ key, valueOrFn })
    return this as unknown as ComponentBuilder<
      P,
      Simplify<S & Record<K, V>>,
      D,
      H
    >
  }

  derived<K extends string, V, DepKeys extends (keyof (S & D))[]>(
    key: K,
    depKeys: [...DepKeys],
    fn: (
      scope: ToReader<Simplify<Pick<S & D, DepKeys[number]>>> & {
        props: ToPropsSignal<P>
      }
    ) => V
  ) {
    this.deriveds.push({ key, depKeys: depKeys as string[], fn })
    return this as unknown as ComponentBuilder<
      P,
      S,
      Simplify<D & Record<K, V>>,
      H
    >
  }

  handler<K extends string, DepKeys extends (keyof (S & D))[]>(
    key: K,
    depKeys: [...DepKeys],
    fn: (
      scope: Simplify<Pick<ToSignal<S> & ToReader<D>, DepKeys[number]>> & {
        props: ToPropsSignal<P>
      }
    ) => void
  ) {
    this.handlers.push({ key, depKeys: depKeys as string[], fn })
    return this as unknown as ComponentBuilder<
      P,
      S,
      D,
      Simplify<H & Record<K, Function>>
    >
  }

  render(
    fn: (args: {
      state: ToReader<Simplify<S & D>>
      handlers: H
      props: ToPropsSignal<P>
    }) => VNode
  ): ComponentContext {
    this.renderFn = fn
    // ルート解析
    const context = this.buildInstance({}, true)
    // @ts-expect-error
    context.__quix_builder = this
    return context
  }

  buildInstance(inputProps: any, isRoot = false): ComponentContext {
    // 1. Zod バリデーション用のアンラップ
    const peekProps: any = {}
    for (const key of Object.keys(inputProps)) {
      const val = inputProps[key]
      // バリデーションのために一時的に実行。trackerを黙らせて副作用を防ぐ
      peekProps[key] =
        typeof val === 'function' ? tracker.silence(() => val()) : val
    }

    // バリデーション実行（Root時はスキップ）
    const validatedProps =
      this.schema && !isRoot ? this.schema.parse(peekProps) : peekProps

    // 2. ID コンテキスト管理
    pushIdContext(this.name)
    const instanceId = isRoot ? '' : getNextInstanceId(this.name)
    const context = new ComponentContext(this.name, instanceId)

    // 3. Props Proxy (実行時に親のシグナルを叩く)
    const propsProxy = new Proxy(
      {},
      {
        get: (_, key: string) => () => {
          const val = inputProps[key]
          return typeof val === 'function' ? val() : validatedProps[key]
        },
      }
    ) as ToPropsSignal<P>

    // 4. ノードの先行登録（依存解決のために先にMapを埋める）
    for (const { key, valueOrFn } of this.states) {
      const val =
        typeof valueOrFn === 'function' ? valueOrFn(propsProxy) : valueOrFn
      context.addState(key, val)
    }
    for (const { key, depKeys, fn } of this.deriveds) {
      const depIds = depKeys
        .map(k => context.getNodeByKey(k)?.id)
        .filter((id): id is string => !!id)
      context.addDerived(key, fn, depIds)
    }
    for (const { key, depKeys, fn } of this.handlers) {
      const depIds = depKeys
        .map(k => context.getNodeByKey(k)?.id)
        .filter((id): id is string => !!id)
      context.addHandler(key, fn, depIds)
    }

    // 5. 統合 Proxy (State + Props)
    const createScopeProxy = () => {
      return new Proxy(
        {},
        {
          get: (_, key: string) => {
            if (key === 'props') return propsProxy
            const node = context.getNodeByKey(key)
            if (!node) return undefined
            return () => {
              tracker.report(node.id)
              return tracker.silence(() =>
                this.computeValue(context, node, propsProxy)
              )
            }
          },
        }
      )
    }

    // 6. Render 実行
    if (this.renderFn) {
      const scope = createScopeProxy()
      const handlersProxy = new Proxy(
        {},
        {
          get: (_, key: string) => {
            const node = context.getNodeByKey(key)
            return node ? `{{HANDLER:${node.id}}}` : ''
          },
        }
      )

      const vnode = this.renderFn({
        state: scope as any,
        handlers: handlersProxy as any,
        props: propsProxy,
      })

      context.html = vnode.html
      context.instructions = vnode.instructions
      if (vnode.additionalNodes) {
        for (const n of vnode.additionalNodes) context.nodes.set(n.id, n)
      }
      if (vnode.hiddenDerivedRequests) {
        for (const req of vnode.hiddenDerivedRequests) {
          context.addHiddenDerived(
            req.deps,
            req.templateBody,
            req.isExpression,
            req.placeholderId
          )
        }
      }
    }

    popIdContext()
    return context
  }

  private computeValue(
    ctx: ComponentContext,
    node: ComponentNode,
    props: any
  ): any {
    if (node.type === 'state') return node.value
    if (node.type === 'derived') {
      // ⭐️ 修正: スプレッドせずに Proxy をそのまま渡す
      const scope = new Proxy(
        {},
        {
          get: (_, k: string) => {
            if (k === 'props') return props
            const target = ctx.getNodeByKey(k)
            return target
              ? () => this.computeValue(ctx, target, props)
              : undefined
          },
        }
      )
      return node.fn(scope)
    }
    return undefined
  }
}

export const component = (name: string) => new ComponentBuilder(name)
