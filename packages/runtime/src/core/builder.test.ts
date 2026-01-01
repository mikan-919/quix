import { describe, expect, test } from 'bun:test'
import { h, Show } from '../..' // indexから読み込む形に修正
import { component } from './builder'

describe('Quix Analysis Engine', () => {
  test('should correctly build a dependency graph for derived states', () => {
    // 1. ビルダーの構築
    const builder = component('TestApp')
      .state('count', 0)
      // 型定義に合わせて s.count() と呼び出す
      .derived('double', ['count'], s => s.count() * 2)

    const context = builder.context

    const countNode = context.getNodeByKey('count')
    const doubleNode = context.getNodeByKey('double')

    expect(countNode).toBeDefined()
    expect(doubleNode).toBeDefined()

    // 依存関係IDのチェック
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
    const ctx = component('TestApp')
      .state('count', 10)
      .render(({ state }) => h('div', null, 'Value is: ', () => state.count()))

    const allNodes = ctx.getAllNodes()
    // keyが __hidden_ で始まるノードを探す
    const hiddenNode = allNodes.find(n => n.key.startsWith('__hidden_'))

    expect(hiddenNode).toBeDefined()
    expect(hiddenNode?.type).toBe('derived')

    const countNode = ctx.getNodeByKey('count')
    if (hiddenNode && hiddenNode.type === 'derived' && countNode) {
      expect(hiddenNode.deps).toContain(countNode.id)
      // テキスト補間なので isExpression は undefined (false)
      expect(hiddenNode.isExpression).toBeFalsy()
    }
  })

  test('should analyze Show component correctly', () => {
    const ctx = component('TestApp')
      .state('count', 0)
      .render(({ state }) =>
        h(Show, { when: () => state.count() > 5 }, h('p', null, 'Big!'))
      )

    const allNodes = ctx.getAllNodes()
    // Showの条件式も __hidden_ で始まる Derived として登録される
    // ただし isExpression: true になっているはず
    const conditionNode = allNodes.find(
      n => n.key.startsWith('__hidden_') && (n as any).isExpression === true
    )

    expect(conditionNode).toBeDefined()

    // 命令に 'show' アクションが含まれているか
    const showInst = ctx.instructions.find(i => i.action === 'show')
    expect(showInst).toBeDefined()
    expect(showInst?.signalId).toBe(conditionNode?.id)
    expect(showInst?.template).toBe('<p>Big!</p>')
  })
})
