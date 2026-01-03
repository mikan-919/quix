import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import consola from 'consola'
import type { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'

const traverse = (_traverse as any).default || _traverse
const generate = (_generate as any).default || _generate

// AST変換関数 (transformCode) は変更なし
function transformCode(
  code: string,
  context: ComponentContext,
  idToShort: Map<string, string>
): string {
  // ... (省略)
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })
    // ... (既存のロジック)
    let scopeName = 'state'
    const body = ast.program.body[0]
    if (
      t.isExpressionStatement(body) &&
      (t.isArrowFunctionExpression(body.expression) ||
        t.isFunctionExpression(body.expression))
    ) {
      const fn = body.expression
      if (fn.params.length > 0) {
        const firstParam = fn.params[0]
        if (t.isIdentifier(firstParam)) {
          scopeName = firstParam.name
        }
        fn.params = fn.params.slice(1)
      }
    }
    traverse(ast, {
      CallExpression(innerPath: any) {
        const callee = innerPath.node.callee
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          callee.object.name === scopeName &&
          t.isIdentifier(callee.property)
        ) {
          const key = callee.property.name
          const targetNode = context.getNodeByKey(key)
          if (!targetNode) return

          const shortName = idToShort.get(targetNode.id)
          if (!shortName) return

          const args = innerPath.node.arguments
          if (args.length === 0) {
            innerPath.replaceWith(
              targetNode.type === 'derived'
                ? t.callExpression(t.identifier(shortName), [])
                : t.identifier(shortName)
            )
          } else if (args.length === 1 && targetNode.type === 'state') {
            const assignment = t.assignmentExpression(
              '=',
              t.identifier(shortName),
              args[0] as any
            )
            const updateCall = t.callExpression(
              t.identifier(`_u${shortName}`),
              []
            )
            innerPath.replaceWith(
              t.sequenceExpression([assignment, updateCall])
            )
          }
        }
      },
    })
    return generate(ast, {
      minified: true,
      comments: false,
      compact: true,
    }).code.replace(/;$/, '')
  } catch (_e) {
    return code
  }
}

export function generateAppJs(context: ComponentContext) {
  const logger = consola.withTag('Quix:Codegen')
  const nodes = context.getAllNodes()
  const instructions = context.instructions

  logger.info(`Generating JS for App: ${context.name}`)
  logger.debug(
    `Analysis Result: ${nodes.length} nodes, ${instructions.length} instructions`
  )

  const idToShort = new Map<string, string>()
  const getShortName = (i: number) =>
    `_${String.fromCharCode(97 + (i % 26))}${i > 25 ? Math.floor(i / 26) : ''}`

  nodes.forEach((node, i) => {
    idToShort.set(node.id, getShortName(i))
  })

  // ... (getRef, selectors, domCache, stateDecls, derivedDecls はそのまま)
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

  const derivedDecls = nodes
    .filter(n => n.type === 'derived')
    .map(n => {
      // ... (既存のDerived生成ロジック)
      const node = n as DerivedNode
      const name = idToShort.get(n.id)
      let fnStr = ''
      if (node.templateBody) {
        if (node.isExpression) {
          fnStr = `() => ${node.templateBody}`
        } else {
          const firstDep = node.deps[0]
          const depRef = firstDep ? `\${${getRef(firstDep)}}` : ''
          const body = `\`${node.templateBody.replace('${val}', depRef)}\``
          return `  const ${name} = () => ${body};`
        }
      } else {
        fnStr = node.fn.toString()
      }
      if (!node.templateBody || node.isExpression) {
        const transformed = transformCode(fnStr, context, idToShort)
        return `  const ${name} = ${transformed};`
      }
      return `  const ${name} = ${fnStr};`
    })
    .join('\n')

  // Dead Code Elimination のロギング強化
  const needsUpdateCache = new Map<string, boolean>()

  // 統計用カウンター
  let droppedCount = 0
  let keptCount = 0

  const needsUpdate = (nodeId: string): boolean => {
    if (needsUpdateCache.has(nodeId)) return needsUpdateCache.get(nodeId)!

    const nodeShort = idToShort.get(nodeId) || nodeId
    const nodeKey = context.getNodeById(nodeId)?.key || 'unknown'
    const debugName = `${nodeKey}(${nodeShort})`

    // 1. 直接DOM操作を持っているか？
    const hasDomOps = instructions.some(i => i.signalId === nodeId)
    if (hasDomOps) {
      // logger.trace(`[Keep] ${debugName}: Has direct DOM instructions`)
      needsUpdateCache.set(nodeId, true)
      return true
    }

    // 2. 依存しているDerivedがアクティブか？ (再帰)
    const dependents = nodes.filter(
      n => n.type === 'derived' && (n as DerivedNode).deps.includes(nodeId)
    )
    // 循環防止のため一旦falseセット
    needsUpdateCache.set(nodeId, false)

    const hasActiveDependents = dependents.some(dep => needsUpdate(dep.id))

    if (hasActiveDependents) {
      // logger.trace(`[Keep] ${debugName}: Needed by active dependents`)
    } else {
      logger.debug(
        `[DCE:Drop] ${debugName}: No DOM ops and No Active Dependents`
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
        droppedCount++
        return ''
      }
      keptCount++

      // ... (DOM操作生成ロジックはそのまま)
      const domOps = instructions
        .filter(i => i.signalId === node.id)
        .map(i => {
          const elIdx = selectors.indexOf(i.selector)
          if (i.action === 'setText') {
            return `    if(_e${elIdx}) _e${elIdx}.textContent = ${getRef(node.id)};`
          }
          if (i.action === 'setAttr' && i.attrName) {
            const attr = i.attrName
            const ref = getRef(node.id)
            if (attr === 'value' || attr === 'checked' || attr === 'disabled') {
              return `    if(_e${elIdx}) _e${elIdx}.${attr} = ${ref};`
            }
            return `    if(_e${elIdx}) _e${elIdx}.setAttribute('${attr}', ${ref});`
          }
          if (i.action === 'show' && i.template) {
            return `    if(_e${elIdx}) _e${elIdx}.innerHTML = ${getRef(node.id)} ? \`${i.template}\` : '';`
          }
          if (i.action === 'list' && i.template) {
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
        // 残す判定にはなったが、実質空の関数になる場合
        logger.debug(`[DCE:Empty] ${node.key} (${sName}) has empty update fn.`)
        return ''
      }

      // Initial Renderリストへの追加
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

  // イベント生成処理はそのまま
  const events = instructions
    .filter(i => i.action === 'addListener')
    .map(i => {
      const elIdx = selectors.indexOf(i.selector)
      const handlerNode = context.getNodeById(i.signalId)
      if (!handlerNode || handlerNode.type !== 'handler') return ''
      let body = handlerNode.fn.toString()
      body = transformCode(body, context, idToShort)
      return `  if(_e${elIdx}) _e${elIdx}.addEventListener('${i.attrName}', ${body});`
    })
    .join('\n')

  logger.success(
    `Codegen Complete: kept=${keptCount} nodes, dropped=${droppedCount} nodes`
  )

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
