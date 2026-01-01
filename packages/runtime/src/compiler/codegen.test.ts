import { describe, expect, test } from 'bun:test'
import { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'
import { generateAppJs } from './codegen'

describe('Code Generator', () => {
  test('should generate state declarations', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)

    const output = generateAppJs(ctx)
    expect(output).toMatch(/let _[a-z] = 0;/)

    // 修正: root.innerHTML が出力に含まれていないことを確認
    expect(output).not.toContain('root.innerHTML =')
  })

  test('should generate expression for Show component', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)
    const countId = ctx.getNodeByKey('count')?.id

    // Showの条件式を模倣したノードを追加
    // s.count() > 5 という式
    const conditionId = ctx.addHiddenDerived([countId!], 'state.count() > 5')

    // isExpressionフラグを手動で立てる
    const node = ctx.getNodeById(conditionId) as DerivedNode
    node.isExpression = true

    const output = generateAppJs(ctx)

    // 文字列 "..." ではなく、式として出力されているか確認
    // 変数置換も行われているはず (state.count() -> _a)
    // 期待: const _b = () => _a > 5;
    expect(output).toMatch(/const _[a-z]\s*=\s*\(\)=>_[a-z]>5;/)
    expect(output).not.toContain('`') // バッククォート（テンプレート文字列）ではない
  })

  test('should generate show instruction update logic', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('val', true)
    const valId = ctx.getNodeByKey('val')?.id
    expect(valId).toBeString()
    // show命令を追加
    ctx.instructions.push({
      signalId: valId!,
      selector: '.anchor',
      action: 'show',
      template: '<p>Hi</p>',
    })

    const output = generateAppJs(ctx)

    // innerHTML の切り替えロジックが含まれているか
    // 条件 ? `template` : ''
    expect(output).toMatch(/\.innerHTML = _[a-z] \? `<p>Hi<\/p>` : '';/)
  })
})
