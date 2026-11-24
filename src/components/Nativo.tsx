/** Integración con Android (Capacitor): enlaces profundos, botón atrás, error de carga y aviso de versión nueva. */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, RefreshCw, WifiOff } from 'lucide-react'
import { App as AppNativa } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { useApp } from '../store/app'
import { backend } from '../data'
import type { VersionPublicada } from '../data/backend'
import { esNativo, URL_RETORNO_NATIVA } from '../lib/plataforma'
import { registrarEvento } from '../lib/telemetria'
import { Boton, Hoja } from './ui'
import { Marca } from './Logo'

/** Enlaces ya canjeados: un código de Supabase sirve una sola vez. */
const enlacesProcesados = new Set<string>()

/**
 * Integración con Android, montada una sola vez dentro del router:
 * - Enlace profundo co.fintrack.app://auth/callback: regreso de Google, confirmación de correo y
 *   recuperación de contraseña (también si el enlace abrió la app desde cero).
 * - Botón "atrás" del sistema: cierra la hoja abierta, vuelve a la pantalla anterior o minimiza la app.
 */
export function IntegracionNativa() {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const completarRetorno = useApp((s) => s.completarRetorno)
  const cancelarEsperaGoogle = useApp((s) => s.cancelarEsperaGoogle)

  useEffect(() => {
    if (!esNativo) return
    const procesar = (url?: string) => {
      if (!url?.startsWith(URL_RETORNO_NATIVA) || enlacesProcesados.has(url)) return
      enlacesProcesados.add(url)
      void completarRetorno(url)
    }
    const enlace = AppNativa.addListener('appUrlOpen', ({ url }) => procesar(url))
    // Si Android había cerrado la app mientras el usuario estaba en su correo, el enlace la abre desde cero.
    void AppNativa.getLaunchUrl().then((r) => procesar(r?.url))
    // Si el usuario cierra la pestaña de Google sin elegir cuenta, el botón vuelve a su estado normal.
    const cerrado = Browser.addListener('browserFinished', () => setTimeout(cancelarEsperaGoogle, 600))
    return () => {
      void enlace.then((h) => h.remove())
      void cerrado.then((h) => h.remove())
    }
  }, [completarRetorno, cancelarEsperaGoogle])

  useEffect(() => {
    if (!esNativo) return
    const atras = AppNativa.addListener('backButton', () => {
      // Las hojas (role="dialog") ya se cierran con Escape: se reutiliza ese camino.
      if (document.querySelector('[role="dialog"]')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        return
      }
      // react-router guarda en history.state.idx la posición en el historial: 0 = primera pantalla abierta.
      const indice = (window.history.state as { idx?: number } | null)?.idx ?? 0
      if (indice > 0) navegar(-1)
      else if (pathname !== '/' && pathname !== '/entrar') navegar('/', { replace: true })
      else void AppNativa.minimizeApp()
    })
    return () => void atras.then((h) => h.remove())
  }, [navegar, pathname])

  return null
}

/** Pantalla cuando hay sesión guardada pero no se pudieron cargar los datos (normalmente, sin internet). */
export function ErrorCarga({ mensaje }: { mensaje: string }) {
  const iniciar = useApp((s) => s.iniciar)
  const salir = useApp((s) => s.salir)
  const [reintentando, setReintentando] = useState(false)
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-suelo px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center text-tinta">
      <Marca tam={34} />
      <span className="mt-12 grid h-16 w-16 place-items-center rounded-full bg-superficie text-marca-600 shadow-suave"><WifiOff size={28} /></span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">No pudimos cargar tus datos</h1>
      <p className="mt-2 max-w-xs text-[15px] text-tenue">{mensaje} Revisa tu conexión y vuelve a intentarlo: no perdiste nada.</p>
      <Boton
        className="mt-7 w-full max-w-xs !rounded-full !py-3" cargando={reintentando}
        onClick={async () => { setReintentando(true); await iniciar(); setReintentando(false) }}
      >
        <RefreshCw size={18} /> Reintentar
      </Boton>
      <button className="mt-4 text-sm font-semibold text-tenue" onClick={() => void salir()}>Cerrar sesión</button>
    </div>
  )
}

/**
 * El APK se comparte a mano (no hay tienda que lo actualice). Cuando se publica una versión nueva en la
 * tabla `version_app`, la app lo avisa con un enlace de descarga. Si es obligatoria, no se puede omitir.
 */
export function AvisoVersion() {
  const [nueva, setNueva] = useState<VersionPublicada | null>(null)

  useEffect(() => {
    if (!esNativo) return
    let vivo = true
    void (async () => {
      try {
        const [publicada, info] = await Promise.all([backend.versionPublicada('android'), AppNativa.getInfo()])
        // Versión que el usuario ya pospuso con "Más tarde" (no se vuelve a ofrecer, salvo que salga otra).
        const omitida = Number(localStorage.getItem('fintrack-version-omitida') ?? 0)
        if (vivo && publicada?.url && publicada.codigo > Number(info.build) && (publicada.obligatoria || publicada.codigo > omitida)) {
          setNueva(publicada)
          registrarEvento('accion', 'aviso_version_mostrado', { codigo: publicada.codigo, actual: Number(info.build) })
        }
      } catch {
        /* sin conexión: se revisa en la próxima apertura */
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const omitir = () => {
    if (!nueva || nueva.obligatoria) return
    try {
      localStorage.setItem('fintrack-version-omitida', String(nueva.codigo))
    } catch {
      /* sin almacenamiento */
    }
    setNueva(null)
  }

  return (
    <Hoja abierto={!!nueva} onCerrar={omitir} titulo="Nueva versión disponible">
      {nueva && (
        <div className="space-y-4">
          <p className="text-[15px] text-tenue">
            Ya está lista la versión <b className="text-tinta">{nueva.nombre}</b> de FinTrack.{nueva.obligatoria ? ' Esta actualización es necesaria para seguir usando la app.' : ''}
          </p>
          {nueva.notas && <p className="whitespace-pre-line rounded-2xl bg-elevada p-4 text-sm text-tinta">{nueva.notas}</p>}
          <p className="text-[13px] text-tenue">Descárgala y ábrela: se instala encima de la que tienes y conservas tu cuenta y tus datos.</p>
          <div className="flex gap-2">
            {!nueva.obligatoria && <Boton variante="fantasma" onClick={omitir}>Más tarde</Boton>}
            <Boton
              className="flex-1"
              onClick={() => {
                registrarEvento('accion', 'actualizacion_descargada', { codigo: nueva.codigo })
                void Browser.open({ url: nueva.url })
              }}
            >
              <Download size={18} /> Descargar
            </Boton>
          </div>
        </div>
      )}
    </Hoja>
  )
}
