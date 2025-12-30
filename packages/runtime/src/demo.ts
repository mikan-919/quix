import { component } from './builder'
import { h } from './h'

const App = component('App')
  .state('count', 0)
  .derived('double', ['count'], s => s.count() * 2)
  .handler('click', ['count'], s => s.count(s.count() + 1))
  .render(({ state, handlers }) =>
    h(
      'div',
      null,
      h('h1', null, 'Counter'),
      h('button', { onClick: handlers.click }, 'Count: ', () => state.count()),
      h('p', null, 'Doubled: ', () => state.double(), '=', state.count, '* 2')
    )
  )
console.log(
  JSON.stringify(App, (_key, value) => {
    return typeof value === 'function' ? value.toString() : value
  })
)
