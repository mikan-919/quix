// コンポーネントごとのコンテキスト（名前）とカウンター
let currentContextName = 'unknown'
let counter = 0

/**
 * ID生成器をリセットします。
 * ComponentBuilder.render() の開始時に呼び出します。
 */
export function resetIdGenerator(name: string) {
  // CSSクラス名として安全な文字のみ残す
  currentContextName = name.replace(/[^a-zA-Z0-9-_]/g, '')
  counter = 0
}

/**
 * 決定論的なIDを生成します。
 * @param prefix 接頭辞 (例: 'q', 's', 'd')
 */
export function generateId(prefix = 'q') {
  // 36進数を使って短くする (0, 1, ..., 9, a, ..., z, 10...)
  const index = (counter++).toString(36)
  return `${prefix}-${currentContextName}-${index}`
}
