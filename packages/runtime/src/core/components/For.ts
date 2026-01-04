import { generateId } from '../id'
import { tracker } from '../tracker'
import type {
  ComponentNode,
  HiddenDerivedRequest,
  Instruction,
  VNode,
} from '../types'

export interface ForProps {
  each: () => unknown[]
}

export function handleFor(props: ForProps, children: unknown[]): VNode {
  /*
   * Forコンポーネント: リストレンダリング
   * items: Signal<any[]>
   * children: [(item) => Element]
   */
  const qid = generateId('q')
  const templateId = generateId('tmpl')
  const instructions: Instruction[] = []
  const additionalNodes: ComponentNode[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []

  const listDerivedId = generateId('for')
  const deps = new Set<string>()

  // 1. 依存関係の追跡
  if (props && typeof props.each === 'function') {
    tracker.runWithScope(
      listDerivedId,
      id => deps.add(id),
      () => props.each()
    )
  }

  // 2. テンプレートの生成 (1回だけ実行)
  let templateHtml = ''
  const itemRenderer = children[0]
  const itemSlots: string[] = []

  if (typeof itemRenderer === 'function') {
    const SLOT_MARKER = '<!--Q_SLOT-->'
    const SLOT_REPLACEMENT = '<q-text></q-text>'

    // ダミーのシグナルを渡して1回レンダリングし、構造を取得する
    // item() が呼ばれた箇所がSLOT_MARKERになる
    // h.ts 側で for-item- から始まるIDを検知して特別に扱う
    const itemSignalId = `for-item-${qid}`
    const spyItem = () => {
      tracker.report(itemSignalId)
      return SLOT_MARKER
    }
    const vnode = itemRenderer(spyItem) as VNode

    if (vnode && typeof vnode === 'object' && 'html' in vnode) {
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)

      // 子要素の命令から itemFns を持つものを集める (スロット順)
      const itemInstructions = vnode.instructions.filter(i => i.itemFns)
      for (const inst of itemInstructions) {
        // biome-ignore lint/style/noNonNullAssertion: filtered
        itemSlots.push(...inst.itemFns!)
      }

      // SLOT_MARKER を <q-text> にすべて置換
      if (vnode.html.includes(SLOT_MARKER)) {
        templateHtml = vnode.html.replaceAll(SLOT_MARKER, SLOT_REPLACEMENT)
      } else {
        // ... (省略)
        const match = vnode.html.match(/^(<[^>]+>)(.*)(<\/[^>]+>)$/)
        if (match) {
          templateHtml = `${match[1]}${SLOT_REPLACEMENT}${match[3]}`
        } else {
          templateHtml = `<span>${SLOT_REPLACEMENT}</span>`
        }
      }
    }
  }

  // 3. each関数をhiddenDerivedとして登録 (変更なし)
  if (deps.size > 0) {
    const eachFnStr = props.each.toString()
    hiddenDerivedRequests.push({
      placeholderId: listDerivedId,
      deps: Array.from(deps),
      templateBody: eachFnStr,
      isExpression: true,
    })
  }

  // 4. 命令の登録
  const signalId = deps.size > 0 ? listDerivedId : undefined
  if (signalId) {
    instructions.push({
      signalId,
      selector: `.${qid}`,
      action: 'list',
      template: templateHtml,
      templateId,
      listFn: props.each.toString(),
      itemSlots: itemSlots.length > 0 ? itemSlots : undefined,
    })
  }

  // 5. VNodeの構築
  const templateTag = `<template id="${templateId}">${templateHtml}</template>`

  return {
    tag: 'For',
    html: `<span class="${qid}" style="display:contents" data-for-anchor></span>${templateTag}`,
    instructions,
    hiddenDerivedRequests,
    additionalNodes,
  }
}
