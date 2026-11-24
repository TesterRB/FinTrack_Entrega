/**
 * Conciliación: compara las filas de un extracto con lo que el usuario ya anotó en la app, para
 * confirmar lo registrado y agregar solo lo que falta (sin duplicar).
 */
import type { Movimiento } from '../lib/tipos'
import { diasEntre } from '../lib/formato'
import type { FilaExtracto } from './extractos'
import { similitud } from './texto'

/** Resultado por fila del extracto: coincide con un movimiento existente o es nuevo. */
export type ResultadoFila =
  | { tipo: 'coincide'; fila: FilaExtracto; movimiento: Movimiento; puntaje: number; diferencias: string[] }
  | { tipo: 'nuevo'; fila: FilaExtracto }

export interface Conciliacion {
  filas: ResultadoFila[]
  /** Registros manuales del periodo que no aparecen en el extracto (posible efectivo u otra cuenta). */
  soloEnApp: Movimiento[]
  resumen: { coincidencias: number; nuevos: number; soloEnApp: number; conDiferencias: number }
}

/**
 * Empareja cada fila del extracto con el registro manual más probable.
 * Puntaje = monto (50 %) + cercanía de fecha (30 %) + similitud de descripción (20 %).
 * La asignación es voraz por puntaje descendente y uno-a-uno.
 */
export function conciliar(filas: FilaExtracto[], movimientos: Movimiento[]): Conciliacion {
  if (!filas.length) return { filas: [], soloEnApp: [], resumen: { coincidencias: 0, nuevos: 0, soloEnApp: 0, conDiferencias: 0 } }
  const desde = filas.reduce((a, f) => (f.fecha < a ? f.fecha : a), filas[0].fecha)
  const hasta = filas.reduce((a, f) => (f.fecha > a ? f.fecha : a), filas[0].fecha)
  // Solo movimientos aún no conciliados y dentro del periodo del extracto (±3 días de margen).
  const candidatos = movimientos.filter((m) => !m.conciliado && diasEntre(desde, m.fecha) >= -3 && diasEntre(m.fecha, hasta) >= -3)

  const pares: { i: number; m: Movimiento; p: number }[] = []
  filas.forEach((f, i) => {
    for (const m of candidatos) {
      // Un gasto nunca empareja con un ingreso.
      if (Math.sign(m.monto) !== Math.sign(f.monto)) continue
      const difRel = Math.abs(Math.abs(m.monto) - Math.abs(f.monto)) / Math.abs(f.monto)
      const dias = Math.abs(diasEntre(m.fecha, f.fecha))
      // Descarte rápido: más de 10 % de diferencia en monto o más de 4 días de distancia.
      if (difRel > 0.1 || dias > 4) continue
      const pMonto = difRel === 0 ? 1 : Math.max(0, 1 - difRel * 8)
      const pFecha = Math.max(0, 1 - dias / 5)
      const pTexto = similitud(m.descripcion, f.descripcion)
      const p = pMonto * 0.5 + pFecha * 0.3 + pTexto * 0.2
      // Umbral mínimo para considerar que son el mismo movimiento.
      if (p >= 0.55) pares.push({ i, m, p })
    }
  })
  // Asignación voraz: primero los pares más seguros; cada fila y cada movimiento se usan una sola vez.
  pares.sort((a, b) => b.p - a.p)
  const filaUsada = new Map<number, { m: Movimiento; p: number }>()
  const movUsado = new Set<string>()
  for (const par of pares) {
    if (filaUsada.has(par.i) || movUsado.has(par.m.id)) continue
    filaUsada.set(par.i, { m: par.m, p: par.p })
    movUsado.add(par.m.id)
  }

  const resultado: ResultadoFila[] = filas.map((fila, i) => {
    const u = filaUsada.get(i)
    if (!u) return { tipo: 'nuevo', fila }
    const diferencias: string[] = []
    if (u.m.monto !== fila.monto) diferencias.push('monto')
    if (u.m.fecha !== fila.fecha) diferencias.push('fecha')
    return { tipo: 'coincide', fila, movimiento: u.m, puntaje: u.p, diferencias }
  })
  const soloEnApp = movimientos.filter((m) => m.origen === 'manual' && !m.conciliado && m.fecha >= desde && m.fecha <= hasta && !movUsado.has(m.id))
  return {
    filas: resultado,
    soloEnApp,
    resumen: {
      coincidencias: filaUsada.size,
      nuevos: filas.length - filaUsada.size,
      soloEnApp: soloEnApp.length,
      conDiferencias: resultado.filter((r) => r.tipo === 'coincide' && r.diferencias.length).length,
    },
  }
}
