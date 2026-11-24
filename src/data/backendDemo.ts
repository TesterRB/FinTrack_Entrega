/**
 * Backend de demostración: todo vive en el navegador (localStorage).
 * Permite usar la app completa sin cuentas en la nube. "Entrar" con cualquier correo carga un perfil de
 * ejemplo con 4 meses de movimientos (`demo.ts`); "Crear cuenta" empieza con un perfil vacío.
 * Los pagos se simulan con `confirmarPagoDemo` y las recompensas se calculan en el cliente.
 */
import type { Backend, Estado, Tabla } from './backend'
import type { Pago, Perfil, Plan } from '../lib/tipos'
import { hoyISO, mesActual, mesAnterior, sumarDias, uid } from '../lib/formato'
import { RECOMPENSAS } from '../lib/planes'
import { calcularFinScore, crearRecompensa, DIA_CIERRE } from '../lib/finscore'
import { ALIADOS_DEMO, CUENTAS_DEMO, actividadesDemo, generarDemo, inicioDemo, metasDemo, presupuestosDemo, promocionesDemo } from './demo'

/** Clave de localStorage con todo el `Estado`. El sufijo de versión separa formatos de datos incompatibles. */
const CLAVE = 'fintrack-demo-v1'
/** Marca de "sesión iniciada" (salir la borra pero conserva los datos). */
const CLAVE_SESION = 'fintrack-demo-sesion'

/** Lee el estado guardado; null si no hay o si está corrupto. */
const leer = (): Estado | null => {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as Estado) : null
  } catch {
    return null
  }
}
/** Guarda el estado. Si el almacenamiento está lleno (fotos de facturas), se avisa en consola sin romper la app. */
const escribir = (e: Estado) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e))
  } catch (err) {
    console.warn('No se pudo guardar el estado demo', err)
  }
}

/** Estado del perfil de ejemplo (exportado para revisar su coherencia en pruebas). */
export function estadoInicial(nombre: string, email: string, conEjemplos: boolean): Estado {
  const hoy = hoyISO()
  const perfil: Perfil = {
    id: 'demo-usuario',
    nombre,
    email,
    plan: 'starter',
    planHasta: null,
    // En la demo el usuario es admin para poder probar el panel de comercios aliados.
    rol: 'admin',
    pruebaHasta: sumarDias(hoy, RECOMPENSAS.diasPrueba),
    premiumHasta: null,
    diaDePago: 15,
    // Con datos de ejemplo la cuenta existe desde el día de su primer movimiento (hace cuatro meses).
    creadoEn: conEjemplos ? `${inicioDemo()}T09:00:00` : new Date().toISOString(),
  }
  const vacio: Estado = {
    perfil, cuentas: CUENTAS_DEMO, movimientos: [], presupuestos: [], metas: [], aportes: [], extractos: [], actividades: [],
    recompensas: [], cierres: [], pagos: [], facturas: [], aliados: ALIADOS_DEMO, promociones: promocionesDemo(),
  }
  if (!conEjemplos) return vacio
  const { movimientos, extractos } = generarDemo(hoy)
  const { metas, aportes } = metasDemo(hoy)
  const conDatos: Estado = { ...vacio, movimientos, extractos, metas, aportes, presupuestos: presupuestosDemo(), actividades: actividadesDemo(hoy) }
  // Cierres del FinScore calculados con la misma fórmula de la app (nunca un puntaje inventado). El último mes
  // cerrable lo cierra la app al entrar, igual que con una cuenta real, y avisa el resultado.
  const ultimoCerrable = Number(hoy.slice(8, 10)) >= DIA_CIERRE ? mesAnterior(mesActual()) : mesAnterior(mesActual(), 2)
  for (let mes = inicioDemo().slice(0, 7); mes < ultimoCerrable; mes = mesAnterior(mes, -1)) {
    const cerradoEl = `${mesAnterior(mes, -1)}-0${DIA_CIERRE}`
    const { total } = calcularFinScore(conDatos, mes)
    const recompensa = crearRecompensa(mes, total, cerradoEl)
    if (recompensa) conDatos.recompensas.push(recompensa)
    conDatos.cierres.push({ id: uid(), mes, puntaje: total, recompensaId: recompensa?.id ?? null, creadoEn: `${cerradoEl}T06:00:00` })
  }
  return conDatos
}

export function crearBackendDemo(): Backend {
  // El estado vive en memoria y se copia a localStorage después de cada cambio.
  let estado = leer()
  const persistir = () => estado && escribir(estado)

  return {
    modo: 'demo',
    async sesion() {
      return localStorage.getItem(CLAVE_SESION) && estado ? estado.perfil.id : null
    },
    async entrar(email) {
      // El perfil de ejemplo es siempre el de Valentina (los datos son suyos), con el correo que se escribió.
      if (!estado) estado = estadoInicial('Valentina Gómez', email, true)
      localStorage.setItem(CLAVE_SESION, '1')
      persistir()
    },
    async registrar(nombre, email) {
      estado = estadoInicial(nombre, email, false)
      localStorage.setItem(CLAVE_SESION, '1')
      persistir()
      return { confirmar: false }
    },
    async entrarConGoogle() {
      // En la demo "Google" carga el perfil de ejemplo, igual que entrar con cualquier correo.
      if (!estado) estado = estadoInicial('Valentina Gómez', 'valentina.gomez@demo.fintrack', true)
      localStorage.setItem(CLAVE_SESION, '1')
      persistir()
      return 'listo'
    },
    async completarRetorno() {
      return 'sesion'
    },
    necesitaNuevaClave() {
      return false
    },
    async recuperarClave() {},
    async cambiarClave() {},
    async reenviarConfirmacion() {},
    async reportar() {},
    async enviarComentario(c) {
      try {
        const previos = JSON.parse(localStorage.getItem('fintrack-demo-comentarios') ?? '[]') as unknown[]
        localStorage.setItem('fintrack-demo-comentarios', JSON.stringify([...previos, { ...c, creadoEn: new Date().toISOString() }]))
      } catch {
        /* sin almacenamiento */
      }
    },
    async versionPublicada() {
      return null
    },
    async salir() {
      localStorage.removeItem(CLAVE_SESION)
    },
    async cargar() {
      if (!estado) throw new Error('Sin sesión')
      return structuredClone(estado)
    },
    async guardar(tabla, filas) {
      if (!estado) return
      // Upsert por id, igual que en Supabase.
      const lista = estado[tabla] as { id: string }[]
      const porId = new Map(lista.map((x) => [x.id, x]))
      ;(filas as { id: string }[]).forEach((f) => porId.set(f.id, f))
      ;(estado[tabla] as unknown) = [...porId.values()]
      persistir()
    },
    async eliminar(tabla: Tabla, id) {
      if (!estado) return
      ;(estado[tabla] as unknown) = (estado[tabla] as { id: string }[]).filter((x) => x.id !== id)
      persistir()
    },
    async actualizar(tabla, id, cambios) {
      if (!estado) return
      ;(estado[tabla] as unknown) = (estado[tabla] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...cambios } : x))
      persistir()
    },
    async actualizarPerfil(cambios) {
      if (!estado) return
      estado.perfil = { ...estado.perfil, ...cambios }
      persistir()
    },
    async subirImagen(dataUrl) {
      // En la demo la propia imagen (dataURL) es la referencia.
      return dataUrl
    },
    async urlImagen(ref) {
      return ref
    },
    async cerrarMes(mes, puntaje) {
      // En la demo el cliente decide la recompensa; en Supabase la decide el servidor.
      const recompensa = crearRecompensa(mes, puntaje, hoyISO())
      const cierre = { id: uid(), mes, puntaje, recompensaId: recompensa?.id ?? null, creadoEn: new Date().toISOString() }
      if (estado) {
        estado.cierres.push(cierre)
        if (recompensa) {
          estado.recompensas.push(recompensa)
          if (recompensa.diasPremium) {
            // Los días de Premium se suman a los que ya tenga vigentes.
            const base = estado.perfil.premiumHasta && estado.perfil.premiumHasta > hoyISO() ? estado.perfil.premiumHasta : hoyISO()
            estado.perfil.premiumHasta = sumarDias(base, recompensa.diasPremium)
          }
        }
        persistir()
      }
      return { cierre, recompensa }
    },
    async iniciarPago(plan: Plan, cupon, montoCentavos) {
      const pago: Pago = { id: uid(), referencia: `FT-${Date.now()}`, plan, montoCentavos, cupon, estado: 'pendiente', creadoEn: new Date().toISOString() }
      estado?.pagos.push(pago)
      persistir()
      return { pago }
    },
    async confirmarPagoDemo(referencia, aprobado) {
      if (!estado) return
      const pago = estado.pagos.find((p) => p.referencia === referencia)
      if (!pago) return
      pago.estado = aprobado ? 'aprobado' : 'rechazado'
      if (aprobado) {
        // Igual que el webhook real: cada pago aprobado suma 30 días de plan y marca el cupón como usado.
        const base = estado.perfil.planHasta && estado.perfil.planHasta > hoyISO() ? estado.perfil.planHasta : hoyISO()
        estado.perfil.plan = pago.plan
        estado.perfil.planHasta = sumarDias(base, 30)
        if (pago.cupon) estado.recompensas = estado.recompensas.map((r) => (r.codigo === pago.cupon ? { ...r, usado: true } : r))
      }
      persistir()
    },
  }
}

/** Reinicia la demo (botón en Perfil). */
export function reiniciarDemo() {
  localStorage.removeItem(CLAVE)
  localStorage.removeItem(CLAVE_SESION)
}
