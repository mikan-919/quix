# packages/transform

## OVERVIEW
SWC transformation plugin that converts JSX to h() function calls for Quix framework.

## WHERE TO LOOK
- `src/index.ts` - Main transform API using SWC with WASM plugin
- `swc-plugin/src/lib.rs` - Core Rust implementation (TransformVisitor)
- `swc-plugin/target/wasm32-wasip1/release/*.wasm` - Built WASM plugin artifacts
- `test/` - Transformation test cases

## CONVENTIONS
- **Build Order**: Rust must be compiled before TypeScript (`cd swc-plugin && cargo build -r`)
- **WASM Target**: Always target `wasm32-wasip1` for SWC plugin compatibility
- **Tag Naming**: Lowercase JSX tags become strings ("div"), uppercase become identifiers (Component)
- **Props**: Non-`on*` props are wrapped in arrow functions automatically
- **Auto-Import**: Inserts `import { h } from "@quix/runtime"` when JSX is detected without explicit import

## ANTI-PATTERNS
- **NEVER edit** `swc-plugin/target/` - These are Cargo build artifacts, regenerate with `cargo build -r`
- **NEVER commit** `.wasm` files to git (add to `.gitignore`)
- **Don't bypass SWC**: All JSX transformation must go through `transformQuix()` in `src/index.ts`
- **Avoid direct string tags**: Use JSX conventions (lowercase = HTML element, uppercase = component)
- **Don't manually import h**: Plugin auto-imports it when needed
