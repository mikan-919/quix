import { ComponentBuilder } from './core/builder'
import { handleComponent } from './core/components/Component'
import { handleFor } from './core/components/For'
import { handleShow } from './core/components/Show'
import { generateId } from './core/id'
import { For, Show } from './core/symbols'
import { tracker } from './core/tracker'
import type { HiddenDerivedRequest, Instruction, VNode } from './core/types'

export function h(tag: any, props: any, ...children: any[]): VNode {
  // 1 & 2. Component/Symbols 処理 (既存通り)
  if (tag instanceof ComponentBuilder || tag?.__quix_builder)
    return handleComponent(tag, props)
  if (tag === Show) return handleShow(props, children)
  if (tag === For) return handleFor(props, children)

  // 3. Normal HTML Tags
  const qid = generateId('q')
  const instructions: Instruction[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []
  const additionalNodes: any[] = []
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
      }
      // ⭐️ 属性のリアクティブ化の追加
      else if (typeof v === 'function') {
        const deps = new Set<string>()
        // 属性値を一度実行して初期値を取得しつつ、依存関係を収集
        const val = tracker.runWithScope(
          generateId('attr'),
          id => deps.add(id),
          () => (v as Function)()
        )

        if (deps.size > 0) {
          const signalId = Array.from(deps)[0]! // 最初の依存ノードに紐付け
          instructions.push({
            signalId,
            selector: `.${qid}`,
            action: 'setAttr',
            attrName: k,
          })
          needsQid = true
        }
        staticProps[k] = String(val) // 初期値を静的HTML用プロパティに設定
      } else {
        staticProps[k] = String(v)
      }
    }
  }

  const flatChildren = children.flat()
  const processedHtml: string[] = []
  const isTextContent = flatChildren.every(c => typeof c !== 'object')
  const hasFunction = flatChildren.some(c => typeof c === 'function')

  if (isTextContent && hasFunction) {
    needsQid = true

    // ⭐️ 最適化 C: 単一の関数のみで、他の静的テキストがない場合
    if (flatChildren.length === 1 && typeof flatChildren[0] === 'function') {
      const fn = flatChildren[0] as Function
      const deps = new Set<string>()

      // 依存関係を調査 (checkスコープ)
      const val = tracker.runWithScope(
        generateId('check'),
        id => deps.add(id),
        () => fn()
      )

      // 依存している変数が 1 つだけなら、直接その ID を使う (Shortcut!)
      if (deps.size === 1) {
        const signalId = Array.from(deps)[0]!
        instructions.push({ signalId, selector: `.${qid}`, action: 'setText' })
        processedHtml.push(String(val))
        // hiddenDerivedRequests への追加は不要（中間ノードをスキップ）
      } else {
        // 依存が複数、または 0 の場合は従来通りの処理
        setupComplexTextInterpolation(
          qid,
          flatChildren,
          instructions,
          hiddenDerivedRequests,
          processedHtml
        )
      }
    } else {
      // 混合テキスト（例: "Count: {count()}"）の場合
      setupComplexTextInterpolation(
        qid,
        flatChildren,
        instructions,
        hiddenDerivedRequests,
        processedHtml
      )
    }
  } else {
    // 4. 子要素の再帰処理 (既存通り)
    flatChildren.forEach(child => {
      if (child && typeof child === 'object' && 'html' in child) {
        const vnode = child as VNode
        instructions.push(...vnode.instructions)
        hiddenDerivedRequests.push(...vnode.hiddenDerivedRequests)
        if (vnode.additionalNodes)
          additionalNodes.push(...vnode.additionalNodes)
        processedHtml.push(vnode.html)
      }
      // ⭐️ 追加: 混合コンテンツ内に関数（シグナル）がある場合
      else if (typeof child === 'function') {
        // 関数を span (display:contents) で包んで再帰的に h を呼ぶ
        // これにより、この関数専用の setText 命令が生成される
        const wrapped = h('span', { style: 'display:contents' }, child)
        instructions.push(...wrapped.instructions)
        hiddenDerivedRequests.push(...wrapped.hiddenDerivedRequests)
        if (wrapped.additionalNodes)
          additionalNodes.push(...wrapped.additionalNodes)
        processedHtml.push(wrapped.html)
      } else {
        processedHtml.push(String(child))
      }
    })
  }

  if (needsQid) staticProps.class = `${staticProps.class || ''} ${qid}`.trim()
  const attrStr = Object.entries(staticProps)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

  return {
    tag,
    html: `<${tag}${attrStr ? ` ${attrStr}` : ''}>${processedHtml.join('')}</${tag}>`,
    instructions,
    hiddenDerivedRequests,
    additionalNodes,
  }
}

/**
 * ⭐️ 複雑なテキスト補間（混合テキストや複数依存）のための共通処理
 */
function setupComplexTextInterpolation(
  qid: string,
  flatChildren: any[],
  instructions: Instruction[],
  hiddenDerivedRequests: HiddenDerivedRequest[],
  processedHtml: string[]
) {
  const tmplId = generateId('hd')
  const deps = new Set<string>()
  const initialHtmlParts: string[] = []

  const templateParts = flatChildren.map(child => {
    if (typeof child === 'function') {
      return tracker.runWithScope(
        tmplId,
        id => deps.add(id),
        () => {
          const val = child()
          initialHtmlParts.push(String(val))
          return `\${val}`
        }
      )
    }
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
}
