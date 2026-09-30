import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl({ compress: true })],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900, // three alone is ~720 kB min (~190 kB gzip)
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) requires the function form
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) return 'motion'
        },
      },
    },
  },
})
