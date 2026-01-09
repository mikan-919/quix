import { quixPlugin } from '@quix/vite-plugin'
import { defineConfig } from 'vite'
import { compression } from 'vite-plugin-compression2'

export default defineConfig({
  plugins: [
    quixPlugin(),
    compression({
      algorithms: ['gzip', 'brotli'],
    }),
  ],
  esbuild: {
    jsx: 'preserve',
    sourcemap: false,
  },
})
