import { generateId } from '../id'
import { tracker } from '../tracker'
import type {
  ComponentNode,
  HiddenDerivedRequest,
  Instruction,
  VNode,
} from '../types'

export interface ShowProps {
  when: () => unknown
}

export type ShowComponent = (props: ShowProps, children: VNode) => VNode
export const Show: ShowComponent

export function handleShow(props: ShowProps, children: unknown[]): VNode {
  const qid = generateId('q')
  const instructions: Instruction[] = []
  const hiddenDerivedRequests: HiddenDerivedRequest[] = []
  const additionalNodes: ComponentNode[] = []

  const conditionId = generateId('cond')
  const deps = new Set<string>()
  let templateBody = ''

  let initialWhen = false
  if (props && typeof props.when === 'function') {
    initialWhen = !!tracker.silence(() => props.when())
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

  const templateId = generateId('tmpl')
  const innerHtml = childHtmlParts.join('')
  instructions.push({
    signalId: conditionId,
    selector: `.${qid}`,
    action: 'show',
    template: innerHtml,
    templateId,
  })

  return {
    tag: 'Show',
    html: `<span class="${qid}" style="display:contents" data-show-anchor>${initialWhen ? innerHtml : ''}</span><template id="${templateId}">${innerHtml}</template>`,
    instructions,
    hiddenDerivedRequests,
    additionalNodes,
  }
}
