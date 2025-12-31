import { describe, expect, test } from 'bun:test'
import { h } from './h'

describe('h function (HTML & Instruction generation)', () => {
  test('should optimize adjacent text and functions into one template', () => {
    const vnode = h('p', null, 'Count: ', () => 10, ' items')

    expect(vnode.html).toContain('Count: 10 items')
    expect(vnode.instructions.length).toBe(1)
    expect(vnode.hiddenDerived.length).toBe(2)

    // 4. テンプレートが正しく構築されているか
    const templateNode = vnode.hiddenDerived.find(d =>
      d.id.startsWith('hd-tmpl')
    )
    expect(templateNode?.templateBody).toContain('Count:')
    expect(templateNode?.templateBody).toContain('items')
  })
  test('should handle event handlers without wrapping them in functions', () => {
    const vnode = h('button', { onClick: '{{HANDLER:inc}}' }, 'Click')

    expect(vnode.instructions[0].action).toBe('addListener')
    expect(vnode.instructions[0].attrName).toBe('click')
    // HTMLから属性が消えている（またはマーカーになっている）ことを確認
    expect(vnode.html).not.toContain('onClick')
  })
})
