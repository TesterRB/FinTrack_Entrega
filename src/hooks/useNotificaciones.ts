/**
 * Avisos dentro de la app (no hay notificaciones push en la beta). Se calculan con los mismos modelos del
 * asistente cada vez que cambian los datos, así que siempre están al día y no ocupan la base de datos.
 * Solo se guarda, en el dispositivo, qué avisos ya vio el usuario.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import { useAnalitica, useDatos } from './useAnalitica'
import { CATEGORIAS } from '../lib/categorias'
import { DIA_CIERRE, calcularFinScore } from '../lib/finscore'
import { diasEntre, fechaISO, hoyISO, mesActual, mesAnterior, nombreMes, pesos, sumarDias } from '../lib/formato'

export type TipoAviso = 'alerta' | 'pago' | 'presupuesto' | 'racha' | 'logro' | 'cierre' | 'consejo'

export interface Aviso {
  /** Estable entre recálculos (incluye lo que lo hace único, p. ej. el mes o el movimiento): así se recuerda si ya se vio. */
  id: string
  tipo: TipoAviso
  titulo: string
  texto: string
  /** Fecha (o fecha y hora) para ordenar y mostrar "hoy", "ayer"… */
  fecha: string
  /** Ruta a la que lleva, o "registrar" para abrir el registro rápido. */
  destino: string
}

// Avisos ya vistos (por dispositivo), en localStorage.
const CLAVE = 'fintrack-avisos-vistos'
const leerVistos = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as string[]
  } catch {
    return []
  }
}
/** Ids de avisos vistos. Se guardan como máximo 400 (los más recientes primero). */
export const useVistos = create<{ vistos: string[]; marcar(ids: string[]): void }>((set, get) => ({
  vistos: leerVistos(),
  marcar(ids) {
    const nuevos = [...new Set([...ids, ...get().vistos])].slice(0, 400)
    set({ vistos: nuevos })
    try {
      localStorage.setItem(CLAVE, JSON.stringify(nuevos))
    } catch {
      /* sin almacenamiento */
    }
  },
}))

/** Lista de avisos ordenada del más reciente al más antiguo, y cuántos no se han visto. */
export function useNotificaciones() {
  const d = useDatos()
  const a = useAnalitica()
  const vistos = useVistos((s) => s.vistos)

  const lista = useMemo(() => {
    const hoy = hoyISO()
    const hora = new Date().getHours()
    const avisos: Aviso[] = []

    // Gastos inusuales o cobros duplicados (los mismos de "Movimientos para revisar").
    a.anomalias.slice(0, 5).forEach((x) => {
      const m = d.movimientos.find((y) => y.id === x.movimientoId)
      if (!m) return
      avisos.push({
        id: `alerta:${x.movimientoId}:${x.tipo}`,
        tipo: 'alerta',
        titulo: x.tipo === 'posible_duplicado' ? `¿Te cobraron dos veces en ${m.descripcion}?` : x.tipo === 'monto_atipico' ? `Gasto inusual en ${m.descripcion}` : `Primera compra alta en ${m.descripcion}`,
        texto: `${pesos(Math.abs(m.monto))}. ${x.explicacion}`,
        fecha: m.creadoEn,
        destino: '/insights',
      })
    })

    // Cobros que se repiten y llegan en los próximos 3 días.
    a.recurrentes
      .filter((r) => r.proximo >= hoy && r.proximo <= sumarDias(hoy, 3))
      .forEach((r) => {
        const cuando = r.proximo === hoy ? 'hoy' : r.proximo === sumarDias(hoy, 1) ? 'mañana' : `en ${diasEntre(hoy, r.proximo)} días`
        avisos.push({
          id: `pago:${r.clave}:${r.proximo}`,
          tipo: 'pago',
          titulo: `${r.nombre} se cobra ${cuando}`,
          texto: `Suele ser de unos ${pesos(r.montoTipico)}. Ten el saldo listo.`,
          fecha: `${sumarDias(r.proximo, -3) > hoy ? hoy : sumarDias(r.proximo, -3)}T08:00:00`,
          destino: '/insights',
        })
      })

    // Presupuestos que, al ritmo actual, probablemente se van a pasar.
    if (a.mes === mesActual()) {
      a.pronostico.porCategoria
        .filter((c) => c.limite && (c.gastado > c.limite || (c.probSuperar ?? 0) >= 0.6))
        .forEach((c) => {
          const pasado = c.gastado > c.limite!
          const nombre = CATEGORIAS[c.categoria].nombre.toLowerCase()
          avisos.push({
            id: `presupuesto:${a.mes}:${c.categoria}:${pasado ? 'pasado' : 'riesgo'}`,
            tipo: 'presupuesto',
            titulo: pasado ? `Te pasaste en ${nombre}` : `Podrías pasarte en ${nombre}`,
            texto: pasado
              ? `Llevas ${pesos(c.gastado)} de un presupuesto de ${pesos(c.limite!)}.`
              : `Llevas ${pesos(c.gastado)} de ${pesos(c.limite!)}; a este ritmo cerrarías en ${pesos(c.proyectado)}.`,
            fecha: `${hoy}T07:00:00`,
            destino: '/presupuestos',
          })
        })
      if (a.pronostico.diaSinDinero) {
        avisos.push({
          id: `sin-dinero:${a.mes}`,
          tipo: 'presupuesto',
          titulo: `Tus gastos superarían tus ingresos el día ${a.pronostico.diaSinDinero}`,
          texto: 'Es una proyección con tu ritmo de este mes. Tu asistente te dice dónde ajustar.',
          fecha: `${hoy}T07:00:00`,
          destino: '/insights',
        })
      }
    }

    // Racha en peligro: al final del día, si hoy aún no hay registros.
    const registroHoy = d.movimientos.some((m) => m.origen !== 'extracto' && fechaISO(new Date(m.creadoEn)) === hoy)
    if (hora >= 17 && !registroHoy && a.racha > 0) {
      avisos.push({
        id: `racha:${hoy}`,
        tipo: 'racha',
        titulo: `No pierdas tu racha de ${a.racha} ${a.racha === 1 ? 'día' : 'días'}`,
        texto: 'Registra un gasto o un ingreso antes de medianoche.',
        fecha: `${hoy}T17:00:00`,
        destino: 'registrar',
      })
    }

    // Retos completados esta semana (con la fecha en que se lograron).
    a.retos.retos
      .filter((r) => r.completado)
      .forEach((r) => {
        const cuando = d.actividades.find((x) => x.tipo === 'reto_completado' && x.ref === r.id)?.fecha ?? `${hoy}T00:00:00`
        avisos.push({ id: `logro:${r.id}`, tipo: 'logro', titulo: `Reto completado: ${r.titulo}`, texto: '+2,5 puntos en tu FinScore.', fecha: cuando, destino: '/finscore' })
      })

    // Cierre del mes anterior: se puede sumar hasta el día de cierre.
    const previo = mesAnterior(mesActual())
    if (Number(hoy.slice(8, 10)) < DIA_CIERRE && !d.cierres.some((c) => c.mes === previo) && d.perfil.creadoEn.slice(0, 7) <= previo) {
      const pts = calcularFinScore(d, previo).total
      avisos.push({
        id: `cierre:${previo}`,
        tipo: 'cierre',
        titulo: `${nombreMes(previo, false).replace(/^./, (l) => l.toUpperCase())} cierra el día ${DIA_CIERRE}`,
        texto: `Llevas ${pts} puntos. Si subes el extracto de ese mes, sumas 15 más.`,
        fecha: `${mesActual()}-01T09:00:00`,
        destino: '/finscore',
      })
    }
    // El último mes cerrado (si cerró hace poco).
    const ultimo = [...d.cierres].sort((x, y) => y.mes.localeCompare(x.mes))[0]
    if (ultimo && diasEntre(ultimo.creadoEn.slice(0, 10), hoy) <= 10) {
      avisos.push({ id: `cerrado:${ultimo.mes}`, tipo: 'logro', titulo: `Cerraste ${nombreMes(ultimo.mes, false)} con ${ultimo.puntaje} puntos`, texto: 'Mira cómo te fue mes a mes en FinScore.', fecha: ultimo.creadoEn, destino: '/finscore' })
    }

    // El hallazgo principal del asistente.
    const consejo = a.insights[0]
    if (consejo) {
      avisos.push({ id: `consejo:${a.mes}:${consejo.id}`, tipo: 'consejo', titulo: consejo.titulo, texto: consejo.mensaje, fecha: `${hoy}T06:00:00`, destino: '/insights' })
    }

    return avisos.sort((x, y) => y.fecha.localeCompare(x.fecha))
  }, [d, a])

  const noLeidas = lista.filter((x) => !vistos.includes(x.id)).length
  return { lista, noLeidas, vistos }
}
