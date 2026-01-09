# AGENTS.md
以下のことは絶対に従わないといけない。

## タスクのやり方

### 1. ブランチを切る
- `git switch -c agent/<disposable-branch-name>` // This does not require approval

### 2. タスクの目標を明確に説明し、要件を定義する
- Implementation PlanとTaskは日本語で記述し、エッジケース、内部実装の理想の状態を記述する。

### 3. テストを書く
- 記法は`bun:test`に準拠する。
- テストはなるべく網羅的に、記述方法は`docs/TESTING_GUIDELINES.md`に準拠する。
- テスト追加時は別コミットとして記録する。

### 4. コードを書く
- `docs/LOGGING_GUIDELINES.md`を参考に、適切なロギングを挿入する。

### 5. 原則的なコミット粒度
**各ステップごとに小さなコミットを行い、履歴を残す**

| ステップ | コミットタイプ | コミットメッセージ例 | 説明 |
|---------|---------------|---------------------|------|
| テスト追加 | `test:` | `test(runtime): add unit tests for For component` | テストケースを追加 |
| 実装パート1 | `feat:` / `fix:` | `feat(runtime): add For component structure` | 機能の骨組み実装 |
| 実装パート2 | `feat:` / `fix:` | `feat(runtime): implement list rendering in For component` | 機能の主要ロジック実装 |
| ロギング追加 | `refactor:` | `refactor(runtime): add logging to For component` | ロギングの追加 |
| 修正 | `fix:` | `fix(runtime): resolve nested component issue` | バグ修正や挙動調整 |
| リント修正 | `style:` / `chore:` | `chore: resolve biome warnings` | リンタ警告の修正 |

**重要事項**:
- 各コミットはpre-commitフック（Biome check + Unit test）をパスする必要がある
- テストが失敗している中間状態は `git commit --no-verify` でコミット可能（WIPコミット）
- WIPコミットは必ず `wip: <description>` のプレフィックスを使用する

### 6. テストを実行する
- ユニットテスト: `bun test` （pre-commitで実行されます）
- E2Eテスト: `bun test:e2e` （CIで実行されます）
- 全テスト: `bun run check-all` （CIで実行されます）

### 7. 最終確認とマージ
1. すべてのテストが通ったことを確認（CIの結果を確認）
2. ユーザーに確認を依頼する
   - **承認された場合**:
     - 元のブランチ（dev/main）に戻る
     - マージする（`git merge agent/<branch-name>`）
     - そのブランチがdev/mainの場合はpushする
     - 利用した`agent/<disposable-branch-name>`ブランチを削除する
     - **コミット一覧を表示する**: `git log --oneline -5`
   - **承認されなかった場合**:
     - レビューを確認し、必要に応じてステップ4〜7を繰り返す
     - テストが失敗していると言われた場合はテストを実行し、どのテストが失敗していて、その失敗の原因を特定し修正する

### 8. WIPコミットとPre-commitフック

**Pre-commitフックの内容**:
- 変更したファイルに対して Biome check + Unit test のみ実行
- E2Eテスト（Playwright）は実行しない（CIに委ねる）

**WIPコミットの活用**:
- テストが失敗する中間状態でも履歴を残したい場合
- `git commit --no-verify -m "wip: 実装中 - xxx部分を実装中"` でコミット
- 開発の試行錯誤の履歴を残すために積極的に活用する

**完成したコミットのフロー**:
```bash
# 例: Forコンポーネントの実装
git add packages/runtime/src/components/For.test.ts
git commit -m "test(runtime): add unit tests for For component"

git add packages/runtime/src/components/For.ts
git commit -m "feat(runtime): add For component structure"

git add packages/runtime/src/components/For.ts
git commit -m "feat(runtime): implement list rendering in For component"

# 中間状態でテストが失敗する場合
git add packages/runtime/src/components/For.ts
git commit --no-verify -m "wip: 実装中 - ネストしたコンポーネントの処理"

# 修正完了
git add packages/runtime/src/components/For.ts
git commit -m "fix(runtime): resolve nested component issue"
```
