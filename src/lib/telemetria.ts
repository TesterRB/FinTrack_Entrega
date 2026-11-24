/**
 * Monitoreo de la beta: uso de pantallas, acciones clave y errores, guardados en Supabase (tabla `eventos`).
 * Nunca se envían montos, descripciones ni otros datos financieros: solo nombres de eventos y conteos.
 *
 * Los eventos se acumulan en una cola y se envían por lotes (cada 8 s, al llegar a 20, o al pasar la app
 * a segundo plano) para no hacer una petición por cada toque. En modo demo no se registra nada.
 */
import { backend } from '../data'
import type { EventoApp, TipoEvento } from '../data/backend'
import { esNativo, infoDispositivo, plataforma, VERSION_APP } from './plataforma'

/** Identificador aleatorio de esta sesión de uso (no identifica al usuario). */
const sesion = (globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64)
/** Eventos pendientes de enviar. */
const cola: EventoApp[] = []
/** Cuántas veces se vio cada error en esta sesión (para limitar repeticiones). */
const erroresVistos = new Map<string, number>()
let temporizador: ReturnType<typeof setTimeout> | null = null
let enviando = false

/** Limita el tamaño de los datos adjuntos (p. ej. pilas de error largas). */
function recortar(datos: Record<string, unknown>) {
  const texto = JSON.stringify(datos)
  return texto.length > 6000 ? { recortado: texto.slice(0, 6000) } : datos
}

/** Encola un evento. Se envía en el próximo lote. */
export function registrarEvento(tipo: TipoEvento, nombre: string, datos: Record<string, unknown> = {}) {
  if (backend.modo !== 'supabase') return
  cola.push({ sesion, tipo, nombre: nombre.slice(0, 160), datos: recortar(datos), plataforma, versionApp: VERSION_APP })
  if (cola.length >= 20) void enviar()
  else if (!temporizador) temporizador = setTimeout(() => void enviar(), 8000)
}

/** Errores: como máximo 5 iguales por sesión, para no inundar la tabla si algo falla en bucle. */
export function registrarError(nombre: string, detalle: Record<string, unknown> = {}) {
  const clave = nombre.slice(0, 160)
  const veces = (erroresVistos.get(clave) ?? 0) + 1
  erroresVistos.set(clave, veces)
  if (veces > 5) return
  registrarEvento('error', clave, { ...detalle, ruta: location.pathname, en_linea: navigator.onLine })
}

/** Envía hasta 50 eventos de la cola. Si falla, los devuelve a la cola para el siguiente intento. */
async function enviar() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  if (enviando || !cola.length) return
  enviando = true
  const lote = cola.splice(0, 50)
  try {
    await backend.reportar(lote)
  } catch {
    // Sin conexión: se reintenta con el siguiente lote (con tope, para no crecer sin límite).
    if (cola.length < 200) cola.unshift(...lote)
  } finally {
    enviando = false
    if (cola.length && !temporizador) temporizador = setTimeout(() => void enviar(), 15000)
  }
}

let iniciada = false
/**
 * Activa la captura global de errores y registra la apertura de la app con datos del dispositivo.
 * Se llama una vez al arrancar (`main.tsx`); llamadas posteriores no hacen nada.
 */
export function iniciarTelemetria() {
  if (iniciada || backend.modo !== 'supabase') return
  iniciada = true
  window.addEventListener('error', (e) => registrarError(e.message || 'Error de JavaScript', { archivo: e.filename, linea: e.lineno, pila: (e.error as Error | undefined)?.stack?.slice(0, 1500) }))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined
    registrarError(typeof r === 'string' ? r : r?.message || 'Promesa rechazada', { pila: typeof r === 'object' ? r?.stack?.slice(0, 1500) : undefined })
  })
  // Al pasar a segundo plano (o cerrar la app) se envía lo pendiente.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviar()
  })
  void infoDispositivo()
    .then((info) => registrarEvento('inicio', esNativo ? 'app_abierta' : 'web_abierta', info))
    .catch(() => registrarEvento('inicio', esNativo ? 'app_abierta' : 'web_abierta'))
}
