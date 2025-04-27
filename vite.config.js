import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  root: __dirname,
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    hmr: {
      clientPort: 8080,
      host: '10.100.11.132'
    },
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      },
    },
  },
  define: {
    'process.env': {},
    'process.browser': true,
    'process.version': '"v16.0.0"',
    'process.platform': '"browser"',
    global: 'window'
  },
  resolve: {
    alias: {
      process: 'process/browser',
      stream: 'stream-browserify',
      util: 'util',
      buffer: 'buffer',
      events: 'events',
      crypto: 'crypto-browserify',
      _stream_duplex: 'stream-browserify/duplex',
      _stream_passthrough: 'stream-browserify/passthrough',
      _stream_readable: 'stream-browserify/readable',
      _stream_transform: 'stream-browserify/transform',
      _stream_writable: 'stream-browserify/writable'
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    },
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'simple-peer',
      'process/browser',
      'buffer',
      'util',
      'events',
      'stream-browserify',
      'crypto-browserify'
    ]
  }
}) 