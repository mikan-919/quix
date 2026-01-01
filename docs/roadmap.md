# Roadmap & Improvements

## Current Status (v0.1.0)
- ✅ **Core Reactivity:** State, Derived, Handler の依存関係解決の実装完了。
- ✅ **Zero-Bundle-Size:** ランタイムライブラリを含まない、600バイト程度の Vanilla JS を生成可能。
- ✅ **FOUC Prevention:** サーバーサイドでの初期 HTML 生成と注入による、ちらつきのない表示。
- ✅ **Dev Experience:** Vite を利用した高速な HMR（Hot Module Replacement）環境。

## Immediate Goals (v0.2.0)

### 1. 制御構文のサポート (Control Flow)
現在は静的な DOM 構造しか扱えません。実用的なアプリのために以下が必要です。
- **条件分岐 (`If` / `Show`):** ステートに応じて DOM を出し分けたい。
- **リストレンダリング (`For` / `Map`):** 配列データを元に要素を繰り返したい。
*課題:* DOM の挿入・削除位置を特定するための「アンカー（コメントノード等）」の概念導入が必要。

### 2. 決定論的 ID 生成と Hydration
現在は `nanoid` でランダムな ID を生成しているため、リロードのたびにクラス名が変わり、JS 側で `innerHTML` を全置換する必要があります。
- **改善案:** ファイルパスや定義順序に基づいた「変わらない ID」を生成する。
- **メリット:** 既存の HTML を壊さずにイベントリスナーだけをアタッチする「Hydration」が可能になり、パフォーマンスがさらに向上する。

## Long-term Goals (v1.0.0)

### 3. AST ベースのコード変換
現在の `codegen.ts` は正規表現 (`Regex`) を用いて関数の中身を書き換えています。
- **問題点:** ネストした括弧や複雑な構文でバグが起きやすい。
- **解決策:** Babel Parser や MagicString を用いた AST（抽象構文木）レベルでの安全なコード変換への移行。

### 4. コンポーネントの合成 (Composition)
現在は単一のコンポーネントのみ動作します。
- 親から子への **Props** の受け渡し。
- コンポーネント間でのステート共有メカニズム。

### 5. TypeScript Support in Templates
JSX 内での型推論を強化し、開発者体験 (DX) を向上させる。