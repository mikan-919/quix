let stack: { name: string; counter: number }[] = []
const instanceCounters = new Map<string, number>()

export function pushIdContext(name: string) {
  stack.push({ name: name.replace(/[^a-zA-Z0-9-_]/g, ''), counter: 0 })
}

export function popIdContext() {
  stack.pop()
}

export function getNextInstanceId(name: string) {
  const count = (instanceCounters.get(name) || 0) + 1
  instanceCounters.set(name, count)
  return count.toString(36)
}

export function generateId(prefix = 'q') {
  const current = stack[stack.length - 1]
  const name = current ? current.name : 'unknown'
  const index = (current ? current.counter++ : 0).toString(36)
  return `${prefix}-${name}-${index}`
}

export function resetIdGenerator(name: string) {
  stack = [{ name: name.replace(/[^a-zA-Z0-9-_]/g, ''), counter: 0 }]
}
