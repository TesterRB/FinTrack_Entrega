/**
 * Hooks de lectura de datos para las pantallas. Concentran los cálculos pesados (modelos y FinScore)
 * en un solo lugar y los memorizan, para que cambiar de pestaña no los repita.
 */
import { useMemo } from 'react'
import { useApp } from '../store/app'
import { hoyISO, mesActual, mesAnterior, mesDe, sumarDias } from '../lib/formato'
import { detectarRecurrentes } from '../ml/recurrentes'
import { detectarAnomalias } from '../ml/anomalias'
import { pronosticarMes } from '../ml/pronostico'
import { generarInsights, totalesPorCategoria } from '../ml/insights'
import { calcularFinScore, rachaActual, retosDeSemana } from '../lib/finscore'
import type { Estado } from '../data'

/**
 * Datos del usuario. Solo se usa dentro de pantallas con sesión (App.tsx no las monta sin datos),
 * por eso se puede afirmar que no es null.
 */
export function useDatos(): Estado {
  return useApp((s) => s.datos)!
}

/** Toda la analítica derivada del mes (modelos ML + FinScore), memorizada. */
export function useAnalitica(mes = mesActual()) {
  const d = useDatos()
  return useMemo(() => {
    const hoy = hoyISO()
    const esActual = mes === mesActual()
    // En meses pasados se toma el mes completo (31 cubre cualquier mes).
    const dia = esActual ? Number(hoy.slice(8, 10)) : 31
    const movs = d.movimientos
    const delMes = movs.filter((m) => mesDe(m.fecha) === mes)
    // Comparación justa: el mes anterior hasta el mismo día del mes.
    const ant = movs.filter((m) => mesDe(m.fecha) === mesAnterior(mes) && Number(m.fecha.slice(8, 10)) <= dia)
    // Suma de montos que cumplen el filtro de signo, sin contar transferencias entre cuentas propias.
    const suma = (l: typeof movs, f: (x: number) => boolean) => l.filter((m) => f(m.monto) && m.categoria !== 'transferencias').reduce((a, m) => a + m.monto, 0)
    const ingresos = suma(delMes, (x) => x > 0)
    const gastos = -suma(delMes, (x) => x < 0)
    const ingresosAnt = suma(ant, (x) => x > 0)
    const gastosAnt = -suma(ant, (x) => x < 0)
    const recurrentes = detectarRecurrentes(movs)
    // Alertas del mes y de las últimas semanas del anterior (un cobro doble de fin de mes sigue siendo relevante).
    const anomalias = detectarAnomalias(movs, sumarDias(`${mes}-01`, -35))
    const pronostico = pronosticarMes(movs, mes, Math.min(dia, 31), d.presupuestos)
    const insights = generarInsights(movs, mes, dia, recurrentes, pronostico)
    const categorias = [...totalesPorCategoria(movs, mes)].sort((a, b) => b[1] - a[1])
    const finscore = calcularFinScore(d, mes)
    const retos = retosDeSemana(d, hoy)
    return {
      mes, dia, delMes, ingresos, gastos, ingresosAnt, gastosAnt,
      balance: ingresos - gastos,
      ahorro: Math.max(0, ingresos - gastos),
      recurrentes, anomalias, pronostico, insights, categorias, finscore, retos,
      racha: rachaActual(movs, hoy),
    }
  }, [d, mes])
}
