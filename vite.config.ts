import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // duas páginas: o cardápio do cliente (/) e o painel da loja (/painel)
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        painel: fileURLToPath(new URL('./painel/index.html', import.meta.url)),
      },
    },
  },
})
