import { consola } from 'consola'
import { ComponentContext } from './context'
import { resetIdGenerator } from './id'
import { tracker } from './tracker'
import type {
  ComponentNode,
  DerivedNode,
  Simplify,
  StateNode,
  ToReader,
  ToSignal,
  VNode,
} from './types'

export class ComponentBuilder<S = {}, D = {}, H = {}> {
  private logger = consola.withTag('Quix:Builder')

  constructor(
    private name: string,
    public context: ComponentContext = new ComponentContext(name)
  ) {}

  state<K extends string, V>(key: K, value: V) {
    this.context.addState(key, value)
    return this as unknown as ComponentBuilder<Simplify<S & Record<K, V>>, D, H>
  }

  derived<K extends string, V, DepKeys extends (keyof (S & D))[]>(
    key: K,
    depKeys: [...DepKeys], // 配列リテラルをタプルとして推論させる
    // ⭐️ 修正: S&D から、DepKeys に含まれるキーだけを Pick して ToReader 化する
    fn: (scope: ToReader<Simplify<Pick<S & D, DepKeys[number]>>>) => V
  ) {
    const deps = depKeys.map(k => {
      const node = this.context.getNodeByKey(String(k))
      if (!node) throw new Error(`Dependency not found: ${String(k)}`)
      return node.id
    })

    this.context.addDerived(key, fn as any, deps)
    return this as unknown as ComponentBuilder<S, Simplify<D & Record<K, V>>, H>
  }

  handler<K extends string, DepKeys extends (keyof (S & D))[]>(
    key: K,
    _depKeys: [...DepKeys],
    // ⭐️ 修正: ToSignal<S> & ToReader<D> から、DepKeys に含まれるものだけを Pick
    fn: (
      scope: Simplify<Pick<ToSignal<S> & ToReader<D>, DepKeys[number]>>
    ) => void
  ) {
    this.context.addHandler(key, fn as any)
    return this as unknown as ComponentBuilder<
      S,
      D,
      Simplify<H & Record<K, Function>>
    >
  }

  render(
    fn: (args: {
      state: ToReader<Simplify<S & D>> // render内は全部見えて良い
      handlers: H
    }) => VNode
  ) {
    this.logger.start(`Analyzing ${this.name}...`)
    resetIdGenerator(this.name)

    const stateProxy = new Proxy(
      {},
      {
        get: (_, key: string) => {
          const node = this.context.getNodeByKey(key)
          if (!node) return undefined

          return () => {
            tracker.report(node.id)
            return tracker.silence(() => this.computeValue(node))
          }
        },
      }
    )

    const handlerProxy = new Proxy(
      {},
      {
        get: (_, key: string) => {
          const node = this.context.getNodeByKey(key)
          return `{{HANDLER:${node?.id}}}`
        },
      }
    )

    const vnode = fn({
      state: stateProxy,
      handlers: handlerProxy,
    } as any) as any

    this.context.html = vnode.html
    this.context.instructions = vnode.instructions

    if (vnode.hiddenDerivedRequests) {
      vnode.hiddenDerivedRequests.forEach((req: any) => {
        const node: any = {
          id: req.placeholderId,
          key: `__hidden_${req.placeholderId}`,
          type: 'derived',
          deps: req.deps,
          fn: () => {},
          templateBody: req.templateBody,
          isExpression: req.isExpression,
        }
        this.context.nodes.set(req.placeholderId, node)
      })
    }

    this.logger.success(
      `Analysis complete. Total nodes: ${this.context.getAllNodes().length}`
    )

    return this.context
  }

  private computeValue(node: ComponentNode): any {
    if (node.type === 'state') {
      return (node as StateNode).value
    }

    if (node.type === 'derived') {
      const derivedNode = node as DerivedNode
      const scope = new Proxy(
        {},
        {
          get: (_, key: string) => {
            const targetNode = this.context.getNodeByKey(key)
            if (!targetNode) return undefined
            return () => this.computeValue(targetNode)
          },
        }
      )
      return derivedNode.fn(scope)
    }

    return undefined
  }
}

export const component = (name: string) => new ComponentBuilder(name)
