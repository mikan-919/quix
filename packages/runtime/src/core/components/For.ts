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

  if (typeof itemRenderer === 'function') {
    const SLOT_MARKER = '<!--Q_SLOT-->'
    const SLOT_REPLACEMENT = '<q-text></q-text>'

    // ダミーのシグナルを渡して1回レンダリングし、構造を取得する
    // item() が呼ばれた箇所がSLOT_MARKERになる
    const vnode = itemRenderer(() => SLOT_MARKER) as VNode

    if (vnode && typeof vnode === 'object' && 'html' in vnode) {
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)

      // SLOT_MARKER を <q-text> に置換
      // SLOT_MARKER が含まれている場合は置換し、そうでなければそのまま使う
      if (vnode.html.includes(SLOT_MARKER)) {
        templateHtml = vnode.html.replace(SLOT_MARKER, SLOT_REPLACEMENT)
      } else {
        // SLOT_MARKER が含まれていない場合（関数呼び出しの結果がテキストノードになっていない）
        // 要素のtextContent全体を置き換える想定で <q-text> を挿入
        // 最も内側のテキストを持つ要素に <q-text> を入れる
        // 簡易的な実装: 末尾の > を置き換えてq-textを入れる
        const match = vnode.html.match(/^(<[^>]+>)(.*)(<\/[^>]+>)$/)
        if (match) {
          templateHtml = `${match[1]}${SLOT_REPLACEMENT}${match[3]}`
        } else {
          templateHtml = `<span>${SLOT_REPLACEMENT}</span>`
        }
      }
    } else if (typeof vnode === 'string') {
      // 単純なテキストの場合
      templateHtml = `<span>${SLOT_REPLACEMENT}</span>`
    } else {
      // フォールバック
      templateHtml = `<span>${SLOT_REPLACEMENT}</span>`
    }
  }

  // 3. each関数をhiddenDerivedとして登録
  // これにより、each関数がderivedとして扱われる
  if (deps.size > 0) {
    // each関数の戻り値を返すexpression
    // deps[0]を使って配列を生成する関数を登録
    const eachFnStr = props.each.toString()

    hiddenDerivedRequests.push({
      placeholderId: listDerivedId,
      deps: Array.from(deps),
      templateBody: eachFnStr,
      isExpression: true,
    })
  }

  // 4. 命令の登録
  // signalId として配列を生成するderivedのIDを使う
  const signalId = deps.size > 0 ? listDerivedId : undefined
  if (signalId) {
    instructions.push({
      signalId,
      selector: `.${qid}`,
      action: 'list',
      template: templateHtml,
      templateId,
      listFn: props.each.toString(),
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
