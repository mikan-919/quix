# Quix Concepts & Guidelines

## 1. Core Philosophy

### "Build-time Execution, Zero-Runtime Delivery"
Quixは、アプリケーションコードを**「ブラウザで実行するスクリプト」ではなく、「コンパイラへの指示書」**として扱います。
コンポーネント定義はビルドプロセスの一部としてNode.js上で実行され、その結果として「最適化された生のJavaScript」が生成されます。

### No Virtual DOM
実行時に仮想DOMの構築や差分検知（Diffing）は一切行いません。
`textContent = ...` や `innerHTML = ...` といった、ピンポイントなDOM操作命令にコンパイルされます。

### Explicit Logic, Implicit Wiring
ユーザーはメソッドチェーンでロジックを明示的に記述しますが、それらがどうDOMに結びつくか（Wiring）は、Proxyとコンパイラが自動的に解決します。

---

## 2. Coding Style & Conventions

現在のコードベースにおいて推奨される（強制される）スタイルです。

### Builder Pattern over Hooks/Classes
関数コンポーネントやクラスコンポーネントではなく、**Builder Pattern** を採用しています。
```typescript
// Good
export default component('App')
  .state('count', 0)
  .render(...)
```
これは、解析フェーズにおいてコンテキストの汚染を防ぎ、型安全性を高めるためです。

### Getter Access for State
ステートへのアクセスは常に関数呼び出し（Getter）形式で行います。
これにより、単純な参照とリアクティブな依存を区別し、ビルド時の追跡を確実にします。
```typescript
// Good
state.count() 

// Bad (Quixでは動作しない、または追跡されない)
state.count
```

### Inline Functions for Optimization
JSX内の動的な値は、必ず関数でラップします（Babelプラグインにより自動化されていますが、意識することが重要です）。
```typescript
// これにより、"Hidden Derived" として個別に最適化・更新されます
<p>Count: {() => state.count()}</p>
```

---

## 3. Dos and Don'ts for AI Developers

今後の開発において、AI（あなた）が遵守すべきルールです。

### Dos
- **コード生成の責務を守る:** 新機能を追加する際は、ランタイムライブラリを太らせるのではなく、`codegen.ts` を修正して「生成されるコード」を変えることを第一に考えること。
- **決定論的であること:** ID生成やコード出力は、何度実行しても同じ結果になるように設計すること（Hydrationのため）。
- **型の整合性:** `core/types.ts` の型定義と `builder.ts` の推論ロジックの整合性を常に保つこと。

### Don'ts
- **Reactのメンタルモデルを持ち込まない:** `useState` や `useEffect` のようなランタイムフックは存在しません。すべては静的な依存グラフとして表現される必要があります。
- **DOMへの直接アクセスを前提としない:** コンポーネント定義時（解析時）は Node.js 環境で動いています。`window` や `document` に直接アクセスするコードを Builder 内に書いてはいけません（`codegen.ts` が生成する文字列の中に含めるのはOK）。
- **`innerHTML` の乱用:** `<Show>` コンポーネント等は現在 `innerHTML` を使用していますが、これは入力フォーム等の状態をリセットする副作用があります。可能な限り `textContent` や細粒度のDOM操作を目指すべきです。