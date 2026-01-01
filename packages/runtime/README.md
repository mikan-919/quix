# Quix

Quix is an experimental, compiler-first reactive framework designed to generate zero-overhead vanilla JavaScript. It combines a strict builder pattern for state management with a compile-time dependency graph analyzer.

> **Note:** This is an experimental prototype.

## Key Features

- **Zero-Runtime Overhead:** Components are compiled into imperative DOM manipulation code (vanilla JS). No Virtual DOM diffing at runtime.
- **Fine-Grained Reactivity:** Automatically tracks dependencies using proxies. Only the precise DOM nodes that need updates are touched.
- **Builder API:** Enforces a clean separation between State, Derived Logic, and View via a fluent chainable API.
- **"Hidden Derived" Optimization:** Inline functions in JSX are automatically extracted, optimized, and treated as derived reactive nodes.

## Architecture

Quix works in two stages:

1.  **Analysis Phase (Builder):**
    The component code is executed to build a dependency graph (`StateBank`). It tracks which states are used where (including inside JSX templates).
2.  **Codegen Phase:**
    The graph and rendering instructions are compiled into a standalone JavaScript IIFE function containing optimized `setText`, `addListener`, and variable updates.

## Installation

This project uses [Bun](https://bun.com).

```bash
bun install
```

## Usage

Quix uses a chaining API to define components.

```typescript
import { component } from './builder'
import { h } from './h'

const App = component('App')
  // 1. Define State
  .state('count', 0)
  
  // 2. Define Derived State (Computed)
  // Dependencies are automatically tracked
  .derived('double', ['count'], s => s.count() * 2)
  
  // 3. Define Handlers
  .handler('increment', ['count'], s => s.count(s.count() + 1))
  
  // 4. Render View
  .render(({ state, handlers }) =>
    h(
      'div',
      null,
      h('h1', null, 'Counter App'),
      // Inline functions are automatically optimized as "Hidden Derived"
      h('p', null, 'Count: ', () => state.count()),
      h('p', null, 'Doubled: ', () => state.double()),
      h('button', { onClick: handlers.increment }, 'Increment')
    )
  )

// This object can be passed to the compiler to generate raw JS
console.log(App)
```

## Development

### Run Demo
To run the demo script which outputs the component structure:

```bash
bun run dev
```

### Run Tests
The project includes snapshot tests to verify the codegen output.

```bash
bun test
```

## Project Structure

- **`src/builder/`**: Core logic for the Component Builder and State Bank.
- **`src/compiler/`**: The Code Generator that turns the graph into JavaScript strings.
- **`src/h.ts`**: Hypercript function (JSX runtime) that collects instructions.
- **`src/tracker.ts`**: Global dependency tracking system using a stack-based approach.

## License

Private / Internal