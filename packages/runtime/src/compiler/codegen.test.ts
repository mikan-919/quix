import { describe, expect, test } from 'bun:test'
import { ComponentContext } from '../core/context'
import { generateAppJs } from './codegen'

describe('Code Generator', () => {
  test('should generate state declarations', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)

    const output = generateAppJs(ctx)

    // 変数定義が含まれているか (let _a = 0;)
    expect(output).toMatch(/let _[a-z] = 0;/)
  })

  test('should generate derived functions with dependency replacement', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 1)

    // s.count() * 2 という関数を登録
    const countId = ctx.getNodeByKey('count')?.id
    ctx.addDerived('double', (s: any) => s.count() * 2, [countId])

    const output = generateAppJs(ctx)

    // Derivedが const _b = ... の形で定義されているか
    // _a はステート、_b はDerivedと仮定
    expect(output).toMatch(/const _[a-z] = \(?s\)? => _[a-z] \* 2;/)
  })

  test('should generate update functions (Cascading)', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)
    const countId = ctx.getNodeByKey('count')?.id

    // Derivedを追加して依存関係を作る
    ctx.addDerived('double', () => {}, [countId])

    const output = generateAppJs(ctx)

    // ステートの更新関数 _u_a が生成され、その中で Derivedの更新 _u_b が呼ばれているか
    expect(output).toMatch(/function _u_[a-z]\(\) \{/)
    expect(output).toMatch(/_u_[a-z]\(\);/)
  })

  test('should generate event listeners with state updates', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)

    // ネストした括弧は正規表現での置換が難しいため、
    // テストでは単純な値のセット (s.count(100)) で基本動作を検証する
    ctx.addHandler('inc', (s: any) => s.count(100))

    const handlerId = ctx.getNodeByKey('inc')?.id

    // DOM要素と紐付け
    ctx.instructions.push({
      signalId: handlerId,
      selector: '.btn',
      action: 'addListener',
      attrName: 'click',
    })

    const output = generateAppJs(ctx)

    expect(output).toMatch(/addEventListener\('click'/)
    // 代入(_a = 100) と 更新関数(_u_a()) の呼び出しが含まれているか
    // s.count(100) -> (_a = 100, _u_a())
    expect(output).toMatch(/\(_[a-z] = 100, _u_[a-z]\(\)\)/)
  })
})
