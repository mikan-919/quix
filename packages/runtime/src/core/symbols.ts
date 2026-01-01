// biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
export const Show = (props: { when: () => boolean }, children: any[]) => null

export const For = <T>(
  // biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
  props: { each: () => T[] },
  // biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
  children: (item: () => T) => any
) => null
