// playground/src/quix.d.ts
import type { VNode } from '@quix/runtime'

declare global {
  namespace JSX {
    // JSX要素の正体
    interface Element extends VNode {}

    // TypeScriptに「Propsのどのプロパティが子要素を指すか」を教える（標準は children）
    interface ElementChildrenAttribute {
      children: object
    }

    // すべての標準タグに共通する基本属性
    interface HTMLAttributes {
      id?: string
      class?: string
      style?: string
      // ⭐️ これが必要！子要素（文字列、要素、それらの配列など）を許可する
      children?: unknown

      // イベントハンドラ（Quix独自の (scope, event) 形式）
      onclick?: (s: unknown, e: unknown) => void
      oninput?: (s: unknown, e: unknown) => void

      // その他、よく使う属性
      placeholder?: string
      value?: unknown
      type?: string
      disabled?: boolean | (() => boolean)
    }

    // タグごとの個別属性を定義
    interface IntrinsicElements {
      div: HTMLAttributes
      span: HTMLAttributes
      h1: HTMLAttributes
      h2: HTMLAttributes
      p: HTMLAttributes
      button: HTMLAttributes
      input: HTMLAttributes // 追加で input 固有の属性が必要ならマージする
      footer: HTMLAttributes
      strong: HTMLAttributes
    }
  }
}
