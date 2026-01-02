import { transformSync } from '@babel/core'
// @ts-expect-error
import pluginJsx from '@babel/plugin-transform-react-jsx'
// @ts-expect-error
import presetTs from '@babel/preset-typescript'
import t from '@babel/types'

export function transformQuix(code: string, filename: string) {
  const result = transformSync(code, {
    filename,
    configFile: false,
    babelrc: false,
    presets: [[presetTs, { isTSX: true, allExtensions: true }]],
    plugins: [
      // 1. { count() } -> { () => count() }
      function quixWrapPlugin({ types: t }: any) {
        return {
          visitor: {
            JSXExpressionContainer(path: any) {
              // ⭐️ onで始まるイベントハンドラ属性は除外
              if (
                path.parentPath.isJSXAttribute() &&
                t.isJSXIdentifier(path.parent.name) &&
                path.parent.name.name.startsWith('on')
              ) {
                return
              }
              const expr = path.node.expression
              // すでにアロー関数の場合や空の場合はスキップ
              if (
                t.isJSXEmptyExpression(expr) ||
                t.isArrowFunctionExpression(expr)
              )
                return

              // ⭐️ 属性の値を関数でラップして、h() への遅延評価・依存追跡を可能にする
              path
                .get('expression')
                .replaceWith(t.arrowFunctionExpression([], expr))
            },
          },
        }
      },
      // 2. JSXタグを h(...) に変換
      [
        pluginJsx,
        {
          pragma: 'h',
          pragmaFrag: 'Fragment',
          runtime: 'classic', // これにより React.createElement ではなく h が使われる
          useBuiltIns: true,
        },
      ],

      // 3. 自動インポート (@quix/runtime から h を入れる)
      {
        visitor: {
          Program(path: any) {
            let hasH = false
            path.traverse({
              ImportSpecifier(p: any) {
                // すでに h がどこかからインポートされていればフラグを立てる
                if (p.node.imported.name === 'h') hasH = true
              },
            })

            if (!hasH) {
              path.node.body.unshift(
                t.importDeclaration(
                  [t.importSpecifier(t.identifier('h'), t.identifier('h'))],
                  t.stringLiteral('@quix/runtime') // 💡 インポート先を統合
                )
              )
            }
          },
        },
      },
    ],
  })
  return result?.code || ''
}
