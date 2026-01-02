import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { h } from '../h'
import { component } from './builder'

describe('Zod-driven Props Passing', () => {
  test('should infer types from zod schema and link reactive nodes', () => {
    // 1. 子コンポーネントをZodで定義
    const Child = component('Child')
      .props({
        age: z.number(),
      })
      .render(({ props }) =>
        // ⭐️ props.age() は Zod から number 型として推論される
        h('span', null, 'Age: ', props.age)
      )

    // 2. 親コンポーネントで利用
    const Parent = component('Parent')
      .state('myAge', 25)
      .render(({ state }) =>
        // ⭐️ 親のステート(シグナル)を age プロップとして渡す
        h(Child as any, { age: state.myAge })
      )

    // --- 検証 ---

    // 検証 1: 親のStateノードを取得 (ID: s-Parent-0)
    const allNodes = Parent.getAllNodes()
    const parentAgeNode = allNodes.find(n => n.key === 'myAge')
    expect(parentAgeNode).toBeDefined()

    // 検証 2: 子コンポーネント由来の更新命令 (setText) を探す
    const setTextInst = Parent.instructions.find(i => i.action === 'setText')
    expect(setTextInst).toBeDefined()

    // 検証 3: リアクティビティの連結チェック
    const targetNode = Parent.getNodeById(setTextInst?.signalId)
    expect(targetNode).toBeDefined()

    // Quixはテキスト補間を Hidden Derived でラップするため、
    // そのラップノードの依存先(deps)に親の State ID が含まれているかを確認する
    if (targetNode?.type === 'derived') {
      // 子のラップノード(hd-Child-x)は、親のState(s-Parent-x)を監視しているはず
      expect(targetNode.deps).toContain(parentAgeNode?.id)
    } else {
      // ラップされていない場合は直接 ID が一致するはず
      expect(targetNode?.id).toBe(parentAgeNode?.id)
    }

    // 検証 4: IDの分離
    // 子のノードIDには "Child" という名前が含まれていること
    expect(targetNode?.id).toContain('Child')
  })

  test('should throw ZodError during build-time analysis if props are invalid', () => {
    const Child = component('Child')
      .props({
        count: z.number(),
      })
      .render(({ props }) => h('div', null, props.count))

    // 不正な型（numberを期待しているところにstringを渡す）
    const buildInvalidParent = () => {
      component('Parent').render(() => h(Child, { count: 'not a number' }))
    }

    // render() 内部で実行される buildInstance() 内の schema.parse() が
    // ZodError を投げることを期待
    expect(buildInvalidParent).toThrow()
  })

  test('should support default values from zod schema', () => {
    const Child = component('Child')
      .props({
        name: z.string().default('Anonymous'),
      })
      .render(({ props }) => h('span', null, props.name))

    const Parent = component('Parent').render(() =>
      // ⭐️ props を空で渡す
      h(Child as any, {})
    )

    // デフォルト値が反映された HTML が生成されているか
    expect(Parent.html).toContain('Anonymous')
  })
})
