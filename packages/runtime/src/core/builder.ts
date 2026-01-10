import consola from 'consola'
import { z } from 'zod'
import { ComponentContext } from './context'
import {
  getActiveContext,
  getNextInstanceId,
  popIdContext,
  pushIdContext,
  setActiveContext,
} from './id'
import { tracker } from './tracker'
import type {
  ComponentNode,
  QuixComponent,
  Simplify,
  StateNode,
  ToPropsSignal,
  ToReader,
  ToSignal,
  VNode,
} from './types'

const logger = consola.withTag('Quix:Builder')

// biome-ignore lint/complexity/noBannedTypes: generic params
export class ComponentBuilder<P = {}, S = {}, D = {}, H = {}> {
  // ComponentBuilder のインスタンスを JSX タグとして認めるように
  /** @internal */
  protected readonly _isQuixComponent = true
  // ダミーの呼び出しシグネチャ（実際には呼び出さないが、TSを騙すため）
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: phantom type
  private __props!: P

  // biome-ignore lint/suspicious/noExplicitAny: zod schema
  private schema?: z.ZodObject<any>
  private states: Array<{ key: string; valueOrFn: unknown }> = []
  // biome-ignore lint/complexity/noBannedTypes: generic function storage
  private deriveds: Array<{ key: string; depKeys: string[]; fn: Function }> = []
  private handlers: Array<{
    key: string
    depKeys: string[]
    // biome-ignore lint/suspicious/noExplicitAny: dynamic scope and args
    fn: (scope: any, ...args: any[]) => void
  }> = []
  // biome-ignore lint/suspicious/noExplicitAny: generic render
  private renderFn?: (args: any) => VNode
  private _analysisContext?: ComponentContext

  constructor(public name: string) {
    logger.debug(`Define Component: ${name}`)
  }

  props<T extends z.ZodRawShape>(shape: T) {
    this.schema = z.object(shape)
    return this as unknown as ComponentBuilder<z.infer<z.ZodObject<T>>, S, D, H>
  }

  state<K extends string, V>(
    key: K,
    valueOrFn: V | ((props: ToPropsSignal<P>) => V)
  ) {
    logger.trace(`[${this.name}] +State: ${key}`)
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
    logger.trace(
      `[${this.name}] +Derived: ${key} (deps: ${depKeys.join(', ')})`
    )
    this.deriveds.push({ key, depKeys: depKeys as string[], fn })
    return this as unknown as ComponentBuilder<
      P,
      S,
      Simplify<D & Record<K, V>>,
      H
    >
  }

  handler<
    K extends string,
    DepKeys extends (keyof (S & D))[],
    // ⭐️ ユーザーが書いた関数の型を F としてキャプチャ
    // biome-ignore lint/suspicious/noExplicitAny: generic constraint
    F extends (scope: any, ...args: any[]) => void,
  >(
    key: K,
    depKeys: [...DepKeys],
    fn: F &
      ((
        scope: Simplify<Pick<ToSignal<S> & ToReader<D>, DepKeys[number]>> & {
          props: ToPropsSignal<P>
        },
        ...args: unknown[]
      ) => void)
  ) {
    logger.trace(
      `[${this.name}] +Handler: ${key} (deps: ${depKeys.join(', ')})`
    )
    this.handlers.push({ key, depKeys: depKeys as string[], fn })
    return this as unknown as ComponentBuilder<P, S, D, H & Record<K, F>>
  }

  render(
    fn: (args: {
      state: ToSignal<S>
      props: ToPropsSignal<P>
      handlers: H
    }) => VNode
  ) {
    this.renderFn = fn
    // 解析用のインスタンスを先行して作成しておく
    this._analysisContext = this.buildInstance({}, true)
    return this as unknown as QuixComponent<P>
  }

  // SSR/Analysis 用にルートインスタンスを提供（互換性と解析のため）
  get context(): ComponentContext {
    if (!this._analysisContext) {
      this._analysisContext = this.buildInstance({}, true)
    }
    return this._analysisContext
  }

  get instructions() {
    return this.context.instructions
  }
  get html() {
    return this.context.html
  }
  getNodeByKey(key: string) {
    return this.context.getNodeByKey(key)
  }
  getNodeById(id: string) {
    return this.context.getNodeById(id)
  }
  getAllNodes() {
    return this.context.getAllNodes()
  }

  /**
   * コンポーネントのインスタンスを生成して初期HTMLと命令セットを返す (SSR用)
   */
  buildInstance(
    inputProps: Record<string, unknown>,
    isRoot = false
  ): ComponentContext {
    const instanceId = isRoot ? '' : getNextInstanceId(this.name)
    const context = new ComponentContext(this.name, instanceId)
    pushIdContext(this.name)

    // 1. Props の準備
    const peekProps = {} as Record<string, unknown>
    for (const key of Object.keys(inputProps)) {
      const val = inputProps[key]
      peekProps[key] =
        typeof val === 'function' ? tracker.silence(() => val()) : val
    }

    // バリデーション実行（Root時やProbing時はスキップ）
    const isProbing = tracker.isProbing()
    const validatedProps =
      this.schema && !isRoot && !isProbing
        ? this.schema.parse(peekProps)
        : peekProps
    // バリデーション成功ログ
    if (this.schema && !isRoot) {
      logger.debug(`[${this.name}] Props validated successfully.`)
    }

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

    // ⭐️ 修正: Props のシグナル紐付けを記録 (Codegen用)
    if (!isRoot) {
      for (const key of Object.keys(inputProps)) {
        const val = inputProps[key]
        if (typeof val === 'function') {
          const deps = new Set<string>()
          tracker.runWithScope(
            `prop-probe-${key}`,
            id => deps.add(id),
            () => {
              const getter = (
                propsProxy as Record<string, (() => unknown) | undefined>
              )[key]
              return getter ? getter() : undefined
            }
          )
          if (deps.size === 1) {
            const dep = Array.from(deps)[0]
            if (dep) {
              context.propMap.set(key, dep)
            }
          }
        }
      }
    }

    // 4. ノードの先行登録（依存解決のために先にMapを埋める）
    for (const { key, valueOrFn } of this.states) {
      const val =
        typeof valueOrFn === 'function' ? valueOrFn(propsProxy) : valueOrFn
      const id = context.addState(key, val)
      logger.trace(`  -> Register State: ${key} (${id})`)
    }
    for (const { key, depKeys, fn } of this.deriveds) {
      const depIds = depKeys
        .map(k => context.getNodeByKey(k)?.id)
        .filter((id): id is string => !!id)
      const id = context.addDerived(key, fn, depIds)
      logger.trace(
        `  -> Register Derived: ${key} (${id}, deps: ${depIds.join(', ')})`
      )
    }
    for (const { key, depKeys, fn } of this.handlers) {
      const depIds = depKeys
        .map(k => context.getNodeByKey(k)?.id)
        .filter((id): id is string => !!id)
      const id = context.addHandler(key, fn, depIds)
      logger.trace(
        `  -> Register Handler: ${key} (${id}, deps: ${depIds.join(', ')})`
      )
    }

    // 5. Proxy ユーティリティ
    const createScopeProxy = (isReader = false) => {
      return new Proxy(
        {},
        {
          get: (_, key: string) => {
            const node = context.getNodeByKey(key)
            if (!node) return undefined

            // SSR解析時(isReader=false)も値を取得・実行できるように関数を返す
            // これにより、render関数内の state.count() が動作し、h() が依存関係(node.id)を収集できる
            return () => {
              if (!isReader) tracker.report(node.id)
              if (node.type === 'state') {
                const stateNode = node as StateNode
                return stateNode.value
              }
              if (node.type === 'derived')
                return this.computeValue(context, node, peekProps)
              return undefined
            }
          },
        }
      )
    }

    // 6. Render 実行
    if (this.renderFn) {
      logger.debug(`[${this.name}] Executing render function...`)
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

      const prevActive = getActiveContext()
      setActiveContext(context)
      try {
        const vnode = this.renderFn({
          state: scope as ToReader<Simplify<S & D>> & {
            props: ToPropsSignal<P>
          },
          handlers: handlersProxy as H,
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
        logger.debug(
          `[${this.name}] Render complete. Generated ${vnode.instructions.length} instructions.`
        )
      } finally {
        setActiveContext(prevActive)
      }
    }

    popIdContext()
    return context
  }

  private computeValue(
    ctx: ComponentContext,
    node: ComponentNode,
    props: Record<string, unknown>
  ): unknown {
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
