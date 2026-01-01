import { describe, expect, test } from 'bun:test'
import { h } from '../h'
import { component } from './builder'

describe('Component Composition', () => {
  test('should merge child component nodes and instructions into parent context', () => {
    // 1. 子コンポーネントの定義
    const Child = component('Child')
      .state('c_count', 100)
      .render(({ state }) =>
        h('span', { id: 'child-root' }, 'Child Val: ', () => state.c_count())
      )

    // 2. 親コンポーネントの定義（子を埋め込む）
    // 現状、JSX変換で h(Child, null) となることを想定
    const Parent = component('Parent').render(() =>
      h(
        'div',
        { id: 'parent-root' },
        h('h1', null, 'Parent'),
        h(Child as any, null) // 子コンポーネントをタグとして渡す
      )
    )

    // --- 検証 ---

    // 検証 1: HTMLが統合されているか
    // 親のHTMLの中に、子のHTML構造が含まれていることを確認
    expect(Parent.html).toContain('<div id="parent-root">')
    expect(Parent.html).toContain('<h1>Parent</h1>')
    expect(Parent.html).toContain('<span id="child-root"')
    expect(Parent.html).toContain('Child Val: ')

    // 検証 2: ノード（State）が統合されているか
    // 親のコンテキストから、子のState(c_count)が見える必要がある
    const allNodes = Parent.getAllNodes()
    const childState = allNodes.find(n => n.key === 'c_count')

    expect(childState).toBeDefined()
    expect(childState?.id).toContain('Child') // IDにコンポーネント名が含まれているか

    // 検証 3: 命令 (Instructions) が統合されているか
    // 子コンポーネント内の setText 命令が、親のコンテキストに引き継がれているか

    // 検証 3: 命令 (Instructions) が統合されているか
    const setTextInst = Parent.instructions.find(i => i.action === 'setText')
    expect(setTextInst).toBeDefined()

    // 修正: 命令の対象(signalId)が、統合されたノードのいずれかであることを確認
    // かつ、それが Child コンポーネントに属していることを確認
    const targetNode = Parent.getNodeById(setTextInst?.signalId)
    expect(targetNode).toBeDefined()
    expect(targetNode?.id).toContain('Child')

    // (オプション) そのノードが c_count ステートに依存しているかまで見ると完璧です
    if (targetNode?.type === 'derived') {
      expect(targetNode.deps).toContain(childState?.id)
    }
  })
})
