import path from 'node:path'
import { generateAppJs } from '@quix/runtime/compiler'
import { transformQuix } from '@quix/transform'
import { transform } from 'esbuild'
import type { Plugin, ViteDevServer } from 'vite'
import { createServer } from 'vite' // 💡 追加

export function quixPlugin(): Plugin {
  let server: ViteDevServer
  let isBuild = false

  // 💡 解析用サーバーを確保するヘルパー
  async function ensureServer() {
    if (server) return server
    // ビルド時はサーバーが存在しないので、最小構成で作成する
    server = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      // 自分のプラグインを再帰的に適用しないよう注意（無限ループ防止）
      // ただし ?quix-meta を処理するために必要なので、このプラグイン自体も読み込む
      plugins: [quixPlugin()],
    })
    return server
  }

  return {
    name: 'vite-plugin-quix',
    enforce: 'pre',

    configResolved(config) {
      isBuild = config.command === 'build'
    },

    configureServer(_server) {
      server = _server
    },

    async transform(code, id) {
      // 1. 解析用リクエスト (?quix-meta)
      if (id.includes('?quix-meta')) {
        return {
          code: transformQuix(code, id),
          map: null,
        }
      }

      // 2. ブラウザ向け JS 生成 (App.tsx)
      if (id.endsWith('.tsx')) {
        const s = await ensureServer() // 💡 サーバーがあるか確認

        // 開発時は絶対パス、ビルド時は相対パス等の差異を吸収
        const metaId = `${id}?quix-meta`
        const module = await s.ssrLoadModule(metaId)
        const component = module.default?.default || module.default

        if (!component || !component.bank) return null

        let finalJs = generateAppJs(component)

        if (isBuild) {
          const minified = await transform(finalJs, {
            minify: true,
            target: 'esnext',
            format: 'esm',
          })
          finalJs = minified.code
        }

        return {
          code: finalJs,
          map: null,
          contentType: 'application/javascript',
        }
      }
      return null
    },

    async transformIndexHtml(html) {
      // 💡 ビルド時も src/App.tsx を解決できるようにする
      const s = await ensureServer()
      const entryPath = path.resolve(s.config.root, 'src/App.tsx')

      try {
        const module = await s.ssrLoadModule(`${entryPath}?quix-meta`)
        const component = module.default?.default || module.default
        if (!component || !component.html) return html

        return html.replace(
          /<div\s+id=["']app["']\s*><\/div>/,
          `<div id="app">${component.html}</div>`
        )
      } catch (e) {
        console.error('[Quix] HTML transformation failed:', e)
        return html
      }
    },

    // 💡 ビルド終了時に一時サーバーを閉じる
    async buildEnd() {
      if (isBuild && server) {
        await server.close()
      }
    },
  }
}
