import { describe, expect, test } from 'bun:test'
import { tracker } from './core/tracker'
import { h } from './h'
import { For, Show } from './index'

describe('h function (JSX Runtime)', () => {
  test('should generate static HTML', () => {
    const vnode = h('div', { id: 'test' }, 'Hello')
    expect(vnode.html).toBe('<div id="test">Hello</div>')
    expect(vnode.instructions).toHaveLength(0)
  })

  test('should optimize inline functions as Hidden Derived', () => {
    const mockFn = () => 123
    const vnode = h('p', null, 'Count: ', mockFn)

    expect(vnode.html).toMatch(/<p\s+class="q-.*">/)
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)

    // 通常のテキスト補間なので isExpression は false (undefined)
    expect(vnode.hiddenDerivedRequests[0]?.isExpression).toBeFalsy()
    expect(vnode.instructions[0]?.action).toBe('setText')
  })

  test('should handle Show component', () => {
    const conditionFn = () => true
    // Showコンポーネントの使用
    const vnode = h(Show, { when: conditionFn }, h('span', null, 'Content'))

    // 1. アンカー（span）が出力されているか
    expect(vnode.html).toMatch(
      /<span\s+class="q-.*"\s+style="display:contents"\s+data-show-anchor><\/span>/
    )

    // 2. show命令が生成されているか
    expect(vnode.instructions).toHaveLength(1)
    const inst = vnode.instructions[0]
    expect(inst?.action).toBe('show')
    expect(inst?.template).toBe('<span>Content</span>')

    // 3. 条件式が「式」としてリクエストされているか
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)
    expect(vnode.hiddenDerivedRequests[0]?.isExpression).toBe(true)
  })

  test('should handle For component for list rendering', () => {
    // 1. モックのState（配列を返すGetter）
    // 修正: tracker.report を呼んで、擬似的にStateであることを通知する
    const mockStateItems = () => {
      tracker.report('s-mock-items')
      return ['A', 'B']
    }

    // 2. <For each={state.items}>...</For>
    const vnode = h(For, { each: mockStateItems }, (item: () => any) =>
      h('div', { class: 'item' }, item)
    )

    // 検証 1: アンカー要素
    expect(vnode.html).toMatch(
      /<span\s+class="q-.*"\s+style="display:contents"\s+data-for-anchor><\/span>/
    )

    // 検証 2: 'list' アクションを持つ命令
    expect(vnode.instructions).toHaveLength(1)
    const inst = vnode.instructions[0]

    expect(inst?.action).toBe('list')
    expect(inst?.selector).toMatch(/\.q-.*/)

    // IDが正しく紐付いているか
    expect(inst?.signalId).toBe('s-mock-items')

    // 検証 3: テンプレート抽出
    // item() が ${v} に置換されているか
    expect(inst?.template).toMatch(/<div class="item q-.*">\${v}<\/div>/)
  })
})
