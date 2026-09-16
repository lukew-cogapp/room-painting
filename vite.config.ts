import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://lukew-cogapp.github.io/room-painting/ on Pages, root in dev.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/room-painting/' : '/',
  plugins: [react(), tailwindcss()],
})
