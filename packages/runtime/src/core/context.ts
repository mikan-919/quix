import { generateId } from './id'
import type { ComponentNode, DerivedNode, Instruction } from './types'

export class ComponentContext {
  private keyMap = new Map<string, ComponentNode>()
  nodes = new Map<string, ComponentNode>()
  propMap = new Map<string, string>()
  html: string = ''
  instructions: Instruction[] = []

  constructor(
    public name: string,
    public instanceId: string = ''
  ) {}

  private createId(prefix: string) {
    const id = generateId(prefix)
    return this.instanceId ? `${id}-${this.instanceId}` : id
  }

  addState(key: string, value: unknown) {
    const id = this.createId('s')
    const node: ComponentNode = { id, key, type: 'state', value, context: this }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
    return id
  }

  addDerived(key: string, fn: (...args: unknown[]) => unknown, deps: string[]) {
    const id = this.createId('d')
    const node: ComponentNode = {
      id,
      key,
      type: 'derived',
      fn,
      deps,
      context: this,
    }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
    return id
  }

  addHandler(key: string, fn: (...args: unknown[]) => void, deps: string[]) {
    const id = this.createId('h')
    const node: ComponentNode = {
      id,
      key,
      type: 'handler',
      fn,
      deps,
      context: this,
    }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
    return id
  }

  // ⭐️ 修正: 外部(h.ts)で生成された id を受け取れるようにする
  addHiddenDerived(
    deps: string[],
    templateBody: string,
    isExpression?: boolean,
    providedId?: string
  ) {
    const id = providedId || this.createId('hd')
    const node: DerivedNode = {
      id,
      key: `__hidden_${id}`,
      type: 'derived',
      fn: () => {},
      deps,
      templateBody,
      isExpression,
    }
    this.nodes.set(id, node)
    return id
  }

  getNodeByKey(key: string) {
    return this.keyMap.get(key)
  }
  getNodeById(id: string) {
    return this.nodes.get(id)
  }
  getAllNodes() {
    return Array.from(this.nodes.values())
  }
}
