import { describe, expect, test } from 'bun:test'
import { h } from './h'
import { Show } from './index'

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
})
