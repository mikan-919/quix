import { describe, expect, test } from 'bun:test'
import { ComponentContext } from '../core/context'
import { generateAppJs } from './codegen'

describe('AST-based Codegen: 高度なJavaScript変換', () => {
  test('ネストしたSetter: スプレッド構文を含む配列更新が正しく変換されること', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('items', ['A'])

    // (s) => s.items([...s.items(), 'B']) 形式のハンドラ
    const handlerFn = (s: { items: (v?: string[]) => string[] }) =>
      s.items([...s.items(), 'B'])
    ctx.addHandler('addItem', handlerFn, [])
    const handlerId = ctx.getNodeByKey('addItem')?.id

    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: '#btn',
        action: 'addListener',
        attrName: 'click',
      })
    }

    const output = generateAppJs(ctx)
    // 期待値: _a = [..._a, "B"], _u_a()
    expect(output).toMatch(
      /_[a-z]\s*=\s*\[\.\.\._[a-z],\s*"B"\],\s*_u_[a-z]\(\)/
    )
  })

  test('外部関数呼び出し: 関係のない console.log などは変換されないこと', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('count', 0)
    const handlerFn = (s: { count: () => number }) => console.log(s.count())
    ctx.addHandler('logIt', handlerFn, [])

    const handlerId = ctx.getNodeByKey('logIt')?.id
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

  test('メソッド名の衝突回避: Array.prototype.map と Stateの map が区別されること', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('dataMap', {}) // 名前が衝突しそうなステート

    const handlerFn = (_s: unknown) => [1, 2].map(x => x * 2)
    ctx.addHandler('testMap', handlerFn, [])

    const handlerId = ctx.getNodeByKey('testMap')?.id
    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: '#btn',
        action: 'addListener',
        attrName: 'click',
      })
    }

    const output = generateAppJs(ctx)
    // 配列の .map() はそのまま残っている必要がある
    expect(output).toContain('.map(')
  })

  test('イベント引数の処理: ハンドラから scope 引数が削除され (e) => ... になること', () => {
    const ctx = new ComponentContext('TestApp')
    ctx.addState('val', '')
    const valId = ctx.getNodeByKey('val')?.id

    // (s, e) => s.val(e.target.value)
    const handlerFn = (
      s: { val: (v: string) => void },
      e: { target: { value: string } }
    ) => s.val(e.target.value)

    if (valId) ctx.addHandler('onInput', handlerFn, [valId])

    const handlerId = ctx.getNodeByKey('onInput')?.id

    if (handlerId) {
      ctx.instructions.push({
        signalId: handlerId,
        selector: 'input',
        action: 'addListener',
        attrName: 'input',
      })
    }

    const output = generateAppJs(ctx)
    // scope(s)が消え、e だけが残る
    expect(output).toMatch(
      /\.addEventListener\('input',\s*\(?e\)?\s*=>\s*\(?_a=e\.target\.value,\s*_u_a\(\)\)?/
    )
  })
})
