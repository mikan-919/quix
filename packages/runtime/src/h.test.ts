import { describe, expect, test } from 'bun:test'
import { h } from './h'

describe('h function (JSX Runtime)', () => {
  test('should generate static HTML', () => {
    const vnode = h('div', { id: 'test' }, 'Hello')
    expect(vnode.html).toBe('<div id="test">Hello</div>')
    expect(vnode.instructions).toHaveLength(0)
  })

  test('should handle nested children', () => {
    const vnode = h('div', null, h('span', null, 'Child'))
    expect(vnode.html).toContain('<div><span>Child</span></div>')
  })

  test('should optimize inline functions as Hidden Derived', () => {
    // モック用の依存報告ロジック
    // h関数内の child() 実行時に tracker.report が呼ばれるのを模倣するため、
    // ここでは tracker は使わず、h関数が内部で runWithScope しているかを確認するのは難しい。
    // 代わりに、関数が実行されることと、リクエストが生成されることを確認する。

    const mockFn = () => {
      // 本来はここで tracker.report('s-123') などが呼ばれる
      return 123
    }

    const vnode = h('p', null, 'Count: ', mockFn)

    // 1. QIDクラスが付与されているか
    expect(vnode.html).toMatch(/<p\s+class="q-.*">/)

    // 2. Hidden Derived リクエストが生成されているか
    expect(vnode.hiddenDerivedRequests).toHaveLength(1)
    const req = vnode.hiddenDerivedRequests[0]
    expect(req.templateBody).toContain('Count:')
    expect(req.templateBody).toContain('${val}') // プレースホルダー

    // 3. setText命令が生成されているか
    expect(vnode.instructions).toHaveLength(1)
    expect(vnode.instructions[0].action).toBe('setText')
    expect(vnode.instructions[0].signalId).toBe(req.placeholderId)
  })

  test('should extract event handlers', () => {
    // BuilderのHandler Proxyが返す形式を模倣
    const handlerMarker = '{{HANDLER:h-abc}}'

    const vnode = h('button', { onClick: handlerMarker }, 'Click Me')

    // 1. addListener命令が生成されているか
    expect(vnode.instructions).toHaveLength(1)
    const inst = vnode.instructions[0]
    expect(inst.action).toBe('addListener')
    expect(inst.attrName).toBe('click') // onClick -> click
    expect(inst.signalId).toBe('h-abc')

    // 2. HTMLから属性が消えているか（クラス名だけになっているか）
    expect(vnode.html).not.toContain('onClick')
    expect(vnode.html).toMatch(/<button\s+class="q-.*">/)
  })
})
