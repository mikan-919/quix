import { describe, expect, test } from 'bun:test'
import z from 'zod'
import { generateAppJs } from '../../compiler/codegen'
import { For, h } from '../../index'
import { component } from '../builder'

describe('For Component: Nested Elements & Components', () => {
  test('For内のネストしたコンポーネント: インストラクションが収集されること', () => {
    const Child = component('Child')
      .props({ value: z.any() })
      .render(({ props }) => h('span', { class: 'child-val' }, props.value))

    const ctx = component('App')
      .state('items', [1, 2])
      .render(({ state }) =>
        h(For, { each: () => state.items() }, (item: () => number) =>
          h('div', { class: 'item' }, h(Child, { value: item }))
        )
      )

    // list 命令を取得
    const listInst = ctx.instructions.find(i => i.action === 'list')
    expect(listInst).toBeDefined()

    // 現状の課題: listInst が内部の Child のインストラクション（setText）を知らない可能性がある
    // また、Child のインストラクションが App のトップレベルに漏れているが、
    // それが For のアイテムに関連付けられていない

    // Child 内の span に対する setText 命令を listInst 内から探す
    const nestedSetText = listInst?.itemInstructions?.find(
      i => i.action === 'setText' && i.selector.includes('q-')
    )
    expect(nestedSetText).toBeDefined()
    expect(nestedSetText?.itemFns).toBeDefined()
  })

  test('For内の動的属性: item() に依存する属性の命令が収集されること', () => {
    const ctx = component('App')
      .state('items', [10, 20])
      .render(({ state }) =>
        h(For, { each: () => state.items() }, (item: () => number) =>
          h('div', { 'data-val': item }, 'Item')
        )
      )

    const listInst = ctx.instructions.find(i => i.action === 'list')
    expect(listInst).toBeDefined()

    const setAttrInst = listInst?.itemInstructions?.find(
      i => i.action === 'setAttr' && i.attrName === 'data-val'
    )
    expect(setAttrInst).toBeDefined()
    expect(setAttrInst?.signalId).toMatch(/^for-item-/)
  })

  test('For内のグローバルステート: 全要素を更新するための命令が生成されること', () => {
    const ctx = component('App')
      .state('items', [1, 2, 3])
      .state('globalValue', 'Hello')
      .render(({ state }) =>
        h(For, { each: () => state.items() }, () =>
          h(
            'div',
            { class: 'item' },
            h('span', { class: 'global-span' }, () => state.globalValue())
          )
        )
      )

    // globalValue の更新命令を探す
    const globalInst = ctx.instructions.find(
      i => i.action === 'setText' && i.selector.includes('q-')
    )
    expect(globalInst).toBeDefined()

    // Codegen を実行して querySelectorAll が使われているか確認
    const code = generateAppJs(ctx)
    // テンプレート内の要素なので querySelectorAll が使われるべき
    expect(code).toContain('.querySelectorAll(')
  })
})
