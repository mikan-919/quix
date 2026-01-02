import { generateId } from '../id'
import { tracker } from '../tracker'
import type { Instruction, VNode } from '../types'

export function handleFor(props: any, children: any[]): VNode {
  const qid = generateId('q')
  const instructions: Instruction[] = []
  const additionalNodes: any[] = []

  const listScopeId = generateId('list')
  const deps = new Set<string>()

  if (props && typeof props.each === 'function') {
    tracker.runWithScope(
      listScopeId,
      id => deps.add(id),
      () => props.each()
    )
  }

  let template = ''
  const itemRenderer = children[0]
  if (typeof itemRenderer === 'function') {
    const MOCK_KEY = '<!--Q_ITEM-->'
    const vnode = itemRenderer(() => MOCK_KEY)

    if (vnode && typeof vnode === 'object' && 'html' in vnode) {
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)
      template = vnode.html.replace(MOCK_KEY, '${v}')
    } else {
      template = String(vnode).replace(MOCK_KEY, '${v}')
    }
  }

  if (deps.size > 0) {
    instructions.push({
      signalId: Array.from(deps)[0]!,
      selector: `.${qid}`,
      action: 'list',
      template,
    })
  }

  return {
    tag: 'For',
    html: `<span class="${qid}" style="display:contents" data-for-anchor></span>`,
    instructions,
    hiddenDerivedRequests: [],
    additionalNodes,
  }
}
