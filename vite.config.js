import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        myplace: resolve(__dirname, 'myplace/index.html'),
        cua: resolve(__dirname, 'cua/index.html'),
      },
    },
  },
})