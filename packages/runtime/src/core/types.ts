import type z from 'zod'

export type WireType = 'text' | 'attr' | 'handler' | 'show' | 'list'

export interface Wire {
  type: WireType
  from: string
  target: string
  property?: string
  fragmentId?: string
}

export interface Fragment {
  id: string
  html: string
  wires: Wire[]
}

export interface HResult {
  html: string
  wires: Wire[]
  hidden: Record<string, HiddenDerived>
  fragments: Fragment[]
  listData?: {
    itemKey: string
    itemDeps: string[]
    itemFns: string[]
  }
}

export interface HiddenDerived {
  valueFn: Function
  deps: string[]
  _rawLogic?: string
}

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type ToReader<T> = { [K in keyof T]-?: () => T[K] }

export type Signal<V> = (update?: V) => V

export type ToSignal<T> = { [K in keyof T]: Signal<T[K]> }
export type ToPropsSignal<T> = {
  [K in keyof T]: () => T[K]
}

export interface DeriveDefinition {
  valueFn: (state: unknown) => unknown
  deps: string[]
  _rawLogic?: string
}

export interface HandlerDefinition {
  valueFn: (state: unknown, event: unknown) => void
  deps: string[]
}

export interface ExtendedHResult extends HResult {
  nestedState?: Record<string, unknown>
  nestedDerive?: Record<string, DeriveDefinition>
}

export type Scope<STATE, DERIVE, PROPS> = {
  state: { [K in keyof (STATE & DERIVE)]: Signal<(STATE & DERIVE)[K]> }
  props: { [K in keyof PROPS]: () => PROPS[K] }
  handlers: { [K in string]: string }
}

export type QuixComponent<P = unknown> = {
  name: string
  __quix_builder?: unknown
  render?: (props: P) => HResult
}

export type NodeType = 'state' | 'derived' | 'handler'

export interface NodeBase {
  id: string
  key: string
  type: NodeType
  context?: any
}

export interface StateNode extends NodeBase {
  type: 'state'
  value: unknown
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
  fn: Function
  deps: string[]
}

export interface VNode {
  tag: string | Function | unknown
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
  listFn?: string
  itemSlots?: string[]
  itemFns?: string[]
  itemInstructions?: Instruction[]
  context?: any
}

export interface HiddenDerivedRequest {
  deps: string[]
  templateBody: string
  placeholderId: string
  isExpression?: boolean
}

export interface ComponentMetadata {
  name: string
  propsSchema?: z.ZodObject<any>
  setupFns: {
    state: Array<{ key: string; valueOrFn: unknown }>
    derived: Array<{ key: string; depKeys: string[]; fn: Function }>
    handler: Array<{ key: string; depKeys: string[]; fn: Function }>
    render?: (args: Record<string, unknown>) => VNode
  }
}
