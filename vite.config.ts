import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths allow Electron to load the compiled app from disk.
  base: './',
  plugins: [react()],
})
