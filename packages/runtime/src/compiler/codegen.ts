import type { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'

export function generateAppJs(context: ComponentContext) {
  const nodes = context.getAllNodes()
  const instructions = context.instructions

  // ... (変数名マップ作成、参照解決ヘルパー、DOM要素キャッシュ、State宣言、Derived宣言 は変更なし) ...
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

  const derivedDecls = nodes
    .filter(n => n.type === 'derived')
    .map(n => {
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
      nodes.forEach(targetNode => {
        if (targetNode.type === 'handler') return
        const targetRef = getRef(targetNode.id)
        const key = targetNode.key
        const regexCall = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(\\)`, 'g')
        fnStr = fnStr.replace(regexCall, targetRef!)
        const regexGet = new RegExp(`[a-zA-Z0-9_]+\\.${key}`, 'g')
        fnStr = fnStr.replace(regexGet, targetRef!)
      })
      return `  const ${name} = ${fnStr};`
    })
    .join('\n')

  // ⭐️ 追加: デッドコード削除のための判定ロジック
  // メモ化用のキャッシュ
  const needsUpdateCache = new Map<string, boolean>()

  const needsUpdate = (nodeId: string): boolean => {
    if (needsUpdateCache.has(nodeId)) return needsUpdateCache.get(nodeId)!

    // 1. このノード自体に対するDOM操作命令があるか？
    const hasDomOps = instructions.some(i => i.signalId === nodeId)
    if (hasDomOps) {
      needsUpdateCache.set(nodeId, true)
      return true
    }

    // 2. このノードに依存している他のノードが、更新を必要としているか？（再帰チェック）
    const dependents = nodes.filter(
      n => n.type === 'derived' && (n as DerivedNode).deps.includes(nodeId)
    )

    // 循環参照防止のために仮でfalseを入れておく
    needsUpdateCache.set(nodeId, false)

    const hasActiveDependents = dependents.some(dep => needsUpdate(dep.id))

    needsUpdateCache.set(nodeId, hasActiveDependents)
    return hasActiveDependents
  }

  // 5. 更新関数 (Updates) の生成
  const initialCallList: string[] = []

  const updates = nodes
    .map(node => {
      // ⭐️ 修正: 更新が必要ないノード（未使用のDerivedなど）の関数は生成しない
      if (!needsUpdate(node.id)) return ''

      const sName = idToShort.get(node.id)
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
          return ''
        })
        .filter(Boolean)
        .join('\n')

      const cascades = nodes
        .filter(
          n => n.type === 'derived' && (n as DerivedNode).deps.includes(node.id)
        )
        // ⭐️ 修正: 依存先が更新関数を持っている場合のみ呼び出す
        .filter(n => needsUpdate(n.id))
        .map(n => `    _u${idToShort.get(n.id)}();`)
        .join('\n')

      if (!domOps && !cascades) return ''

      if (node.type === 'state') {
        initialCallList.push(`_u${sName}()`)
      }

      if (node.type === 'derived') {
        const isShowCondition = instructions.some(
          inst => inst.signalId === node.id && inst.action === 'show'
        )
        if (isShowCondition) {
          initialCallList.push(`_u${sName}()`)
        }
      }

      return `  function _u${sName}() {\n${domOps}\n${cascades}\n  }`
    })
    .filter(Boolean)
    .join('\n')

  // ... (Events, return は変更なし) ...
  const events = instructions
    .filter(i => i.action === 'addListener')
    .map(i => {
      const elIdx = selectors.indexOf(i.selector)
      const handlerNode = context.getNodeById(i.signalId)
      if (!handlerNode || handlerNode.type !== 'handler') return ''

      let body = handlerNode.fn.toString()

      nodes.forEach(target => {
        const tName = idToShort.get(target.id)
        const key = target.key
        const regexGet = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(\\)`, 'g')
        const replacement = target.type === 'derived' ? `${tName}()` : tName
        body = body.replace(regexGet, replacement!)
      })

      nodes.forEach(target => {
        if (target.type !== 'state') return
        const tName = idToShort.get(target.id)
        const tUpdate = `_u${tName}`
        const key = target.key
        const regexSet = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(([^)]+)\\)`, 'g')
        // ⭐️ 注意: tUpdate が生成されていない場合（Stateがどこにも使われていない）は呼び出さないべきだが
        // State更新は常に副作用(DOM更新)の起点となるため、needsUpdate(state) は基本trueになるはず
        body = body.replace(regexSet, `(${tName} = $1, ${tUpdate}())`)
      })

      return `  if(_e${elIdx}) _e${elIdx}.addEventListener('${i.attrName}', ${body});`
    })
    .join('\n')

  return `(function() {
  const root = document.getElementById("app");
  if (!root) return;

  // HTML構造を注入
  root.innerHTML = ${JSON.stringify(context.html)};

${domCache}
${stateDecls}
${derivedDecls}
${updates}
${events}

  // Initial Render
${initialCallList.map(call => `  ${call};`).join('\n')}
})();`
}
