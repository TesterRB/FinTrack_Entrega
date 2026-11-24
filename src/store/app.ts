/**
 * Estado global de la app (zustand): sesión, datos del usuario y todas las acciones que los modifican.
 *
 * Las pantallas leen con `useApp((s) => s.datos)` y llaman acciones como `agregarMovimientos`.
 * Cada cambio se aplica primero en pantalla (optimista) y luego se guarda en el backend; si falla,
 * se revierte y se avisa al usuario (ver `mutar`).
 */
import { create } from 'zustand'
import { backend, type Estado } from '../data'
import type {
  Actividad, Aliado, AporteMeta, EstadoFactura, Extracto, Factura, Meta, Movimiento, Plan, Presupuesto, Promocion, Recompensa,
} from '../lib/tipos'
import { hoyISO, mesActual, mesAnterior, mesDe, nombreMes, uid } from '../lib/formato'
import { calcularFinScore, DIA_CIERRE } from '../lib/finscore'
import { ClasificadorCategorias, entrenarConUsuario } from '../ml/clasificador'
import { BETA } from '../lib/planes'
import { registrarError, registrarEvento } from '../lib/telemetria'

/** Errores de red (no de datos): la app muestra "sin conexión" con un botón para reintentar. */
const esErrorDeRed = (e: unknown) => /failed to fetch|network|load failed|sin conexión|timeout/i.test((e as Error)?.message ?? '')

interface Store {
  /** Terminó el arranque (se sabe si hay sesión). Antes de esto se muestra el splash. */
  listo: boolean
  autenticado: boolean
  /** Datos del usuario; null mientras no hay sesión. */
  datos: Estado | null
  /** Error para mostrar en la pantalla de acceso. */
  error: string | null
  /** Hay sesión guardada pero no se pudieron cargar los datos (casi siempre, sin internet). */
  fallaCarga: string | null
  /** Android: el navegador está abierto con Google y se espera el regreso por el enlace profundo. */
  esperandoGoogle: boolean
  /** La sesión viene de un enlace de recuperación: se pide la contraseña nueva antes de entrar. */
  recuperandoClave: boolean
  /** Mensaje emergente (toast) actual. */
  aviso: { texto: string; tipo: 'ok' | 'error' | 'premio' } | null
  /** Clasificador personal, reentrenado cuando el usuario confirma o corrige categorías. */
  modelo: ClasificadorCategorias
  /** Arranque: revisa la sesión, carga los datos y cierra los meses pendientes del FinScore. */
  iniciar(): Promise<void>
  entrar(email: string, clave: string): Promise<void>
  registrar(nombre: string, email: string, clave: string): Promise<{ confirmar: boolean }>
  entrarConGoogle(): Promise<void>
  /** Enlace profundo de regreso: Google, confirmación de correo o recuperación de contraseña. */
  completarRetorno(url: string): Promise<void>
  cancelarEsperaGoogle(): void
  recuperarClave(email: string): Promise<void>
  cambiarClave(nueva: string): Promise<void>
  reenviarConfirmacion(email: string): Promise<void>
  salir(): Promise<void>
  avisar(texto: string, tipo?: 'ok' | 'error' | 'premio'): void
  /** Crea movimientos; los que no traen categoría se clasifican con el modelo. */
  agregarMovimientos(movs: Partial<Movimiento>[]): Promise<Movimiento[]>
  actualizarMovimiento(id: string, cambios: Partial<Movimiento>): Promise<void>
  eliminarMovimiento(id: string): Promise<void>
  /** Guarda el resultado de una conciliación: el extracto, los movimientos confirmados (`ajustes`) y los que faltaban (`nuevos`). */
  registrarExtracto(extracto: Extracto, nuevos: Partial<Movimiento>[], ajustes: { id: string; cambios: Partial<Movimiento> }[]): Promise<void>
  guardarPresupuesto(p: Presupuesto): Promise<void>
  eliminarPresupuesto(id: string): Promise<void>
  guardarMeta(m: Meta): Promise<void>
  eliminarMeta(id: string): Promise<void>
  aportarMeta(metaId: string, monto: number): Promise<void>
  /** Deja constancia de una acción que suma al FinScore (revisiones, retos). Nunca muestra error. */
  registrarActividad(tipo: Actividad['tipo'], ref?: string): Promise<void>
  /** Sube la foto y guarda la factura (con el resultado del OCR y la validación ya calculados). */
  enviarFactura(f: Omit<Factura, 'id' | 'usuarioId' | 'usuarioNombre' | 'creadoEn' | 'imagen'> & { imagen: string }): Promise<Factura>
  /** Admin: aprueba o rechaza una factura pendiente. */
  revisarFactura(id: string, estado: EstadoFactura, motivo: string | null): Promise<void>
  guardarAliado(a: Aliado): Promise<void>
  guardarPromocion(p: Promocion): Promise<void>
  guardarRecompensa(r: Recompensa): Promise<void>
  actualizarPerfil(c: { nombre?: string; diaDePago?: number }): Promise<void>
  iniciarPago(plan: Plan, cupon: string | null, montoCentavos: number): ReturnType<typeof backend.iniciarPago>
  confirmarPagoDemo(referencia: string, aprobado: boolean): Promise<void>
}

/** Marca de tiempo ISO para `creadoEn`. */
const ahora = () => new Date().toISOString()

export const useApp = create<Store>((set, get) => {
  /** Aplica un cambio local inmediato (optimista) y persiste en el backend. */
  async function mutar<K extends keyof Estado>(clave: K, nuevo: (actual: Estado[K]) => Estado[K], persistir: () => Promise<void>) {
    const d = get().datos
    if (!d) return
    const previo = d[clave]
    set({ datos: { ...d, [clave]: nuevo(previo) } })
    try {
      await persistir()
    } catch (e) {
      set({ datos: { ...get().datos!, [clave]: previo } })
      registrarError('No se pudo guardar', { tabla: String(clave), mensaje: (e as Error).message })
      get().avisar(esErrorDeRed(e) ? 'Sin conexión: no se guardó el cambio. Inténtalo de nuevo.' : 'No se pudo guardar el cambio. Inténtalo de nuevo.', 'error')
      throw e
    }
  }

  /** Vuelve a entrenar el clasificador con las categorías que el usuario puso o confirmó. */
  function reentrenar() {
    const d = get().datos
    if (d) set({ modelo: entrenarConUsuario(d.movimientos) })
  }

  /** Cierra los meses pendientes (a partir del día DIA_CIERRE del mes siguiente) y emite recompensas. */
  async function cerrarMesesPendientes() {
    const d = get().datos
    if (!d) return
    const hoy = hoyISO()
    // Último mes que ya se puede cerrar: el anterior si hoy es día 6 o más; si no, el de hace dos meses.
    const limite = Number(hoy.slice(8, 10)) >= DIA_CIERRE ? mesAnterior(mesActual()) : mesAnterior(mesActual(), 2)
    const desde = mesDe(d.perfil.creadoEn.slice(0, 10))
    // Del más reciente hacia atrás, hasta encontrar uno ya cerrado (los anteriores también lo están).
    for (let mes = limite; mes >= desde; mes = mesAnterior(mes)) {
      if (d.cierres.some((c) => c.mes === mes)) break
      const { total } = calcularFinScore(d, mes)
      const { cierre, recompensa } = await backend.cerrarMes(mes, total)
      const actual = get().datos!
      set({ datos: { ...actual, cierres: [...actual.cierres, cierre], recompensas: recompensa ? [...actual.recompensas, recompensa] : actual.recompensas } })
      if (recompensa) {
        get().avisar(
          BETA
            ? `¡Cerraste ${nombreMes(mes, false)} con ${cierre.puntaje} puntos! Muy buen mes.`
            : recompensa.diasPremium
            ? `¡FinScore perfecto en ${mes}! Ganaste un cupón del ${recompensa.descuento} % y ${recompensa.diasPremium} días Premium.`
            : `¡Llegaste a ${cierre.puntaje} puntos! Ganaste un cupón del ${recompensa.descuento} %.`,
          'premio',
        )
        // El mes regalado cambia el perfil en el servidor: se recarga.
        if (recompensa.diasPremium) set({ datos: { ...get().datos!, perfil: (await backend.cargar()).perfil } })
      }
    }
  }

  /** Un arranque completo: sesión, datos, actividad del día y cierre de meses pendientes. */
  async function arrancar() {
    let sesion: string | null = null
    try {
      sesion = await backend.sesion()
      if (!sesion) return set({ listo: true, autenticado: false, fallaCarga: null, recuperandoClave: false })
      // Entró con un enlace de recuperación: primero elige la contraseña nueva (pantalla NuevaClave).
      if (backend.necesitaNuevaClave()) return set({ listo: true, autenticado: false, fallaCarga: null, recuperandoClave: true })
      const datos = await backend.cargar()
      set({ datos, autenticado: true, listo: true, error: null, fallaCarga: null })
      reentrenar()
      // Una actividad de inicio de sesión por día (para medir uso; no suma puntos). Se espera a que se guarde
      // para que un arranque siguiente ya la vea y no la duplique.
      if (!datos.actividades.some((a) => a.tipo === 'inicio_sesion' && a.fecha.startsWith(hoyISO()))) await get().registrarActividad('inicio_sesion')
      await cerrarMesesPendientes()
    } catch (e) {
      const mensaje = (e as Error).message
      registrarError('No se pudieron cargar los datos', { mensaje, con_sesion: !!sesion })
      // Con sesión guardada no se manda al usuario al login: se le ofrece reintentar.
      if (sesion) set({ listo: true, autenticado: false, fallaCarga: esErrorDeRed(e) ? 'Sin conexión a internet.' : 'Hubo un problema al traer tus datos.' })
      else set({ listo: true, autenticado: false, error: esErrorDeRed(e) ? 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' : 'Algo no salió bien. Inténtalo de nuevo en un momento.' })
    }
  }

  /**
   * Cola de arranques: `iniciar` puede llamarse varias veces casi a la vez (React ejecuta los efectos dos veces
   * en desarrollo, y entrar a la demo o iniciar sesión también arranca). Si dos arranques corrieran juntos,
   * ambos verían el mismo mes sin cerrar y lo cerrarían dos veces. Encadenados, cada uno ve lo que dejó el anterior.
   */
  let arranqueEnCurso: Promise<void> = Promise.resolve()

  return {
    listo: false,
    autenticado: false,
    datos: null,
    error: null,
    fallaCarga: null,
    esperandoGoogle: false,
    recuperandoClave: false,
    aviso: null,
    modelo: new ClasificadorCategorias(),

    iniciar() {
      const turno = arranqueEnCurso.then(arrancar)
      // `arrancar` ya maneja sus errores; esto solo asegura que la cola nunca quede rechazada.
      arranqueEnCurso = turno.catch(() => undefined)
      return turno
    },
    async entrar(email, clave) {
      await backend.entrar(email, clave)
      registrarEvento('accion', 'sesion_iniciada', { metodo: 'correo' })
      await get().iniciar()
    },
    async registrar(nombre, email, clave) {
      const r = await backend.registrar(nombre, email, clave)
      registrarEvento('accion', 'cuenta_creada', { metodo: 'correo', requiere_confirmar: r.confirmar })
      if (!r.confirmar) await get().iniciar()
      return r
    },
    async entrarConGoogle() {
      set({ error: null })
      const r = await backend.entrarConGoogle()
      if (r === 'listo') {
        registrarEvento('accion', 'sesion_iniciada', { metodo: 'google' })
        await get().iniciar()
        // En Android se queda esperando el enlace de regreso (ver IntegracionNativa en components/Nativo.tsx).
      } else set({ esperandoGoogle: true })
    },
    async completarRetorno(url) {
      const deGoogle = get().esperandoGoogle
      try {
        const tipo = await backend.completarRetorno(url)
        if (tipo === 'recuperacion') registrarEvento('accion', 'enlace_recuperacion_abierto')
        else registrarEvento('accion', deGoogle ? 'sesion_iniciada' : 'correo_confirmado', { metodo: deGoogle ? 'google' : 'enlace' })
        await get().iniciar()
      } catch (e) {
        registrarError(deGoogle ? 'Google: retorno fallido' : 'Enlace de correo fallido', { mensaje: (e as Error).message })
        set({ error: (e as Error).message })
      } finally {
        set({ esperandoGoogle: false })
      }
    },
    async recuperarClave(email) {
      await backend.recuperarClave(email)
      registrarEvento('accion', 'recuperacion_solicitada')
    },
    async cambiarClave(nueva) {
      await backend.cambiarClave(nueva)
      registrarEvento('accion', 'clave_cambiada')
      set({ recuperandoClave: false })
      get().avisar('Listo: tu contraseña quedó actualizada.')
      await get().iniciar()
    },
    async reenviarConfirmacion(email) {
      await backend.reenviarConfirmacion(email)
      registrarEvento('accion', 'confirmacion_reenviada')
    },
    cancelarEsperaGoogle() {
      set({ esperandoGoogle: false })
    },
    async salir() {
      await backend.salir()
      registrarEvento('accion', 'sesion_cerrada')
      set({ autenticado: false, datos: null, recuperandoClave: false })
    },
    avisar(texto, tipo = 'ok') {
      set({ aviso: { texto, tipo } })
      // Se cierra solo, salvo que ya lo haya reemplazado otro aviso.
      setTimeout(() => get().aviso?.texto === texto && set({ aviso: null }), tipo === 'premio' ? 7000 : 3500)
    },

    async agregarMovimientos(parciales) {
      const modelo = get().modelo
      const nuevos: Movimiento[] = parciales.map((p) => {
        const sugerida = p.categoria ? null : modelo.categorizar(p.descripcion ?? '', p.monto)
        return {
          id: uid(),
          fecha: p.fecha ?? hoyISO(),
          descripcion: p.descripcion ?? 'Movimiento',
          monto: p.monto ?? 0,
          categoria: p.categoria ?? sugerida!.categoria,
          confianza: p.categoria ? (p.confianza ?? null) : sugerida!.confianza,
          cuentaId: p.cuentaId ?? null,
          origen: p.origen ?? 'manual',
          conciliado: p.conciliado ?? false,
          extractoId: p.extractoId ?? null,
          nota: p.nota,
          creadoEn: ahora(),
        }
      })
      await mutar('movimientos', (l) => [...l, ...nuevos], () => backend.guardar('movimientos', nuevos))
      registrarEvento('accion', 'movimientos_agregados', { cantidad: nuevos.length, origen: nuevos[0]?.origen, categoria_auto: nuevos.filter((m) => m.confianza !== null).length })
      if (nuevos.some((m) => m.confianza === null)) reentrenar()
      return nuevos
    },
    async actualizarMovimiento(id, cambios) {
      const actual = get().datos?.movimientos.find((m) => m.id === id)
      if (!actual) return
      // Si el usuario toca la categoría, pasa a ser un ejemplo etiquetado para el modelo.
      const nuevo = { ...actual, ...cambios, ...(cambios.categoria ? { confianza: null } : {}) }
      await mutar('movimientos', (l) => l.map((m) => (m.id === id ? nuevo : m)), () => backend.guardar('movimientos', [nuevo]))
      if (cambios.categoria || cambios.confianza === null) reentrenar()
    },
    async eliminarMovimiento(id) {
      await mutar('movimientos', (l) => l.filter((m) => m.id !== id), () => backend.eliminar('movimientos', id))
    },
    async registrarExtracto(extracto, nuevos, ajustes) {
      await mutar('extractos', (l) => [...l, extracto], () => backend.guardar('extractos', [extracto]))
      registrarEvento('accion', 'extracto_importado', { filas: extracto.filas, conciliados: ajustes.length, agregados: nuevos.length })
      const movs = get().datos!.movimientos
      const ajustados = ajustes.map(({ id, cambios }) => ({ ...movs.find((m) => m.id === id)!, ...cambios }))
      if (ajustados.length) {
        await mutar('movimientos', (l) => l.map((m) => ajustados.find((a) => a.id === m.id) ?? m), () => backend.guardar('movimientos', ajustados))
      }
      if (nuevos.length) await get().agregarMovimientos(nuevos)
    },

    async guardarPresupuesto(p) {
      await mutar('presupuestos', (l) => [...l.filter((x) => x.id !== p.id), p], () => backend.guardar('presupuestos', [p]))
      registrarEvento('accion', 'presupuesto_guardado')
    },
    async eliminarPresupuesto(id) {
      await mutar('presupuestos', (l) => l.filter((x) => x.id !== id), () => backend.eliminar('presupuestos', id))
    },
    async guardarMeta(m) {
      await mutar('metas', (l) => [...l.filter((x) => x.id !== m.id), m], () => backend.guardar('metas', [m]))
      registrarEvento('accion', 'meta_guardada')
    },
    async eliminarMeta(id) {
      await mutar('metas', (l) => l.filter((x) => x.id !== id), () => backend.eliminar('metas', id))
    },
    async aportarMeta(metaId, monto) {
      const meta = get().datos!.metas.find((m) => m.id === metaId)!
      // El aporte queda registrado (cuenta para el FinScore) y el total de la meta se actualiza.
      const aporte: AporteMeta = { id: uid(), metaId, monto, fecha: hoyISO() }
      await mutar('aportes', (l) => [...l, aporte], () => backend.guardar('aportes', [aporte]))
      await get().guardarMeta({ ...meta, ahorrado: meta.ahorrado + monto })
    },
    async registrarActividad(tipo, ref) {
      const a: Actividad = { id: uid(), tipo, ref, fecha: ahora() }
      // `mutar` ya revierte y avisa; aquí se ignora el error para no interrumpir el flujo que la llamó.
      await mutar('actividades', (l) => [...l, a], () => backend.guardar('actividades', [a])).catch(() => undefined)
    },

    async enviarFactura(f) {
      const d = get().datos!
      const id = uid()
      const imagen = await backend.subirImagen(f.imagen, id)
      const factura: Factura = { ...f, id, imagen, usuarioId: d.perfil.id, usuarioNombre: d.perfil.nombre, creadoEn: ahora() }
      await mutar('facturas', (l) => [...l, factura], () => backend.guardar('facturas', [factura]))
      registrarEvento('accion', 'factura_enviada', { estado: factura.estado, con_promocion: !!factura.promocionId })
      return factura
    },
    async revisarFactura(id, estado, motivo) {
      const f = get().datos!.facturas.find((x) => x.id === id)!
      const nueva = { ...f, estado, motivo }
      // UPDATE (no upsert): la factura es de otro usuario y solo el admin puede cambiar su estado.
      await mutar('facturas', (l) => l.map((x) => (x.id === id ? nueva : x)), () => backend.actualizar('facturas', id, { estado, motivo }))
    },
    async guardarAliado(a) {
      await mutar('aliados', (l) => [...l.filter((x) => x.id !== a.id), a], () => backend.guardar('aliados', [a]))
    },
    async guardarPromocion(p) {
      await mutar('promociones', (l) => [...l.filter((x) => x.id !== p.id), p], () => backend.guardar('promociones', [p]))
    },
    async guardarRecompensa(r) {
      await mutar('recompensas', (l) => [...l.filter((x) => x.id !== r.id), r], () => backend.guardar('recompensas', [r]))
    },
    async actualizarPerfil(c) {
      const d = get().datos!
      set({ datos: { ...d, perfil: { ...d.perfil, ...c } } })
      await backend.actualizarPerfil(c)
    },
    async iniciarPago(plan, cupon, montoCentavos) {
      const r = await backend.iniciarPago(plan, cupon, montoCentavos)
      const d = get().datos!
      set({ datos: { ...d, pagos: [...d.pagos, r.pago] } })
      return r
    },
    async confirmarPagoDemo(referencia, aprobado) {
      await backend.confirmarPagoDemo?.(referencia, aprobado)
      set({ datos: await backend.cargar() })
    },
  }
})

/** `demo` o `supabase`: algunas pantallas muestran ayudas distintas según el modo. */
export const modoBackend = backend.modo
