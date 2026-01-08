import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // テストファイルの場所
  testDir: './packages/runtime/test/playwright',

  // .spec.ts ファイルのみをテストとして認識
  testMatch: '**/*.spec.ts',

  // 並列実行を有効化
  fullyParallel: true,

  // CI環境でのみ `only` を禁止
  forbidOnly: !!process.env.CI,

  // CI環境でリトライ回数を設定
  retries: process.env.CI ? 2 : 0,

  // CI環境では1つのワーカーのみ使用
  workers: process.env.CI ? 1 : undefined,

  // HTMLレポーターを有効化
  reporter: 'html',

  // テストの挙動を設定
  use: {
    // baseURL で相対URLを簡略化
    baseURL: 'http://localhost:5173',

    // 最初のリトライ時にトレースを記録
    trace: 'on-first-retry',

    // 失敗時のみスクリーンショットを保存
    screenshot: 'only-on-failure',

    // 失敗時のビデオを保持
    video: 'retain-on-failure',
  },

  // プロジェクト設定（ブラウザの種類など）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 開発サーバーを自動起動（playgroundをテスト対象にする）
  webServer: {
    command: 'cd playground && bun run dev',
    url: 'http://localhost:5173',
    // CI環境以外では既存サーバーを再利用
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
