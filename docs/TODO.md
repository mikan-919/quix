# ToDo, Issues & Refactoring (2026/01/03版)

現状のコードベース解析に基づく、実装状況と課題の最新版です。

## 1. 実装済み機能 (Verified)

今日の開発を通じて「確実に動く」ことが確認されたコア機能です。

- **Blueprint Builder API:** `ComponentBuilder` を設計図（Blueprint）として扱い、`h()` 呼び出し時に実体化（Instantiation）する高度なコンポーネントシステム。
- **Zod-driven Props Passing:** Zod スキーマによるビルド時バリデーションと、TypeScript の型推論が完全に統合された親子間通信。
- **Recursive Component Composition:** 子コンポーネントの命令（Instructions）とノードを親へ再帰的に吸い上げるバブリング・メカニズム。
- **Reactive Attribute Binding:** `<input value={state.val()}>` 等の、DOM 属性・プロパティに対する細粒度なリアクティブ・バインド。
- **Event Argument Transformation:** ハンドラの第一引数（scope）を自動削除し、ブラウザの `Event` オブジェクトをシームレスに受け取る AST 変換。
- **Mixed Content Support:** JSX 内で要素、テキスト、シグナルが混在しても、自動的に透明な `<span>` でラップしてリアクティビティを確保する解析ロジック。
- **Direct Link Optimization:** 単一シグナルの補間や属性バインドにおいて、中間ノード（Hidden Derived）を生成せず、State と DOM を直接繋ぐ「最短経路」生成。
- **Stack-based ID Management:** `pushIdContext` / `popIdContext` により、コンポーネントがネストしても ID カウンターが衝突・混乱しない決定論的 ID 生成。
- **Vite Build-time SSR Injection:** ビルド時に内部 SSR サーバーを立ち上げ、初期 HTML を `index.html` に確実に注入する Vite プラグイン。
- **Orchestrated JSX Runtime:** `h.ts` をオーケストレーターとし、`Show`, `For`, `Component` 等のハンドラをモジュール分離したクリーンな内部構造。

## 2. 未実装・不安定な機能 (Missing / Unstable)

### Priority: High (直近の目標)
- **Two-way Binding (`bind:value`):** `<input bind:value={state.val} />` と書くだけで `value` と `oninput` の両方を自動生成する糖衣構文。
- **Ref API:** `ref={(el) => ...}` 形式で、生の DOM 要素への参照を取得する仕組み。
- **List Rendering v2:** `For` において、アイテムだけでなくインデックス `(item, index)` をリアクティブに扱えるようにする拡張。

### Priority: Medium (中期的目標)
- **Lifecycle Hooks:** `onMount`, `onCleanup` などのライフサイクルイベントのサポート。
- **True Hydration:** 現在の `innerHTML` による上書きを廃止し、既存の DOM 構造を完全に再利用するシームレスな Hydration への移行。
- **Style Scoping:** コンポーネント単位の CSS スコープ管理（CSS-in-JS または自動クラス付与）。

## 3. リファクタリング提案 & 既知の問題 (Issues)

### A. Show/For コンポーネントの `innerHTML` 実装
- **問題:** 表示切り替えのたびに子要素が `innerHTML` で再生成されるため、`<input>` 等の状態がリセットされる。
- **対策:** `template` 要素と `cloneNode` を用いたノード保持方式への変更。

### B. List Rendering における `indexOf` の静的解決
- **問題:** `indexOf(name())` 等の解析時実行が、モック値に対して行われるため、初期表示のインデックスが不正確になるケースがある。
- **対策:** 解析フェーズでの動的計算を許容する「プレースホルダー変数」の導入。

### C. 循環参照の継続的監視
- **問題:** シンボルの分離により `h.ts` と `index.ts` のサイクルは解消したが、ユーザーコードによる複雑なステート依存（A -> B -> A）における DCE の挙動が未検証。
- **対策:** 依存グラフのトポロジカルソート等を用いた、より堅牢な解析エンジンの実装。