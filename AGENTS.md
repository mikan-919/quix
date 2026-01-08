# AGENTS.md
以下のことは絶対に従わないといけない。

## タスクのやり方
1. ブランチを切る。
  - `git switch -c agent/<disposable-branch-name>` // This does not require approval
2. タスクの目標を明確に説明し、要件を定義する。
  - Implementation PlanとTaskは日本語で記述し、エッジケース、内部実装の理想の状態を記述する。
3. テストを書く
  - 記法は`bun:test`に準拠する。
  - テストはなるべく網羅的に、記述方法は`docs/TESTING_GUIDELINES.md`に準拠する。
4. コードを書く
  - `docs/LOGGING_GUIDELINES.md`を参考に、適切なロギングを挿入する。
5. テストを実行する。
6. すべてのテストケースが成功するまで4に戻る。
7. コードをコミットする。
  - `git add .`
  - `git commit -m "<commit-message>"`
  - コミットメッセージはConventional Commitsに準拠する。
8. ユーザーに確認をする。
  - 承認された場合、元のブランチに戻り、マージする。
    - マージ後、そのブランチがdevの場合はpushする。
    - マージ後、利用した`agent/<disposable-branch-name>`ブランチを削除する。
  - 承認されなかった場合、レビューを確認して2に戻る。
  - テストが失敗していると言われたっ場合はテストを実行し、どのテストが失敗していて、その失敗の原因を特定し4に戻る。
