import { describe, expect, test } from 'bun:test'
import { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'
import { generateAppJs } from './codegen'

describe('Code Generator: 基本的なコード生成', () => {
  test('ステート宣言: let変数として適切に出力されること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)

    const output = generateAppJs(ctx)

    // ステートが let _a = 0; の形式で定義されているか
    expect(output).toMatch(/let _[a-z] = 0;/)
    // 不要な innerHTML の初期化が含まれていないこと
    expect(output).not.toContain('root.innerHTML =')
  })

  test('Showコンポーネントの条件式: バッククォートではなく「式」として生成されること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('count', 0)
    const countId = ctx.getNodeByKey('count')?.id

    // 条件: state.count() > 5
    const conditionId = ctx.addHiddenDerived([countId!], 'state.count() > 5')
    const node = ctx.getNodeById(conditionId) as DerivedNode
    node.isExpression = true

    const output = generateAppJs(ctx)

    // 期待値: const _b = () => _a > 5; （文字列リテラルではなく実行可能な関数）
    expect(output).toMatch(/const _[a-z]\s*=\s*\(\)=>_[a-z]>5;/)
    expect(output).not.toContain('`')
  })

  test('Show命令の更新ロジック: 三項演算子によるinnerHTMLの切り替え', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('val', true)
    const valId = ctx.getNodeByKey('val')?.id

    ctx.instructions.push({
      signalId: valId!,
      selector: '.anchor',
      action: 'show',
      template: '<p>Hi</p>',
    })

    const output = generateAppJs(ctx)

    // 条件に応じたテンプレートの挿入ロジックを確認
    expect(output).toMatch(/\.innerHTML = _[a-z] \? `<p>Hi<\/p>` : '';/)
  })
})
