// Configuración de Vite (desarrollo, build de producción) y de Vitest (pruebas).
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  // La versión de package.json queda disponible en la app como __VERSION_APP__ (ver src/vite-env.d.ts).
  define: { __VERSION_APP__: JSON.stringify(version) },
  build: {
    // pdf.js y Tesseract son grandes, pero se cargan bajo demanda: se sube el umbral del aviso de tamaño.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Librerías grandes en archivos separados: el navegador las guarda en caché entre versiones de la app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          graficas: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  // Las pruebas del motor (src/ml/ml.test.ts) son funciones puras: no necesitan un DOM simulado.
  test: { environment: 'node' },
  // `as never`: la clave `test` es de Vitest y no está en los tipos de Vite.
} as never)
