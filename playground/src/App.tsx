import { component } from '@quix/runtime'

export default component('App')
  .state('count', 0)
  .derived('double', ['count'], s => s.count() * 2)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) => (
    <div>
      <h1>Quix Restart</h1>
      <button onclick={handlers.inc}>Count: {state.count()}</button>
      <p>Double: {state.double()}</p>
    </div>
  ))
