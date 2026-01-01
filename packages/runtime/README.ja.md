# Quix

Quix は、オーバーヘッドのない純粋な JavaScript (Vanilla JS) を生成するために設計された、実験的な**コンパイラファースト・リアクティブフレームワーク**です。
厳格な Builder パターンによる状態管理と、コンパイル時の依存関係グラフ解析を組み合わせることで、実行時のコストを極限まで排除します。

> **Note:** 本プロジェクトは実験的なプロトタイプです。

## 主な特徴

- **ゼロ・ランタイム (Zero-Runtime Overhead):**
  コンポーネントは、`setText` や `addEventListener` などの命令的な DOM 操作コードにコンパイルされます。実行時に仮想 DOM (Virtual DOM) の差分検知は行われません。
- **きめ細やかなリアクティビティ (Fine-Grained Reactivity):**
  Proxy を使用して依存関係を自動的に追跡します。値が変化した際、更新が必要な特定の DOM ノードのみをピンポイントで操作します。
- **Builder API:**
  チェーンメソッド（`state`, `derived`, `render`）を採用することで、状態定義、派生ロジック、View の分離を強制し、解析しやすい構造を保ちます。
- **"Hidden Derived" 最適化:**
  JSX 内に書かれたインライン関数（例: `() => state.count()`）は自動的に抽出され、最適化された「派生ノード」として依存グラフに組み込まれます。

## アーキテクチャ

Quix は大きく 2 つのステージで動作します：

1.  **解析フェーズ (Analysis Phase):**
    Builder で定義されたコンポーネントを実行し、依存関係グラフ (`StateBank`) を構築します。どのステートがどこで（JSX 内のテンプレートも含めて）使われているかを追跡します。
2.  **コード生成フェーズ (Codegen Phase):**
    構築されたグラフとレンダリング命令を元に、最適化された DOM 操作を含む自己完結型の JavaScript (IIFE) を生成します。

## インストール

このプロジェクトは [Bun](https://bun.com) を使用しています。

```bash
bun install
```

## 使い方

Quix はチェーン API を使用してコンポーネントを定義します。

```typescript
import { component } from './builder'
import { h } from './h'

const App = component('App')
  // 1. ステートの定義
  .state('count', 0)

  // 2. 派生ステート（Computed）の定義
  // 依存しているステートは自動的に追跡・解決されます
  .derived('double', ['count'], s => s.count() * 2)

  // 3. ハンドラの定義
  .handler('increment', ['count'], s => s.count(s.count() + 1))

  // 4. View のレンダリング
  .render(({ state, handlers }) =>
    h(
      'div',
      null,
      h('h1', null, 'Counter App'),
      // インライン関数は自動的に最適化され、"Hidden Derived" として扱われます
      h('p', null, 'Count: ', () => state.count()),
      h('p', null, 'Doubled: ', () => state.double()),
      h('button', { onClick: handlers.increment }, 'Increment')
    )
  )

// このオブジェクトをコンパイラに渡すことで、生の JS が生成されます
console.log(App)
```

## 開発

### デモの実行
コンポーネント構造の解析結果を出力するデモスクリプトを実行します。

```bash
bun run dev
```

### テストの実行
コード生成 (Codegen) の出力を検証するスナップショットテストが含まれています。

```bash
bun test
```

## ディレクトリ構造

- **`src/builder/`**: コンポーネントビルダーと StateBank（状態管理）のコアロジック。
- **`src/compiler/`**: 依存グラフを JavaScript 文字列に変換するコードジェネレータ。
- **`src/h.ts`**: DOM 更新命令を収集する Hyperscript 関数 (JSX ランタイム)。
- **`src/tracker.ts`**: スタックベースのアプローチを用いたグローバルな依存関係トラッキングシステム。

## ライセンス

Private / Internal