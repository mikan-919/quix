import type z from 'zod'

export type NodeType = 'state' | 'derived' | 'handler'

export interface NodeBase {
  id: string
  key: string
  type: NodeType
  context?: unknown
}

export interface StateNode extends NodeBase {
  type: 'state'
  value: unknown
}

export interface DerivedNode extends NodeBase {
  type: 'derived'
  fn: (...args: unknown[]) => unknown
  deps: string[]
  templateBody?: string
  isExpression?: boolean
}

export interface HandlerNode extends NodeBase {
  type: 'handler'
  fn: (...args: unknown[]) => void // Internal function storage, Builder provides stricter typing
  deps: string[]
}

export interface VNode {
  tag: string | ((...args: unknown[]) => unknown) | unknown
  html: string
  instructions: Instruction[]
  hiddenDerivedRequests: HiddenDerivedRequest[]
  additionalNodes?: ComponentNode[]
}

export type ComponentNode = StateNode | DerivedNode | HandlerNode

export interface Instruction {
  signalId: string
  selector: string
  action: 'setText' | 'setAttr' | 'addListener' | 'show' | 'list'
  attrName?: string
  template?: string
  templateId?: string
  listFn?: string // For用: each関数の文字列表現
  itemSlots?: string[] // For用: 各q-textスロットを更新するための関数の配列表現
  itemFns?: string[] // For用: テキストノード内の各動的分を更新するための関数の文字列表現リスト
  itemInstructions?: Instruction[] // For用: 各アイテム内で実行される命令
  context?: unknown
}

export interface HiddenDerivedRequest {
  deps: string[]
  templateBody: string
  placeholderId: string
  isExpression?: boolean
}

// ⬇️ ここから追加: 型推論用ユーティリティ

// 交差型を綺麗に畳み込む（ツールチップで見やすくする）
export type Simplify<T> = { [K in keyof T]: T[K] } & {}

// Getter専用: Derived内での状態アクセス用
// { count: number } -> { count: () => number }
export type ToReader<T> = { [K in keyof T]: () => T[K] }

// Signal (Getter/Setter両用): Handler内での状態アクセス用
// value() で取得、value(newVal) で更新
export type Signal<V> = {
  (): V
  (newValue: V): void
}

// { count: number } -> { count: Signal<number> }
export type ToSignal<T> = { [K in keyof T]: Signal<T[K]> }
export type ToPropsSignal<T> = {
  [K in keyof T]: () => T[K]
}

// ⭐️ Builder の内部状態用の型
export interface ComponentMetadata {
  name: string
  propsSchema?: z.ZodObject<z.ZodRawShape>
  // ロジックを保持しておき、親の render 時に再実行できるようにする
  setupFns: {
    state: Array<{ key: string; valueOrFn: unknown }>
    derived: Array<{
      key: string
      depKeys: string[]
      fn: (...args: unknown[]) => unknown
    }>
    handler: Array<{
      key: string
      depKeys: string[]
      fn: (...args: unknown[]) => void
    }>

    render?: (args: Record<string, unknown>) => VNode
  }
}
export type QuixComponent<P = unknown> =
  import('./context').ComponentContext & {
    (props: P): VNode
    __quix_builder?: unknown // 内部用
  }
