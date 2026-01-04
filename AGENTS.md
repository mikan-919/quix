# AGENTS.md - Quix: Super Fine-Grained Signal-Based Compiler Framework

## 最重要ルール: CONCEPT.md を絶対遵守
- **すべての行動の前に CONCEPT.md を最初に読み、内容を完全に理解せよ**。
- このフレームワークのコア哲学は「Build-time Execution, Zero-Runtime Delivery」で、**ランタイムでの仮想DOM差分検知は一切禁止**。コンパイル時にNode.jsで実行し、命令的なDOM操作コードのみブラウザへ出力。
- 提案・実装・リファクタリングが CONCEPT.md の原則（Blueprint & Instanceモデル、No Virtual DOM、Signal Consistency）と矛盾していないか、必ず確認。
- 矛盾しそうなら、まず CONCEPT.md の更新を提案せよ（勝手に設計変更するな）。

## リアクティビティの鉄則（絶対守れ）
- Signalは**Getter形式**（`state.count()`、`props.age()`）で統一。動的値アクセスは常に関数呼び出し形式。
- 依存関係は**コンパイル時のProxyとtracker**で静的解析。Proxyのスプレッド演算子（`...`）は禁止（リアクティビティが失われる）。
- 更新は**変更されたSignalに直接依存するDOMノード/計算のみ**再生成（super fine-grainedの極み）。
- ランタイムライブラリ依存禁止：ブラウザ出力はVanilla JSのみ。汎用ライブラリ（e.g., React-like effects）は追加せず、handlerかrender時の命令生成で表現。
- 組み込みコンポーネント（For, Show）はcore/symbols.tsで管理。h.tsからの循環参照を避けよ。

## TypeScript & コード生成ルール
- すべての公開APIに厳格な型定義必須（Zod-Driven Propsを活用: `.props({ age: z.number().min(0) })`）。
- ジェネリクスを積極活用。
- コンパイラ関数（e.g., transformTemplate, codegen.ts）は**純粋関数**で、副作用ゼロ。Dead Code Elimination (DCE)を意識。
- 変更前は必ず `tsc --noEmit` で型チェック実行。strict modeを維持。
- Zodバリデーション: Props評価時は`tracker.silence`で囲み、不要な依存を防げ。
- ID生成: スタックベース（pushIdContext/popIdContext）でネスト管理。親子コンポーネントのID衝突を避けよ。

## ドキュメント準拠
- docs/以下（特に CONCEPT.md）は以下で統一:
  - H1禁止、H2から開始。
  - コード例は ```typescript:disable-run
  - 新しい設計決定・Signalパターンが出たら、CONCEPT.md への追記を提案。
- 新機能追加時は docs/ に該当する説明ファイル（e.g., ARCHITECTURE.md更新）を作成/更新せよ。
- 日本語/英語混在OKだが、CONCEPT.mdのスタイル（Core Philosophy, Dos/Don'ts）を踏襲。

## TODO管理
- 作業前に TODO.md とコード内の // TODO: を確認。
- タスク完了時:
  - 該当TODOを [x] または削除。
  - 新しいTODO発見時は優先度付きで追加（例: High: 依存解析のエッジケース対応）。
- CONCEPT.md関連の変更は必ず「High: CONCEPT.md 更新」と明記。
- テスト関連TODO: TESTING_GUIDELINES.mdの命名規則（'テスト対象の条件: 期待される振る舞い（〜こと）'）を参考に記述。

## テストルール
- 新機能/変更時は必ずtests/に対応テスト追加（bun:test）。
- 特に依存解析の正しさ、更新のfine-grained性を検証するテスト必須（e.g., ID決定論的生成、命令バブリング）。
- 命名: describe('英語の機能名: 日本語による概要')、test('テスト対象の条件: 期待される振る舞い（〜こと）')。
- スナップショット利用: 複雑出力（codegen結果）でtoMatchSnapshot()、重要部分はtoContain/Regexで明示アサーション。
- 決定論的テスト: IDスタックをモックし、複数実行でID一致を確認。

## 境界（絶対に破るな）
- 外部依存は最小限（Zod, Consola, Babelなど。ブラウザ出力に含めない）。
- React/Vue/Solidのようなランタイムフレームワークの概念を混入禁止（useEffectなし）。
- Proxy、WeakMapによるruntime tracking 禁止。
- 仮想DOMフルdiffは避け、signal単位のピンポイント更新を維持。
- ランタイムオーバーヘッドゼロを崩す変更（e.g., ブラウザ側依存追跡追加）禁止。

## その他
- git commitメッセージは明確に（例: "feat: add fine-grained dependency tracking for if-blocks"）。
- AI自身が迷ったら、まず「CONCEPT.mdに基づいてどうすべきか？」と自問せよ。
- Logging: Consola.withTag('Quix:Module')でタグ付け。info/successで結果、debug/traceで過程。
- Dev: Bun使用（bun test, bun run dev）。