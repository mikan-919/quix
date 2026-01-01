# Roadmap & Improvements

## Current Status (v0.1.5)
- ✅ **Core Reactivity:** State, Derived, Handler の依存関係解決の実装完了。
- ✅ **Zero-Bundle-Size:** ランタイムライブラリを含まない、極小の Vanilla JS を生成。
- ✅ **FOUC Prevention:** サーバーサイドでの初期 HTML 生成と注入。
- ✅ **Dev Experience:** Vite を利用した高速な HMR と開発サーバー統合。
- ✅ **Conditional Rendering:** `<Show />` コンポーネントによる表示切り替え。
- ✅ **Type Safety:** 依存配列に基づく厳密な型推論。
- ✅ **Code Optimization:** 不要な更新関数の削除（Dead Code Elimination）。

## Immediate Goals (v0.2.0)

### 1. リストレンダリング (List Rendering)
配列データを元に要素を繰り返す機能の実装。
- **`<For />` コンポーネント:** `items` プロパティを受け取り、配列の変更に応じて DOM を効率的に更新する。
- **課題:** `innerHTML` 全置換ではなく、`insertBefore` / `removeKey` などを用いた部分更新ロジックの生成が必要。

### 2. 決定論的 ID 生成と Hydration
現在は `nanoid` でランダムな ID を生成しているため、リロードのたびにクラス名が変わります。
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