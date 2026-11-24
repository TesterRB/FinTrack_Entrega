/**
 * Puente con la plataforma: detecta si la app corre en el navegador o dentro del APK (Capacitor)
 * y agrupa las llamadas a plugins nativos. Los plugins se importan bajo demanda para no cargarlos en la web.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

/** true dentro del APK (WebView de Capacitor); false en el navegador. */
export const esNativo = Capacitor.isNativePlatform()
/** Plataforma actual, tal como la reporta Capacitor (se envía con cada evento de monitoreo). */
export const plataforma = Capacitor.getPlatform() as 'android' | 'ios' | 'web'

/**
 * Versión de la app (package.json), inyectada por Vite en `vite.config.ts` (`define`).
 * El número de compilación de Android se lee con App.getInfo().
 */
export const VERSION_APP: string = __VERSION_APP__

/**
 * Esquema propio para volver a la app después de iniciar sesión con Google en el navegador del sistema.
 * Debe coincidir con el intent-filter de AndroidManifest.xml y estar en las "Redirect URLs" de Supabase.
 */
export const URL_RETORNO_NATIVA = 'co.fintrack.app://auth/callback'

/** Color de los íconos de la barra de estado según el tema de la app (no el del sistema). */
function sincronizarBarras() {
  const oscuro = document.documentElement.classList.contains('dark')
  // DARK = íconos claros (fondo oscuro); LIGHT = íconos oscuros (fondo lavanda).
  SystemBars.setStyle({ style: oscuro ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
}

/** Ajustes de "app instalada" que solo aplican dentro del APK. */
export function prepararNativo() {
  if (!esNativo) return
  document.documentElement.classList.add('nativo')
  sincronizarBarras()
  // El tema se cambia con una clase en <html>: se observa para mantener la barra de estado legible.
  new MutationObserver(sincronizarBarras).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

/** El splash nativo se queda hasta que la app tenga algo que mostrar (evita el destello en blanco). */
export async function ocultarSplash() {
  if (!esNativo) return
  const { SplashScreen } = await import('@capacitor/splash-screen')
  await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined)
}

/** Vibración con el motor háptico de Android. `fuerte` usa el patrón de "éxito" del sistema. */
export async function vibrarNativo(patron: 'leve' | 'medio' | 'fuerte') {
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
  if (patron === 'fuerte') return Haptics.notification({ type: NotificationType.Success })
  return Haptics.impact({ style: patron === 'leve' ? ImpactStyle.Light : ImpactStyle.Medium })
}

/** Datos del dispositivo para el monitoreo (sin identificadores personales). */
export async function infoDispositivo(): Promise<Record<string, string | number | boolean>> {
  const base = {
    idioma: navigator.language,
    pantalla: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    tema: document.documentElement.classList.contains('dark') ? 'oscuro' : 'claro',
  }
  if (!esNativo) return { ...base, dispositivo: navigator.userAgent.slice(0, 120) }
  const [{ Device }, { App }] = await Promise.all([import('@capacitor/device'), import('@capacitor/app')])
  const [d, app] = await Promise.all([Device.getInfo(), App.getInfo()])
  return {
    ...base,
    dispositivo: `${d.manufacturer} ${d.model}`,
    so: `${d.operatingSystem} ${d.osVersion}`,
    android_sdk: d.androidSDKVersion ?? 0,
    webview: d.webViewVersion,
    compilacion: app.build,
    emulador: d.isVirtual,
  }
}
