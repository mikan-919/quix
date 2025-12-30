import { defineConfig } from 'vite'
import { quixPlugin } from '@quix/vite-plugin'

export default defineConfig({
  plugins: [quixPlugin()],
  esbuild: {
    jsx: 'preserve',
  },
})
