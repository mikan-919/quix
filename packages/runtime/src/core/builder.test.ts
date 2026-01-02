import { describe, expect, test } from 'bun:test'
import { h, Show } from '../index'
import { component } from './builder'

describe('Quix Analysis Engine', () => {
  test('should correctly build a dependency graph for derived states', () => {
    // render() を呼ぶことで解析プロセスが走り、Context が返される
    const context = component('TestApp')
      .state('count', 0)
      .derived('double', ['count'], s => s.count() * 2)
      .render(({ state }) => h('div', null, state.double()))

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
    const context = component('TestApp')
      .state('count', 0)
      .handler('inc', ['count'], s => s.count(s.count() + 1))
      .render(({ handlers }) =>
        h('button', { onclick: handlers.inc }, 'Increment')
      )

    const handlerNode = context.getNodeByKey('inc')

    expect(handlerNode).toBeDefined()
    expect(handlerNode?.type).toBe('handler')

    // 命令にハンドラが登録されているか
    const hasHandlerInst = context.instructions.some(
      i => i.action === 'addListener' && i.signalId === handlerNode?.id
    )
    expect(hasHandlerInst).toBe(true)
  })

  test('should extract Hidden Derived nodes from JSX via render()', () => {
    const ctx = component('TestApp')
      .state('count', 10)
      .render(({ state }) => h('div', null, 'Value is: ', () => state.count()))

    const allNodes = ctx.getAllNodes()
    // keyが __hidden_ で始まるノード（テキスト補間用）を探す
    const hiddenNode = allNodes.find(n => n.key.startsWith('__hidden_'))

    expect(hiddenNode).toBeDefined()
    expect(hiddenNode?.type).toBe('derived')

    const countNode = ctx.getNodeByKey('count')
    if (hiddenNode && hiddenNode.type === 'derived' && countNode) {
      expect(hiddenNode.deps).toContain(countNode.id)
    }
  })

  test('should analyze Show component correctly', () => {
    const ctx = component('TestApp')
      .state('count', 0)
      .render(({ state }) =>
        h(Show, { when: () => state.count() > 5 }, h('p', null, 'Big!'))
      )

    const allNodes = ctx.getAllNodes()
    // Showの条件式ノードを探す
    // h.ts で生成された 'cond-' ID が引き継がれているはず
    const conditionNode = allNodes.find(n => n.id.includes('cond-TestApp'))

    expect(conditionNode).toBeDefined()

    // 命令に 'show' アクションが含まれているか
    const showInst = ctx.instructions.find(i => i.action === 'show')
    expect(showInst).toBeDefined()
    expect(showInst?.signalId).toBe(conditionNode?.id)
    expect(showInst?.template).toBe('<p>Big!</p>')
  })

  test('should generate correct HTML structure', () => {
    const ctx = component('TestApp').render(() =>
      h('div', { id: 'root' }, h('span', null, 'Hello'))
    )

    // 静的な要素のみなので QID は付かず、ID 属性だけが残る
    expect(ctx.html).toBe('<div id="root"><span>Hello</span></div>')
  })

  test('should generate deterministic IDs', () => {
    const build = () =>
      component('App')
        .state('count', 0)
        .render(({ state }) => h('div', null, () => state.count()))

    const ctx1 = build()
    const ctx2 = build()

    // ルートコンポーネントとして render された場合、instanceId は空なので
    // ID は完全に一致するはず (s-App-0, hd-App-1...)
    expect(ctx1.html).toBe(ctx2.html)
    expect(ctx1.html).toContain('App')
  })
})
