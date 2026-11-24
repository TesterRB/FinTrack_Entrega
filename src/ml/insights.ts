/**
 * Motor de recomendaciones de la pantalla Asistente (Insights).
 * Son reglas explicables construidas sobre los modelos (recurrentes, pronóstico): cada hallazgo
 * dice qué pasa, cuánto se podría ahorrar y qué movimientos lo demuestran.
 */
import type { IdCategoria, Movimiento } from '../lib/tipos'
import { CATEGORIAS } from '../lib/categorias'
import { mesAnterior, mesDe, parseFecha, pesos } from '../lib/formato'
import { costoMensual, type GastoRecurrente } from './recurrentes'
import type { PronosticoMes } from './pronostico'
import { mediana, promedio } from './texto'

export interface Insight {
  id: string
  tipo: 'tendencia' | 'hormiga' | 'suscripciones' | 'presupuesto' | 'ahorro' | 'patron' | 'liquidez'
  tono: 'positivo' | 'alerta' | 'neutro'
  titulo: string
  mensaje: string
  /** Ahorro mensual potencial estimado si se sigue la recomendación. */
  ahorroPotencial: number | null
  /** Evidencia: ids de movimientos que respaldan el hallazgo. */
  evidencia: string[]
  /** Cifras de apoyo en texto ("Este mes: $ 120.000"). */
  datos: string[]
  /** true = solo para planes de pago (función `insights_avanzados`). */
  avanzado: boolean
}

/** Categorías donde el usuario decide cuánto gastar (candidatas a recortes). */
const DISCRECIONALES: IdCategoria[] = ['comida', 'entretenimiento', 'compras', 'transporte', 'otros']
/** Palabras que identifican plataformas de streaming en la descripción del cobro. */
const STREAMING = ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'youtube', 'apple', 'crunchyroll', 'paramount', 'star']

/** Gastos reales del mes (sin transferencias entre cuentas propias). */
const gastosDe = (movs: Movimiento[], mes: string) =>
  movs.filter((m) => mesDe(m.fecha) === mes && m.monto < 0 && m.categoria !== 'transferencias')

/** Total gastado por categoría en un mes (montos positivos). */
export function totalesPorCategoria(movs: Movimiento[], mes: string) {
  const t = new Map<IdCategoria, number>()
  gastosDe(movs, mes).forEach((m) => t.set(m.categoria, (t.get(m.categoria) ?? 0) - m.monto))
  return t
}

/**
 * Motor de recomendaciones: reglas explicables alimentadas por los modelos (recurrentes,
 * pronóstico). Cada hallazgo trae la evidencia que lo sustenta, como pide la oferta.
 */
export function generarInsights(
  movs: Movimiento[],
  mes: string,
  diaActual: number,
  recurrentes: GastoRecurrente[],
  pronostico: PronosticoMes | null,
): Insight[] {
  const res: Insight[] = []
  const actual = totalesPorCategoria(movs, mes)
  const historicos = [1, 2, 3].map((i) => totalesPorCategoria(movs, mesAnterior(mes, i)))
  // Lo que se llevaba gastado AL MISMO DÍA en cada mes anterior: así el arriendo del día 5 o los servicios
  // no parecen "arriba" solo porque ya se pagaron completos.
  const historicosAlDia = [1, 2, 3].map((i) => totalesPorCategoria(movs.filter((m) => Number(m.fecha.slice(8, 10)) <= diaActual), mesAnterior(mes, i)))
  // Avance aproximado del mes, para proyectar sumas parciales (mínimo 10 % para no dividir por casi cero).
  const fraccionMes = Math.max(diaActual / 30, 0.1)

  // 1. Tendencias por categoría frente al promedio de los últimos 3 meses (ajustado al día del mes).
  for (const [cat, valor] of actual) {
    const hist = historicosAlDia.map((h) => h.get(cat) ?? 0).filter((x) => x > 0)
    // Con menos de una semana de datos la comparación es ruido.
    if (hist.length < 2 || diaActual < 7) continue
    const esperado = promedio(hist)
    // Categorías con poco gasto: un cambio porcentual grande sería irrelevante en pesos.
    if (esperado < 30_000) continue
    const cambio = (valor - esperado) / esperado
    const nombre = CATEGORIAS[cat].nombre.toLowerCase()
    const ids = gastosDe(movs, mes).filter((m) => m.categoria === cat).map((m) => m.id)
    if (cambio <= -0.15) {
      res.push({
        id: `tend-${cat}`,
        tipo: 'tendencia',
        tono: 'positivo',
        titulo: `Estás gastando ${Math.round(-cambio * 100)} % menos en ${nombre}`,
        mensaje: `A esta altura del mes sueles llevar ${pesos(esperado)} y vas en ${pesos(valor)}: ${pesos(esperado - valor)} que puedes guardar.`,
        ahorroPotencial: Math.round(esperado - valor),
        evidencia: ids,
        datos: [`Este mes: ${pesos(valor)}`, `Esperado a la fecha: ${pesos(esperado)}`],
        avanzado: false,
      })
    } else if (cambio >= 0.25) {
      res.push({
        id: `tend-${cat}`,
        tipo: 'tendencia',
        tono: 'alerta',
        titulo: `Tu gasto en ${nombre} va ${Math.round(cambio * 100)} % arriba`,
        mensaje: `A esta altura del mes sueles llevar ${pesos(esperado)} y ya vas en ${pesos(valor)}.`,
        ahorroPotencial: Math.round(valor - esperado),
        evidencia: ids,
        datos: [`Promedio a esta altura del mes: ${pesos(esperado)}`],
        avanzado: false,
      })
    }
  }

  // 2. Gastos hormiga: muchas compras pequeñas que suman mucho.
  const pequenos = gastosDe(movs, mes).filter((m) => -m.monto <= 15_000 && DISCRECIONALES.includes(m.categoria))
  const sumaPeq = pequenos.reduce((a, m) => a - m.monto, 0)
  if (pequenos.length >= 8) {
    const proy = sumaPeq / fraccionMes
    res.push({
      id: 'hormiga',
      tipo: 'hormiga',
      tono: 'alerta',
      titulo: `${pequenos.length} gastos hormiga suman ${pesos(sumaPeq)}`,
      mensaje: `Al ritmo actual cerrarías el mes con ${pesos(proy)} en compras menores a $15.000. Reducirlos a la mitad liberaría ${pesos(proy / 2)}.`,
      ahorroPotencial: Math.round(proy / 2),
      evidencia: pequenos.map((m) => m.id),
      datos: [`Promedio por compra: ${pesos(sumaPeq / pequenos.length)}`],
      avanzado: true,
    })
  }

  // 3. Suscripciones (recurrentes mensuales de precio fijo; sin arriendo ni servicios públicos).
  const subs = recurrentes.filter((r) => r.frecuencia === 'mensual' && r.variacionMonto < 0.15 && !['vivienda', 'servicios', 'mercado'].includes(r.categoria))
  const streaming = subs.filter((r) => STREAMING.some((s) => r.clave.includes(s)))
  if (subs.length) {
    const total = subs.reduce((a, r) => a + costoMensual(r), 0)
    const extra = streaming.length >= 3 ? costoMensual([...streaming].sort((a, b) => a.montoTipico - b.montoTipico)[0]) : 0
    res.push({
      id: 'suscripciones',
      tipo: 'suscripciones',
      tono: streaming.length >= 3 ? 'alerta' : 'neutro',
      titulo: `Pagas ${subs.length} suscripciones: ${pesos(total)} al mes`,
      mensaje:
        streaming.length >= 3
          ? `Tienes ${streaming.length} plataformas de streaming. Rotarlas (una por mes) podría ahorrarte al menos ${pesos(extra)} mensuales.`
          : 'Revisa si sigues usando todas. Son cobros automáticos que suelen pasar desapercibidos.',
      ahorroPotencial: extra || null,
      evidencia: subs.flatMap((r) => r.evidencia.slice(-1)),
      datos: subs.map((r) => `${r.nombre}: ${pesos(r.montoTipico)}`),
      avanzado: true,
    })
  }

  // 4. Riesgo de presupuesto según el pronóstico.
  pronostico?.porCategoria
    .filter((c) => c.limite && c.probSuperar !== null && c.probSuperar > 0.6)
    .slice(0, 2)
    .forEach((c) =>
      res.push({
        id: `ppto-${c.categoria}`,
        tipo: 'presupuesto',
        tono: 'alerta',
        titulo: `${Math.round(c.probSuperar! * 100)} % de probabilidad de pasarte en ${CATEGORIAS[c.categoria].nombre.toLowerCase()}`,
        mensaje: `Proyectamos ${pesos(c.proyectado)} contra un presupuesto de ${pesos(c.limite!)}. Te quedan ${pesos(Math.max(0, c.limite! - c.gastado))} para el resto del mes.`,
        ahorroPotencial: null,
        evidencia: [],
        datos: [`Gastado: ${pesos(c.gastado)}`],
        avanzado: true,
      }),
    )

  // 5. Liquidez: ¿se acaba el dinero antes del próximo ingreso?
  if (pronostico && pronostico.diaSinDinero && pronostico.diaSinDinero > diaActual) {
    res.push({
      id: 'liquidez',
      tipo: 'liquidez',
      tono: 'alerta',
      titulo: `Al ritmo actual tus gastos superan tus ingresos el día ${pronostico.diaSinDinero}`,
      mensaje: `Proyectamos un cierre de ${pesos(pronostico.proyeccionCierre)} frente a ingresos de ${pesos(pronostico.ingresosMes)}. Ajustar ${pesos(-pronostico.saldoProyectado)} evitaría quedarte corto.`,
      ahorroPotencial: Math.round(-pronostico.saldoProyectado),
      evidencia: [],
      datos: [],
      avanzado: true,
    })
  }

  // 6. Patrón de fin de semana.
  const g = gastosDe(movs, mes).concat(gastosDe(movs, mesAnterior(mes)))
  // getDay(): 0 = domingo, 5 = viernes, 6 = sábado.
  const finde = g.filter((m) => [0, 5, 6].includes(parseFecha(m.fecha).getDay()))
  const sumaFinde = finde.reduce((a, m) => a - m.monto, 0)
  const sumaTotal = g.reduce((a, m) => a - m.monto, 0)
  if (sumaTotal > 0 && sumaFinde / sumaTotal > 0.55) {
    res.push({
      id: 'finde',
      tipo: 'patron',
      tono: 'neutro',
      titulo: `El ${Math.round((sumaFinde / sumaTotal) * 100)} % de tu gasto ocurre de viernes a domingo`,
      mensaje: 'Definir un tope para el fin de semana es una de las formas más efectivas de controlar el mes.',
      ahorroPotencial: null,
      evidencia: finde.map((m) => m.id),
      datos: [],
      avanzado: true,
    })
  }

  // 7. Recomendación de ahorro: recortar 20 % la categoría discrecional más alta.
  // Se usa el promedio histórico; el ritmo del mes solo cuenta cuando ya hay suficientes días.
  const mensualDe = (c: IdCategoria) => {
    // Mediana de los meses con actividad (un mes sin gasto en la categoría cuenta como 0).
    const hist = historicos.filter((h) => h.size > 0).map((h) => h.get(c) ?? 0)
    const ritmo = (actual.get(c) ?? 0) / fraccionMes
    if (hist.length < 2) return ritmo
    const peso = Math.min(1, diaActual / 30)
    return mediana(hist) * (1 - peso) + ritmo * peso
  }
  const top = DISCRECIONALES.map((c) => [c, mensualDe(c)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]
  if (top) {
    const mensual = top[1]
    res.push({
      id: 'ahorro-top',
      tipo: 'ahorro',
      tono: 'positivo',
      titulo: 'Ahorra más con hábitos inteligentes',
      mensaje: `Si reduces ${CATEGORIAS[top[0]].nombre.toLowerCase()} un 20 % el próximo mes podrías ahorrar hasta ${pesos(mensual * 0.2)}.`,
      ahorroPotencial: Math.round(mensual * 0.2),
      evidencia: movs.filter((m) => m.categoria === top[0] && m.monto < 0 && mesDe(m.fecha) >= mesAnterior(mes, 3)).map((m) => m.id),
      datos: [`Gasto mensual típico en la categoría: ${pesos(mensual)}`],
      avanzado: false,
    })
  }

  // Primero lo que requiere atención, luego las buenas noticias.
  const orden = { alerta: 0, positivo: 1, neutro: 2 }
  return res.sort((a, b) => orden[a.tono] - orden[b.tono])
}
