import type { CapacitorConfig } from '@capacitor/cli'

// Misma app web empaquetada para Android. Flujo: npm run android:sync && npm run android:abrir
const config: CapacitorConfig = {
  appId: 'co.fintrack.app',
  appName: 'FinTrack',
  webDir: 'dist',
  // Color del WebView mientras carga (el "suelo" lavanda de la app): evita el destello blanco.
  backgroundColor: '#f6f5fb',
  android: {
    allowMixedContent: false,
    // La depuración remota del WebView queda activa solo en compilaciones debug (valor por defecto de Capacitor).
  },
  plugins: {
    SplashScreen: {
      // La app lo oculta cuando ya tiene algo que mostrar (src/lib/plataforma.ts → ocultarSplash).
      launchAutoHide: false,
      backgroundColor: '#6338ee',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    SystemBars: {
      // Android 15+ dibuja la app de borde a borde; la app ya respeta env(safe-area-inset-*).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
}

export default config
