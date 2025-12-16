import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import sass from 'vite-plugin-sass';

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        myplace: resolve(__dirname, 'myplace/index.html'),
        cua: resolve(__dirname, 'cua/index.html'),
        geomaps: resolve(__dirname, 'geomaps/index.html'),
        newspapers: resolve(__dirname, 'newspapers/index.html'),
      },
    },
  },
})