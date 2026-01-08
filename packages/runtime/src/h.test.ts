import { describe, expect, test } from 'bun:test'
import { tracker } from './core/tracker'
import { h } from './h'
import { For, Show } from './index'

describe('h function: JSXランタイムの命令生成ロジック', () => {
  test('静的要素: 命令を生成せずそのままのHTMLを返すこと', () => {
    const vnode = h('div', { id: 'test' }, 'Hello')
    expect(vnode.html).toBe('<div id="test">Hello</div>')
    expect(vnode.instructions).toHaveLength(0)
  })

  test('インライン関数の最適化: テキスト補間を Hidden Derived としてリクエストすること', () => {
    const mockFn = () => 123
    const vnode = h('p', null, 'Count: ', mockFn)

    expect(vnode.html).toMatch(/<p\s+class="q-.*">/)
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)

    // テキスト補間の場合、isExpression フラグは false (undefined) であること
    expect(vnode.hiddenDerivedRequests[0]?.isExpression).toBeFalsy()
    expect(vnode.instructions[0]?.action).toBe('setText')
  })

  test('Show コンポーネント: アンカー、show 命令、式のフラグ管理', () => {
    const conditionFn = () => true
    const vnode = h(Show, { when: conditionFn }, h('span', null, 'Content'))

    // アンカー要素の出力確認
    expect(vnode.html).toContain('data-show-anchor><span>Content</span></span>')
    expect(vnode.html).toContain('<template id="tmpl-')
    expect(vnode.html).toContain('<span>Content</span></template>')

    expect(vnode.instructions).toHaveLength(1)
    const inst = vnode.instructions[0]
    expect(inst?.action).toBe('show')
    expect(inst?.template).toBe('<span>Content</span>')

    // Show の条件式は「式 (isExpression: true)」としてリクエストされること
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)
    expect(vnode.hiddenDerivedRequests[0]?.isExpression).toBe(true)
  })

  test('For コンポーネント: リストレンダリングのテンプレート抽出と {v} 置換', () => {
    const mockStateItems = () => {
      tracker.report('s-mock-items')
      return ['A', 'B']
    }

    const vnode = h(For, { each: mockStateItems }, (item: () => unknown) =>
      h('div', { class: 'item' }, item)
    )

    expect(vnode.html).toMatch(/data-for-anchor/)
    expect(vnode.instructions).toHaveLength(1)

    const inst = vnode.instructions[0]
    expect(inst?.action).toBe('list')
    // 新しい実装では for- プレフィックスの独自IDが生成される
    expect(inst?.signalId).toMatch(/^for-/)
    // item() が呼び出された箇所がテンプレート内で <q-text> になっていること
    expect(inst?.template).toMatch(
      /<div class="item q-.*"><q-text><\/q-text><\/div>/
    )
    expect(inst?.templateId).toBeDefined()
  })

  test('最適化 A: 単一シグナルの補間は Hidden Derived を作らず直結すること', () => {
    const mockSignal = () => {
      tracker.report('s-original')
      return 'val'
    }

    // <span>{() => signal()}</span> のように、関数が唯一の子要素の場合
    const vnode = h('span', null, mockSignal)

    expect(vnode.instructions).toHaveLength(1)
    // 中間ノード (hd-) を作らず、直接 s-original に紐付いているか
    expect(vnode.instructions[0]?.signalId).toBe('s-original')
    expect(vnode.hiddenDerivedRequests).toHaveLength(0)
  })

  test('混合テキストの処理: 静的文字と混ざる場合は Hidden Derived が必須であること', () => {
    const mockSignal = () => {
      tracker.report('s-1')
      return 'val'
    }

    // <span>Value: {() => signal()}</span>
    const vnode = h('span', null, 'Value: ', mockSignal)

    // 期待値: hd- ノードが生成され、そちらをsetTextの対象にする
    expect(vnode.instructions[0]?.signalId).toContain('hd-')
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)
  })

  test('属性のリアクティブ化: setAttr 命令と初期値のHTML反映', () => {
    const mockSignal = () => {
      tracker.report('s-attr')
      return 'dynamic-value'
    }

    const vnode = h('input', { value: mockSignal })

    const inst = vnode.instructions.find(i => i.action === 'setAttr')
    expect(inst).toBeDefined()
    expect(inst?.attrName).toBe('value')
    expect(inst?.signalId).toBe('s-attr')
    // 初期レンダリング用のHTMLに値が含まれていること
    expect(vnode.html).toContain('value="dynamic-value"')
  })

  test('属性の最適化: クラス等の属性で単一シグナルならショートカットを適用すること', () => {
    const mockSignal = () => {
      tracker.report('s-original-state')
      return 'active'
    }

    const vnode = h('div', { class: mockSignal })

    const inst = vnode.instructions.find(i => i.action === 'setAttr')
    expect(inst?.signalId).toBe('s-original-state')
    // HTML出力: "初期値 + 追跡用ID(q-...)" の形式
    expect(vnode.html).toMatch(/class="active\s+q-.*"/)
  })
})
