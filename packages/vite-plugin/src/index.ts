import path from 'node:path'
import { generateAppJs } from '@quix/runtime/compiler' // 分離したcodegenを呼ぶ
import { transformQuix } from '@quix/transform'
import type { Plugin, ViteDevServer } from 'vite'

export function quixPlugin(): Plugin {
  let server: ViteDevServer

  return {
    name: 'vite-plugin-quix',
    enforce: 'pre',
    configureServer(_server) {
      server = _server
    },

    async transform(code, id) {
      if (id.includes('?quix-meta')) {
        return { code: transformQuix(code, id), map: null }
      }
      return null
    },

    async transformIndexHtml(html) {
      const entryPath = path.resolve(server.config.root, 'src/App.tsx')
      try {
        const module = await server.ssrLoadModule(`${entryPath}?quix-meta`)
        const component = module.default?.default || module.default

        if (!component || !component.bank) return html

        const activationScript = generateAppJs(component)

        return html
          .replace(
            /<div\s+id=["']app["']\s*><\/div>/,
            `<div id="app">${component.html}</div>`
          )
          .replace(
            '</body>',
            `<script type="module">${activationScript}</script></body>`
          )
      } catch (e) {
        console.error('[Quix] Compilation failed:', e)
        return html
      }
    },
  }
}
