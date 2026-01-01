import type { ComponentContext } from './core/context'
import { generateId } from './core/id'
import { For, Show } from './core/symbols'
import { tracker } from './core/tracker'
import type { HiddenDerivedRequest, Instruction, VNode } from './core/types'

export function h(tag: any, props: any, ...children: any[]): VNode {
  if (
    tag &&
    typeof tag === 'object' &&
    'nodes' in tag &&
    'instructions' in tag
  ) {
    const childCtx = tag as ComponentContext

    return {
      tag: childCtx.name,
      html: childCtx.html,
      instructions: childCtx.instructions,
      hiddenDerivedRequests: [],
      additionalNodes: childCtx.getAllNodes(), // 子の全ノードを親に渡す
    }
  }

  // 2. 通常のHTMLタグ処理
  const qid = generateId('q') // q-App-x
  const instructions: Instruction[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []
  const additionalNodes: any[] = []
  // 1. <Show /> コンポーネントの特別処理
  if (tag === Show) {
    const qid = generateId('q') // q-App-x
    const instructions: Instruction[] = []
    const hiddenDerivedRequests: HiddenDerivedRequest[] = []

    const conditionId = generateId('cond') // cond-App-x
    const deps = new Set<string>()
    let templateBody = ''

    if (props && typeof props.when === 'function') {
      tracker.runWithScope(
        conditionId,
        id => deps.add(id),
        () => {
          props.when() // 実行して依存収集

          // 式の抽出 (例: "() => s.count() > 5" -> "s.count() > 5")
          const fnStr = props.when.toString()
          const match = fnStr.match(/=>\s*([\s\S]*)/)
          templateBody = match ? match[1].trim() : 'false'
        }
      )
    }

    hiddenDerivedRequests.push({
      placeholderId: conditionId,
      deps: Array.from(deps),
      templateBody,
      isExpression: true,
    })

    const flatChildren = children.flat()
    const childHtmlParts: string[] = []

    flatChildren.forEach(child => {
      if (child && typeof child === 'object' && 'html' in child) {
        const vnode = child as VNode
        instructions.push(...vnode.instructions)
        hiddenDerivedRequests.push(...vnode.hiddenDerivedRequests)
        if (vnode.additionalNodes)
          additionalNodes.push(...vnode.additionalNodes)
        childHtmlParts.push(vnode.html)
      } else {
        childHtmlParts.push(String(child))
      }
    })

    const templateHtml = childHtmlParts.join('')

    instructions.push({
      signalId: conditionId,
      selector: `.${qid}`,
      action: 'show',
      template: templateHtml,
    })

    return {
      tag: 'Show',
      html: `<span class="${qid}" style="display:contents" data-show-anchor></span>`,
      instructions,
      hiddenDerivedRequests,
      additionalNodes,
    }
  }

  if (tag === For) {
    const qid = generateId('q')
    const instructions: Instruction[] = []

    // 1. 依存収集
    const listScopeId = generateId('list')
    const deps: string[] = []

    if (props && typeof props.each === 'function') {
      tracker.runWithScope(
        listScopeId,
        id => deps.push(id),
        () => {
          // 修正: Babelによってラップされたシグナルをアンラップする
          // each={state.items} -> (() => state.items)() -> returns Signal Function
          // each={state.items()} -> (() => state.items())() -> returns Array

          let val = props.each()

          // もし戻り値が関数なら、それは「シグナルそのもの」である可能性が高いので、
          // さらに実行して値を評価し、依存追跡(tracker.report)を発火させる
          if (typeof val === 'function') {
            val = val()
          }
          return val
        }
      )
    }

    // 2. テンプレート生成
    let template = ''
    const itemRenderer = children[0] // {(item) => ...}

    if (typeof itemRenderer === 'function') {
      // モックシグナル: 実行されるとユニークなプレースホルダーを返す
      const MOCK_KEY = '<!--Q_ITEM-->'
      const mockItemSignal = () => MOCK_KEY

      // レンダラーを実行してVNodeを取得
      const vnode = itemRenderer(mockItemSignal)

      // HTML文字列内のモックキーを、JSテンプレート変数の ${v} に置換
      if (vnode && typeof vnode === 'object' && 'html' in vnode)
        if (vnode.additionalNodes)
          additionalNodes.push(...vnode.additionalNodes)
      const rawHtml =
        vnode && typeof vnode === 'object' && 'html' in vnode
          ? vnode.html
          : String(vnode)

      template = rawHtml.replace(MOCK_KEY, '${v}')
    }

    // 3. 命令生成
    // 依存Stateが見つかれば、そのIDに対してlist命令を発行
    if (deps.length > 0) {
      instructions.push({
        signalId: deps[0]!, // 主たる依存先（items配列そのもの）
        selector: `.${qid}`,
        action: 'list',
        template,
      })
    }

    return {
      tag: 'For',
      html: `<span class="${qid}" style="display:contents" data-for-anchor></span>`,
      instructions,
      hiddenDerivedRequests: [],
      additionalNodes,
    }
  }

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

  const flatChildren = children.flat()
  const processedHtml: string[] = []

  const isTextContent = flatChildren.every(c => typeof c !== 'object')
  const hasFunction = flatChildren.some(c => typeof c === 'function')

  if (isTextContent && hasFunction) {
    needsQid = true
    const tmplId = generateId('hd') // hd-App-x
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
            // テキスト補間では式抽出を行わず、常にプレースホルダーを使う
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
      // isExpression: false (デフォルト)
    })

    instructions.push({
      signalId: tmplId,
      selector: `.${qid}`,
      action: 'setText',
    })
    processedHtml.push(initialHtmlParts.join(''))
  } else {
    flatChildren.forEach(child => {
      if (child && typeof child === 'object' && 'html' in child) {
        const vnode = child as VNode
        instructions.push(...vnode.instructions)
        hiddenDerivedRequests.push(...vnode.hiddenDerivedRequests)
        if (vnode.additionalNodes)
          additionalNodes.push(...vnode.additionalNodes)
        processedHtml.push(vnode.html)
      } else {
        processedHtml.push(String(child))
      }
    })
  }

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
    additionalNodes,
  }
}
