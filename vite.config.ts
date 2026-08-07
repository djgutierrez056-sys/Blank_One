import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repo at /Blank_One/, so production builds need
  // that as the base path; the dev server still runs at the root.
  base: command === 'build' ? '/Blank_One/' : '/',
  plugins: [react(), tailwindcss()],
}))
