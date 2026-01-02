import { component } from '@quix/runtime'
import z from 'zod'

const Display = component('Display')
  .props({ value: z.number() })
  .render(({ props }) => <h2>Double: {props.value()}</h2>)

export default component('App')
  .state('count', 0)
  .derived('double', ['count'], s => s.count() * 2)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) => (
    <div>
      <h1>Quix Framework</h1>
      <button onclick={handlers.inc}>Count is: {state.count()}</button>
      <Display value={state.double()} />
    </div>
  ))
