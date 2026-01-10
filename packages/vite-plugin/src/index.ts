import path from 'node:path'
import { generateAppJs } from '@quix/runtime/compiler'
import { transformQuix } from '@quix/transform'
import { consola } from 'consola'
import { transform } from 'esbuild'
import type { IndexHtmlTransformContext, Plugin, ViteDevServer } from 'vite'
import { createServer } from 'vite'

/**
 * Quix フレームワーク用の Vite プラグイン。
 *
 * 主な責務:
 * 1. .tsx ファイルをコンパイル時に実行(SSR)し、その結果からクライアント用 JS を生成する。
 * 2. index.html に対して、アプリの初期レンダリング結果(HTML)を注入する。
 * 3. ビルド時にも `ssrLoadModule` を使用可能にするため、内部的な Vite サーバーを管理する。
 */
export function quixPlugin(): Plugin {
  // ログを見やすくするため、専用のタグを付与したロガーを作成
  const logger = consola.withTag('Quix:Vite')

  // 開発サーバーまたはビルド用の一時サーバーのインスタンスを保持
  let server: ViteDevServer | undefined

  // build コマンドか serve (dev) コマンドかを識別するフラグ
  let isBuild = false

  // プロジェクトのルートディレクトリ（configResolved で確定される）
  let projectRoot = process.cwd()

  /**
   * ビルドプロセス中にコードを実行・解析するための内部 SSR サーバーを確保する。
   *
   * 【Why】
   * Vite の `build` コマンド実行時は、通常バンドル処理のみが行われ、Node.js 環境でのモジュール実行（SSR）機能は提供されません。
   * しかし、Quix はコンパイル時にコンポーネントを実行して解析（Partial Hydration 用データの抽出など）を行うアーキテクチャを採用しています。
   * そのため、ビルド時であっても `ssrLoadModule` を利用できるように、意図的に独立した Vite サーバーインスタンスを立ち上げます。
   */
  async function ensureBuildServer() {
    if (server) return server
    logger.info('Starting internal SSR server for build-time analysis...')

    // configFile: false にすることで、ユーザー設定との競合や二重読み込みを防ぎつつ、
    // 最小限の構成でサーバーを起動します。
    server = await createServer({
      root: projectRoot,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      plugins: [quixPlugin()], // 自分自身をプラグインとして登録（再帰的な変換が必要な場合に対応）
      configFile: false,
    })
    return server
  }

  return {
    name: 'vite-plugin-quix',
    // 他の Vite プラグインより先に実行されるように 'pre' を指定。
    // これにより、Quix 独自の変換ロジックが標準の変換よりも優先されます。
    enforce: 'pre',

    /**
     * Vite の設定が確定したタイミングで呼ばれるフック。
     * ここでコマンドタイプ（build/serve）やルートパスをキャッシュします。
     */
    configResolved(config) {
      isBuild = config.command === 'build'
      projectRoot = config.root
    },

    /**
     * 開発サーバー (`vite dev`) の起動時に呼ばれるフック。
     * 開発時はこのサーバーインスタンスを解析用に使用します。
     */
    configureServer(_server: ViteDevServer) {
      server = _server
    },

    /**
     * ソースコード変換フック。
     * 特定のファイルをインターセプトし、ブラウザ向けまたは解析向けのコードに変換します。
     *
     * @param code ソースコード文字列
     * @param id ファイルパス（クエリパラメータ含む）
     */
    async transform(code, id) {
      // 再帰防止・解析用フラグの処理
      // `?quix-analyze` が付いている場合、SSR 用の変換ロジックを通してから返す。
      // これにより `ssrLoadModule` で読み込まれた際の挙動を制御します。
      if (id.includes('?quix-analyze')) {
        const cleanId = id.replace(/\?quix-analyze$/, '')
        logger.debug(`Transforming for analyze: ${cleanId}`)
        try {
          const transformed = transformQuix(code, cleanId)
          logger.trace(`Transformed code start: ${transformed.slice(0, 100)}`)
          return { code: transformed, map: null }
        } catch (e) {
          logger.error(`Transform failed for ${cleanId}:`, e)
          throw e
        }
      }

      // .tsx ファイルに対するメイン処理
      // コンポーネント定義ファイルを検出し、クライアント実行用の JS を生成します。
      if (id.endsWith('.tsx')) {
        // ビルド時なら内部サーバー、開発時なら開発サーバーを取得
        const s = isBuild ? await ensureBuildServer() : server
        if (!s) return null

        try {
          // 【Core Logic】
          // 実際にモジュールを Node.js 環境でロード（実行）します。
          // これにより、静的解析では難しい「動的に生成されたコンテキスト」や「依存関係」を解決します。
          const module = await s.ssrLoadModule(`${id}?quix-analyze`)

          // default export の解決（CJS/ESM の相互運用性を考慮）
          const exported = module.default?.default || module.default
          if (!exported) return null

          // コンテキストの抽出（Quix フレームワークの仕様に基づく）
          // `getAllNodes` メソッドを持つオブジェクトも有効なエントリポイントとみなします。
          const context =
            exported.context ||
            (typeof exported.getAllNodes === 'function' ? exported : null)

          if (!context) return null

          // 解析結果（context）を元に、ブラウザで動作する最終的な JS コードを生成
          const finalJs = generateAppJs(context)

          // ビルドモードに応じた最適化オプションの設定
          const transformOptions = isBuild
            ? { minify: true }
            : {
                minifySyntax: true,
                minifyIdentifiers: true,
                minifyWhitespace: true,
                minify: true,
              }

          // 生成された JS はまだ生の文字列である可能性があるため、
          // esbuild を通して標準的な ESM 形式かつ最適化された状態に変換して Vite に返します。
          const result = await transform(finalJs, {
            ...transformOptions,
            target: 'esnext',
            format: 'esm',
          })
          return { code: result.code, map: null }
        } catch (e) {
          logger.error('Failed to analyze and transform component:', e)
          // 解析に失敗した場合（構文エラーなど）、ここでは null を返して
          // Vite の標準的なエラーハンドリングや後続のプラグインに任せる。
          return null
        }
      }
      return null
    },

    /**
     * HTML 変換フック。
     * index.html に対して、SSR で生成された HTML 文字列を注入します。
     * `order: 'pre'` により、Vite の標準的な HTML 処理の前に実行されます。
     */
    transformIndexHtml: {
      order: 'pre',
      async handler(html: string, _ctx: IndexHtmlTransformContext) {
        logger.info(
          `[${isBuild ? 'Build' : 'Dev'}] transformIndexHtml (pre) started.`
        )
        const s = isBuild ? await ensureBuildServer() : server
        if (!s) return html

        // HTML 内の <script> タグを解析し、エントリポイントとなるモジュールパスを特定する
        const scriptRegex = /<script\s+[^>]*?src=["'](.+?)["'][^>]*?>/g
        let entrySrc: string | null = null

        // `matchAll` を使用することで、全てのマッチ結果に対してイテレータブルにアクセス
        for (const match of html.matchAll(scriptRegex)) {
          const fullTag = match[0]
          const src = match[1]

          // エントリポイントの条件:
          // 1. type="module" であること
          // 2. Vite 内部クライアント (@vite/client) ではないこと
          if (
            src &&
            fullTag.includes('type="module"') &&
            !src.includes('@vite/client')
          ) {
            entrySrc = src
            break // 最初に見つかった有効なエントリポイントを採用
          }
        }

        if (!entrySrc) {
          logger.warn('No entry script found in HTML.')
          return html
        }

        // 絶対パスへの解決
        const entryPath = entrySrc.startsWith('/')
          ? path.resolve(projectRoot, entrySrc.slice(1))
          : path.resolve(projectRoot, entrySrc)

        try {
          logger.info(`SSR Analysis for: ${entryPath}`)

          // エントリポイントを実行し、レンダリング結果を取得
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

          // <div id="app"> をターゲットとし、SSR で生成された HTML に置換・注入する
          const targetRegex =
            /<div\s+[^>]*id=["']app["'][^>]*>([\s\S]*?)<\/div>/

          const newHtml = html.replace(targetRegex, m => {
            // 元の div タグの属性を維持しつつ、中身だけを置換する
            const tagMatch = m.match(/^(<div\s+[^>]*id=["']app["'][^>]*>)/)
            return `${tagMatch ? tagMatch[1] : '<div id="app">'}${context.html}</div>`
          })

          logger.success('HTML successfully injected at build-time.')
          return newHtml
        } catch (e: unknown) {
          // TypeScript 4.x~ では catch 節の変数は unknown 型になるため、
          // 型安全性を考慮して明示的に unknown とし、そのままログ出力に渡す
          logger.error('In-build SSR failed:', e)
          return html
        }
      },
    },

    /**
     * バンドル処理終了時のフック。
     * ビルド用に一時的に立ち上げたサーバーがあれば、リソース解放のためにクローズする。
     */
    async closeBundle() {
      if (isBuild && server) {
        logger.info('Closing SSR analyzer server...')
        await server.close()
        server = undefined
      }
    },
  }
}
