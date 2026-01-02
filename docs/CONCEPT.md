# Quix Concepts & Guidelines (Revised)

## 1. Core Philosophy

### "Build-time Execution, Zero-Runtime Delivery"
Quixは、アプリケーションコードを「ブラウザで実行するスクリプト」ではなく、**「コンパイル後のVanilla JSを生成するための指示書」**として扱います。ビルド時に一度だけNode.js上で実行され、その解析結果から、命令的なDOM操作コード（副作用の塊）だけをブラウザへ出力します。

### "Blueprint & Instance"
`component()` メソッドチェーンは解析を実行するのではなく、コンポーネントの **「設計図（Blueprint）」** を作成します。実際の解析は、親コンポーネントの `render` 内で `h()` 関数がその設計図を検知し、`buildInstance()` を呼び出した瞬間に始まります。これにより、同一コンポーネントを異なる Props で複数回再利用することが可能になります。

### No Virtual DOM
実行時に仮想DOMの構築や差分検知（Diffing）は一切行いません。
解析フェーズで「どのステートがどのDOMを書き換えるか」が静的に確定されるため、実行時はピンポイントな `textContent` 更新や `innerHTML` 置換のみが行われます。

---

## 2. Coding Style & Conventions

### Signal Consistency (Everything is a Getter)
Quixにおいて、動的な値（State, Derived, Props）へのアクセスは、一貫して **関数呼び出し `()`** 形式で行います。
- **State:** `state.count()`
- **Derived:** `state.double()`
- **Props:** `props.age()`
この統一されたアクセス方法により、Babelプラグインによる自動ラップと、解析時の `tracker` による依存収集が極めてシンプルかつ堅牢に動作します。

### Zod-Driven Props
コンポーネント間のインターフェース（Props）は **Zod スキーマ** で定義します。
```typescript
.props({
  age: z.number().min(0),
  name: z.string().default('Guest')
})
```
これにより、ビルド時のバリデーション（不正な値を渡すとビルドエラーになる）と、TypeScript による強力な型推論を同時に享受できます。

---

## 3. Dos and Don'ts for AI Developers

### Dos
- **IDスタックの尊重:** ID生成はスタックベース (`pushIdContext` / `popIdContext`) です。ネストしたコンポーネント解析を行う際は、必ずスタックを管理し、親のカウンターを破壊しないこと。
- **Zodバリデーションの活用:** Props の評価前には必ず Zod スキーマを通過させること。ただし、バリデーションのための「お試し実行」は `tracker.silence` で囲み、不要な依存関係を吸い込まないようにすること。
- **シンボル分離の維持:** `For` や `Show` などの特別なコンポーネントは `core/symbols.ts` で管理すること。`h.ts` から `index.ts` をインポートすると循環参照が発生します。

### Don'ts
- **Proxyのスプレッド禁止:** `state` や `props` の Proxy オブジェクトをスプレッド演算子 (`...`) で展開してはいけません。Proxy が剥がれ、リアクティビティ（Getterのトラップ能力）が失われます。
- **Reactメンタルモデルの混同:** `useEffect` などは存在しません。副作用は `handler` か、あるいは `render` 時の命令生成としてのみ表現されます。
- **ランタイムライブラリへの依存追加:** ブラウザに送信されるコード量を最小化するため、`codegen.ts` で生成される文字列に汎用ライブラリを含めてはいけません。必要な処理は Vanilla JS として出力すること。