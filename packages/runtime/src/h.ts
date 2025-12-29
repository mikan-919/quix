import { quixTracker } from './tracker'

export type Instruction = {
  signalId: string
  selector: string
  path: number[]
  action: 'setText' | 'setAttr' | 'addListener'
  attrName?: string
}

export type VNode = {
  tag: string
  html: string
  instructions: Instruction[]
}

let qidCounter = 0
const generateQid = () => `q-${qidCounter++}`

// --- 1. 属性とハンドラの分離 ---
function processAttributes(props: any, qid: string) {
  const instructions: Instruction[] = []
  const filteredProps: Record<string, string> = {}
  let needsQid = false

  if (!props) return { attrString: '', instructions, needsQid }

  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string' && v.startsWith('{{HANDLER:')) {
      const handlerName = v.replace('{{HANDLER:', '').replace('}}', '')
      instructions.push({
        signalId: handlerName,
        selector: `.${qid}`,
        path: [],
        action: 'addListener',
        attrName: k.toLowerCase().replace('on', ''),
      })
      needsQid = true
    } else {
      filteredProps[k] = String(v)
    }
  }

  const attrString = Object.entries(filteredProps)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

  return { attrString, instructions, needsQid }
}

// --- 2. 子供の解析と最適化判定 ---
function processChildren(children: any[], qid: string) {
  const flatChildren = children.flat()
  const isAllText = flatChildren.every(
    c =>
      typeof c === 'string' || typeof c === 'number' || typeof c === 'function'
  )
  const hasDynamic = flatChildren.some(c => typeof c === 'function')

  return { flatChildren, isAllText, hasDynamic }
}

// --- 3. メインのオーケストレーター ---
export function h(tag: string, props: any, ...children: any[]): VNode {
  const qid = generateQid()
  const myDeps = new Set<string>()

  // 💡 スコープ開始：この要素の処理中に発生する report を myDeps で回収する
  quixTracker.beginScope(qid, id => myDeps.add(id))

  // 1. 属性処理
  let {
    attrString,
    instructions: propInsts,
    needsQid,
  } = processAttributes(props, qid)

  // 2. 子供の分類
  const { flatChildren, isAllText, hasDynamic } = processChildren(children, qid)

  const processedHtml: string[] = []
  const childInsts: Instruction[] = []

  // 3. 具体的なレンダリングとバブリング
  if (isAllText && hasDynamic) {
    // 💡 テキスト結合最適化：全員実行して一つの文字列にする
    needsQid = true
    const content = flatChildren
      .map(c => (typeof c === 'function' ? c() : c))
      .join('')
    processedHtml.push(content)
  } else {
    // 💡 通常の再帰・インデックス管理
    flatChildren.forEach((child, index) => {
      if (typeof child === 'function') {
        needsQid = true
        processedHtml.push(String(child()))
      } else if (
        child &&
        typeof child === 'object' &&
        'instructions' in child
      ) {
        // 子の命令を吸い上げる
        childInsts.push(...(child as VNode).instructions)
        processedHtml.push((child as VNode).html)
      } else {
        processedHtml.push(String(child))
      }
    })
  }

  // 💡 スコープ終了：ここまでの report 回収を終える
  quixTracker.endScope()

  // 💡 4. 回収した依存(myDeps)を元に命令を生成
  myDeps.forEach(signalId => {
    // 属性(handler)として既に登録済みのIDはテキスト更新からは除外
    if (propInsts.some(i => i.signalId === signalId)) return

    childInsts.push({
      signalId,
      selector: `.${qid}`,
      path: isAllText ? [] : [0 /* 実際にはindexが必要 */],
      action: 'setText',
    })
  })

  // 5. 最終的なHTML組み立て
  const finalNeedsQid =
    needsQid || propInsts.length > 0 || childInsts.length > 0
  const finalAttr = finalNeedsQid
    ? attrString
      ? `class="${qid}" ${attrString}`
      : `class="${qid}"`
    : attrString

  return {
    tag,
    html: `<${tag}${finalAttr ? ' ' + finalAttr : ''}>${processedHtml.join('')}</${tag}>`,
    instructions: [...propInsts, ...childInsts],
  }
}
