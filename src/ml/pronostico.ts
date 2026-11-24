/**
 * Pronóstico del cierre de mes: cuánto se va a gastar, con qué rango, si alcanza el dinero y
 * qué presupuestos corren riesgo de pasarse. Todo con historial propio, sin servidor.
 */
import type { IdCategoria, Movimiento, Presupuesto } from '../lib/tipos'
import { diasDelMes, mesAnterior, mesDe } from '../lib/formato'
import { mediana, promedio } from './texto'

export interface PronosticoMes {
  mes: string
  diaActual: number
  diasMes: number
  gastadoHastaHoy: number
  proyeccionCierre: number
  /** Rango probable del gasto al cierre; se estrecha a medida que avanza el mes. */
  rango: [number, number]
  /** Ingresos del mes, o el promedio de los últimos 3 si este mes todavía no llegan. */
  ingresosMes: number
  /** Saldo estimado al cierre (ingresos - gasto proyectado). */
  saldoProyectado: number
  /** Día del mes en que se proyecta que el gasto supera los ingresos (null si no ocurre). */
  diaSinDinero: number | null
  /** Gasto acumulado por día para la gráfica: `real` hasta hoy, `proyectado` desde hoy. */
  serie: { dia: number; real: number | null; proyectado: number | null }[]
  /** Proyección por categoría; `probSuperar` es la probabilidad (0-1) de pasar el presupuesto. */
  porCategoria: { categoria: IdCategoria; gastado: number; proyectado: number; limite: number | null; probSuperar: number | null }[]
}

/** Movimientos que cuentan como gasto (las transferencias entre cuentas propias no). */
const gasto = (m: Movimiento) => m.monto < 0 && m.categoria !== 'transferencias'

/**
 * Pronóstico del cierre de mes: combina el ritmo de gasto del mes actual con el perfil diario
 * histórico (cuánto del gasto mensual suele ocurrir después del día de hoy). El peso del ritmo
 * actual crece a medida que avanza el mes.
 */
export function pronosticarMes(movs: Movimiento[], mes: string, hoy: number, presupuestos: Presupuesto[] = []): PronosticoMes {
  const diasMes = diasDelMes(mes)
  const delMes = movs.filter((m) => mesDe(m.fecha) === mes)
  // acumuladoDia[d] = gasto total del día 1 al d (índice 0 = antes de empezar el mes).
  const acumuladoDia = Array(diasMes + 1).fill(0)
  delMes.filter(gasto).forEach((m) => (acumuladoDia[Number(m.fecha.slice(8, 10))] += -m.monto))
  for (let d = 1; d <= diasMes; d++) acumuladoDia[d] += acumuladoDia[d - 1]
  const gastadoHastaHoy = acumuladoDia[Math.min(hoy, diasMes)]

  // Fracción histórica del gasto mensual ocurrida hasta el día "hoy" (últimos 3 meses).
  const fracciones: number[] = []
  const totalesHist: number[] = []
  for (let i = 1; i <= 3; i++) {
    const mm = mesAnterior(mes, i)
    const g = movs.filter((m) => mesDe(m.fecha) === mm && gasto(m))
    const total = g.reduce((a, m) => a - m.monto, 0)
    if (total <= 0) continue
    totalesHist.push(total)
    const hasta = g.filter((m) => Number(m.fecha.slice(8, 10)) <= hoy).reduce((a, m) => a - m.monto, 0)
    fracciones.push(Math.max(0.05, hasta / total))
  }
  // Dos estimaciones del cierre:
  //  - ritmo: si sigue gastando igual que hasta hoy, día a día.
  //  - porPerfil: si hasta hoy suele llevar el X % del mes, el total es gastado / X (capta que el arriendo
  //    o el mercado grande llegan a principio de mes).
  const ritmo = hoy > 0 ? (gastadoHastaHoy / hoy) * diasMes : 0
  const porPerfil = fracciones.length ? gastadoHastaHoy / promedio(fracciones) : ritmo
  // Avance del mes (0-1): cuanto más avanzado, más confiable es el ritmo actual.
  const peso = Math.min(1, hoy / diasMes)
  let proyeccion = fracciones.length ? porPerfil * (1 - peso * 0.5) + ritmo * peso * 0.5 : ritmo
  // En los primeros días hay muy poca información del mes: pesa más el promedio de meses anteriores.
  if (totalesHist.length && hoy < 5) proyeccion = proyeccion * 0.4 + promedio(totalesHist) * 0.6
  // Nunca se proyecta menos de lo que ya se gastó.
  proyeccion = Math.max(proyeccion, gastadoHastaHoy)
  // ±30 % al inicio del mes, ±5 % al final.
  const incertidumbre = (1 - peso) * 0.25 + 0.05
  const rango: [number, number] = [Math.max(gastadoHastaHoy, proyeccion * (1 - incertidumbre)), proyeccion * (1 + incertidumbre)]

  const ingresosMes = delMes.filter((m) => m.monto > 0).reduce((a, m) => a + m.monto, 0)
  const ingresosHist = promedio(
    [1, 2, 3].map((i) => movs.filter((m) => mesDe(m.fecha) === mesAnterior(mes, i) && m.monto > 0).reduce((a, m) => a + m.monto, 0)).filter((x) => x > 0),
  )
  const ingresosEsperados = Math.max(ingresosMes, ingresosHist)

  // Lo que falta por gastar se reparte por igual entre los días restantes.
  const diario = (proyeccion - gastadoHastaHoy) / Math.max(1, diasMes - hoy)
  const serie = []
  let diaSinDinero: number | null = null
  for (let d = 1; d <= diasMes; d++) {
    const proyectado = d >= hoy ? gastadoHastaHoy + diario * (d - hoy) : null
    serie.push({ dia: d, real: d <= hoy ? acumuladoDia[d] : null, proyectado })
    const valor = d <= hoy ? acumuladoDia[d] : proyectado!
    if (diaSinDinero === null && ingresosEsperados > 0 && valor > ingresosEsperados) diaSinDinero = d
  }

  const cats = new Map<IdCategoria, number>()
  delMes.filter(gasto).forEach((m) => cats.set(m.categoria, (cats.get(m.categoria) ?? 0) - m.monto))
  presupuestos.filter((p) => p.mes === mes).forEach((p) => !cats.has(p.categoria) && cats.set(p.categoria, 0))
  const porCategoria = [...cats].map(([categoria, gastado]) => {
    const limite = presupuestos.find((p) => p.mes === mes && p.categoria === categoria)?.limite ?? null
    // Por categoría: promedio histórico de la categoría mezclado con su ritmo actual según avance el mes.
    // Un mes con actividad pero sin gasto en la categoría cuenta como 0 (no se descarta).
    const hist = [1, 2, 3]
      .map((i) => mesAnterior(mes, i))
      .filter((mm) => movs.some((m) => mesDe(m.fecha) === mm))
      .map((mm) => movs.filter((m) => mesDe(m.fecha) === mm && gasto(m) && m.categoria === categoria).reduce((a, m) => a - m.monto, 0))
    const ritmoCat = hoy > 0 ? (gastado / hoy) * diasMes : 0
    // Mediana: una compra atípica de un mes no debe disparar la proyección de los siguientes.
    // Con menos de 2 meses de historial no hay base: el ritmo actual pesa según avance el mes.
    const proyectado = Math.max(gastado, hist.length >= 2 ? mediana(hist) * (1 - peso) + ritmoCat * peso : gastado * (1 - peso) + ritmoCat * peso)
    // Probabilidad aproximada (logística) de superar el límite según la distancia relativa.
    const probSuperar = limite ? 1 / (1 + Math.exp(-((proyectado - limite) / (limite * Math.max(0.08, incertidumbre))))) : null
    return { categoria, gastado, proyectado, limite, probSuperar }
  })

  return {
    mes,
    diaActual: hoy,
    diasMes,
    gastadoHastaHoy,
    proyeccionCierre: proyeccion,
    rango,
    ingresosMes: ingresosEsperados,
    saldoProyectado: ingresosEsperados - proyeccion,
    diaSinDinero,
    serie,
    porCategoria: porCategoria.sort((a, b) => b.proyectado - a.proyectado),
  }
}
