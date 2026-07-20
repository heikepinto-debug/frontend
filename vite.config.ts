import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Carimbo de versão: sem isto não há forma de saber que código alguém está
// a correr. Custou-nos horas de diagnóstico a descobrir um cliente preso
// numa versão antiga — com o carimbo, ver-se-ia num segundo.
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ')
const PACOTE = 'v42'   // número do pacote — actualizar a cada entrega

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(BUILD), __APP_PACKAGE__: JSON.stringify(PACOTE) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registamos à mão no main.tsx para poder verificar actualizações e
      // avisar o utilizador. Sem isto o plugin injectava um segundo registo.
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'OficinaHub',
        short_name: 'OficinaHub',
        description: 'Plataforma de gestão de oficinas',
        theme_color: '#3a3a38',
        background_color: '#3a3a38',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
})
