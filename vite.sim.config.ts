import { defineConfig } from 'vite'

// The simulated Alexa+ page. Served by the household server at /sim/ and by the
// hosted router at /<home>/sim/, so the built asset URLs must be relative.
export default defineConfig({
  root: 'web/sim',
  base: '',
  build: { outDir: '../../dist/sim', emptyOutDir: true },
})
