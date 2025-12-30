import { consola } from 'consola'
import { nanoid } from 'nanoid'
import { quixTracker } from './tracker'

// --- 型定義 ---

export type Instruction = {
  signalId: string
  selector: string
  path: number[]
  action: 'setText' | 'setAttr' | 'addListener'
  attrName?: string
}

export type HiddenDerivedEntry = {
  id: string
  deps: string[]
  fn?: (scope: any) => any
  templateBody?: string
}

export type VNode = {
  tag: string
  html: string
  instructions: Instruction[]
  hiddenDerived: HiddenDerivedEntry[]
}

const logger = consola.withTag('h-func')

/**
 * 形式チェック: (s) => s.count() または () => state.count() から "count" を抽出
 */
function extractMethodName(fn: Function): string | undefined {
  const code = fn.toString().trim()
  // 1. (s) => s.method()
  const matchWithArg = code.match(
    /^\(\s*[a-zA-Z_$][\w$]*\s*\)\s*=>\s*[a-zA-Z_$][\w$]*\.([a-zA-Z_$][\w$]*)\(\)$/
  )
  if (matchWithArg) return matchWithArg[1]

  // 2. () => state.method()
  const matchNoArg = code.match(
    /^\(\s*\)\s*=>\s*[a-zA-Z_$][\w$]*\.([a-zA-Z_$][\w$]*)\(\)$/
  )
  if (matchNoArg) return matchNoArg[1]

  return undefined
}

/**
 * 動的パーツ（関数）を解析し、テンプレート用のキーと命令用のIDを決定する
 */
function processDynamicPart(
  fn: Function,
  prefix: string,
  hiddenDerived: HiddenDerivedEntry[]
): { instructionId: string; accessKey: string; initial: any } {
  const deps: string[] = []
  const initial = quixTracker.track(fn as any, id => {
    if (!deps.includes(id)) deps.push(id)
  })

  const methodName = extractMethodName(fn)

  // A. 短絡可能なパススルー形式
  if (methodName && deps.length > 0) {
    logger.info(
      `Optimization | Passthrough detected: "${methodName}" (ID: ${deps[0]})`
    )
    return {
      instructionId: deps[0]!, // 根本のIDで発火させる
      accessKey: methodName, // テンプレート内ではユーザー定義名で呼ぶ
      initial,
    }
  }

  // B. 複雑なロジックを含む場合は HiddenDerived 化
  const hdId = `${prefix}-${nanoid(6)}`
  hiddenDerived.push({ id: hdId, deps, fn: fn as any })

  logger.info(`Extraction   | Complex function wrapped as: ${hdId}`)
  return {
    instructionId: hdId,
    accessKey: hdId,
    initial,
  }
}

// --- 1. 属性解析モジュール ---

function parseAttributes(props: any, qid: string) {
  const instructions: Instruction[] = []
  const hiddenDerived: HiddenDerivedEntry[] = []
  const staticProps: Record<string, string> = {}
  let needsQid = false

  if (!props) return { attrString: '', instructions, hiddenDerived, needsQid }

  for (const [key, value] of Object.entries(props)) {
    // イベントハンドラ
    if (typeof value === 'string' && value.startsWith('{{HANDLER:')) {
      const handlerName = value.replace('{{HANDLER:', '').replace('}}', '')
      instructions.push({
        signalId: handlerName,
        selector: `.${qid}`,
        path: [],
        action: 'addListener',
        attrName: key.toLowerCase().replace(/^on/, ''),
      })
      needsQid = true
    }
    // 動的属性
    else if (typeof value === 'function') {
      const { instructionId, initial } = processDynamicPart(
        value,
        'hd-attr',
        hiddenDerived
      )
      instructions.push({
        signalId: instructionId,
        selector: `.${qid}`,
        path: [],
        action: 'setAttr',
        attrName: key,
      })
      staticProps[key] = String(initial)
      needsQid = true
    }
    // 静的属性
    else {
      staticProps[key] = String(value)
    }
  }

  const attrString = Object.entries(staticProps)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return { attrString, instructions, hiddenDerived, needsQid }
}

// --- 2. 子要素解析モジュール ---

function parseChildren(children: any[], qid: string) {
  const instructions: Instruction[] = []
  const hiddenDerived: HiddenDerivedEntry[] = []
  const processedHtml: string[] = []
  let needsQid = false

  let buffer: any[] = []

  const flushBuffer = () => {
    if (buffer.length === 0) return

    const nodeIndex = processedHtml.length
    const hasFunction = buffer.some(item => typeof item === 'function')

    if (!hasFunction) {
      processedHtml.push(buffer.join(''))
    } else {
      let finalSignalId: string
      let finalInitialValue: any

      if (buffer.length === 1 && typeof buffer[0] === 'function') {
        const { instructionId, initial } = processDynamicPart(
          buffer[0],
          'hd-txt',
          hiddenDerived
        )
        finalSignalId = instructionId
        finalInitialValue = initial
      } else {
        const templateHdId = `hd-tmpl-${nanoid(6)}`
        const allDeps = new Set<string>()
        let combinedInitial = ''

        // 💡 ここで `... ${s["count"]()} ...` という形式の文字列を組み立てる
        const bodyParts = buffer.map(item => {
          if (typeof item === 'function') {
            const { instructionId, accessKey, initial } = processDynamicPart(
              item,
              'hd-txt',
              hiddenDerived
            )
            allDeps.add(instructionId)
            combinedInitial += initial
            return `\${s["${accessKey}"]()}` // スコープオブジェクト `s` を介して呼ぶ形式
          } else {
            const str = String(item)
            combinedInitial += str
            return str.replace(/[`\\$]/g, '\\$&') // テンプレートリテラルで壊れないようエスケープ
          }
        })

        const templateBody = bodyParts.join('')

        // 💡 以前はここで new Function していたが、文字列として記録するだけに
        hiddenDerived.push({
          id: templateHdId,
          deps: Array.from(allDeps),
          templateBody: templateBody, // 💡 これを codegen に渡す
        })

        finalSignalId = templateHdId
        finalInitialValue = combinedInitial
      }

      instructions.push({
        signalId: finalSignalId,
        selector: `.${qid}`,
        path: [nodeIndex],
        action: 'setText',
      })
      processedHtml.push(String(finalInitialValue ?? ''))
      needsQid = true
    }
    buffer = []
  }

  for (const child of children.flat()) {
    // VNode(タグ)が現れたらバッファを切り出す
    if (child && typeof child === 'object' && 'html' in child) {
      flushBuffer()
      const vchild = child as VNode
      instructions.push(...vchild.instructions)
      hiddenDerived.push(...vchild.hiddenDerived)
      processedHtml.push(vchild.html)
    } else {
      buffer.push(child ?? '')
    }
  }

  // ループ終了後に残ったバッファを処理
  flushBuffer()

  return { html: processedHtml.join(''), instructions, hiddenDerived, needsQid }
}

// --- 3. メインオーケストレーター ---

export function h(tag: string, props: any, ...children: any[]): VNode {
  const qid = `q-${nanoid(6)}`

  const attrResult = parseAttributes(props, qid)
  const childResult = parseChildren(children, qid)

  const finalInstructions = [
    ...attrResult.instructions,
    ...childResult.instructions,
  ]
  const finalHiddenDerived = [
    ...attrResult.hiddenDerived,
    ...childResult.hiddenDerived,
  ]
  const needsQid = attrResult.needsQid || childResult.needsQid

  // クラス名の統合
  const classList: string[] = []
  if (needsQid) classList.push(qid)

  // 属性文字列の構築
  let attrMarkup = attrResult.attrString ? ` ${attrResult.attrString}` : ''
  if (needsQid) {
    // 既存の class 属性がある場合は結合、なければ新設
    if (attrMarkup.includes('class="')) {
      attrMarkup = attrMarkup.replace('class="', `class="${qid} `)
    } else {
      attrMarkup = ` class="${qid}"${attrMarkup}`
    }
  }

  const html = `<${tag}${attrMarkup}>${childResult.html}</${tag}>`

  if (needsQid) {
    logger.info(
      `VNode [${tag}] | ID: ${qid}, Instructions: ${finalInstructions.length}, HiddenDerived: ${finalHiddenDerived.length}`
    )
  }

  return {
    tag,
    html,
    instructions: finalInstructions,
    hiddenDerived: finalHiddenDerived,
  }
}
