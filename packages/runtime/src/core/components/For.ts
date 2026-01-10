import { generateId, getActiveContext } from '../id'
import { tracker } from '../tracker'
import type {
  ComponentNode,
  HiddenDerivedRequest,
  Instruction,
  VNode,
} from '../types'

export interface ForProps<T = unknown> {
  each: () => T[]
}

export type ForComponent = unknown

export function handleFor<T>(props: ForProps<T>, children: unknown[]): VNode {
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

  if (typeof itemRenderer === 'function') {
    const SLOT_MARKER = '<q-text></q-text>'
    const SLOT_REPLACEMENT = '<q-text></q-text>'

    // ダミーのシグナルを渡して1回レンダリングし、構造を取得する
    // item() が呼ばれた箇所がSLOT_MARKERになる
    // h.ts 側で for-item- から始まるIDを検知して特別に扱う
    const itemSignalId = `for-item-${qid}`
    const spyItem = () => {
      tracker.report(itemSignalId)
      return SLOT_MARKER
    }

    tracker.startProbing()
    let vnode: VNode
    try {
      vnode = itemRenderer(spyItem) as VNode
    } finally {
      tracker.stopProbing()
    }

    if (vnode && typeof vnode === 'object' && 'html' in vnode) {
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)

      // 子要素の命令を分類
      const nestedItemInstructions: Instruction[] = []
      if (vnode.instructions) {
        for (const inst of vnode.instructions) {
          // itemSignalIdに依存しているか、itemFnsを持っている場合はアイテム内命令
          const isItemDep =
            inst.signalId.includes(itemSignalId) ||
            (inst.itemFns && inst.itemFns.length > 0)

          if (isItemDep) {
            nestedItemInstructions.push(inst)
          } else {
            // それ以外はグローバル命令として親に引き継ぐ
            instructions.push(inst)
          }
        }
      }

      // SLOT_MARKER を <q-text> にすべて置換
      if (vnode.html.includes(SLOT_MARKER)) {
        templateHtml = vnode.html.split(SLOT_MARKER).join(SLOT_REPLACEMENT)
      } else {
        const match = vnode.html.match(/^(<[^>]+>)(.*)(<\/[^>]+>)$/)
        if (match) {
          templateHtml = `${match[1]}${SLOT_REPLACEMENT}${match[3]}`
        } else {
          templateHtml = `<span>${SLOT_REPLACEMENT}</span>`
        }
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
          itemInstructions:
            nestedItemInstructions.length > 0
              ? nestedItemInstructions
              : undefined,
          context: getActiveContext(),
        })
      }
    }
  }

  // 3. each関数をhiddenDerivedとして登録
  if (deps.size > 0) {
    const eachFnStr = props.each.toString()
    hiddenDerivedRequests.push({
      placeholderId: listDerivedId,
      deps: Array.from(deps),
      templateBody: eachFnStr,
      isExpression: true,
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
