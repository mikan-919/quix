import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from '@swc/core'
import { consola } from 'consola'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginPath = path.resolve(
  __dirname,
  '../swc-plugin/target/wasm32-wasip1/release/swc_lazy_jsx_plugin.wasm'
)
const logger = consola.withTag('Quix:Transform')

export function transformQuix(code: string, _filename: string) {
  try {
    const result = transformSync(code, {
      jsc: {
        target: 'es2020',
        parser: { syntax: 'typescript', tsx: true },
        experimental: { plugins: [[pluginPath, {}]] },
      },
      minify: false,
    })
    return result.code
  } catch (e) {
    logger.error(`SWC Transform failed for ${_filename}:`, e)
    throw e
  }
}
