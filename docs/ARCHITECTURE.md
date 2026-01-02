# Quix Architecture

## 1. 全体フロー概要

### A. Build Time Flow (Node.js環境)
1. **Transform (Babel):**
   * JSX内の式を `() => expression` にラップし、一貫したシグナルアクセス (`()`) に統一します。
2. **Definition Phase (Blueprint):**
   * `component('App').props(...).state(...)` が実行されます。この時点では解析は行われず、`ComponentBuilder` オブジェクトに「設計図」として定義が蓄積されます。
3. **Instantiation & Analysis (`buildInstance`):** ⭐️ **重要変更**
   * ルートの `.render()` または `h(Child, props)` が呼ばれた際、設計図から `ComponentContext` インスタンスが生成されます。
   * **Zod Validation:** このフェーズで Props が検証され、不正なデータはビルドエラーとなります。
   * **Signal Unwrapping:** バリデーション時は値を評価し、依存追跡時は Proxy を介して親の State ID を特定します。
4. **Instruction Bubbling (Merging):** ⭐️ **重要変更**
   * 子コンポーネントの解析結果（Nodes, Instructions）は、`additionalNodes` を通じて親へ再帰的に「吸い上げ」られます。
   * 最終的にルートの `ComponentContext` にアプリ全体の全命令がフラットに集約されます。
5. **Code Generation:**
   * 集約された巨大なグラフから、重複を排除し、Dead Code を削除した Vanilla JS を生成します。

---

## 2. モジュール構造 (`packages/runtime/src/`)

### 追加・更新された主要ファイル

- **`core/builder.ts`**: **[役割変更]** 即時実行エンジンから「設計図（Blueprint）」クラスへ。Props の型推論と `buildInstance`（実体化）を管理します。
- **`core/components/`**: ⭐️ **[新規]** 組み込みコンポーネントの解析ロジックを分離。
    - `Show.ts`: 条件付きレンダリングの解析。
    - `For.ts`: リストレンダリングの解析。
    - `Component.ts`: 子コンポーネントの実体化とマージ。
- **`h.ts`**: JSXランタイム。タグの種類に応じて `core/components/` の各ハンドラへ処理を委譲するオーケストレーター。
- **`core/symbols.ts`**: **[新規]** `For` や `Show` の識別子。`h.ts` との循環参照を防ぐための独立した定義ファイルです。
- **`core/id.ts`**: **[更新]** スタックベースの ID 管理。`pushIdContext` / `popIdContext` により、ネストしたコンポーネント間での ID 衝突やカウンターの乱れを防ぎます。
- **`core/context.ts`**: **[更新]** `instanceId` を導入。同じコンポーネントが複数回使われても、ID が衝突しないよう管理します。

---

## 3. リアクティビティの仕組み

### Build Time: Props Bridging (親から子への連鎖)
Props のリアクティビティは、実行時ではなく **「ビルド時の Proxy 転送」** で解決されます。

```typescript
// 解析時のイメージ
// 1. 親が <Child count={state.val()} /> と渡す
// 2. h() が state.val() を実行。tracker が 's-App-0' (親ID) を検知。
// 3. 子の解析時、props.count() を呼ぶと Proxy が 's-App-0' を報告。
// 4. 子の DOM 更新命令 (setText) の監視先が直接 's-App-0' に設定される。
```

### Run Time: Shortcut Update (直結更新)
生成される JS では、コンポーネントの境界は消滅します。
```javascript
// 生成されるコードのイメージ
let _a = 0; // 親の state.val

function _u_a() {
  _e0.textContent = _a; // 親のDOM
  _e5.textContent = _a; // 子のDOM（直接親の変数を参照！）
}
```
このように、親の変数が変わると、子の DOM を更新する関数が直接呼ばれます。Props を中継するコスト（Prop Drilling の実行時負荷）は **ゼロ** です。

### Build Time: Handler Argument Transformation ⭐️ **[追加]**
イベントハンドラにおいて、第一引数のスコープ (`s`) を削除し、ブラウザのイベントオブジェクト (`e`) を受け取れるように AST を書き換えます。
- **Source:** `(s, e) => s.val(e.target.value)`
- **Output:** `e => (_a = e.target.value, _u_a())`