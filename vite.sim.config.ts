import { defineConfig } from 'vite'

// The simulated Alexa+ page. Served by the household server at /sim/.
export default defineConfig({
  root: 'web/sim',
  build: { outDir: '../../dist/sim', emptyOutDir: true },
})
