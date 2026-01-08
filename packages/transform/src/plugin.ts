export default function myPlugin(_program: Program): Transformer {
  return {
    visitor: {
      JSXElement(node) {
        // カスタム変換ロジック
        if (node.span.start < 10) {
          // 例: 短いJSXをスキップ
          return null
        }
        return undefined // 変更なし
      },
    },
  }
}
