import { nanoid } from 'nanoid'
import { tracker } from './core/tracker'
import type { HiddenDerivedRequest, Instruction } from './core/types'

// ... (VNode, generateQid は変更なし) ...
export interface VNode {
  tag: string
  html: string
  instructions: Instruction[]
  hiddenDerivedRequests: HiddenDerivedRequest[]
}

const generateQid = () => `q-${nanoid(6)}`

export function h(tag: string, props: any, ...children: any[]): VNode {
  // ... (前半の属性処理は変更なし) ...
  const qid = generateQid()
  const instructions: Instruction[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []

  const staticProps: Record<string, string> = {}
  let needsQid = false

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' && v.startsWith('{{HANDLER:')) {
        const handlerId = v.replace('{{HANDLER:', '').replace('}}', '')
        instructions.push({
          signalId: handlerId,
          selector: `.${qid}`,
          action: 'addListener',
          attrName: k.toLowerCase().replace(/^on/, ''),
        })
        needsQid = true
      } else {
        staticProps[k] = String(v)
      }
    }
  }

  // 2. 子要素の処理
  const flatChildren = children.flat()
  const processedHtml: string[] = []

  const isTextContent = flatChildren.every(c => typeof c !== 'object')
  const hasFunction = flatChildren.some(c => typeof c === 'function')

  if (isTextContent && hasFunction) {
    needsQid = true
    const tmplId = `hd-${nanoid(6)}`

    const deps = new Set<string>()
    const initialHtmlParts: string[] = []

    // テンプレートボディの構築
    const templateParts = flatChildren.map(child => {
      if (typeof child === 'function') {
        // 関数を実行して依存IDを収集
        return tracker.runWithScope(
          tmplId,
          id => deps.add(id),
          () => {
            const val = child() // 初期値を取得
            initialHtmlParts.push(String(val))

            // ⭐️ 修正: 関数のソースコードから式を抽出する
            // child.toString() -> "() => state.isQuad() ? 'A' : 'B'"
            const fnStr = child.toString()

            // アロー関数の "=>" より後ろの部分を取り出す
            // 正規表現で簡易的に抽出 (ブロック {} がない単一式を想定)
            const match = fnStr.match(/=>\s*([\s\S]*)/)
            if (match) {
              const expr = match[1].trim()
              // JSテンプレートリテラル内に式を埋め込む
              return `\${${expr}}`
            }

            // フォールバック（解析できなかった場合）
            return `\${val}`
          }
        )
      }

      // 通常の文字列
      const str = String(child)
      initialHtmlParts.push(str)
      return str.replace(/[`\\$]/g, '\\$&')
    })

    hiddenDerivedRequests.push({
      placeholderId: tmplId,
      deps: Array.from(deps),
      templateBody: templateParts.join(''),
    })

    instructions.push({
      signalId: tmplId,
      selector: `.${qid}`,
      action: 'setText',
    })

    processedHtml.push(initialHtmlParts.join(''))
  } else {
    // ... (再帰処理は変更なし) ...
    flatChildren.forEach(child => {
      if (child && typeof child === 'object' && 'html' in child) {
        const vnode = child as VNode
        instructions.push(...vnode.instructions)
        hiddenDerivedRequests.push(...vnode.hiddenDerivedRequests)
        processedHtml.push(vnode.html)
      } else {
        processedHtml.push(String(child))
      }
    })
  }

  // クラス名の注入
  if (needsQid) {
    staticProps.class = `${staticProps.class || ''} ${qid}`.trim()
  }

  const attrStr = Object.entries(staticProps)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

  return {
    tag,
    html: `<${tag}${attrStr ? ` ${attrStr}` : ''}>${processedHtml.join('')}</${tag}>`,
    instructions,
    hiddenDerivedRequests,
  }
}
