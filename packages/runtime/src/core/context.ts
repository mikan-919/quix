import { nanoid } from 'nanoid'
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

  // ID生成ヘルパー
  generateId(prefix = 'q-') {
    return `${prefix}${nanoid(6)}`
  }

  addState(key: string, value: any) {
    const id = this.generateId('s-')
    const node: ComponentNode = { id, key, type: 'state', value }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  addDerived(key: string, fn: Function, deps: string[]) {
    const id = this.generateId('d-')
    const node: ComponentNode = { id, key, type: 'derived', fn, deps }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  addHandler(key: string, fn: () => void) {
    const id = this.generateId('h-')
    const node: ComponentNode = { id, key, type: 'handler', fn, deps: [] }
    this.keyMap.set(key, node)
    this.nodes.set(id, node)
  }

  // JSX内などで見つかった "Hidden Derived" (無名関数) を登録
  addHiddenDerived(deps: string[], templateBody: string) {
    const id = this.generateId('hd-')
    const node: DerivedNode = {
      id,
      key: `__hidden_${id}`, // 内部用キー
      type: 'derived',
      fn: () => {}, // 実際には templateBody が使われる
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

  // Codegen用に全ノードを配列で返す
  getAllNodes() {
    return Array.from(this.nodes.values())
  }
}
