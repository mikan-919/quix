# packages/runtime AGENTS.md

## OVERVIEW
Core reactivity engine for Quix framework - handles state management, component rendering, and JSX-like syntax via h() function.

## STRUCTURE
- `src/core/` - Builder pattern, types, components (For, Show, Component)
- `src/compiler/` - Code generator using Babel AST
- `src/` - Entry point (index.ts), h() function, demos

## WHERE TO LOOK
- `src/core/builder.ts` - ComponentBuilder chainable API (.state, .derived, .handler, .render)
- `src/core/types.ts` - Core types: StateNode, DerivedNode, HandlerNode, Instruction, VNode
- `src/h.ts` - JSX runtime, VNode generation, instruction collection
- `src/core/tracker.ts` - Stack-based dependency tracking
- `src/core/id.ts` - ID generation (prefixes: s-, d-, hd-, for-, q-, tmpl-)
- `src/compiler/codegen.ts` - AST-based JS code generation, dead code elimination

## CONVENTIONS
- **Testing**: `bun:test` with Japanese descriptions (see `docs/TESTING_GUIDELINES.md`)
  - `describe('English: 日本語概要', () => { test('条件: 期待される振る舞い（〜こと）') })`
  - Use `.toContain()` or `.find()` for auto-generated IDs (not exact match)
- **Logging**: Consola with tagged logging (see `docs/LOGGING_GUIDELINES.md`)
  - Tags: `Quix:Builder`, `Quix:Runtime`, `Quix:Codegen`
  - Levels: `info/success` (overview), `debug` (details), `trace` (loops), `warn` (DCE)
- **Code Style**: Single quotes, semicolons as needed, ES5 trailing commas (biome.json)
- **Signal Access**: Always call signals as functions `state()` - no `.value` property access

## ANTI-PATTERNS
- Direct `console.log()` - must use Consola with proper tags
- Hard-coded IDs in tests - use `.toContain()` since IDs are auto-generated
- Signal property access like `state.value` - must use `state()` function calls
- Missing dependency tracking in derived/handler deps arrays - causes silent failures
