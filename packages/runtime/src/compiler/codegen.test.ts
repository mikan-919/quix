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

  test('Show命令の更新ロジック: HTMLテンプレートからの取得とクローニングに加え、リバインドの呼び出し', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('val', true)
    const valId = ctx.getNodeByKey('val')?.id

    ctx.instructions.push({
      signalId: valId!,
      selector: '.anchor',
      action: 'show',
      template: '<p>Hi</p>',
      templateId: 'tmpl-test-id',
    })

    const output = generateAppJs(ctx)

    // テンプレート取得ロジック
    expect(output).toContain(
      "const _tmpl_tmpl_test_id = document.getElementById('tmpl-test-id');"
    )
    // クローニングとリバインドロジック
    expect(output).toContain('if(!_e0.firstChild)')
    expect(output).toContain(
      '_e0.appendChild(_tmpl_tmpl_test_id.content.cloneNode(true))'
    )
    expect(output).toContain('_u_rebind_tmpl_test_id()')
  })

  test('Forコンポーネントのリスト更新ロジック: _reconcile ヘルパー関数とテンプレートを利用すること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('items', ['A', 'B'])
    const itemsId = ctx.getNodeByKey('items')?.id

    ctx.instructions.push({
      signalId: itemsId!,
      selector: '.list-anchor',
      action: 'list',
      template: '<div class="item"><q-text></q-text></div>',
      templateId: 'tmpl-list-id',
    })

    const output = generateAppJs(ctx)

    // _reconcile 関数の定義が含まれていること
    expect(output).toContain('function _reconcile(container, items, template)')

    // テンプレートの宣言
    expect(output).toContain(
      "const _tmpl_tmpl_list_id = document.getElementById('tmpl-list-id');"
    )

    // 更新関数内で _reconcile が呼ばれていること
    // _reconcile(container, items, template)
    expect(output).toContain('_reconcile(_e0, _a, _tmpl_tmpl_list_id);')

    // innerHTML への直接代入が含まれていないこと
    expect(output).not.toContain('.innerHTML =')
  })
})
