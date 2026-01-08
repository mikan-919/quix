import { ComponentBuilder } from '../builder'
import type { VNode } from '../types'

export function handleComponent(
  tag: unknown,
  props: Record<string, unknown> | null
): VNode {
  const builder =
    tag instanceof ComponentBuilder
      ? tag
      : (tag as { __quix_builder?: ComponentBuilder } | undefined | null)
          ?.__quix_builder

  const childCtx = builder.buildInstance(props || {})

  return {
    tag: childCtx.name,
    html: childCtx.html,
    instructions: childCtx.instructions,
    additionalNodes: childCtx.getAllNodes(),
    hiddenDerivedRequests: [],
  }
}
