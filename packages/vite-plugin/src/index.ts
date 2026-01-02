import path from 'node:path'
import { generateAppJs } from '@quix/runtime/compiler'
import { transformQuix } from '@quix/transform'
import { consola } from 'consola' // consola を使用
import { transform } from 'esbuild'
import type { Plugin, ViteDevServer } from 'vite'
import { createServer } from 'vite'

export function quixPlugin(): Plugin {
  const logger = consola.withTag('Quix:Vite')
  let server: ViteDevServer | undefined
  let isBuild = false
  let projectRoot = process.cwd()

  async function ensureBuildServer() {
    if (server) return server
    logger.info('Starting internal SSR server for build-time analysis...')
    server = await createServer({
      root: projectRoot,
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
      projectRoot = config.root
    },

    configureServer(_server) {
      server = _server
    },

    async transform(code, id) {
      // (既存の transform ロジック)
      if (id.includes('?quix-analyze')) {
        const cleanId = id.replace(/\?quix-analyze$/, '')
        return { code: transformQuix(code, cleanId), map: null }
      }

      if (id.endsWith('.tsx')) {
        const s = isBuild ? await ensureBuildServer() : server
        if (!s) return null
        try {
          const module = await s.ssrLoadModule(`${id}?quix-analyze`)
          const exported = module.default?.default || module.default
          if (!exported) return null
          const context =
            exported.context ||
            (typeof exported.getAllNodes === 'function' ? exported : null)
          if (!context) return null
          const finalJs = generateAppJs(context)
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
          return { code: result.code, map: null }
        } catch (_e) {
          return null
        }
      }
      return null
    },

    // ⭐️ 修正：オブジェクト形式にして order: 'pre' を指定
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        logger.info(
          `[${isBuild ? 'Build' : 'Dev'}] transformIndexHtml (pre) started.`
        )
        const s = isBuild ? await ensureBuildServer() : server
        if (!s) return html

        // ⭐️ 修正：正規表現をより柔軟に (src 属性を広く探す)
        const scriptRegex = /<script\s+[^>]*?src=["'](.+?)["'][^>]*?>/g
        let match
        let entrySrc = null
        let entryPath = null

        while ((match = scriptRegex.exec(html)) !== null) {
          const fullTag = match[0]
          const src = match[1]
          // type="module" かつ Viteクライアント以外
          if (
            fullTag.includes('type="module"') &&
            !src.includes('@vite/client')
          ) {
            entrySrc = src
            break
          }
        }

        if (!entrySrc) {
          logger.warn('No entry script found in HTML.')
          return html
        }

        entryPath = entrySrc.startsWith('/')
          ? path.resolve(projectRoot, entrySrc.slice(1))
          : path.resolve(projectRoot, entrySrc)

        try {
          logger.info(`SSR Analysis for: ${entryPath}`)
          const module = await s.ssrLoadModule(`${entryPath}?quix-analyze`)
          const exported = module.default?.default || module.default
          const context =
            exported?.context ||
            (exported && typeof exported.getAllNodes === 'function'
              ? exported
              : null)

          if (!context || !context.html) {
            logger.warn('No HTML generated from SSR.')
            return html
          }

          const targetRegex =
            /<div\s+[^>]*id=["']app["'][^>]*>([\s\S]*?)<\/div>/
          const newHtml = html.replace(targetRegex, m => {
            const tagMatch = m.match(/^(<div\s+[^>]*id=["']app["'][^>]*>)/)
            return `${tagMatch ? tagMatch[1] : '<div id="app">'}${context.html}</div>`
          })

          logger.success('HTML successfully injected at build-time.')
          return newHtml
        } catch (e) {
          logger.error('In-build SSR failed:', e)
          return html
        }
      },
    },

    // ⭐️ 修正：buildEnd ではなく closeBundle でサーバーを閉じる
    async closeBundle() {
      if (isBuild && server) {
        logger.info('Closing SSR analyzer server...')
        await server.close()
        server = undefined
      }
    },
  }
}
