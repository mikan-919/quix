import { generateId } from '../id'
import { tracker } from '../tracker'
import type { HiddenDerivedRequest, Instruction, VNode } from '../types'

export function handleShow(props: any, children: any[]): VNode {
  const qid = generateId('q')
  const instructions: Instruction[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []
  const additionalNodes: any[] = []

  const conditionId = generateId('cond')
  const deps = new Set<string>()
  let templateBody = ''

  if (props && typeof props.when === 'function') {
    tracker.runWithScope(
      conditionId,
      id => deps.add(id),
      () => {
        props.when()
        const fnStr = props.when.toString()
        const match = fnStr.match(/=>\s*([\s\S]*)/)
        templateBody = match ? match[1].trim() : 'false'
      }
    )
  }

  hiddenDerivedRequests.push({
    placeholderId: conditionId,
    deps: Array.from(deps),
    templateBody,
    isExpression: true,
  })

  const childHtmlParts: string[] = []
  children.flat().forEach(child => {
    if (child && typeof child === 'object' && 'html' in child) {
      const vnode = child as VNode
      instructions.push(...vnode.instructions)
      hiddenDerivedRequests.push(...vnode.hiddenDerivedRequests)
      if (vnode.additionalNodes) additionalNodes.push(...vnode.additionalNodes)
      childHtmlParts.push(vnode.html)
    } else {
      childHtmlParts.push(String(child))
    }
  })

  instructions.push({
    signalId: conditionId,
    selector: `.${qid}`,
    action: 'show',
    template: childHtmlParts.join(''),
  })

  return {
    tag: 'Show',
    html: `<span class="${qid}" style="display:contents" data-show-anchor></span>`,
    instructions,
    hiddenDerivedRequests,
    additionalNodes,
  }
}
