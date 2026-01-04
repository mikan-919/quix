import { component, type QuixComponent, Show } from '@quix/runtime'
import z from 'zod'

const Display = component('Display')
  .props({ value: z.number() })
  .render(({ props }) => <h2>Double: {props.value()}</h2>)

const App: QuixComponent = component('App')
  .state('count', 1)
  .derived('double', ['count'], s => s.count() * 2)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) => (
    <div>
      <h1>My new framework</h1>
      <button type='button' onclick={handlers.inc}>
        Count is: {state.count()}
      </button>
      <Show when={state.count() % 2 === 1}>
        <p>Count is Even</p>
        <p>Half is {state.count() / 2}</p>
      </Show>
      <Display value={state.double()} />
    </div>
  ))

export default App
