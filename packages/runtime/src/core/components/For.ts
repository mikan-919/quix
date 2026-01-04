import { generateId } from '../id'
import { tracker } from '../tracker'
import type { Instruction, VNode } from '../types'

export function handleFor(props: any, children: any[]): VNode {
  /*
   * Forコンポーネント: リストレンダリング
   * items: Signal<any[]>
   * children: [(item) => Element]
   */
  const qid = generateId('q')
  const templateId = generateId('tmpl')
  const instructions: Instruction[] = []
  const additionalNodes: any[] = []

  const listScopeId = generateId('list')
  const deps = new Set<string>()

  // 1. 依存関係の追跡
  if (props && typeof props.each === 'function') {
    tracker.runWithScope(
      listScopeId,
      id => deps.add(id),
      () => props.each()
    )
  }

  // 2. テンプレートの生成 (1回だけ実行)
  let templateHtml = ''
  const itemRenderer = children[0]

  if (typeof itemRenderer === 'function') {
    const SLOT_MARKER = '<!--Q_SLOT-->'

    // ダミーのシグナルを渡して1回レンダリングし、構造を取得する
    const vnode = itemRenderer(() => SLOT_MARKER)

    if (vnode && typeof vnode === 'object' && 'html' in vnode) {
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)
      // スロットマーカーを置換せず、そのままテンプレートにする
      // ただし、値を注入する場所を特定できるように data-q-slot 属性などを付けるのが理想だが、
      // 既存の仕組みに合わせて、まずは単純なテンプレートとして出力する。
      // リコンサイラ側で innerHTML = ... をするのではなく、cloneNode して textContent を埋める形にするには
      // 埋め込みポイントを知る必要がある。
      // 今回は簡易的に、テキストノードの置換マーカーとしてそのまま利用する。
      templateHtml = vnode.html.replace(SLOT_MARKER, '') // 一旦空にしておく
      // もしvnode.htmlが要素のルートなら、そこにマーカーを付けたいが、
      // 文字列置換だと難しいので、今回は vnode.html 全体をテンプレートの中身とする
      // テキスト埋め込みの場合は、テンプレート生成ロジック側で頑張る必要がある

      // 修正: テンプレート内での値のバインディング
      // 文字列ベースの単純置換ではなく、専用のバインディング記法が必要になるが
      // 今回は単純化のため、vnode.html 内の SLOT_MARKER を <slot> 的な何かに置き換えるか、
      // あるいは codegen 側で map して join する方式を変える。

      // ここでは「単一要素のリスト」を想定し、vnode.html をそのまま template とする。
      // 値の挿入位置は、codegen 側で `textContent = value` 等で行うため、
      // テンプレート自体には空の要素が入っていれば良い。

      // ただし、現行の h function の実装では、テキストノードは直接埋め込まれる。
      // `<div>{item}</div>` -> `<div><!--Q_SLOT--></div>`
      // これをテンプレート化する。
      templateHtml = vnode.html.replace(SLOT_MARKER, '')
    } else {
      // テキストのみの場合
      templateHtml = `<span></span>`
    }

    // テンプレート生成時に、${v} のようなプレースホルダーを使う形に戻し、
    // codegen側でそれを使って組み立てる方式をやめ、
    // 本当の意味での <template> + Clone + Update にする。

    // しかし、h関数の戻り値は静的文字列になっているため、動的なバインディング情報が欠落している。
    // Forの中で itemRenderer を読んだ時の挙動として、
    // 生成されるHTMLには "値が入るべき場所" に印がついている必要がある。
    // 現状の handleFor は MOCK_KEY を渡している。

    // ここでは「テンプレートHTML文字列」を生成する。
    // 値が入る場所は空にしておくか、特定data属性をつける。
    // vnode.html が `<div class="item">text</div>` なら
    // templateHtml も `<div class="item"></div>` にする。

    // 既存ロジック: template = vnode.html.replace(MOCK_KEY, '${v}')
    // ${v} は codegen で .map(v => `...${v}...`) となる。

    // 新ロジック:
    // MOCK_KEY の場所を特定できる属性 `data-q-text` 等に置換する？
    // あるいは slot 要素？

    // 最もシンプルな実装:
    // MOCK_KEY を `<q-text></q-text>` のようなカスタム要素に置換しておき
    // ランタイムでそこを埋める。
    templateHtml = vnode.html.replace(SLOT_MARKER, '<q-text></q-text>')
  }

  if (deps.size > 0) {
    instructions.push({
      signalId: Array.from(deps)[0]!,
      selector: `.${qid}`,
      action: 'list',
      template: templateHtml,
      templateId, // 生成したIDを渡す
    })
  }

  // 3. VNodeの構築
  // テンプレートタグ自体もHTMLに含める（非表示）
  const templateTag = `<template id="${templateId}">${templateHtml}</template>`

  return {
    tag: 'For',
    // アンカー要素 + テンプレート
    html: `<span class="${qid}" style="display:contents" data-for-anchor></span>${templateTag}`,
    instructions,
    hiddenDerivedRequests: [],
    additionalNodes,
  }
}
