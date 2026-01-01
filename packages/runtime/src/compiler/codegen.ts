import type { ComponentContext } from '../core/context'
import type { DerivedNode } from '../core/types'

export function generateAppJs(context: ComponentContext) {
  const nodes = context.getAllNodes()
  const instructions = context.instructions

  // 1. 変数名マップ作成
  const idToShort = new Map<string, string>()
  const getShortName = (i: number) =>
    `_${String.fromCharCode(97 + (i % 26))}${i > 25 ? Math.floor(i / 26) : ''}`

  nodes.forEach((node, i) => {
    idToShort.set(node.id, getShortName(i))
  })

  // 参照解決ヘルパー
  const getRef = (id: string) => {
    const node = context.getNodeById(id)
    if (!node) return 'undefined'
    const name = idToShort.get(id)
    return node.type === 'derived' ? `${name}()` : name
  }

  // ... (DOMキャッシュ、State宣言は変更なし) ...
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

  // 4. Derived宣言
  const derivedDecls = nodes
    .filter(n => n.type === 'derived')
    .map(n => {
      const node = n as DerivedNode
      const name = idToShort.get(n.id)

      // ⭐️ 修正: User Derived も Hidden Derived も共通の置換ロジックを通す
      let fnStr = ''

      if (node.templateBody) {
        // Hidden Derived: テンプレート文字列をアロー関数で包む
        fnStr = `() => \`${node.templateBody}\``
      } else {
        // User Derived: 元の関数文字列を使う
        fnStr = node.fn.toString()
      }

      // 変数参照の置換 (Dependency Replacement)
      nodes.forEach(targetNode => {
        if (targetNode.type === 'handler') return

        const targetRef = getRef(targetNode.id)
        const key = targetNode.key

        // ユーザーコードの変数名は何かわからない (state, s, etc)
        // そのため "任意の変数.key()" というパターンを置換する
        // [a-zA-Z0-9_]+  --> 変数名にマッチ

        // Getter置換: anyVar.key() -> targetRef
        const regexCall = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(\\)`, 'g')
        fnStr = fnStr.replace(regexCall, targetRef!)

        // Getter置換 (プロパティアクセス): anyVar.key -> targetRef
        const regexGet = new RegExp(`[a-zA-Z0-9_]+\\.${key}`, 'g')
        fnStr = fnStr.replace(regexGet, targetRef!)
      })

      return `  const ${name} = ${fnStr};`
    })
    .join('\n')

  // ... (Updates, Events生成ロジックも同様に正規表現を修正) ...
  const initialCallList: string[] = []

  const updates = nodes
    .map(node => {
      const sName = idToShort.get(node.id)
      const domOps = instructions
        .filter(i => i.signalId === node.id)
        .map(i => {
          const elIdx = selectors.indexOf(i.selector)
          if (i.action === 'setText') {
            return `    if(_e${elIdx}) _e${elIdx}.textContent = ${getRef(node.id)};`
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')

      const cascades = nodes
        .filter(
          n => n.type === 'derived' && (n as DerivedNode).deps.includes(node.id)
        )
        .map(n => `    _u${idToShort.get(n.id)}();`)
        .join('\n')

      if (!domOps && !cascades) return ''

      if (node.type === 'state') {
        initialCallList.push(`_u${sName}()`)
      }

      return `  function _u${sName}() {\n${domOps}\n${cascades}\n  }`
    })
    .filter(Boolean)
    .join('\n')

  // 6. イベントリスナー (ここも正規表現を修正)
  const events = instructions
    .filter(i => i.action === 'addListener')
    .map(i => {
      const elIdx = selectors.indexOf(i.selector)
      const handlerNode = context.getNodeById(i.signalId)
      if (!handlerNode || handlerNode.type !== 'handler') return ''

      let body = handlerNode.fn.toString()

      // 1. Getter置換
      nodes.forEach(target => {
        const tName = idToShort.get(target.id)
        const key = target.key
        // 任意の変数名.key() -> 参照
        const regexGet = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(\\)`, 'g')
        const replacement = target.type === 'derived' ? `${tName}()` : tName
        body = body.replace(regexGet, replacement!)
      })

      // 2. Setter置換
      nodes.forEach(target => {
        if (target.type !== 'state') return
        const tName = idToShort.get(target.id)
        const tUpdate = `_u${tName}`
        const key = target.key
        // 任意の変数名.key(...) -> 更新ロジック
        const regexSet = new RegExp(`[a-zA-Z0-9_]+\\.${key}\\(([^)]+)\\)`, 'g')
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
