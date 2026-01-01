# Quix Framework Concept

## 設計思想 (Philosophy)

Quix は、**「宣言的な記述 (Declarative)」** と **「命令的な実行 (Imperative)」** の完全な分離を目指した、超軽量・高速なフロントエンドフレームワークです。

最大の目標は **Zero-Runtime Overhead (実行時オーバーヘッドゼロ)** です。
開発者は React のような宣言的な JSX で UI を記述しますが、ブラウザ上で動作するのは、コンパイラによって生成された「手書きで最適化したような Vanilla JS」のみです。

## アーキテクチャ (Architecture)

### 1. Build-time Execution (ビルド時実行)
Quix の最もユニークな点は、**「コンポーネントのコードをビルド時（Vite プラグイン内）に Node.js 環境で実行してしまう」** ことです。
これにより、アプリケーションの依存関係グラフ（どのステートがどの DOM を書き換えるか）を静的に解析し、確定させます。

### 2. No Virtual DOM (仮想DOMなし)
React や Vue が採用している「仮想 DOM の差分検知 (Diffing)」は、Quix には存在しません。
解析フェーズで「この変数が変わったら、このテキストノードを更新する」という命令 (`Instruction`) が生成されるため、実行時はピンポイントで DOM を操作 (`textContent = ...`) するだけです。

### 3. Compiler-First Reactivity (コンパイラ主導のリアクティビティ)
実行時にリアクティブシステム（Observer や Effect）のライブラリコードをブラウザに配信しません。
代わりに、依存関係に基づいた「更新関数の連鎖呼び出し（Cascade Update）」をハードコードされた JavaScript として生成します。

## 既存フレームワークとの比較

| 特徴 | React | Vue / SolidJS | Svelte | Quix |
| :--- | :--- | :--- | :--- | :--- |
| **View 更新** | 仮想DOM Diff | 仮想DOM / Fine-grained | コンパイル時生成 | **コンパイル時生成** |
| **ランタイムサイズ** | 大 | 中 / 小 | 小 | **極小 (ほぼゼロ)** |
| **リアクティビティ** | Render Cycle | Signals / Proxies | Compiler Magic | **Build-time Proxy** |
| **実行タイミング** | ブラウザ | ブラウザ | ブラウザ | **ビルド時 (解析)** -> ブラウザ (実行) |

## 主要コンポーネント

- **Builder API:** `component().state().render()` チェーンにより、型安全かつ解析容易な構造を強制します。
- **Scope Engine:** `Proxy` を使用して、明示的な依存配列なしでステートの使用を自動検知します。
- **Codegen:** 解析結果（`Context`）を元に、最適化された命令型コード（IIFE）を出力します。