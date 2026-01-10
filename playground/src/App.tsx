import { component, type QuixComponent } from '@quix/runtime'
import z from 'zod'

const Display = component('Display')
  .props({ value: z.number() })
  .render(({ props }) => <h2>Double: {props.value()}</h2>)

const App = component('App')
  .state('count', 10)
  .state('modalOpen', false)
  .derived('double', ['count'], s => s.count() * 2)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .handler('toggleModal', ['modalOpen'], s => s.modalOpen(!s.modalOpen()))
  .render(({ state, handlers }) => {
    const doubleValue = state.count() * 2

    return (
      <div>
        <h1>My new framework</h1>
        <button type='button' onclick={handlers.inc}>
          Count is: {state.count()}
        </button>
        <Display value={doubleValue} />
        {state.modalOpen() ? (
          <div
            onclick={handlers.toggleModal}
            style='position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;'
            data-testid='modal-backdrop'
          >
            <div
              style='background:white;padding:2rem;border-radius:8px;max-width:400px;'
              data-testid='modal-content'
            >
              <h2 style='margin:0 0 1rem 0;'>Modal Title</h2>
              <p>This modal is used for E2E testing.</p>
            </div>
          </div>
        ) : null}
        <button
          type='button'
          onclick={handlers.toggleModal}
          data-testid='open-modal'
        >
          Open Modal
        </button>
      </div>
    )
  })

export default App
