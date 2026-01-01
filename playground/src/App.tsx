import { component, Show } from '@quix/runtime'

export default component('App')
  .state('count', 0)
  .derived('double', ['count'], s => s.count() * 2)
  .derived('isQuad', ['double'], s => s.double() % 4 === 0)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) => (
    <div>
      <h1>new frontend library</h1>
      <button onclick={handlers.inc}>Count: {state.count()}</button>
      <p>Double: {state.double()}</p>
      <Show when={() => state.count() % 2 === 0}>
        <p style='color: red'>Even Number!</p>
      </Show>
      <Show when={() => state.count() % 2 !== 0}>
        <p style='color: blue'>Odd Number!</p>
      </Show>
      普通のテキストはどうなのか問題
    </div>
  ))
// export default component('App').render(({}) => (
//   <div>
//     <h1>Hello world!</h1>
//   </div>
// ))
