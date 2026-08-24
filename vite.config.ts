import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Carnet Carburant',
        short_name: 'Carburant',
        description: 'Suivi des pleins de la famille : litres, prix, kilométrage et photos de pompe.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F3F1EC',
        background_color: '#F3F1EC',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Appui long sur l'icône (Android/desktop) : entrées rapides
        shortcuts: [
          {
            name: 'Saisir un plein',
            short_name: 'Plein',
            url: '/?action=new',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Saisir une recharge',
            short_name: 'Recharge',
            url: '/?action=recharge',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        launch_handler: { client_mode: 'focus-existing' },
      },
      workbox: {
        navigateFallback: 'index.html',
      },
    }),
  ],
})
