# Quix Architecture

Quix は「実行時のオーバーヘッドをゼロにする」ことを目指した、コンパイルファーストのリアクティブフレームワークです。
アプリケーションコードはビルド時に解析され、仮想DOMを持たない純粋な JavaScript (Vanilla JS) に変換されます。

## Core Concept

Quix の最大の特徴は **"Build-time Execution" (ビルド時実行)** です。
コンポーネント定義ファイル（`.tsx`）は、ブラウザに配信される前に Node.js 環境で一度実行されます。この実行により、ステートの依存関係グラフ（Context）が構築され、それを元に最適化された命令型コードが生成されます。

## Data Flow

ビルドプロセスは以下のフェーズで進行します。

### 1. Analysis Phase (Builder & Runtime)
ユーザーが記述した `component(...)` コードが実行されます。
- **State Proxy:** `state.count()` などのアクセスを検知し、依存関係を自動的に記録します。
- **Hidden Derived:** JSX 内に書かれたインライン関数（例: `() => state.count() * 2`）は自動的に抽出され、計算済みの派生ステートとして登録されます。
- **Initial Rendering:** `h` 関数が実行され、初期 HTML 構造と DOM 更新命令（Instructions）が生成されます。

### 2. Context Construction
すべての情報は `ComponentContext` オブジェクトに集約されます。
- **Nodes:** State, Derived, Handler の定義。
- **HTML:** 静的な HTML テンプレート（初期値込み）。
- **Instructions:** 「どのステートが変わったら、どの DOM を更新するか」の命令リスト。

### 3. Code Generation (Codegen)
`ComponentContext` を入力として、JavaScript 文字列を生成します。
- **Optimization:** 変数名は `_a`, `_b` のように短縮されます。
- **Cascade Update:** 依存グラフに基づき、更新関数 (`_u_a()`) が連鎖的に呼び出されるロジックが組み立てられます。
- **No Virtual DOM:** 生成されるコードは `innerHTML`, `querySelector`, `textContent = ...` などのネイティブ API のみで構成されます。

### 4. Output (Vite Plugin)
生成された JS 文字列は `esbuild` を通して整形・圧縮され、HTML には初期レンダリング結果が注入されます。これにより、JS ロード前の「画面のちらつき（FOUC）」を防ぎます。

## Directory Structure

- `packages/runtime/src/core/`: 状態管理と解析の中核ロジック。
- `packages/runtime/src/compiler/`: JS コード生成器。
- `packages/vite-plugin/`: Vite と連携し、HMR や HTML 注入を行うプラグイン。