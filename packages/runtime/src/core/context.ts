import { generateId } from './id'
import type { ComponentNode, DerivedNode, Instruction } from './types'

export class ComponentContext {
  // 名前ベースのマップ (API構築用: "count" -> Node)
  private keyMap = new Map<string, ComponentNode>()

  // IDベースのマップ (Codegen用: "q-xyz" -> Node)
  // IDはユニークなので、こちらですべてのノード（Hidden Derived含む）を管理
  nodes = new Map<string, ComponentNode>()

  // View情報
  html: string = ''
  instructions: Instruction[] = []

  constructor(public name: string) {}

  addState(key: string, value: any) {
    const id = generateId('s') // s-App-0
    const node: ComponentNode = { id, key, type: 'state', value }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  addDerived(key: string, fn: Function, deps: string[]) {
    const id = generateId('d') // d-App-1
    const node: ComponentNode = { id, key, type: 'derived', fn, deps }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  addHandler(key: string, fn: () => void) {
    const id = generateId('h') // h-App-2
    const node: ComponentNode = { id, key, type: 'handler', fn, deps: [] }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  addHiddenDerived(deps: string[], templateBody: string) {
    const id = generateId('hd') // hd-App-3
    const node: DerivedNode = {
      id,
      key: `__hidden_${id}`,
      type: 'derived',
      fn: () => {},
      deps,
      templateBody,
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
