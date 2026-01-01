import { component, For, Show } from '@quix/runtime'

export default component('App')
  .state('count', 4)
  .derived('double', ['count'], s => s.count() * 2)
  .derived('array', ['count'], s =>
    Array(s.count())
      .fill(0)
      .map((_, i) => i)
  )
  .derived('isQuad', ['double'], s => s.double() % 4 === 0)
  .handler('inc', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) => (
    <div>
      <h1>new frontend library</h1>
      <button onclick={handlers.inc}>Count: {state.count()}</button>
      <p>Double: {state.double()}</p>
      <For each={state.array}>{item => <p>{item()}</p>}</For>
      <Show when={state.isQuad()}>
        <p style='color: red'>Even Number!</p>
      </Show>
      普通のテキストはどうなのか問題
    </div>
  ))
// export default component('App').render(({}) => (
//   <div>
//     <h1>Hello world!</h1>
//   </div>
// ))
