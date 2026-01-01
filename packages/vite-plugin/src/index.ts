import path from 'node:path'
import { generateAppJs } from '@quix/runtime/compiler'
import { transformQuix } from '@quix/transform'
import { transform } from 'esbuild'
import type { Plugin, ViteDevServer } from 'vite'
import { createServer } from 'vite'

export function quixPlugin(): Plugin {
  let server: ViteDevServer | undefined
  let isBuild = false

  async function ensureBuildServer() {
    if (server) return server
    server = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      plugins: [quixPlugin()],
      configFile: false,
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

    // ⭐️ 追加: コンポーネント更新時はフルリロードする
    // Quixは「HTML構造」と「JSのDOM取得処理」が密結合なため、
    // HTMLを再生成しないとHMRで壊れる可能性がある。
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.tsx')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },

    async transform(code, id) {
      if (id.includes('?quix-analyze')) {
        const cleanId = id.replace(/\?quix-analyze$/, '')
        console.log(transformQuix(code, cleanId))
        return {
          code: transformQuix(code, cleanId),
          map: null,
        }
      }

      if (id.endsWith('.tsx')) {
        const s = isBuild ? await ensureBuildServer() : server
        if (!s) return null

        try {
          const module = await s.ssrLoadModule(`${id}?quix-analyze`)
          const exported = module.default?.default || module.default

          if (!exported) return null

          let context
          if (exported.context) {
            context = exported.context
          } else if (typeof exported.getAllNodes === 'function') {
            context = exported
          }

          if (!context) return null

          let finalJs = generateAppJs(context)

          // ⭐️ 修正: esbuildを使って整形・圧縮を行う
          // ビルド時は完全圧縮、開発時は余白削除のみ
          const transformOptions = isBuild
            ? { minify: true }
            : {
                minifySyntax: true,
                minifyIdentifiers: true,
                minifyWhitespace: true,
                minify: true,
              }

          const result = await transform(finalJs, {
            ...transformOptions,
            target: 'esnext',
            format: 'esm',
          })

          finalJs = result.code

          return {
            code: finalJs,
            map: null,
            contentType: 'application/javascript',
          }
        } catch (e) {
          console.error(`[Quix] Compilation failed for ${id}:`, e)
          throw e
        }
      }
      return null
    },

    async transformIndexHtml(html) {
      const s = isBuild ? await ensureBuildServer() : server
      if (!s) return html

      // ⭐️ 修正: 正規表現ですべての script タグを走査し、ユーザーコードを探す
      const scriptRegex = /<script\s+type="module"\s+src="(.+?)"/g
      let match
      let entrySrc = null

      while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1]
        // Vite内部のクライアントスクリプトは無視する
        if (!src.includes('@vite/client')) {
          entrySrc = src
          break
        }
      }

      if (!entrySrc) return html

      // パス解決
      const entryPath = entrySrc.startsWith('/')
        ? path.join(s.config.root, entrySrc)
        : entrySrc

      try {
        const module = await s.ssrLoadModule(`${entryPath}?quix-analyze`)
        const exported = module.default?.default || module.default

        let context
        if (exported?.context) {
          context = exported.context
        } else if (exported && typeof exported.getAllNodes === 'function') {
          context = exported
        }

        if (!context || !context.html) return html

        return html.replace(
          /<div\s+id=["']app["']\s*><\/div>/,
          `<div id="app">${context.html}</div>`
        )
      } catch (e) {
        console.error('[Quix] HTML injection failed:', e)
        return html
      }
    },

    async buildEnd() {
      if (isBuild && server) {
        await server.close()
      }
    },
  }
}
