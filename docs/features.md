# Features & Usage

Quix が提供する主要な機能と、その使用方法について解説します。

## 1. State Management (Builder API)

Quix はメソッドチェーンを用いた厳格な Builder パターンを採用しています。これにより、ステートの依存関係が明確になり、型安全性が保証されます。

```jsx
import { component } from '@quix/runtime'

export default component('App')
  // 1. State: 書き換え可能な値
  .state('count', 0)
  
  // 2. Derived: 他のステートに依存する計算値（読み取り専用）
  // 第2引数で依存するキーを指定します
  .derived('double', ['count'], s => s.count() * 2)
  
  // 3. Handler: イベントハンドラ（書き込み可能）
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  
  // 4. Render: Viewの定義
  .render(({ state, handlers }) => (
    <button onclick={handlers.inc}>
      Count: {state.count()} (Double: {state.double()})
    </button>
  ))
```

## 2. Type Safety (Dependency Inference)

`derived` や `handler` では、第2引数の配列（依存リスト）に指定したキーのみが、コールバック関数内のスコープで利用可能になります。これにより、不要な依存や意図しない副作用を防ぎます。

```jsx
.state('a', 1)
.state('b', 2)
.derived('sum', ['a'], s => {
  s.a() // OK
  // s.b() // Error: Property 'b' does not exist
  return s.a() + 10
})
```

## 3. Conditional Rendering (`<Show />`)

`if` 文の代わりに `<Show />` コンポーネントを使用することで、DOM の条件付きレンダリングを実現します。

```jsx
import { component, Show } from '@quix/runtime'

// ...
.render(({ state }) => (
  <div>
    <Show when={() => state.count() % 2 === 0}>
      <p style="color: red">Even Number!</p>
    </Show>
    
    <Show when={() => state.count() % 2 !== 0}>
      <p style="color: blue">Odd Number!</p>
    </Show>
  </div>
))
```

- **仕組み:** `when` プロパティに渡された関数は「式」として解析され、生成される JavaScript 内で三項演算子などのロジックとして展開されます。
- **DOM更新:** 条件が変化すると、`innerHTML` を書き換えることで表示を切り替えます。

## 4. Auto-Optimized Rendering

JSX 内に書かれた関数（インライン関数）は、Quix コンパイラによって自動的に最適化されます。

- **Hidden Derived:** `{() => state.count() * 2}` のような式は、自動的に名前のない派生ステートとして抽出されます。
- **Fine-Grained Updates:** その値が変化したとき、関連するテキストノードだけが `textContent` で直接更新されます。コンポーネント全体の再レンダリングは発生しません。