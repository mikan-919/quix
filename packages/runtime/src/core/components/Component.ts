import { ComponentBuilder } from '../builder'
import type { VNode } from '../types'

export function handleComponent(tag: any, props: any): VNode {
  const builder = tag instanceof ComponentBuilder ? tag : tag?.__quix_builder

  const childCtx = builder.buildInstance(props || {})

  return {
    tag: childCtx.name,
    html: childCtx.html,
    instructions: childCtx.instructions,
    additionalNodes: childCtx.getAllNodes(),
    hiddenDerivedRequests: [],
  }
}
