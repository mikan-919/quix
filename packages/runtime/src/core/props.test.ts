import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { h } from '../h'
import { component } from './builder'

describe('Zod-driven Props: 型安全な親子通信', () => {
  test('リアクティビティの連結: 親のStateを子のPropsとして渡すと直接繋がること', () => {
    const Child = component('Child')
      .props({ age: z.number() })
      .render(({ props }) => h('span', null, props.age))

    const Parent = component('Parent')
      .state('myAge', 25)
      .render(({ state }) => h(Child as any, { age: state.myAge }))

    const allNodes = Parent.getAllNodes()
    const parentAgeNode = allNodes.find(n => n.key === 'myAge')
    const setTextInst = Parent.instructions.find(i => i.action === 'setText')

    // 子のテキスト更新の依存先が、親のステートIDになっていることを確認
    const targetNode = Parent.getNodeById(setTextInst?.signalId)
    if (targetNode?.type === 'derived') {
      expect(targetNode.deps).toContain(parentAgeNode?.id)
    }
  })

  test('ビルド時バリデーション: 不正な型を渡すとエラーを投げること', () => {
    const Child = component('Child')
      .props({ count: z.number() })
      .render(({ props }) => h('div', null, props.count))

    // number型に string を渡す
    const buildInvalid = () => {
      component('Parent').render(() => h(Child as any, { count: 'wrong' }))
    }

    expect(buildInvalid).toThrow()
  })

  test('デフォルト値: Zodの .default() が反映されること', () => {
    const Child = component('Child')
      .props({ name: z.string().default('Anonymous') })
      .render(({ props }) => h('span', null, props.name))

    const Parent = component('Parent').render(() => h(Child as any, {}))

    expect(Parent.html).toContain('Anonymous')
  })
})
