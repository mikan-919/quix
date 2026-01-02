# ToDo, Issues & Architectural Roadmap (2026/01/03)

Quixの「ビルド時実行・ゼロランタイム」という哲学を維持しつつ、実用的なフレームワークへと進化させるためのタスクリストです。

## 1. 実装済み機能 (Verified)
- [x] **Blueprint & Instance Pattern:** コンポーネント定義（設計図）と解析時の実体化の分離。
- [x] **Zod-driven Props:** ビルド時バリデーションと型安全な親子間通信。
- [x] **Deterministic ID Management:** スタックベースの `pushIdContext` によるSSR/HydrationセーフなID生成。
- [x] **Fine-grained Updates:** テキストノードおよび属性（Value, Checked等）のピンポイント更新命令の生成。
- [x] **Instruction Bubbling:** 子コンポーネントの命令を親コンテキストへ自動集約する解析エンジン。
- [x] **AST-based Codegen:** Babelを用いた、JavaScriptのスコープを意識したイベントハンドラとSetterの変換。

## 2. 最優先課題：アーキテクチャの洗練 (Priority: High)

### A. Rendering: `innerHTML` から Template Cloning への移行
現在の `Show` と `For` は `innerHTML` を使用しているため、切り替え時に要素内のフォーカスや入力状態が失われます。
- [ ] **Static Template Extraction:** 解析時に静的なHTML構造を `<template>` 要素として抽出し、JSの冒頭で宣言する。
- [ ] **DOM State Preservation:** `cloneNode(true)` と `cached elements` を用いた更新ロジックへの変更。
- [ ] **Keyed List Support:** `For` において、`innerHTML.map` ではなく、要素の移動・削除を最小限にする `insertBefore` ベースの更新。

### B. Developer Experience: 糖衣構文の実装
- [ ] **Two-way Binding (`bind:value`):** `<input bind:value={state.val} />` を `value={state.val()}` と `oninput` ハンドラに自動展開する機能。
- [ ] **Ref API:** `ref={(el) => ...}` を通じて、ビルド時に特定されたDOM参照（`_e0`等）をハンドラ内で利用可能にする。

## 3. 内部構造のリファクタリング (Priority: Medium)

### C. Compiler: 中間表現 (IR) の導入
解析結果から直接JSを生成するのではなく、最適化可能な中間形式を導入します。
- [ ] **Instruction Optimizer:** 連続する `setText` 命令の統合や、静的であることが判明したノードの削除を行う。
- [ ] **Modularity of Codegen:** `codegen.ts` を `Optimizer`, `Emitter`, `Transformer` に分離し、メンテナンス性を向上させる。

### D. Performance: 真の Hydration (Event Listener-only)
- [ ] **Hybrid Hydration:** 初期HTMLが既に存在する場合、DOM操作を行わず `addEventListener` と `Variable Initialization` だけを行う軽量な起動パスを Codegen に追加。

### E. Lifecycle & Effects
- [ ] **Lifecycle Hooks:** `onMount`, `onCleanup` のサポート。これらは Codegen 時に `init` 関数や `window.addEventListener('unload')` 等に変換される。

## 4. 長期的目標 (Priority: Low)

- [ ] **Style Scoping:** コンポーネント定義に紐付いたCSSを解析し、自動的にハッシュ化されたクラス名を付与する（ビルド時にCSSファイルを分離抽出）。
- [ ] **Global State (Store):** コンポーネントの設計図外で定義されたシグナルを、複数のコンポーネントが横断的に参照・更新できる仕組み。
- [ ] **Advanced Scope Analysis:** より複雑なクロージャや外部変数の参照を安全に扱うための、より厳密な静的解析の実装。

## 5. 既知のバグ・検討事項
- [ ] **Circular Dependency in Analysis:** ステート A が B に依存し、B が A に依存するようなケースでの無限ループ防止策。
- [ ] **Shadowing in Handlers:** ハンドラ引数の `e` (Event) がユーザー定義の変数と衝突した場合の回避策。
- [ ] **FOUC Prevention in Complex Show:** ネストした `Show` コンポーネントにおける、初期表示時の非表示要素のチラつきの完全な抑制。
