import { expect, test } from 'bun:test'
import { generateAppJs } from './codegen'

test('Snapshot: Counter App Codegen', () => {
  const mockComponent = {
    name: 'App',
    bank: {
      count: { id: 'idx-count', value: 0, isDerived: false },
      double: {
        id: 'idx-double',
        deps: ['idx-count'],
        value: (s: any) => s.count() * 2,
        isDerived: true,
      },
    },
    handlerBank: {
      inc: (s: any) => s.count(s.count() + 1),
    },
    html: '<div>...</div>',
    instructions: [
      { signalId: 'idx-count', selector: '.q-1', path: [], action: 'setText' },
      {
        signalId: 'inc',
        selector: '.q-1',
        path: [],
        action: 'addListener',
        attrName: 'click',
      },
    ],
  }

  const output = generateAppJs(mockComponent)

  // 生成されたJSをスナップショットとして保存
  // 次回実行時、1文字でも変わるとエラーになる
  expect(output).toMatchSnapshot()
})
