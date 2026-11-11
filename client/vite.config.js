import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config. The /api proxy was previously used to forward calls to a
// local Express + SQLite backend; that backend has been retired now that
// all data lives in Firebase (Auth + Firestore + Storage).
export default defineConfig({
  // Relative asset paths ('./assets/...') so the built app works when
  // Electron loads index.html from a file:// URL in the packaged build.
  // With the default '/', assets resolve against the filesystem root and
  // the renderer shows a blank/black window.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
})
