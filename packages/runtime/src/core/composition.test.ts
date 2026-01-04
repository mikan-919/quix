import { describe, expect, test } from 'bun:test'
import { h } from '../h'
import { component } from './builder'

describe('Component Composition: コンポーネントの合成', () => {
  test('命令のバブリング: 子の更新命令が親のコンテキストに集約されること', () => {
    // 1. 子コンポーネントの定義
    const Child = component('Child')
      .state('c_val', 100)
      .render(({ state }) => h('span', { id: 'child' }, () => state.c_val()))

    // 2. 親コンポーネントでの使用
    const Parent = component('Parent').render(() =>
      h('div', null, h('h1', null, 'Parent'), h(Child as any, null))
    )

    // HTMLが統合されているか
    expect(Parent.html).toContain('<h1>Parent</h1>')
    expect(Parent.html).toContain('<span id="child"')

    // 子のステート(c_val)が親の全ノードリストに含まれているか
    const allNodes = Parent.getAllNodes()
    const childState = allNodes.find(n => n.key === 'c_val')
    expect(childState).toBeDefined()
    expect(childState?.id).toContain('Child')

    // 子の setText 命令が親に引き継がれているか
    const setTextInst = Parent.instructions.find(i => i.action === 'setText')
    expect(setTextInst).toBeDefined()
    expect(setTextInst?.signalId).toBe(childState?.id)
  })
})
