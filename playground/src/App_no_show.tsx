import { component } from '@quix/runtime'
import z from 'zod'

const Display = component('Display')
  .props({ value: z.number() })
  .render(({ props }) => <h2>Double: {props.value()}</h2>)

const App = component('App')
  .state('count', 10)
  .state('modalOpen', false)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .handler('toggleModal', ['modalOpen'], s => s.modalOpen(!s.modalOpen()))
  .render(({ state, handlers }) => (
    <div>
      <h1>My new framework</h1>
      <button type='button' onclick={handlers.inc}>
        Count is: {state.count()}
      </button>
      <Display value={state.count() * 2} />
      {state.modalOpen() && (
        <div
          style='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);'
          data-testid='modal-backdrop'
          onclick={handlers.toggleModal}
        >
          <div
            style='background:white;padding:2rem;max-width:400px;margin:auto;'
            data-testid='modal-content'
          >
            <h2 style='margin:0 0 1rem 0;'>Modal Title</h2>
            <p>This modal is used for E2E testing.</p>
          </div>
        </div>
      )}
      <button type='button' onclick={handlers.toggleModal} data-testid='open-modal'>
        Open Modal
      </button>
    </div>
  ))

export default App
