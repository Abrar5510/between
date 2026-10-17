import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The MCP App view ships as one self-contained HTML file served as a ui:// resource.
export default defineConfig({
  root: 'web/app',
  plugins: [viteSingleFile()],
  build: { outDir: '../../dist/app', emptyOutDir: true },
})
