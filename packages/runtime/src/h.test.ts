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
  test('should handle For component with executed signal style', () => {
    // ユーザーが <For each={state.items()}> と書いた場合、
    // Babelにより { each: () => state.items() } に変換される
    const mockStateItems = () => {
      tracker.report('s-mock-items')
      return ['A', 'B']
    }
    const wrappedEach = () => mockStateItems() // Babelのラップを模倣

    const vnode = h(For, { each: wrappedEach }, (item: () => any) =>
      h('div', null, item)
    )

    // 検証 1: 命令が生成されているか
    expect(vnode.instructions).toHaveLength(1)
    const inst = vnode.instructions[0]
    expect(inst?.signalId).toBe('s-mock-items') // 正しく依存が抜けているか

    // 検証 2: アンカーHTML
    expect(vnode.html).toContain('data-for-anchor')
  })
  test('should NOT generate Hidden Derived for single signal interpolation', () => {
    const mockSignal = () => {
      tracker.report('s-original')
      return 'val'
    }

    // <span>{() => ...}</span> の形式
    const vnode = h('span', null, mockSignal)

    // 検証 1: 命令は生成されている
    expect(vnode.instructions).toHaveLength(1)

    // 検証 2: 命令の signalId が、オリジナルの ID に直結している ⭐️
    expect(vnode.instructions[0].signalId).toBe('s-original')

    // 検証 3: 余計な派生ノードのリクエストが作られていない ⭐️
    expect(vnode.hiddenDerivedRequests).toHaveLength(0)
  })

  test('should still generate Hidden Derived for mixed text', () => {
    const mockSignal = () => {
      tracker.report('s-1')
      return 'val'
    }

    // <span>Value: {() => ...}</span>
    const vnode = h('span', null, 'Value: ', mockSignal)

    // 混合テキストの場合は、hd- ノードが必要
    expect(vnode.instructions[0].signalId).toContain('hd-')
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)
  })
  test('should handle reactive attribute binding', () => {
    const mockSignal = () => {
      tracker.report('s-attr')
      return 'dynamic-value'
    }

    // <input value={() => mockSignal()} />
    const vnode = h('input', { value: mockSignal })

    // 検証 1: setAttr 命令が生成されているか
    const inst = vnode.instructions.find(i => i.action === 'setAttr')
    expect(inst).toBeDefined()
    expect(inst?.attrName).toBe('value')
    expect(inst?.signalId).toBe('s-attr')

    // 検証 2: HTML に初期値が反映されているか
    expect(vnode.html).toContain('value="dynamic-value"')
  })

  test('should handle attribute binding with multiple dependencies (first dependency win)', () => {
    const mockMultiSignal = () => {
      tracker.report('s-first')
      tracker.report('s-second')
      return 'combined'
    }

    const vnode = h('div', { 'data-test': mockMultiSignal })

    const inst = vnode.instructions.find(i => i.action === 'setAttr')
    expect(inst).toBeDefined()
  })
  test('should handle attribute binding with direct signal shortcut (Optimization for Attr)', () => {
    const mockSignal = () => {
      tracker.report('s-original-state')
      return 'active'
    }

    const vnode = h('div', { class: mockSignal })

    const inst = vnode.instructions.find(i => i.action === 'setAttr')
    expect(inst).toBeDefined()
    expect(inst?.signalId).toBe('s-original-state')
    expect(inst?.attrName).toBe('class')

    // ⭐️ 修正: "active" が含まれており、その後に識別子(q-...)が続くことを許容する
    expect(vnode.html).toMatch(/class="active\s+q-.*"/)
  })
})
