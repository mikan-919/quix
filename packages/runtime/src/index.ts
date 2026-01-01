// Core API
export * from './core/builder'
// Types
export type { ComponentContext } from './core/context'
export type { Instruction, VNode } from './core/types'
export * from './h'

// biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
export const Show = (props: { when: () => boolean }, children: any[]) => null
export const For = <T>(
  // biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
  props: { each: () => T[] },
  // biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
  children: (item: () => T) => any
) => null
