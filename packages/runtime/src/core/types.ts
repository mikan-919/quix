export type NodeType = 'state' | 'derived' | 'handler'

export interface NodeBase {
  id: string
  key: string
  type: NodeType
}

export interface StateNode extends NodeBase {
  type: 'state'
  value: any
}

export interface DerivedNode extends NodeBase {
  type: 'derived'
  fn: Function
  deps: string[]
  templateBody?: string
}

export interface HandlerNode extends NodeBase {
  type: 'handler'
  fn: Function // ここは内部的にはFunctionだが、Builder上では厳密な型をつける
  deps: string[]
}

export type ComponentNode = StateNode | DerivedNode | HandlerNode

export interface Instruction {
  signalId: string
  selector: string
  action: 'setText' | 'setAttr' | 'addListener'
  attrName?: string
}

export interface HiddenDerivedRequest {
  deps: string[]
  templateBody: string
  placeholderId: string
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
