import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import consola from 'consola'
import type { ComponentContext } from '../core/context'
import type { DerivedNode, StateNode } from '../core/types'

const logger = consola.withTag('Quix:Codegen')

// Handle ESM/CJS interop for Babel modules
const traverse = (_traverse as any).default || _traverse
const generate = (_generate as any).default || _generate

// AST変換関数 (transformCode) は変更なし
function transformCode(
  code: string,
  context: ComponentContext,
  idToShort: Map<string, string>,
  keepParams = false
): string {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })

    let stateScope = 'state'
    let propsScope = 'props'
    let handlersScope = 'handlers'
    const itemScope = 'item'

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
          stateScope = firstParam.name
        } else if (t.isObjectPattern(firstParam)) {
          for (const prop of firstParam.properties) {
            if (
              t.isObjectProperty(prop) &&
              t.isIdentifier(prop.key) &&
              t.isIdentifier(prop.value)
            ) {
              if (prop.key.name === 'state') stateScope = prop.value.name
              if (prop.key.name === 'props') propsScope = prop.value.name
              if (prop.key.name === 'handlers') handlersScope = prop.value.name
            }
          }
        }
        if (!keepParams) {
          fn.params = fn.params.slice(1)
        }
      }
    }

    traverse(ast, {
      CallExpression(innerPath: NodePath<t.CallExpression>) {
        const callee = innerPath.node.callee

        // 1. 直出しの呼び出し: item() -> item
        if (t.isIdentifier(callee) && callee.name === itemScope) {
          innerPath.replaceWith(t.identifier(itemScope))
          return
        }

        // 2. メンバー経由の呼び出し: state.count() -> _a, props.v() -> item or _a, etc.
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          t.isIdentifier(callee.property)
        ) {
          const objName = callee.object.name
          const key = callee.property.name

          if (objName === stateScope || objName === propsScope) {
            let targetId: string | undefined
            let isDerived = false

            if (objName === stateScope) {
              const node = context.getNodeByKey(key)
              if (node) {
                targetId = node.id
                isDerived = node.type === 'derived'
              }
            } else {
              targetId = context.propMap.get(key)
              // Prop の先が Derived かどうかは Context 跨ぎになるため、
              // signals map から判定する必要があるが、ここでは signalId の形式で推測
              isDerived = !!targetId?.match(/^d-/)
            }

            if (!targetId) return

            if (targetId.startsWith('for-item-')) {
              innerPath.replaceWith(t.identifier(itemScope))
              return
            }

            const shortName = idToShort.get(targetId)
            if (!shortName) return

            const args = innerPath.node.arguments
            if (args.length === 0) {
              innerPath.replaceWith(
                isDerived
                  ? t.callExpression(t.identifier(shortName), [])
                  : t.identifier(shortName)
              )
            } else if (
              args.length === 1 &&
              objName === stateScope &&
              context.getNodeById(targetId)?.type === 'state'
            ) {
              const assignment = t.assignmentExpression(
                '=',
                t.identifier(shortName),
                args[0] as t.Expression
              )
              const updateCall = t.callExpression(
                t.identifier(`_u${shortName}`),
                []
              )
              innerPath.replaceWith(
                t.sequenceExpression([assignment, updateCall])
              )
            }
          } else if (objName === handlersScope) {
            const targetNode = context.getNodeByKey(key)
            if (targetNode) {
              innerPath.replaceWith(
                t.identifier(`{{HANDLER:${targetNode.id}}}`)
              )
            }
          }
        }
      },
    })

    return generate(ast, {
      minified: true,
      comments: false,
      compact: true,
    }).code.replace(/;$/, '')
  } catch (e) {
    logger.error('Failed to parse or transform code:', e)
    throw e
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

  const showInsts = instructions.filter(
    i => (i.action === 'show' || i.action === 'list') && i.templateId
  )
  const selectorsInsideTemplate = new Set<string>()
  const selectorsInsideFor = new Set<string>()

  for (const si of showInsts) {
    for (const i of instructions) {
      if (
        i.selector !== si.selector &&
        si.template?.includes(i.selector.replace(/^\./, ''))
      ) {
        selectorsInsideTemplate.add(i.selector)
        if (si.action === 'list') {
          selectorsInsideFor.add(i.selector)
        }
      }
    }
  }

  const selectors = Array.from(new Set(instructions.map(i => i.selector)))
  const domCache = selectors
    .map((sel, i) => {
      const isInside = selectorsInsideTemplate.has(sel)
      const isFor = selectorsInsideFor.has(sel)
      const method = isFor ? 'querySelectorAll' : 'querySelector'
      return `  ${isInside ? 'let' : 'const'} _e${i} = root.${method}('${sel}');`
    })
    .join('\n')

  const templateDecls = showInsts
    .map(si => {
      const tId = (si.templateId ?? 'unknown').replace(/-/g, '_')
      return `  const _tmpl_${tId} = document.getElementById('${si.templateId}');`
    })
    .join('\n')

  const rebindFns = showInsts
    .map(si => {
      const tId = (si.templateId ?? 'unknown').replace(/-/g, '_')
      const internalInsts = instructions.filter(
        i =>
          i.selector !== si.selector &&
          si.template?.includes(i.selector.replace(/^\./, ''))
      )
      const rebindBody = Array.from(new Set(internalInsts.map(i => i.selector)))
        .map(sel => {
          const idx = selectors.indexOf(sel)
          const isFor = selectorsInsideFor.has(sel)
          const method = isFor ? 'querySelectorAll' : 'querySelector'
          return `    _e${idx} = root.${method}('${sel}');`
        })
        .join('\n')
      // Re-attach event listeners for addListener instructions inside this template
      const eventRebindBody = instructions
        .filter(
          i =>
            i.action === 'addListener' &&
            si.template?.includes(i.selector?.replace(/^\./, ''))
        )
        .map(i => {
          const handlerNode = context.getNodeById(i.signalId)
          if (!handlerNode || handlerNode.type !== 'handler') return ''
          let body = handlerNode.fn.toString()
          body = transformCode(body, context, idToShort)
          const idx = selectors.indexOf(i.selector)
          return `    if(_e${idx}) _e${idx}.addEventListener('${i.attrName}', ${body});`
        })
        .join('\n')
      return `  function _u_rebind_${tId}() {\n${rebindBody}\n${eventRebindBody}\n  }`
    })
    .join('\n')

  const stateDecls = nodes
    .filter(n => n.type === 'state')
    .map(n => {
      const stateNode = n as StateNode
      return `  let ${idToShort.get(n.id)} = ${JSON.stringify(stateNode.value)};`
    })
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
          // templateBody がすでにアロー関数 (() => ...) の場合はそのまま使う
          if (
            node.templateBody.trim().startsWith('()') ||
            node.templateBody.trim().startsWith('(')
          ) {
            fnStr = node.templateBody
          } else {
            fnStr = `() => ${node.templateBody}`
          }
        } else {
          const firstDep = node.deps[0]
          const depRef = firstDep ? `\${${getRef(firstDep)}}` : ''
          // biome-ignore lint/suspicious/noTemplateCurlyInString: code generation of template string
          const body = `\`${node.templateBody.replace('${val}', depRef)}\``
          return `  const ${name} = () => ${body};`
        }
      } else {
        fnStr = node.fn.toString()
      }
      if (!node.templateBody || node.isExpression) {
        const transformed = transformCode(
          fnStr,
          (node.context as ComponentContext | undefined) || context,
          idToShort
        )
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
    // biome-ignore lint/style/noNonNullAssertion: checked
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
          const isFor = selectorsInsideFor.has(i.selector)
          const wrapList = (code: string) =>
            isFor
              ? `    if(_e${elIdx}) _e${elIdx}.forEach(el => { ${code.replace(`_e${elIdx}`, 'el')} });`
              : `    if(_e${elIdx}) ${code}`

          if (i.action === 'setText') {
            return wrapList(`_e${elIdx}.textContent = ${getRef(node.id)};`)
          }
          if (i.action === 'setAttr' && i.attrName) {
            const attr = i.attrName
            const ref = getRef(node.id)
            if (attr === 'value' || attr === 'checked' || attr === 'disabled') {
              return wrapList(`_e${elIdx}.${attr} = ${ref};`)
            }
            return wrapList(`_e${elIdx}.setAttribute('${attr}', ${ref});`)
          }
          if (i.action === 'show' && i.templateId) {
            const tId = i.templateId.replace(/-/g, '_')
            return `    if(_e${elIdx}) {
      const _cond = ${getRef(node.id)};
      if(_cond) {
        if(!_e${elIdx}.firstChild) {
          if(_tmpl_${tId}) _e${elIdx}.appendChild(_tmpl_${tId}.content.cloneNode(true));
        }
        _u_rebind_${tId}();
      } else {
        _e${elIdx}.innerHTML = '';
      }
    }`
          }
          if (i.action === 'list' && i.templateId) {
            const tId = i.templateId.replace(/-/g, '_')
            // itemInstructions の変換
            let itemUpdateFn = 'null'
            if (i.itemInstructions && i.itemInstructions.length > 0) {
              const body = i.itemInstructions
                .map(ii => {
                  const selector = ii.selector.replace(/^\./, '')
                  const findEl = `{ const el = root.classList.contains('${selector}') ? root : root.querySelector('.${selector}'); if(el)`
                  if (ii.action === 'setText') {
                    if (ii.itemFns) return ''
                    return `      ${findEl} el.textContent = String(item); }`
                  }
                  if (ii.action === 'setAttr' && ii.attrName) {
                    const attr = ii.attrName
                    if (
                      attr === 'value' ||
                      attr === 'checked' ||
                      attr === 'disabled'
                    ) {
                      return `      ${findEl} el.${attr} = item; }`
                    }
                    return `      ${findEl} el.setAttribute('${attr}', item); }`
                  }
                  if (ii.action === 'addListener' && ii.attrName) {
                    const handlerNode = context.getNodeById(ii.signalId)
                    if (handlerNode && handlerNode.type === 'handler') {
                      let hBody = handlerNode.fn.toString()
                      hBody = transformCode(
                        hBody,
                        (handlerNode.context as ComponentContext | undefined) ||
                          context,
                        idToShort,
                        true
                      )
                      return `      ${findEl} el.addEventListener('${ii.attrName}', ${hBody}); }`
                    }
                  }
                  return ''
                })
                .filter(Boolean)
                .join('\n')
              itemUpdateFn = `(root, item) => {\n${body}\n    }`
            }

            // itemSlots (q-text) の変換
            let slotFnsStr = '[]'
            const allItemFns = (i.itemInstructions || [])
              .filter(ii => ii.itemFns)
              .flatMap(ii => ii.itemFns ?? [])
            if (allItemFns.length > 0) {
              const transformedSlots = (i.itemInstructions || [])
                .filter(ii => ii.itemFns)
                .flatMap(ii => {
                  return (ii.itemFns ?? []).map(fnStr => {
                    const withParam = fnStr.replace(/^\(\)\s*=>/, '(item) =>')
                    return transformCode(
                      withParam,
                      (ii.context as ComponentContext | undefined) || context,
                      idToShort,
                      true
                    )
                  })
                })
              slotFnsStr = `[${transformedSlots.join(', ')}]`
            }

            return `    if(_e${elIdx}) _reconcile(_e${elIdx}, ${getRef(
              node.id
            )}, _tmpl_${tId}, ${slotFnsStr}, ${itemUpdateFn});`
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
        const needsInitialCall = instructions.some(
          inst =>
            inst.signalId === node.id &&
            (inst.action === 'show' || inst.action === 'list')
        )
        if (needsInitialCall) initialCallList.push(`_u${sName}()`)
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

  function _reconcile(container, items, template, slotFns, itemUpdateFn) {
    let oldMap = container._q_map || new Map();
    let newMap = new Map();
    const hasSlotFns = slotFns && slotFns.length > 0;
    
    // 1. Prepare nodes
    items.forEach(item => {
       const key = (typeof item === 'object' && item !== null && 'key' in item) ? item.key : item;
       let node = oldMap.get(key);
       if (!node) {
         const clone = template.content.cloneNode(true);
         const slots = clone.querySelectorAll('q-text');
         const q_texts = [];
         slots.forEach((slot, i) => {
            const val = (hasSlotFns && slotFns[i]) ? slotFns[i](item) : String(item);
            const textNode = document.createTextNode(val);
            slot.parentNode.replaceChild(textNode, slot);
            q_texts.push(textNode);
         });
         node = clone.firstElementChild;
         if (node) {
            node._q_texts = q_texts;
            if (itemUpdateFn) itemUpdateFn(node, item);
         }
       } else {
         if (node._q_texts) {
            node._q_texts.forEach((tn, i) => {
              const val = String((hasSlotFns && slotFns[i]) ? slotFns[i](item) : item);
              if (tn.textContent !== val) tn.textContent = val;
            });
         }
         if (itemUpdateFn) itemUpdateFn(node, item);
       }
       if (node) newMap.set(key, node);
    });
    
    // 2. Align DOM
    let cursor = container.firstElementChild;
    items.forEach(item => {
       const key = (typeof item === 'object' && item !== null && 'key' in item) ? item.key : item;
       const node = newMap.get(key);
       if (node) {
         if (node !== cursor) {
            container.insertBefore(node, cursor);
         } else {
            cursor = cursor.nextElementSibling;
         }
       }
    });
    
    // 3. Remove rest
    while(cursor) {
       const next = cursor.nextElementSibling;
       cursor.remove();
       cursor = next;
    }
    
    container._q_map = newMap;
  }

${domCache}
${templateDecls}
${rebindFns}
${stateDecls}
${derivedDecls}
${updates}
${events}

  // Initial Render
${initialCallList.map(call => `  ${call};`).join('\n')}
})();`
}
