# Quix Architecture

本ドキュメントでは、Quixフレームワークの内部構造と動作原理について解説します。
Quixは **"Build-time Execution" (ビルド時実行)** を核とした、コンパイルファーストのフレームワークです。

## 1. 全体フロー概要

Quixのライフサイクルは、**Build Time (解析・生成)** と **Run Time (ブラウザ実行)** の2つに明確に分かれます。

### A. Build Time Flow (Node.js環境)
Viteプラグインが `.tsx` ファイルへのリクエストをインターセプトした時点で処理が開始されます。

1.  **Transform (Babel):**
    *   JSX内の式（例: `{state.count}`）をアロー関数（`{() => state.count}`）にラップし、遅延評価・追跡可能にします。
    *   JSXタグを `h()` 関数呼び出しに変換します。
2.  **Analysis Execution (SSR):**
    *   変換後のコードを Node.js 環境 (`ssrLoadModule`) で実行します。
    *   `component().state()...render()` が実行され、**`ComponentContext`** が生成されます。
    *   この際、Stateは **Proxy** として振る舞い、どのプロパティがどこで読まれたか（依存関係）を記録します。
3.  **Graph Construction:**
    *   状態（State）、計算値（Derived）、DOM更新命令（Instruction）のすべての依存関係グラフがメモリ上に構築されます。
4.  **Code Generation (Codegen):**
    *   `ComponentContext` を元に、**命令的なVanilla JS文字列** を生成します。
    *   **Dead Code Elimination:** DOM更新に寄与しない不要な計算ロジックはこの時点で削除されます。
5.  **HTML Injection:**
    *   初期状態のHTML文字列を `index.html` に注入し、FOUC (Flash of Unstyled Content) を防ぎます。

### B. Run Time Flow (Browser環境)
ブラウザにはランタイムライブラリが含まれず、生成された自己完結型のJavaScriptのみが届きます。

1.  **Hydration (Cache DOM):**
    *   `document.querySelector` 等を使用し、静的HTML内の操作対象要素を変数（`_e0`, `_e1`...）にキャッシュします。
2.  **State Initialization:**
    *   変数を初期化します（例: `let _a = 0;`）。
3.  **Event Binding:**
    *   `addEventListener` を設定します。
4.  **Initial Render Consistency:**
    *   各更新関数を一度だけ呼び出し、JS変数の状態とDOMを同期させます。

---

## 2. モジュール構造 (`packages/`)

| パッケージ | 役割 | 依存方向 |
| :--- | :--- | :--- |
| **runtime** | フレームワークの中核。Builder API、解析エンジン、Codegenを含む。 | なし (Core) |
| **transform** | Babelを使用したAST変換。JSXの最適化やラップ処理を担当。 | -> runtime (h関数の注入用) |
| **vite-plugin** | ビルドプロセスのオーケストレーション。SSR実行、HMR、HTML注入を管理。 | -> runtime, transform |

### 主要ファイル (`packages/runtime/src/`)

- **`core/builder.ts`**: ユーザーが触るAPI (`component`, `state`) の実装。Proxyを用いて依存収集を開始するトリガーとなります。
- **`core/context.ts`**: 解析結果を保持するデータベース。ノード、命令、HTMLテンプレートを管理します。
- **`core/tracker.ts`**: スタックベースの依存収集機。`derived` や `render` 実行中のアクセスを監視します。
- **`h.ts` (JSX Runtime)**: 仮想DOMノードを作成しますが、保持はせず、即座に「命令 (Instruction)」と「静的HTML」に分解します。
- **`compiler/codegen.ts`**: コンパイラの心臓部。Contextを解析し、文字列操作でJavaScriptコードを出力します。

---

## 3. リアクティビティの仕組み

Quixはランタイムにリアクティブシステム（ObserverやSignalライブラリ）を持ちません。**「コンパイルされた関数呼び出しの連鎖」** がリアクティビティの実体です。

### Build Time: Proxyによる収集
解析フェーズでは、`state` オブジェクトは Proxy です。
```typescript
// state.count() が呼ばれると...
get: (_, key) => {
  tracker.report(node.id) // 現在計算中のノード（DerivedやView）に依存を通知
  return value
}
```

### Run Time: 関数カスケード (Cascade Update)
生成されるコードは、依存グラフに基づいてハードコードされた関数呼び出しです。

```javascript
// 生成されるコードのイメージ
let _a = 0; // state.count

// state.count の更新関数
function _u_a() {
  // 1. DOM更新
  if(_e0) _e0.textContent = _a;
  
  // 2. 依存するDerivedの更新関数を呼び出し (Cascade)
  _u_b(); 
}

// derived.double の更新関数
function _u_b() {
  const newVal = _a * 2;
  if(_e1) _e1.textContent = newVal;
}
```
このように、**「値が変わる → 対応する更新関数を呼ぶ → 依存先を呼ぶ」** という処理が静的に決定されています。