export type WireType = 'text' | 'attr' | 'handler' | 'show'

export interface DependencySubscriber {
  name: string
  addDep: (key: string) => void
}

const subscriberStack: DependencySubscriber[] = []

export const Tracker = {
  start(sub: DependencySubscriber) {
    subscriberStack.push(sub)
  },
  stop() {
    subscriberStack.pop()
  },
  report(key: string) {
    const current = subscriberStack[subscriberStack.length - 1]
    if (current) {
      current.addDep(key)
    }
  },
}
