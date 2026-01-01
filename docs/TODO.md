# ToDo, Issues & Refactoring

現状のコードベース解析に基づく、実装状況と課題のまとめです。

## 1. 実装済み機能 (Verified)

コード上で動作が確認できている機能です。

- **Builder API:** `state`, `derived`, `handler`, `render` のチェーン動作。
- **Dependency Tracking:** Proxy を用いた依存関係の自動解決。
- **Text Interpolation:** JSX内の `{() => state.val()}` の部分更新 (`textContent`)。
- **Conditional Rendering:** `<Show />` コンポーネント（`innerHTML` 置換による実装）。
- **Event Handling:** `handler` で定義した関数のイベントバインド。
- **Dead Code Elimination (DCE):** `codegen.ts` 内の再帰チェックによる、不要な更新関数の削除。
- **HMR (Full Reload):** ファイル変更時の全リロード対応。
- **FOUC Prevention:** Viteプラグインによる初期HTML注入。
- **List Rendering (<For>):** 配列データを元にしたリストレンダリング。
    - インターフェース: `<For each={state.items}>{(item) => <div>{item()}</div>}</For>`
    - 実装: `innerHTML` の全置換による更新。
- **AST-based Codegen:** Babelを使用した堅牢なJavaScriptコード生成。

## 2. 未実装・不安定な機能 (Missing / Unstable)

ドキュメントには記載があるがコードがない、または不完全な機能です。

- **Props Passing:**
    - コンポーネントは現在シングルトン／独立して動作しており、親から子へデータを渡す仕組みが実装されていません。
- **True Hydration:**
    - 現状はサーバーで生成したHTMLに対し、クライアント側でもう一度 `innerHTML` を生成したり、IDの整合性が崩れると動作しない可能性があります。
- **Input Binding:**
    - 双方向バインディング（`v-model`的なもの）の仕組みがありません。
- **Style Isolation:**
    - CSSのスコープ管理機能がありません。

## 3. リファクタリング提案 & 既知の問題 (Issues)

設計レベルで修正が必要な箇所です。

### B. Showコンポーネントの `innerHTML` 実装
`<Show>` は現在、アンカー要素の中身を `innerHTML` で書き換えています。
```typescript
// Current Implementation
.innerHTML = _cond ? `<p>...</p>` : '';
```
- **リスク:** 子要素に `<input>` など状態を持つ要素があった場合、表示切り替えのたびに状態がリセットされます。また、パフォーマンス的にも非効率です。
- **提案:** `template` 要素の使用や、DOMノードの `replaceWith` / `appendChild` を使用した実装への変更。

### C. ID生成の決定論
ID生成はカウンタベース（`counter++`）であり、ビルド時の実行順序に依存します。
- **リスク:** 開発中にHMR等で一部のモジュールだけ再実行された場合、IDがずれてDOMキャッシュ（`querySelector`）が失敗する恐れがあります。

### D. 循環参照のハンドリング
DCE（Dead Code Elimination）のロジックに循環参照防止の簡易的な対策はありますが、複雑な依存関係（State A -> Derived B -> State A）が発生した場合の挙動が未検証です。