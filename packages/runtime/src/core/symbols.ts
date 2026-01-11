// biome-ignore lint/correctness/noUnusedFunctionParameters: type definition only
// Show and For symbols for JSX transformation
// These symbols are detected by h() function and handled specially
export function Show(props: { when: () => boolean }, children: unknown[]): void {
  // This is a symbol detected by h() function
}
export function For<T>(props: { each: () => T[] }, children: (item: () => T) => unknown): void {
  // This is a symbol detected by h() function
}
