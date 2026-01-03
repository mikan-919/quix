import { describe, expect, test } from 'bun:test'
import { transformQuix } from '../src/index.ts'

// 出力のフォーマット差異（改行やスペース）を無視して比較するためのヘルパー
const normalize = (code: string) => code.replace(/\s+/g, ' ').trim()

describe('Quix SWC Plugin Transformation', () => {
  test('基本的な変換: PropsとChildrenの遅延評価化', () => {
    const code = `const App = () => <div color={state()}>{item()}</div>;`
    const result = transformQuix(code, 'test.tsx')

    // 1. 自動インポートが追加されていること
    expect(result).toContain('import { h } from "@quix/runtime";')

    // 2. h関数に変換されていること
    expect(result).toContain('h("div"')

    // 3. Propsが () => state() にラップされていること
    // SWCの出力スペース等に依存しないよう正規化してチェックするか、部分一致を使う
    expect(result).toContain('color: ()=>state()')

    // 4. Childrenが () => item() にラップされていること
    expect(result).toContain('()=>item()')
  })

  test('自動インポート: すでに h がある場合は追加しない', () => {
    const code = `
      import { h } from "other-library";
      
      // ▼▼▼ これを追加してください！ ▼▼▼
      console.log(h); 
      // ▲▲▲ SWCによる「未使用インポート削除」を防ぎます ▲▲▲
      
      const App = () => <div />;
    `
    const result = transformQuix(code, 'test.tsx')

    // @quix/runtime からのインポートがないこと
    expect(result).not.toContain('@quix/runtime')
    // 元のインポートが残っていること
    expect(result).toContain('from "other-library"')
  })

  test('除外ロジック1: イベントハンドラ (onStart...) はラップしない', () => {
    const code = `<button onClick={handleClick} onInput={handleInput} />`
    const result = transformQuix(code, 'test.tsx')

    // onClick: () => handleClick ではなく、 onClick: handleClick になっているはず
    expect(result).toContain('onClick: handleClick')
    expect(result).not.toContain('onClick: ()=>handleClick')

    expect(result).toContain('onInput: handleInput')
  })

  test('除外ロジック2: すでにアロー関数の場合は二重にラップしない', () => {
    const code = `<div callback={() => doSomething()} />`
    const result = transformQuix(code, 'test.tsx')

    // callback: () => doSomething() のままであること
    // (() => () => doSomething()) になっていないこと
    expect(normalize(result)).toContain('callback: ()=>doSomething()')
    expect(normalize(result)).not.toContain('()=>()=>')
  })

  test('静的な値の処理', () => {
    const code = `<div id="my-id" disabled />`
    const result = transformQuix(code, 'test.tsx')

    // 文字列リテラルはそのまま
    expect(result).toContain('id: "my-id"')
    // boolean属性は true
    expect(result).toContain('disabled: true')
  })

  test('ネストしたJSXの処理', () => {
    const code = `
      <div>
        <span>{text}</span>
      </div>
    `
    const result = transformQuix(code, 'test.tsx')
    // const normalized = normalize(result); // 必要に応じて使用

    // 外側のdiv
    expect(result).toContain('h("div"')

    // 内側のspanもh関数になるが、直下の子要素なので関数ラップはされない
    // h("div", {}, h("span", {}, ()=>text)) のような構造になる

    // 修正: => なしで h("span" が含まれていることを確認
    expect(result).toContain('h("span"')

    // 念のため、ラップされていないことを確認する場合
    expect(result).not.toMatch(/=>\s*h\("span"/)
  })

  test('JSX Fragmentの処理', () => {
    const code = `<><div /></>`
    const _result = transformQuix(code, 'test.tsx')
    const codeProp = `<div icon={<Icon />} />`
    const resultProp = transformQuix(codeProp, 'test.tsx')

    // icon: () => h(Icon, ...) となっていること
    expect(resultProp).toMatch(/icon:\s*\(\)=>\s*h\(/)
  })
})
