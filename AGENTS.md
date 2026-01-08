# AGENTS.md

このファイルはエージェント開発者のためのガイドラインです。以下のことは絶対に従わないといけない。

## コマンド (Commands)

### 依存関係のインストール
```bash
bun install
```

### 開発サーバー
```bash
bun run dev  # playground の dev サーバーを起動
```

### ビルド
```bash
bun run build  # packages/transform の WASM プラグインをビルド
```

### テスト
```bash
bun test                    # 全テスト実行
bun test <file>             # 特定のテストファイル実行
bun test -t <pattern>       # テスト名にマッチするテストのみ実行
bun run check-all           # biome check + test 実行
```

### コードフォーマットとリント
```bash
biome check --write  # フォーマットとリントを修正
```

## コードスタイル (Code Style)

### 設定
- **TypeScript**: Strict mode, verbatimModuleSyntax, bundler mode
- **Linter/Formatter**: Biome (ESLint/Prettier は使用しない)
- **Import style**: Explicit extensions (`.ts`), no `.js` extensions

### フォーマットルール
- **Quotes**: Single quotes (`'`)
- **Semicolons**: As needed (not always required)
- **Trailing commas**: ES5 style
- **Arrow parentheses**: As needed (no unnecessary parens)
- **Indentation**: Spaces (not tabs)

### 命名規則
- **Components**: PascalCase (`ComponentBuilder`, `ComponentContext`)
- **Functions/Variables**: camelCase (`addState`, `getNodeByKey`)
- **Constants/Tags**: UPPER_SNAKE_CASE or specific patterns (`Quix:Builder`, `s-`, `d-`, `h-`)
- **Private members**: Underscore prefix (`_isQuixComponent`, `_analysisContext`)

### エラーハンドリング
- Zod for schema validation when props validation is needed
- Never suppress type errors with `as any` or `@ts-ignore` in production code
- Test files only: `noExplicitAny` is allowed in biome config overrides

### Biome 無視コメント
必要な場合にのみ使用し、理由を明記する：
```typescript
// biome-ignore lint/suspicious/noExplicitAny: generic constraint
// biome-ignore lint/complexity/noBannedTypes: generic params
```

## テストガイドライン (Testing Guidelines)

詳細は `docs/TESTING_GUIDELINES.md` を参照。

### 基本構造
```typescript
import { describe, expect, test } from 'bun:test'

describe('英語の機能名: 日本語による概要', () => {
  test('テスト条件: 期待される振る舞い（〜こと）', () => {
    // ...
  })
})
```

### 重要ルール
1. **Describe**: `English: Japanese` 形式
2. **Test**: `Condition: Expected behavior (〜こと)` 形式
3. **ID検証**: 自動生成IDは `.toContain()` や `.find()` を使用
4. **Snapshot**: 複雑な出力にはスナップショットを活用
5. **Deterministic**: ID生成器はシングルトンなので、テスト順序に注意

## ロギングガイドライン (Logging Guidelines)

詳細は `docs/LOGGING_GUIDELINES.md` を参照。

### 使用ライブラリ
```typescript
import consola from 'consola'
const logger = consola.withTag('Quix:ModuleName')
```

### タグ名
- `Quix:Builder` - コンポーネント定義とインスタンス化
- `Quix:Runtime` - JSX実行とインライン関数抽出
- `Quix:Codegen` - JS生成とAST変換
- `Quix:Vite` - Viteプラグイン関連

### ログレベル基準
- `success`/`info`: ユーザー向けの概要情報
- `warn`: 予期しないが継続可能な状態
- `debug`: 開発者向けの詳細情報
- `trace`: ループ内の詳細挙動

### 統計指向のログ
処理終了時に必ず統計情報を出力：
```typescript
logger.debug(`Render complete. Generated ${n} instructions.`)
```

## タスクのやり方 (Task Workflow)

1. **ブランチを作成**
   ```bash
   git switch -c agent/<disposable-branch-name>  // 承認不要
   ```

2. **タスクの目標を明確化**
   - Implementation Plan と Task を**日本語**で記述
   - エッジケース、内部実装の理想の状態を記述

3. **テストを書く**
   - `bun:test` 記法に準拠
   - 網羅的に記述（`docs/TESTING_GUIDELINES.md` 準拠）

4. **コードを書く**
   - `docs/LOGGING_GUIDELINES.md` に従い、適切なロギングを挿入

5. **テストを実行**

6. **全テスト成功まで4に戻る**

7. **コミット**
   ```bash
   git add .
   git commit -m "<commit-message>"  # Conventional Commits に準拠
   ```

8. **ユーザー確認**
   - 承認された場合: 元ブランチに戻りマージ（devの場合はpush、agentブランチ削除）
   - 承認されなかった場合: レビュー確認後2に戻る
   - テスト失敗: テスト実行 → 失敗原因特定 → 4に戻る

## プロジェクト概要

Quixはコンパイラファーストなリアクティブフレームワークです。
- **Runtime**: コンポーネント定義、ステート管理、JSXランタイム
- **Transform**: SWCプラグイン（WASM）によるソースコード変換
- **Vite Plugin**: Vite開発サーバー統合

重要: プロキシによる依存追跡、コンパイル時の解析、コード生成によるゼロランタイムオーバーヘッドが特徴。
