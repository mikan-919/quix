import { describe, expect, test } from 'bun:test'
import { h, Show } from '../index'
import { component } from './builder'

describe('Quix Analysis Engine: コンポーネント解析の詳細検証', () => {
  test('依存関係グラフの構築: Derived（派生）ステートが正しく親を追跡すること', () => {
    // 期待値: double が count の ID を deps に含んでいること
    const context = component('TestApp')
      .state('count', 0)
      .derived('double', ['count'], s => s.count() * 2)
      .render(({ state }) => h('div', null, state.double()))

    const countNode = context.getNodeByKey('count')
    const doubleNode = context.getNodeByKey('double')

    expect(countNode).toBeDefined()
    expect(doubleNode).toBeDefined()

    if (countNode && doubleNode && doubleNode.type === 'derived') {
      expect(doubleNode.deps).toContain(countNode.id)
    }
  })

  test('ハンドラの登録: ハンドラノードが生成され、addListener 命令と連結されること', () => {
    const context = component('TestApp')
      .state('count', 0)
      .handler('inc', ['count'], s => s.count(s.count() + 1))
      .render(({ handlers }) =>
        h('button', { onclick: handlers.inc }, 'Increment')
      )

    const handlerNode = context.getNodeByKey('inc')
    expect(handlerNode).toBeDefined()
    expect(handlerNode?.type).toBe('handler')

    // 命令リストに addListener があり、その signalId がハンドラIDと一致するか
    const hasHandlerInst = context.instructions.some(
      i => i.action === 'addListener' && i.signalId === handlerNode?.id
    )
    expect(hasHandlerInst).toBe(true)
  })

  test('Hidden Derived の抽出: JSX内のインライン関数が自動的に解析対象になること', () => {
    const ctx = component('TestApp')
      .state('count', 10)
      .render(({ state }) => h('div', null, 'Value is: ', () => state.count()))

    const allNodes = ctx.getAllNodes()
    // 内部的な命名規則 "__hidden_" で始まるノードが存在するか
    const hiddenNode = allNodes.find(n => n.key.startsWith('__hidden_'))

    expect(hiddenNode).toBeDefined()
    expect(hiddenNode?.type).toBe('derived')

    const countNode = ctx.getNodeByKey('count')
    if (hiddenNode && hiddenNode.type === 'derived' && countNode) {
      expect(hiddenNode.deps).toContain(countNode.id)
    }
  })

  test('Show コンポーネントの解析: 条件式ノード(cond-)と show 命令の生成', () => {
    const ctx = component('TestApp')
      .state('count', 0)
      .render(({ state }) =>
        h(Show, { when: () => state.count() > 5 }, h('p', null, 'Big!'))
      )

    const allNodes = ctx.getAllNodes()
    const conditionNode = allNodes.find(n => n.id.includes('cond-TestApp'))

    expect(conditionNode).toBeDefined()

    const showInst = ctx.instructions.find(i => i.action === 'show')
    expect(showInst).toBeDefined()
    expect(showInst?.signalId).toBe(conditionNode?.id)
    // テンプレートIDが含まれているか
    expect(showInst?.templateId).toBeDefined()
  })

  test('Show コンポーネントのSSR: 初期状態が真の場合、HTMLにコンテンツが含まれること', () => {
    const ctx = component('TestApp')
      .state('visible', true)
      .render(({ state }) =>
        h(
          Show,
          { when: () => state.visible() },
          h('span', null, 'Visible Content')
        )
      )

    // 初期状態が真なので、コンテンツがHTMLに含まれているべき
    expect(ctx.html).toContain('data-show-anchor><span>Visible Content</span>')
    // テンプレートタグも含まれているべき
    expect(ctx.html).toContain('<template id="tmpl-TestApp-')
    expect(ctx.html).toContain('Visible Content</span></template>')
  })

  test('Show コンポーネントのSSR: 初期状態が偽の場合、HTMLが空でテンプレートのみ含まれること', () => {
    const ctx = component('TestApp')
      .state('visible', false)
      .render(({ state }) =>
        h(
          Show,
          { when: () => state.visible() },
          h('span', null, 'Hidden Content')
        )
      )

    // 初期状態が偽なので、アンカー部分は空
    expect(ctx.html).toContain('data-show-anchor></span>')
    // ただしテンプレートとしては存在する
    expect(ctx.html).toContain('<template id="tmpl-TestApp-')
    expect(ctx.html).toContain('Hidden Content</span></template>')
  })

  test('Show コンポーネント内の動的要素: 内部のシグナル依存が正しく抽出されること', () => {
    const ctx = component('TestApp')
      .state('visible', true)
      .state('count', 123)
      .render(({ state }) =>
        h(
          Show,
          { when: () => state.visible() },
          h(
            'div',
            null,
            h('span', null, 'Count: ', () => state.count())
          )
        )
      )

    // 初期HTMLに現在の値が含まれているか
    expect(ctx.html).toContain('Count: 123')

    // 内部のsetText命令が生成されているか
    const setTextInst = ctx.instructions.find(i => i.action === 'setText')
    expect(setTextInst).toBeDefined()

    // 内部要素の更新命令のセレクタがShowのテンプレート内にも反映されているか（ハイドレーション用）
    expect(ctx.html).toContain(setTextInst?.selector.replace('.', ''))
  })

  test('Show コンポーネント内の大規模要素: 静的構造が正しく保持されること', () => {
    const ctx = component('TestApp')
      .state('visible', true)
      .render(({ state }) =>
        h(
          Show,
          { when: () => state.visible() },
          h(
            'div',
            { class: 'container' },
            h('header', null, h('h1', null, 'Title')),
            h(
              'main',
              null,
              h('p', null, 'Paragraph 1'),
              h('p', null, 'Paragraph 2'),
              h(
                'ul',
                null,
                h('li', null, 'Item 1'),
                h('li', null, 'Item 2'),
                h('li', null, 'Item 3')
              )
            ),
            h('footer', null, 'Footer')
          )
        )
      )

    expect(ctx.html).toContain('<header><h1>Title</h1></header>')
    expect(ctx.html).toContain('<li>Item 3</li>')
    expect(ctx.html).toContain('<template')
  })

  test('静的HTMLの生成: リアクティブでない要素に QID が付与されないこと', () => {
    const ctx = component('TestApp').render(() =>
      h('div', { id: 'root' }, h('span', null, 'Hello'))
    )

    // クラス名(q-...)が付かず、純粋なHTMLが出力されること
    expect(ctx.html).toBe('<div id="root"><span>Hello</span></div>')
  })

  test('決定論的 ID 生成: 同一構造のコンポーネントは常に同じ ID を持つこと', () => {
    const build = () =>
      component('App')
        .state('count', 0)
        .render(({ state }) => h('div', null, () => state.count()))

    const ctx1 = build()
    const ctx2 = build()

    // SSR/ハイドレーションのために、複数回実行しても ID (s-App-0等) が一致する必要がある
    expect(ctx1.html).toBe(ctx2.html)
    expect(ctx1.html).toContain('App')
  })
})
