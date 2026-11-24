/**
 * Detección de pagos que se repiten (suscripciones, arriendo, servicios) y cálculo del próximo cobro.
 * Algoritmo explicable, sin entrenamiento: regularidad de los intervalos + estabilidad del monto.
 */
import type { IdCategoria, Movimiento } from '../lib/tipos'
import { diasEntre, sumarDias, parseFecha } from '../lib/formato'
import { claveComercio, desviacion, mediana, promedio } from './texto'

export interface GastoRecurrente {
  /** Clave del comercio (`claveComercio`) que agrupa los cobros. */
  clave: string
  /** Descripción del último cobro, para mostrar. */
  nombre: string
  categoria: IdCategoria
  frecuencia: 'semanal' | 'quincenal' | 'mensual'
  periodoDias: number
  /** Mediana de los montos (positiva). */
  montoTipico: number
  /** Coeficiente de variación del monto: bajo = suscripción de precio fijo. */
  variacionMonto: number
  /** Fecha del último cobro y la estimada para el siguiente. */
  ultimo: string
  proximo: string
  ocurrencias: number
  /** 0-1: 70 % regularidad de los intervalos + 30 % estabilidad del monto. */
  confianza: number
  evidencia: string[] // ids de movimientos
}

/** Periodos que se buscan, con su tolerancia en días (un mes no siempre trae el cobro el mismo día). */
const PERIODOS = [
  { nombre: 'semanal' as const, dias: 7, tol: 2 },
  { nombre: 'quincenal' as const, dias: 15, tol: 3 },
  { nombre: 'mensual' as const, dias: 30, tol: 5 },
]

/**
 * Un cobro fijo tiene un monto estable (una suscripción, el arriendo, un servicio público). El mercado o los
 * restaurantes pueden repetirse cada semana, pero su monto varía mucho: son hábitos, no cobros que "llegan".
 */
const VARIACION_MAXIMA = 0.25
/** Proporción mínima de intervalos que deben caer en el periodo (los almuerzos de entre semana no lo cumplen). */
const REGULARIDAD_MINIMA = 0.7
/** Gastos que la persona decide (mercado, comida, transporte, compras): pueden repetirse, pero no son cobros que llegan. */
const NO_SON_COBROS = new Set(['mercado', 'comida', 'transporte', 'compras'])

/**
 * Detecta gastos periódicos agrupando por comercio y midiendo la regularidad de los intervalos
 * entre cargos (mediana del intervalo cerca de 7/15/30 días con baja dispersión) y la estabilidad del monto.
 * Si el siguiente cobro ya debió llegar hace rato y no llegó, se considera que dejó de repetirse.
 */
export function detectarRecurrentes(movs: Movimiento[]): GastoRecurrente[] {
  // Referencia de "hoy": el movimiento más reciente (la función no depende del reloj).
  const referencia = movs.reduce((max, m) => (m.fecha > max ? m.fecha : max), '')
  const grupos = new Map<string, Movimiento[]>()
  for (const m of movs) {
    if (m.monto >= 0 || m.categoria === 'transferencias' || NO_SON_COBROS.has(m.categoria)) continue
    const k = claveComercio(m.descripcion)
    if (!k) continue
    grupos.set(k, [...(grupos.get(k) ?? []), m])
  }

  const res: GastoRecurrente[] = []
  for (const [clave, lista] of grupos) {
    // Con menos de 3 cobros no hay forma de saber si es un patrón.
    if (lista.length < 3) continue
    const ord = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
    // Días entre cobros consecutivos (los del mismo día no cuentan como intervalo).
    const intervalos = ord.slice(1).map((m, i) => diasEntre(ord[i].fecha, m.fecha)).filter((d) => d > 0)
    if (intervalos.length < 2) continue
    const med = mediana(intervalos)
    const periodo = PERIODOS.find((p) => Math.abs(med - p.dias) <= p.tol)
    if (!periodo) continue
    // Proporción de intervalos que caen cerca del periodo detectado.
    const regulares = intervalos.filter((d) => Math.abs(d - periodo.dias) <= periodo.tol * 1.5).length / intervalos.length
    const montos = ord.map((m) => -m.monto)
    // Coeficiente de variación = desviación / promedio. 0 = siempre el mismo valor.
    const cv = desviacion(montos) / (promedio(montos) || 1)
    if (regulares < REGULARIDAD_MINIMA || cv > VARIACION_MAXIMA) continue
    // Un cobro semanal cae el mismo día de la semana; los almuerzos o cafés de entre semana, no.
    if (periodo.nombre === 'semanal') {
      const cuenta = new Map<number, number>()
      ord.forEach((m) => cuenta.set(parseFecha(m.fecha).getDay(), (cuenta.get(parseFecha(m.fecha).getDay()) ?? 0) + 1))
      if (Math.max(...cuenta.values()) / ord.length < 0.7) continue
    }
    const confianza = Math.max(0, Math.min(1, regulares * 0.7 + Math.max(0, 1 - cv) * 0.3))
    const ultimo = ord[ord.length - 1]
    const proximo = sumarDias(ultimo.fecha, Math.round(med))
    // Si el próximo cobro ya debió llegar (con margen) y no llegó, la suscripción se canceló.
    if (referencia && proximo < sumarDias(referencia, -periodo.tol * 2)) continue
    res.push({
      clave,
      nombre: ultimo.descripcion,
      categoria: ultimo.categoria,
      frecuencia: periodo.nombre,
      periodoDias: periodo.dias,
      montoTipico: Math.round(mediana(montos)),
      variacionMonto: cv,
      ultimo: ultimo.fecha,
      proximo,
      ocurrencias: ord.length,
      confianza,
      evidencia: ord.map((m) => m.id),
    })
  }
  return res.sort((a, b) => b.montoTipico - a.montoTipico)
}

/** Costo mensual equivalente de un recurrente (un cobro semanal de $10.000 ≈ $42.857 al mes). */
export const costoMensual = (r: GastoRecurrente) => Math.round((r.montoTipico * 30) / r.periodoDias)
