import { customAlphabet } from 'nanoid'
import { alphanumeric } from 'nanoid-dictionary'

let count = 0
let isTesting = false
const nanoid = customAlphabet(alphanumeric, 8)

export const setTestingMode = (val: boolean) => {
  isTesting = val
  count = 0
}
export const generateId = (prefix = '', len?: number) => {
  if (isTesting) return `${prefix}${++count}`
  // 本番は nanoidを利用する
  return `${prefix}${nanoid(len)}`
}
