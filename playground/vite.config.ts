import { quixPlugin } from '@quix/vite-plugin'
import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    quixPlugin(),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // 💡 さらに強力な Brotli 圧縮も生成する場合
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  esbuild: {
    jsx: 'preserve',
    sourcemap: false,
  },
})
