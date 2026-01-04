# Testing Guidelines

Quix プロジェクトにおけるテストコードの命名規則、構成、およびベストプラクティスをまとめたガイドラインです。
本プロジェクトでは `bun:test` を使用しています。

## 1. 命名規則 (Naming Conventions)

テストの可読性を高めるため、`describe` ブロックと `test` ブロックには統一されたフォーマット（コロン区切り記法）を採用しています。

### 基本フォーマット

```typescript
describe('英語の機能名: 日本語による概要', () => {
  test('テスト対象の条件: 期待される振る舞い（〜こと）', () => {
    // ...
  })
})
```

### 詳細ルール

1.  **Describe Block**
    *   前半: **英語**でモジュール名や機能カテゴリを記述します（例: `Component Composition`, `h function`）。
    *   後半: **日本語**でそのテスト群が何を検証するものか簡潔に記述します。
    *   区切り: `: ` (コロン + 半角スペース) を使用します。

2.  **Test Block**
    *   前半: **テスト条件やシナリオ**を記述します（例: `インライン関数の最適化`, `ネストしたSetter`）。
    *   後半: **期待値**を記述し、文末は「**〜こと**」で統一します。
    *   区切り: `: ` (コロン + 半角スペース) を使用します。

### 実例 (Examples)

**良い例 (Good):**
```typescript
// packages/runtime/src/core/composition.test.ts
describe('Component Composition: コンポーネントの合成', () => {
  test('命令のバブリング: 子の更新命令が親のコンテキストに集約されること', () => {
    // ...
  })
})

// packages/runtime/src/compiler/codegen.test.ts
describe('AST-based Codegen: 高度なJavaScript変換', () => {
  test('イベント引数の処理: ハンドラから scope 引数が削除され (e) => ... になること', () => {
    // ...
  })
})
```

**悪い例 (Bad):**
```typescript
// 具体性がない、フォーマットに従っていない
describe('Components', () => {
  test('should work', () => { ... }) // 英語のみ、should形式は避ける
  test('正しく動く', () => { ... }) // 条件が不明
})
```

---

## 2. テスト戦略 (Testing Strategies)

Quix はコンパイラファーストなフレームワークであるため、テストのアプローチはレイヤーごとに異なります。

### A. Runtime / Builder Tests (`packages/runtime/src/core/*.test.ts`)
コンポーネント定義から `ComponentContext` が正しく生成されるか、グラフ構造を検証します。

*   **検証対象:**
    *   `ctx.getAllNodes()`: 期待通りのノード（State, Derived, Handler）が存在するか。
    *   `ctx.instructions`: 生成された命令（`setText`, `addListener` 等）のアクションとターゲットIDが正しいか。
    *   **IDの依存:** 自動生成される ID (`s-App-0` 等) は変動する可能性があるため、完全一致ではなく `.toContain()` や `.find()` を用いて検証することを推奨します。

### B. JSX / h Function Tests (`packages/runtime/src/h.test.ts`)
JSX 関数が正しい命令と HTML 構造を生成するかを検証します。

*   **検証対象:**
    *   `vnode.html`: 初期 HTML 構造（アンカー要素や静的属性）。
    *   `vnode.hiddenDerivedRequests`: インライン関数の抽出リクエストが正しく発行されているか。
    *   Regex: HTML 文字列の検証には正規表現を活用し、クラス名（`q-xxxx`）の変動を許容します。

### C. Codegen Tests (`packages/runtime/src/compiler/codegen.test.ts`)
最終的に生成される JavaScript 文字列を検証します。

*   **検証対象:**
    *   出力された文字列に特定のコードパターン（例: `_e0.textContent = ...`）が含まれているか。
    *   AST変換（変数の短縮化、引数の削除など）が適用されているか。
*   **注意点:**
    *   フォーマット（空白や改行）に依存しすぎないよう、`toMatch(/regex/)` を使用するか、ヘルパー関数でスペースを正規化してから比較してください。

### D. Transform Tests (`packages/transform/test/transform.test.ts`)
SWC プラグインによるソースコード変換を検証します。

*   **検証対象:**
    *   JSX が `h()` 関数に変換されているか。
    *   シグナルアクセスが `() => state()` の形にラップされているか。
    *   `normalize` ヘルパー等を使用し、フォーマッターによる差異を無視して比較します。

---

## 3. ベストプラクティス

1.  **決定論的テスト:**
    ID生成器 (`src/core/id.ts`) はシングルトンの状態を持つため、テスト実行順序によってIDが変わる可能性があります。各テストケース内で完結するよう、または必要に応じてモックを使用し、IDの絶対値（`s-App-5`など）に依存しすぎないようにしてください。

2.  **スナップショットの利用:**
    複雑な出力（Codegen結果など）には `expect(output).toMatchSnapshot()` の利用も検討してください。ただし、変更意図が明確になるよう、重要なロジック部分は `toContain` や Regex で明示的にアサーションを書くことを推奨します。

3.  **日本語での意図明示:**
    AI や他の開発者がコードレビューを行いやすくするため、複雑な正規表現によるマッチングを行う場合は、何をチェックしようとしているのかコメントやテストタイトルで明確にしてください。
```