import { beforeEach, describe, expect, test } from 'bun:test'
import { component } from './builder'
import { h } from './h'
import { setTestingMode } from './id' // ID生成を固定する場合

describe('Quix Analysis Engine', () => {
  beforeEach(() => {
    setTestingMode(true) // テストごとにIDをリセット
  })

  test('should correctly build a dependency graph for derived states', () => {
    const App = component('TestApp')
      .state('count', 0)
      .derived('double', ['count'], s => s.count() * 2)

    const bank = App.bank as any
    const countId = bank.count.id
    const _doubleId = bank.double.id

    expect(bank.double.deps).toContain(countId)
  })

  test('should extract Hidden Derived nodes from JSX', () => {
    const App = component('TestApp')
      .state('count', 10)
      .render(({ state }) => h('div', null, 'Value is: ', () => state.count()))

    // bankの中に hd-tmpl-... が自動生成されているか確認
    const bankEntries = Object.keys(App.bank)
    const hasTemplate = bankEntries.some(key => key.startsWith('hd-tmpl'))
    expect(
      App.bank[bankEntries.find(key => key.startsWith('hd-tmpl'))!]
        ?.templateBody
    ).toMatch(/Value is: \$\{.*\}/)
    expect(hasTemplate).toBe(true)

    // 命令セットに setText が登録されているか確認
    expect(App.instructions[0].action).toBe('setText')
  })
})
