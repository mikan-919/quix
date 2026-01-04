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
    // biome-ignore lint/style/noNonNullAssertion: testing
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
      // biome-ignore lint/style/noNonNullAssertion: testing
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
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: itemsId!,
      selector: '.list-anchor',
      action: 'list',
      template: '<div class="item"><q-text></q-text></div>',
      templateId: 'tmpl-list-id',
    })

    const output = generateAppJs(ctx)

    // _reconcile 関数の定義が含まれていること
    expect(output).toContain(
      'function _reconcile(container, items, template, slotFns, itemUpdateFn)'
    )

    // テンプレートの宣言
    expect(output).toContain(
      "const _tmpl_tmpl_list_id = document.getElementById('tmpl-list-id');"
    )

    // 更新関数内で _reconcile が呼ばれていること
    // _reconcile(container, items, template, slotFns, itemUpdateFn)
    expect(output).toContain(
      '_reconcile(_e0, _a, _tmpl_tmpl_list_id, [], null);'
    )

    // innerHTML への直接代入が含まれていないこと
    expect(output).not.toContain('.innerHTML =')
  })
})

describe('Code Generator: Forコンポーネントの詳細テスト', () => {
  test('Forコンポーネントの初期レンダリング: stateの更新関数が初期化時に呼ばれること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('items', ['A', 'B', 'C'])
    const itemsId = ctx.getNodeByKey('items')?.id

    ctx.instructions.push({
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: itemsId!,
      selector: '.list-anchor',
      action: 'list',
      template: '<li><q-text></q-text></li>',
      templateId: 'tmpl-items',
    })

    const output = generateAppJs(ctx)

    // 初期レンダリングで state の更新関数が呼ばれること
    // state ノードの list 命令があれば _u_a() が Initial Render に含まれるべき
    expect(output).toMatch(/_u_a\(\);/)

    // リストアイテムを保持するための _q_map が使われていること
    expect(output).toContain('container._q_map')
  })

  test('Forコンポーネント: 空配列でもエラーなく動作すること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('items', [])
    const itemsId = ctx.getNodeByKey('items')?.id

    ctx.instructions.push({
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: itemsId!,
      selector: '.list-anchor',
      action: 'list',
      template: '<span><q-text></q-text></span>',
      templateId: 'tmpl-empty',
    })

    const output = generateAppJs(ctx)

    // 配列が空でも _reconcile が呼ばれること
    expect(output).toContain('_reconcile(_e0, _a, _tmpl_tmpl_empty, [], null);')
    // items.forEach が _reconcile 内で使われていること
    expect(output).toContain('items.forEach')
  })

  test('Forコンポーネント: ネストしたHTML構造のテンプレートが正しく処理されること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('users', [{ name: 'Alice' }, { name: 'Bob' }])
    const usersId = ctx.getNodeByKey('users')?.id

    ctx.instructions.push({
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: usersId!,
      selector: '.user-list',
      action: 'list',
      template:
        '<div class="user-card"><h3><q-text></q-text></h3><p>Details</p></div>',
      templateId: 'tmpl-users',
    })

    const output = generateAppJs(ctx)

    // テンプレートが登録されていること
    expect(output).toContain(
      "const _tmpl_tmpl_users = document.getElementById('tmpl-users');"
    )

    // q-text の置換処理が _reconcile 内にあること
    expect(output).toContain("clone.querySelectorAll('q-text')")
    expect(output).toContain('node._q_texts')
    expect(output).toContain('slot.parentNode.replaceChild(textNode, slot)')
  })

  test('Forコンポーネント: 単一アイテムでも正しく動作すること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('single', ['Only One'])
    const singleId = ctx.getNodeByKey('single')?.id

    ctx.instructions.push({
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: singleId!,
      selector: '.single-item',
      action: 'list',
      template: '<p><q-text></q-text></p>',
      templateId: 'tmpl-single',
    })

    const output = generateAppJs(ctx)

    // 初期化時に更新関数が呼ばれること
    expect(output).toMatch(/_u_a\(\);/)

    // DOM要素の再利用ロジックがあること (oldMap, newMap)
    expect(output).toContain('let oldMap = container._q_map')
    expect(output).toContain('let newMap = new Map()')
  })

  test('Forコンポーネント: テキストの更新ロジックが正しく動作すること', () => {
    const ctx = new ComponentContext('Test')
    ctx.addState('numbers', [1, 2, 3])
    const numbersId = ctx.getNodeByKey('numbers')?.id

    ctx.instructions.push({
      // biome-ignore lint/style/noNonNullAssertion: testing
      signalId: numbersId!,
      selector: '.number-list',
      action: 'list',
      template: '<span class="num"><q-text></q-text></span>',
      templateId: 'tmpl-numbers',
    })

    const output = generateAppJs(ctx)

    // 既存ノードの更新ロジック (_q_texts でキャッシュされたテキストノードを更新)
    expect(output).toContain('node._q_texts')
    expect(output).toContain('tn.textContent !== val')
  })
})
