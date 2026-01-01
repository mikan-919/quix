# Current Status & Implementation Gap

## 実装済み機能 (Implemented)

### Core
- [x] **Builder Pattern:** `state`, `derived`, `handler`, `render` のメソッドチェーンによるコンポーネント定義。
- [x] **Reactive Graph:** Proxy を用いた依存関係の自動解決とグラフ構築。
- [x] **Code Generator:** 依存グラフから命令型 JS (Vanilla JS) へのコンパイル。
- [x] **Deterministic IDs:** コンポーネント名に基づく固定 ID 生成（リロードしてもクラス名が変わらない）。

### Rendering
- [x] **Text Interpolation:** `{() => state.val()}` によるテキストノードの更新 (`setText`)。
- [x] **Attribute Binding:** 静的な属性およびイベントハンドラのバインド。
- [x] **Conditional Rendering:** `<Show when={...}>` コンポーネントによる表示切り替え (`innerHTML` 置換)。
- [x] **Expression Support:** `{condition ? 'A' : 'B'}` のような式を JS の式として正しくコード生成するフラグ管理 (`isExpression`)。

### Optimization
- [x] **Build-time Execution (SSR-like):** Vite プラグイン内でのコンポーネント実行と HTML 生成。
- [x] **FOUC Prevention:** 生成された HTML を `index.html` に注入し、初期表示のちらつきを防止。
- [x] **Dead Code Elimination:** DOM 更新に使用されない不要な派生ステートのコード生成をスキップ。

### DX (Developer Experience)
- [x] **HMR:** ファイル変更時のホットリロード（Full Reload 方式）。
- [x] **Type Safety:** `ToReader`, `ToSignal` 等の型ユーティリティによる、依存配列に応じた厳密な型推論。

---

## 未実装・課題 (Missing / TODO)

### Priority: High (直近の目標)
- [ ] **List Rendering (`<For>`):** 配列データを元にしたリストレンダリング。
    - 現状は `map` を使っても静的な展開しかできず、動的な追加・削除に対応できない。
    - `innerHTML` ではなく、`template` 要素と `cloneNode` を使った効率的な DOM 生成が必要。
- [ ] **Props Passing:** 親コンポーネントから子コンポーネントへのデータ受け渡し。
    - 現在は単一のコンポーネント（App）で完結している。
- [ ] **Input Binding:** `input` 要素への双方向バインディング（`bind:value` のような仕組み）。

### Priority: Medium (中期的目標)
- [ ] **Ref:** 生の DOM 要素への参照を取得する仕組み。
- [ ] **Lifecycle Hooks:** `onMount`, `onCleanup` などのライフサイクルイベント。
- [ ] **Improved Hydration:** 現在は既存 HTML を `innerHTML` で上書きするケース（Show等）があるため、完全に既存 DOM を再利用する真の Hydration への移行。
- [ ] **Style Scoping:** コンポーネント単位の CSS スコープ管理。

### Priority: Low (長期的目標)
- [ ] **Global State:** コンポーネントを跨いだ状態管理。
- [ ] **AST Transformation:** 現在の正規表現 (`Regex`) ベースのコード置換から、AST (Abstract Syntax Tree) を用いた堅牢な変換への移行。