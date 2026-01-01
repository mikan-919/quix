import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import consola from 'consola'
import type { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'

// ESM/CommonJSの相互運用性対応
const traverse = (_traverse as any).default || _traverse
const generate = (_generate as any).default || _generate

function transformCode(
  code: string,
  context: ComponentContext,
  idToShort: Map<string, string>
): string {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })

    traverse(ast, {
      'ArrowFunctionExpression|FunctionExpression'(path: any) {
        const params = path.node.params

        // 【修正】引数がある場合はその名前、ない場合は 'state' をデフォルトとする
        let scopeName = 'state'

        if (params.length > 0) {
          const scopeParam = params[0]
          if (t.isIdentifier(scopeParam)) {
            scopeName = scopeParam.name
          }
        }

        path.traverse({
          CallExpression(innerPath: any) {
            const callee = innerPath.node.callee

            // MemberExpressionかつ、オブジェクト名が scopeName と一致する場合のみ置換
            if (
              t.isMemberExpression(callee) &&
              t.isIdentifier(callee.object) &&
              callee.object.name === scopeName && // 's' or 'state'
              t.isIdentifier(callee.property)
            ) {
              const key = callee.property.name
              const targetNode = context.getNodeByKey(key)

              if (!targetNode) return

              const shortName = idToShort.get(targetNode.id)
              if (!shortName) return

              const args = innerPath.node.arguments

              if (args.length === 0) {
                const replacement =
                  targetNode.type === 'derived'
                    ? t.callExpression(t.identifier(shortName), [])
                    : t.identifier(shortName)

                innerPath.replaceWith(replacement)
              } else if (args.length === 1 && targetNode.type === 'state') {
                const newValue = args[0]
                const updateFnName = `_u${shortName}`
                const assignment = t.assignmentExpression(
                  '=',
                  t.identifier(shortName),
                  newValue
                )
                const updateCall = t.callExpression(
                  t.identifier(updateFnName),
                  []
                )
                const sequence = t.sequenceExpression([assignment, updateCall])
                innerPath.replaceWith(sequence)
              }
            }
          },
        })
      },
    })

    return generate(ast, {
      minified: true,
      comments: false,
      compact: true,
    }).code.replace(/;$/, '')
  } catch (e) {
    console.error('Codegen Transform Error:', e)
    return code
  }
}

export function generateAppJs(context: ComponentContext) {
  const logger = consola.withTag('Quix:Codegen') // ロガー作成
  const nodes = context.getAllNodes()
  const instructions = context.instructions

  // 1. Debug: コンテキスト情報のダンプ
  logger.info(`Starting Codegen for ${context.name}`)
  logger.debug(
    'Nodes:',
    nodes.map(n => `${n.key} (${n.id}) [${n.type}]`)
  )
  logger.debug(
    'Instructions:',
    instructions.map(
      i => `Action: ${i.action}, Signal: ${i.signalId}, Selector: ${i.selector}`
    )
  )

  // ... (変数名マップ作成、参照解決ヘルパー、DOM要素キャッシュ、State宣言 は変更なし) ...
  const idToShort = new Map<string, string>()
  const getShortName = (i: number) =>
    `_${String.fromCharCode(97 + (i % 26))}${i > 25 ? Math.floor(i / 26) : ''}`

  nodes.forEach((node, i) => {
    idToShort.set(node.id, getShortName(i))
  })

  const getRef = (id: string) => {
    const node = context.getNodeById(id)
    if (!node) return 'undefined'
    const name = idToShort.get(id)
    return node.type === 'derived' ? `${name}()` : name
  }

  const selectors = Array.from(new Set(instructions.map(i => i.selector)))
  const domCache = selectors
    .map((sel, i) => `  const _e${i} = root.querySelector('${sel}');`)
    .join('\n')

  const stateDecls = nodes
    .filter(n => n.type === 'state')
    .map(
      n => `  let ${idToShort.get(n.id)} = ${JSON.stringify((n as any).value)};`
    )
    .join('\n')

  // Derived宣言の生成（AST変換を使用）
  const derivedDecls = nodes
    .filter(n => n.type === 'derived')
    .map(n => {
      const node = n as DerivedNode
      const name = idToShort.get(n.id)
      let fnStr = ''

      if (node.templateBody) {
        if (node.isExpression) {
          // 式の場合はアロー関数でラップしてから変換
          fnStr = `() => ${node.templateBody}`
        } else {
          // テンプレートリテラルの場合
          // 依存関係の解決はここでも必要だが、単純な変数は正規表現でもリスクが低い
          // ただし統一のためにASTを通すなら関数化する
          // 今回は templateBody 内の ${val} はすでに解決済みと仮定するか、
          // HiddenDerived のロジックを見直す必要がある。
          // いったん既存ロジックを踏襲しつつ、単純置換で対応（テンプレートリテラル内の複雑な式は稀なため）

          const firstDep = node.deps[0]
          const depRef = firstDep ? `\${${getRef(firstDep)}}` : ''
          // ここはBabelを通さず直接構築（テンプレート文字列のため）
          const body = `\`${node.templateBody.replace('${val}', depRef)}\``
          return `  const ${name} = () => ${body};`
        }
      } else {
        fnStr = node.fn.toString()
      }

      // AST変換を実行
      // 注意: templateBody由来ではない通常のDerived関数や、Expression由来のコードを変換
      if (!node.templateBody || node.isExpression) {
        // 関数全体を変換
        const transformed = transformCode(fnStr, context, idToShort)
        return `  const ${name} = ${transformed};`
      }
      return `  const ${name} = ${fnStr};` // Fallback
    })
    .join('\n')

  const needsUpdateCache = new Map<string, boolean>()
  const needsUpdate = (nodeId: string): boolean => {
    if (needsUpdateCache.has(nodeId)) return needsUpdateCache.get(nodeId)!
    const nodeShort = idToShort.get(nodeId) || nodeId
    const hasDomOps = instructions.some(i => i.signalId === nodeId)
    if (hasDomOps) {
      logger.trace(`[DCE] Keep ${nodeShort}: Has DOM Instructions`)
      needsUpdateCache.set(nodeId, true)
      return true
    }
    const dependents = nodes.filter(
      n => n.type === 'derived' && (n as DerivedNode).deps.includes(nodeId)
    )
    needsUpdateCache.set(nodeId, false)
    const hasActiveDependents = dependents.some(dep => needsUpdate(dep.id))

    if (hasActiveDependents) {
      logger.trace(`[DCE] Keep ${nodeShort}: Has Active Dependents`)
    } else {
      logger.trace(
        `[DCE] Drop ${nodeShort}: No DOM ops and No Active Dependents`
      )
    }
    needsUpdateCache.set(nodeId, hasActiveDependents)
    return hasActiveDependents
  }

  const initialCallList: string[] = []

  const updates = nodes
    .map(node => {
      const shouldKeep = needsUpdate(node.id)
      const sName = idToShort.get(node.id)
      if (!shouldKeep) {
        logger.warn(
          `Dropping update function for ${node.key} (${sName}) because it seems unused.`
        )
        return ''
      }
      // DOM操作生成（Listアクション対応含む）
      const domOps = instructions
        .filter(i => i.signalId === node.id)
        .map(i => {
          const elIdx = selectors.indexOf(i.selector)
          if (i.action === 'setText') {
            return `    if(_e${elIdx}) _e${elIdx}.textContent = ${getRef(node.id)};`
          }
          if (i.action === 'show' && i.template) {
            return `    if(_e${elIdx}) _e${elIdx}.innerHTML = ${getRef(node.id)} ? \`${i.template}\` : '';`
          }
          if (i.action === 'list' && i.template) {
            logger.success(`Generating list update for ${node.key} (${sName})`)
            // ここも ${getRef} はAST変換済み変数名が入る
            return `    if(_e${elIdx}) _e${elIdx}.innerHTML = ${getRef(node.id)}.map(v => \`${i.template}\`).join('');`
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')

      const cascades = nodes
        .filter(
          n => n.type === 'derived' && (n as DerivedNode).deps.includes(node.id)
        )
        .filter(n => needsUpdate(n.id))
        .map(n => `    _u${idToShort.get(n.id)}();`)
        .join('\n')

      if (!domOps && !cascades) {
        logger.warn(
          `Node ${node.key} (${sName}) passed DCE but generated NO code inside update function.`
        )
        return ''
      }

      if (node.type === 'state') initialCallList.push(`_u${sName}()`)
      if (node.type === 'derived') {
        const isShowCondition = instructions.some(
          inst => inst.signalId === node.id && inst.action === 'show'
        )
        if (isShowCondition) initialCallList.push(`_u${sName}()`)
      }

      return `  function _u${sName}() {\n${domOps}\n${cascades}\n  }`
    })
    .filter(Boolean)
    .join('\n')

  // Event Handlerの変換 (AST変換を使用)
  const events = instructions
    .filter(i => i.action === 'addListener')
    .map(i => {
      const elIdx = selectors.indexOf(i.selector)
      const handlerNode = context.getNodeById(i.signalId)
      if (!handlerNode || handlerNode.type !== 'handler') return ''

      // ハンドラ関数を文字列化してAST変換
      let body = handlerNode.fn.toString()
      body = transformCode(body, context, idToShort)

      return `  if(_e${elIdx}) _e${elIdx}.addEventListener('${i.attrName}', ${body});`
    })
    .join('\n')

  return `(function() {
  const root = document.getElementById("app");
  if (!root) return;

${domCache}
${stateDecls}
${derivedDecls}
${updates}
${events}

  // Initial Render
${initialCallList.map(call => `  ${call};`).join('\n')}
})();`
}
