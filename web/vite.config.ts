import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * A chunk's file name: the page or component it holds, or for code split out
 * of a library (which would otherwise be called "dist" or "es2015"), "lib-"
 * and the library's name.
 */
function chunkName(chunk: { name: string; facadeModuleId?: string | null; moduleIds: string[] }): string {
  if (chunk.name === 'vendor' || chunk.name === 'ui') return chunk.name
  const modules = chunk.facadeModuleId ? [chunk.facadeModuleId] : chunk.moduleIds
  const library = modules
    .map((id) => /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id.replaceAll('\\', '/'))?.[1])
    .find(Boolean)
  return library ? `lib-${library.replace('@', '').replace('/', '-')}` : chunk.name
}

export default defineConfig({
  // Tailwind still optimizes the stylesheet but leaves it readable (see cssMinify below).
  plugins: [react(), tailwindcss({ optimize: { minify: false } })],
  build: {
    // The stylesheet is kept readable (indented, one rule per line). It is
    // compressed in transit, so this barely changes what visitors download.
    cssMinify: false,
    rollupOptions: {
      output: {
        // The built site is laid out like a plain website: index.html,
        // css/style.css, js/script.js, images/ and fonts/, with plain names
        // (no content hash). vercel.json makes browsers re-check these files
        // on every visit, so nobody keeps an old copy after an update.
        entryFileNames: 'js/script.js',
        chunkFileNames: (chunk) => `js/${chunkName(chunk)}.js`,
        assetFileNames(asset) {
          const name = asset.names[0] ?? ''
          // The site's stylesheet is style.css; the address map's own stylesheet loads only with the map.
          if (name.endsWith('.css')) return name === 'index.css' ? 'css/style[extname]' : 'css/[name][extname]'
          if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(name)) return 'images/[name][extname]'
          if (/\.(woff2?|ttf|otf)$/i.test(name)) return 'fonts/[name][extname]'
          return 'assets/[name][extname]'
        },
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor'
          }
          if (id.includes('node_modules/radix-ui') || id.includes('node_modules/lucide-react') || id.includes('node_modules/sonner')) {
            return 'ui'
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
