# Logging Guidelines

Quix は「コンパイル時にコードを実行して解析する」という特性上、開発者が予期しない挙動（例：意図しないノードの削除や、依存関係の抽出漏れ）が発生しやすい環境にあります。
そのため、**Consola** を用いた構造化されたロギングを徹底し、解析プロセスの透明性を確保します。

## 1. 基本方針 (Core Philosophy)

*   **Tagged Logging:** 全てのログはモジュールごとにタグ付けを行い、発生元を明確にする。
*   **Verbosity Control:** ユーザーにとって重要な「結果」は `info`/`success` で表示し、開発者向けの「過程」は `debug`/`trace` に隠蔽する。
*   **Stats Oriented:** 処理の終わりには必ず「N個のノードを生成」「M個を削除」といった統計情報を出力する。

## 2. ツールと設定

ロガーライブラリとして `consola` を使用します。
各ファイルの冒頭で必ず `withTag` を使用して専用のインスタンスを作成してください。

```typescript
import { consola } from 'consola'

// Bad
console.log('Something happened')

// Good
const logger = consola.withTag('Quix:MyModule')
logger.info('Processing started...')
```

## 3. モジュール別タグ命名規則 (Tag Naming)

| モジュール領域 | タグ名 | 役割 |
| :--- | :--- | :--- |
| **Component Builder** | `Quix:Builder` | コンポーネント定義(`state`, `derived`)の登録、インスタンス化の開始/終了 |
| **Runtime / JSX** | `Quix:Runtime` | JSX(`h()`)の実行、インライン関数の抽出、最適化の適用判定 |
| **Code Generator** | `Quix:Codegen` | JS生成、AST変換、Dead Code Elimination(DCE)の判定理由 |
| **Vite Plugin** | `Quix:Vite` | ファイルロード(`ssrLoadModule`)、HTML注入、サーバー起動/停止 |

## 4. ログレベルの基準 (Log Levels)

出力内容の粒度は以下の基準に従ってください。

### 🟢 `success` / 🔵 `info`
**「何が行われたか」の概要**
ユーザー（アプリ開発者）が、ビルドが正常に進んでいることを確認するためのレベル。

*   コンポーネントの解析開始/完了
*   コード生成の完了と統計情報（生成サイズ、命令数）
*   HTML注入の成功

```typescript
logger.info('Build Instance: <App /> (Root Analysis)')
logger.success('Codegen Complete: kept=15 nodes, dropped=2 nodes')
```

### 🟡 `warn`
**「予期しないが継続可能な状態」**
開発者の注意を引くべき箇所。

*   未使用のステートやハンドラの検出（DCEによる削除警告）
*   HTML注入先のアンカーが見つからない場合

```typescript
logger.warn('Dropping update function for "tempCount" because it seems unused.')
```

### 🟣 `debug`
**「どのように処理されたか」の詳細**
フレームワーク開発者が挙動を検証するためのレベル。

*   特定の最適化が適用されたかどうかの判定結果
*   生成された命令(`Instruction`)の数や種類
*   バリデーションの通過確認

```typescript
logger.debug('Optimization: Shortcuts direct signal access for <span>')
logger.debug('Render complete. Generated 12 instructions.')
```

### ⚪ `trace`
**「ループ内での詳細な挙動」**
不具合調査時にのみ有効化する、非常に細かいログ。

*   個々のステート/ハンドラの登録ログ
*   プロパティごとのバインディング処理
*   DCEの判定ロジック（なぜKeep/Dropされたかの理由）

```typescript
logger.trace('  -> Register State: count (s-App-0)')
logger.trace('[DCE:Drop] count(s-App-0): No DOM ops and No Active Dependents')
```

## 5. 実装パターン (Implementation Patterns)

### A. 解析フェーズ (Builder/Runtime)

階層構造がわかるように、子要素の処理や詳細な属性処理にはインデント（スペース）を含めることを推奨します。

```typescript
// packages/runtime/src/core/builder.ts
const logger = consola.withTag('Quix:Builder')

export class ComponentBuilder {
  state(key, val) {
    // 定義の積み上げは trace
    logger.trace(`[${this.name}] +State: ${key}`)
    // ...
  }

  buildInstance() {
    // 解析という大きなイベントは info
    logger.info(`Build Instance: <${this.name} />`)
    
    // ...
    
    // 完了時に統計を debug で出す
    logger.debug(`[${this.name}] Render complete. Instructions: ${ctx.instructions.length}`)
  }
}
```

### B. 最適化ロジック (Runtime/Codegen)

最適化が働いたのか、それとも通常パスを通ったのかを `debug` レベルで明示します。

```typescript
// packages/runtime/src/h.ts
if (isSimpleSignal) {
  logger.debug(`Optimization: Shortcut applied for <${tag}>`)
  // ...
} else {
  logger.debug(`Optimization: Complex interpolation extracted for <${tag}>`)
  // ...
}
```

### C. Dead Code Elimination (Codegen)

削除理由を明確にするため、判定ロジック内で条件分岐ごとにログを出します。

```typescript
// packages/runtime/src/compiler/codegen.ts
const needsUpdate = (nodeId) => {
  if (hasDomOps) {
    // logger.trace(...) // 頻出するため trace 推奨
    return true
  }
  if (hasActiveDependents) {
    return true
  }
  
  // なぜ消されたかを記録
  logger.debug(`[DCE:Drop] ${nodeKey}: No DOM ops and No Active Dependents`)
  return false
}
```