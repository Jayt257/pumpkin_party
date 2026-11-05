import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, as CrazyGames requires.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: 'index.html',
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
