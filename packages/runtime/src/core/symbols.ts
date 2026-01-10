// biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
export const Show = (props: { when: () => boolean }, children: unknown[]) =>
  null
export const For = <T>(
  props: { each: () => T[] },
  children: (item: () => T) => unknown
) => null
