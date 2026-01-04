import type z from 'zod'

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
  isExpression?: boolean
}

export interface HandlerNode extends NodeBase {
  type: 'handler'
  fn: Function // ここは内部的にはFunctionだが、Builder上では厳密な型をつける
  deps: string[]
}

export interface VNode {
  tag: string | Function | any
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
  propsSchema?: z.ZodObject<any>
  // ロジックを保持しておき、親の render 時に再実行できるようにする
  setupFns: {
    state: Array<{ key: string; valueOrFn: any }>
    derived: Array<{ key: string; depKeys: string[]; fn: Function }>
    handler: Array<{ key: string; depKeys: string[]; fn: Function }>
    render?: (args: any) => VNode
  }
}
export type QuixComponent<P = any> = import('./context').ComponentContext & {
  (props: P): VNode
  __quix_builder?: any // 内部用
}
