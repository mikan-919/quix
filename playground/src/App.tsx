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
    const modalContent = state.modalOpen() ? (
      <div style='background:white;padding:2rem;border-radius:8px;max-width:400px;'>
        <h2>Modal Title</h2>
        <p>This modal is used for E2E testing.</p>
      </div>
    ) : (
      <div style='display:none;' data-testid='modal-content'>
        <h2>Modal Title</h2>
        <p>This modal is used for E2E testing.</p>
      </div>
    )

    return (
      <div>
        <h1>My new framework</h1>
        <button type='button' onclick={handlers.inc}>
          Count is: {state.count()}
        </button>
        <Display value={doubleValue} />
        <div data-testid='modal-backdrop' onclick={handlers.toggleModal}>
          <div data-testid='modal-content'>{modalContent}</div>
        </div>
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
