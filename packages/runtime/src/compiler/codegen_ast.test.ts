import { describe, expect, test } from 'bun:test'
import { ComponentContext } from '../core/context'
import { generateAppJs } from './codegen'

describe('AST-based Code Generation', () => {
  test('should correctly transform nested setters with spread syntax', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('items', ['A'])

    const handlerFn = (s: { items: (v?: string[]) => string[] }) => {
      return s.items([...s.items(), 'B'])
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ctx.addHandler('addItem', handlerFn as any)
    const handlerId = ctx.getNodeByKey('addItem')?.id

    // 【修正】コード生成をトリガーするために命令を追加
    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: '#btn',
        action: 'addListener',
        attrName: 'click',
      })
    }

    const output = generateAppJs(ctx)
    expect(output).toMatch(
      /_[a-z]\s*=\s*\[\.\.\._[a-z],\s*"B"\],\s*_u_[a-z]\(\)/
    )
  })

  test('should NOT transform unrelated external function calls', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('count', 0)

    const handlerFn = (s: { count: () => number }) => console.log(s.count())
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ctx.addHandler('logIt', handlerFn as any)
    const handlerId = ctx.getNodeByKey('logIt')?.id

    // 【修正】命令を追加
    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: '#btn',
        action: 'addListener',
        attrName: 'click',
      })
    }

    const output = generateAppJs(ctx)

    expect(output).toContain('console.log(')
    expect(output).not.toContain('.count()')
    expect(output).toMatch(/console\.log\(_[a-z]\)/)
  })

  test('should distinguish state getters from same-named methods on other objects', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('map', { data: 1 })

    const handlerFn = (_s: unknown) => {
      const arr = [1, 2]
      return arr.map(x => x * 2)
    }
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ctx.addHandler('testMap', handlerFn as any)
    const handlerId = ctx.getNodeByKey('testMap')?.id

    // 【修正】命令を追加
    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: '#btn',
        action: 'addListener',
        attrName: 'click',
      })
    }

    const output = generateAppJs(ctx)

    expect(output).toContain('.map(')
    expect(output).not.toMatch(/_\w+\(x => x \* 2\)/)
  })
})
