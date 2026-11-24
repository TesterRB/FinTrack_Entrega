/**
 * Detección de movimientos inusuales (cobros dobles, montos atípicos, comercios nuevos con montos altos).
 * Es no supervisada: no necesita ejemplos etiquetados, solo el historial del propio usuario.
 */
import type { Movimiento } from '../lib/tipos'
import { diasEntre } from '../lib/formato'
import { claveComercio, mediana } from './texto'

export interface Anomalia {
  movimientoId: string
  tipo: 'monto_atipico' | 'posible_duplicado' | 'comercio_nuevo_alto'
  severidad: 'media' | 'alta'
  /** Texto para el usuario: por qué se marcó. */
  explicacion: string
  /** Qué tan fuera de lo normal está; se usa para ordenar (más alto = primero). */
  puntaje: number
  /** Movimientos que sustentan la alerta (en duplicados, los dos cargos). */
  evidencia: string[]
}

/** La lista sin una aparición del valor (el pago que se está evaluando). */
function sinUno(lista: number[], valor: number) {
  const i = lista.indexOf(valor)
  return i < 0 ? lista : [...lista.slice(0, i), ...lista.slice(i + 1)]
}
/** Percentil `p` (0-1) por el método del rango más cercano. */
function percentil(lista: number[], p: number) {
  const o = [...lista].sort((a, b) => a - b)
  return o[Math.min(o.length - 1, Math.floor(p * o.length))]
}

/**
 * Detección de movimientos inusuales sin supervisión:
 *  - z-score robusto (mediana / MAD) del monto frente a lo habitual en ese mismo comercio (si hay historia)
 *    o, si no, en su categoría (una cena en restaurante no es "rara" solo porque los almuerzos son baratos),
 *  - cargos duplicados (mismo comercio y monto en <= 1 día),
 *  - primer cargo en un comercio nuevo muy por encima del gasto típico del usuario.
 *
 * Usa todo el historial como referencia, pero solo evalúa los movimientos desde `desde` (si se indica).
 */
export function detectarAnomalias(movs: Movimiento[], desde?: string): Anomalia[] {
  // El arriendo y las transferencias son grandes por naturaleza: no se marcan como raros.
  const gastos = movs.filter((m) => m.monto < 0 && m.categoria !== 'transferencias' && m.categoria !== 'vivienda')
  const porCategoria = new Map<string, number[]>()
  gastos.forEach((m) => porCategoria.set(m.categoria, [...(porCategoria.get(m.categoria) ?? []), -m.monto]))
  const porComercio = new Map<string, number[]>()
  gastos.forEach((m) => {
    const k = claveComercio(m.descripcion)
    if (k) porComercio.set(k, [...(porComercio.get(k) ?? []), -m.monto])
  })
  const medGlobal = mediana(gastos.map((m) => -m.monto))
  const objetivo = desde ? gastos.filter((m) => m.fecha >= desde) : gastos
  const vistos = new Map<string, string>() // comercio -> id de su primer movimiento
  ;[...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((m) => {
    const k = claveComercio(m.descripcion)
    if (k && !vistos.has(k)) vistos.set(k, m.id)
  })

  const res: Anomalia[] = []
  for (const m of objetivo) {
    // Primero los duplicados: son lo más accionable (posible cobro doble).
    const k = claveComercio(m.descripcion)
    // `o.id < m.id` hace que de cada par solo se marque uno de los dos cargos.
    const dup = gastos.find(
      (o) => o.id !== m.id && o.monto === m.monto && claveComercio(o.descripcion) === k && Math.abs(diasEntre(o.fecha, m.fecha)) <= 1 && o.id < m.id,
    )
    if (dup && k) {
      res.push({
        movimientoId: m.id,
        tipo: 'posible_duplicado',
        severidad: 'alta',
        explicacion: 'Hay otro cargo idéntico del mismo comercio con un día o menos de diferencia. Verifica que no sea un cobro doble.',
        puntaje: 10,
        evidencia: [dup.id, m.id],
      })
      continue
    }
    // Con 5 o más compras en el mismo comercio, lo normal se mide ahí; si no, en la categoría.
    const delComercio = k ? porComercio.get(k) ?? [] : []
    const base = delComercio.length >= 5 ? delComercio : porCategoria.get(m.categoria) ?? []
    // Se compara con los demás pagos (sin el propio) y además debe superar con holgura lo más alto habitual:
    // un mercado grande en la tienda donde también haces compras pequeñas no es "raro".
    const montos = sinUno(base, -m.monto)
    if (montos.length >= 4) {
      const med = mediana(montos)
      // MAD = mediana de las desviaciones absolutas. Si todos los montos son iguales (MAD = 0) se usa un respaldo.
      const mad = mediana(montos.map((x) => Math.abs(x - med))) || med * 0.25 || 1
      // z-score modificado de Iglewicz y Hoaglin: 0,6745 hace el MAD comparable a una desviación estándar;
      // por encima de 3,5 se considera atípico.
      const z = (0.6745 * (-m.monto - med)) / mad
      if (z > 3.5 && -m.monto > med * 2.5 && -m.monto > percentil(montos, 0.95) * 1.5) {
        res.push({
          movimientoId: m.id,
          tipo: 'monto_atipico',
          severidad: z > 7 ? 'alta' : 'media',
          explicacion: `Este gasto es ${(-m.monto / med).toFixed(1).replace('.', ',')} veces tu gasto típico en esta categoría.`,
          puntaje: z,
          evidencia: [m.id],
        })
        continue
      }
    }
    // Primer pago en un comercio y 6 veces el gasto típico. Se exige algo de historial para que
    // un usuario nuevo no vea todo como "comercio nuevo".
    if (k && vistos.get(k) === m.id && -m.monto > medGlobal * 6 && gastos.length > 20) {
      res.push({
        movimientoId: m.id,
        tipo: 'comercio_nuevo_alto',
        severidad: 'media',
        explicacion: 'Primer pago en este comercio y por un valor alto frente a tus gastos habituales.',
        puntaje: -m.monto / medGlobal,
        evidencia: [m.id],
      })
    }
  }
  return res.sort((a, b) => b.puntaje - a.puntaje)
}
