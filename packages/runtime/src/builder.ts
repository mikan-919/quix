import { type ConsolaInstance, consola } from 'consola'
import { nanoid } from 'nanoid'
import type { VNode } from './h' // 分割した h.ts から VNode 型をインポート
import { quixTracker } from './tracker'

/** メタデータ構造 */
type StateMeta<V> = { value: V }
type DerivedMeta<V, Deps extends string> = { value: V; deps: Deps }
type HandlerMeta<Deps extends string> = { deps: Deps }

type ResolveValue<T> = T extends { value: infer V } ? V : never

type ExtractReaders<S, D> = Simplify<{
  [K in keyof (S & D)]: () => ResolveValue<(S & D)[K]>
}>

type ExtractSignals<S, D, Keys extends keyof (S & D)> = Simplify<{
  [K in Keys]: K extends keyof S
    ? (update?: ResolveValue<S[K]>) => ResolveValue<S[K]>
    : () => ResolveValue<(S & D)[K]>
}>

type Simplify<T> = { [K in keyof T]: T[K] } & {}

export class ComponentBuilder<
  S extends Record<string, StateMeta<unknown>> = {},
  D extends Record<string, DerivedMeta<unknown, string>> = {},
  H extends Record<string, HandlerMeta<string>> = {},
> {
  // 全ての State / Derived (Hidden含む) を格納する
  private bank: Record<
    string,
    {
      id: string
      value: any
      deps?: string[]
      isDerived: boolean
    }
  > = {}

  private handlerBank: Record<string, Function> = {}
  private logger: ConsolaInstance
  constructor(public name: string) {
    this.logger = consola.withTag(this.name)
    this.logger.start(`Building: ${name}`)
  }

  private next<
    NS extends Record<string, StateMeta<unknown>>,
    ND extends Record<string, DerivedMeta<unknown, string>>,
    NH extends Record<string, HandlerMeta<string>>,
  >(): ComponentBuilder<NS, ND, NH> {
    return this as any
  }

  /** ユーザー定義 State */
  state<K extends string, V>(key: K, value: V) {
    const id = nanoid()
    this.bank[key] = { id, value, isDerived: false }
    this.logger.info(`State   | ${key} (id: ${id})`)
    return this.next<Simplify<S & Record<K, StateMeta<V>>>, D, H>()
  }

  /** ユーザー定義 Derived */
  derived<K extends string, V, Keys extends keyof (S & D)>(
    key: K,
    deps: Keys[],
    fn: (scope: ExtractReaders<S, D>) => V
  ) {
    const id = nanoid()
    // 名前ベースの依存関係を内部IDベースに変換
    const depIds = deps.map(k => (this.bank[k as string] as any).id)

    this.bank[key] = { id, deps: depIds, value: fn, isDerived: true }
    this.logger.info(`Derived | ${key} (deps: ${deps.join(', ')})`)
    return this.next<
      S,
      Simplify<D & Record<K, DerivedMeta<V, Keys & string>>>,
      H
    >()
  }

  /** イベントハンドラ */
  handler<K extends string, Keys extends keyof (S & D)>(
    key: K,
    _deps: Keys[],
    fn: (scope: ExtractSignals<S, D, Keys>) => void
  ) {
    this.handlerBank[key] = fn
    this.logger.info(`Handler | ${key} registered`)
    return this.next<
      S,
      D,
      Simplify<H & Record<K, HandlerMeta<Keys & string>>>
    >()
  }

  /** 解析・マージ実行 */
  render(
    fn: (args: {
      state: ExtractReaders<S, D>
      handlers: Simplify<{ [K in keyof H]: string }>
    }) => VNode
  ) {
    // 1. 解析用の Scope 生成
    const allKeys = Object.keys(this.bank)
    const stateScope = this.createScope(allKeys, false)
    const handlerNames = Object.fromEntries(
      Object.keys(this.handlerBank).map(k => [k, `{{HANDLER:${k}}}`])
    )
    this.logger.info('handler: ', handlerNames)
    // 2. JSX(h関数)の実行
    const vnode = fn({ state: stateScope, handlers: handlerNames as any })

    // 3. Hidden Derived を bank に統合
    for (const hd of vnode.hiddenDerived) {
      this.bank[hd.id] = {
        id: hd.id,
        deps: hd.deps,
        value: hd.fn, // テンプレートの場合は undefined
        isDerived: true,
        // 💡 ここを追加！ h.ts から届いた文字列を bank に入れる
        // @ts-expect-error
        templateBody: hd.templateBody,
      }
    }

    this.logger.success(
      `Render analyzed: ${Object.keys(this.bank).length} total nodes in graph`
    )

    return {
      version: '0.1',
      name: this.name,
      bank: this.bank, // ユーザー定義 + Hidden が混ざった状態
      handlerBank: this.handlerBank,
      html: vnode.html,
      instructions: vnode.instructions,
    }
  }

  /** 依存追跡機能付き Scope 生成 */
  private createScope(keys: string[], writable: boolean): any {
    const scope: any = {}
    for (const key of keys) {
      const entry = this.bank[key]
      if (!entry) continue

      const getter = () => {
        // 💡 依存関係を報告（これが h関数の track に回収される）
        quixTracker.report(entry.id)

        if (entry.isDerived) {
          // 派生値の計算（再帰）
          return entry.value(this.createScope(Object.keys(this.bank), false))
        }
        return entry.value
      }

      if (writable && !entry.isDerived) {
        scope[key] = (update?: any) => {
          if (arguments.length > 0) entry.value = update
          return getter()
        }
      } else {
        scope[key] = getter
      }
    }
    return scope
  }
}

export const component = (name: string) => new ComponentBuilder(name)
