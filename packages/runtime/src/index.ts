// Core API
export * from './core/builder'
// Types
export type { ComponentContext } from './core/context'
export type { Instruction } from './core/types'
export type { VNode } from './h'
export * from './h'

// biome-ignore lint/correctness/noUnusedFunctionParameters: <explanation>
export const Show = (props: { when: () => boolean }, children: any[]) => null
