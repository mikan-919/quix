import { describe, expect, test } from 'bun:test'
import { h } from '../h'
import { component } from './builder'

describe('Quix Analysis Engine (Refactored)', () => {
  test('should correctly build a dependency graph for derived states', () => {
    // 1. ビルダーの構築
    const builder = component('TestApp')
      .state('count', 0)
      .derived('double', ['count'], s => s.count() * 2)

    const context = builder.context

    // 2. キーからノードを取得して検証
    const countNode = context.getNodeByKey('count')
    const doubleNode = context.getNodeByKey('double')

    // ノードが存在すること
    expect(countNode).toBeDefined()
    expect(doubleNode).toBeDefined()
    expect(countNode?.type).toBe('state')
    expect(doubleNode?.type).toBe('derived')

    // 3. 依存関係（ID）が正しく解決されているか検証
    // doubleNode.deps に countNode.id が含まれているはず
    if (countNode && doubleNode && doubleNode.type === 'derived') {
      expect(doubleNode.deps).toContain(countNode.id)
    }
  })

  test('should register handlers and link them to context', () => {
    const builder = component('TestApp')
      .state('count', 0)
      .handler('inc', ['count'], s => s.count(s.count() + 1))

    const context = builder.context
    const handlerNode = context.getNodeByKey('inc')

    expect(handlerNode).toBeDefined()
    expect(handlerNode?.type).toBe('handler')
  })

  test('should extract Hidden Derived nodes from JSX via render()', () => {
    // 1. renderを実行して解析完了済みのコンテキストを取得
    const ctx = component('TestApp')
      .state('count', 10)
      .render(({ state }) => h('div', null, 'Value is: ', () => state.count()))

    // 2. Hidden Derived (JSX内の関数) が nodes に登録されているか探す
    const allNodes = ctx.getAllNodes()
    const hiddenNode = allNodes.find(n => n.key.startsWith('__hidden_'))

    expect(hiddenNode).toBeDefined()
    expect(hiddenNode?.type).toBe('derived')

    // 3. Hidden Derived の依存関係チェック
    const countNode = ctx.getNodeByKey('count')
    if (hiddenNode && hiddenNode.type === 'derived' && countNode) {
      // テンプレート内で state.count() を呼んでいるので、依存に含まれるはず
      expect(hiddenNode.deps).toContain(countNode.id)

      // テンプレートボディ（簡易実装版）の確認
      expect(hiddenNode.templateBody).toContain('${val}')
    }

    // 4. 命令セット (Instructions) の検証
    // setText アクションが生成されているはず
    const setTextInst = ctx.instructions.find(i => i.action === 'setText')
    expect(setTextInst).toBeDefined()

    // 命令のターゲットIDが Hidden Derived のIDと一致するか
    expect(setTextInst?.signalId).toBe(hiddenNode?.id)
  })

  test('should generate correct HTML structure', () => {
    const ctx = component('TestApp').render(() =>
      h('div', { id: 'root' }, h('span', null, 'Hello'))
    )

    // 静的な要素のみなのでQIDは付かず、ID属性だけが残るのが正しい挙動
    expect(ctx.html).toBe('<div id="root"><span>Hello</span></div>')
  })
})
