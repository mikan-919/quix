// playground/src/quix.d.ts
import type { VNode } from '@quix/runtime'
import type { For as ForType, Show as ShowType } from '@quix/runtime'

declare global {
  namespace JSX {
    interface Element extends VNode {}
    interface ElementChildrenAttribute {
      children: object
    }
    interface HTMLAttributes {
      id?: string
      class?: string
      style?: string
      children?: unknown
      onclick?: (s: unknown, e: unknown) => void
      oninput?: (s: unknown, e: unknown) => void
      placeholder?: string
      value?: unknown
      type?: string
      disabled?: boolean | (() => boolean)
    }
    interface IntrinsicElements {
      div: HTMLAttributes
      span: HTMLAttributes
      h1: HTMLAttributes
      h2: HTMLAttributes
      p: HTMLAttributes
      button: HTMLAttributes
      input: HTMLAttributes
      footer: HTMLAttributes
      strong: HTMLAttributes
      For: ForType<unknown>
      Show: ShowType
    }
  }
}
