import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Artesanías - Tienda Online',
        short_name: 'Artesanías',
        description: 'Tienda online de artesanías colombianas',
        theme_color: '#8b4513',
        background_color: '#f8f4f0',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheKeyWillBeUsed: async ({ request }) => {
                return `${request.url}?${Date.now()}`;
              }
            }
          }
        ]
      }
    })
  ],

  // ============================================================
  // 🔒 CONFIGURACIÓN DE SEGURIDAD DEL SERVIDOR DE DESARROLLO
  // ============================================================
  server: {
    // ⚠️ CRÍTICO: host: 'localhost' previene exposición en red
    // NUNCA cambiar a '0.0.0.0' o true en entornos compartidos
    host: 'localhost',
    
    // Puerto del servidor
    port: 5173,

    // ============================================================
    // 🔒 SEGURIDAD DEL FILESYSTEM - Protege archivos sensibles
    // ============================================================
    fs: {
      // Activa restricciones estrictas - previene acceso fuera de la raíz
      strict: true,
      
      // Deniega explícitamente archivos sensibles
      deny: [
        // Variables de entorno
        '.env',
        '.env.*',
        '.env.local',
        '.env.development',
        '.env.production',
        
        // Certificados y claves
        '*.pem',
        '*.crt',
        '*.key',
        '*.csr',
        
        // Archivos de base de datos
        '*.db',
        '*.sqlite',
        '*.sql',
        
        // Archivos de configuración sensibles
        'package-lock.json',
        'yarn.lock',
        
        // Archivos de sistema
        '.DS_Store',
        'Thumbs.db',
        
        // Archivos de respaldo
        '*.backup',
        '*.old',
        '*.swp',
      ],
    },
  },

  // ============================================================
  // 🔒 CONFIGURACIÓN DE BUILD (PRODUCCIÓN)
  // ============================================================
  build: {
    // ⚠️ CRÍTICO: sourcemap: false en producción
    // Los sourcemaps exponen tu código original completo
    // false = no generar sourcemaps en producción
    sourcemap: false,
    
    // Minificar código (mejora rendimiento)
    minify: 'esbuild',
    
    // Limpiar directorio de salida antes de build
    emptyOutDir: true,
  },
})