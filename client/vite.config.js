import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({ plugins: [react(), VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.js', registerType: 'autoUpdate', devOptions: { enabled: true, type: 'module' }, manifest: {
  name: process.env.VITE_APP_NAME || 'Tumblrr', short_name: process.env.VITE_APP_NAME || 'Tumblrr', start_url: '/', display: 'standalone', background_color: '#f4f4f8', theme_color: '#5340e8',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] } })] });
