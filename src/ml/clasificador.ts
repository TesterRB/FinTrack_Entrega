import type { IdCategoria, Movimiento } from '../lib/tipos'
import { SEMILLA } from './semilla'
import { tokens } from './texto'

/**
 * Clasificador Naive Bayes multinomial (suavizado de Laplace) para categorizar movimientos.
 * Se entrena con un corpus semilla y aprende de las categorías que el usuario confirma o corrige
 * (sus ejemplos pesan más). Corre 100% en el dispositivo: sin costo por uso ni envío de datos.
 */
export class ClasificadorCategorias {
  /** Peso total de ejemplos por categoría (para la probabilidad previa P(categoría)). */
  private conteoClase = new Map<IdCategoria, number>()
  /** Cuántas veces aparece cada palabra en cada categoría (para P(palabra | categoría)). */
  private conteoToken = new Map<IdCategoria, Map<string, number>>()
  /** Total de palabras vistas por categoría (denominador de P(palabra | categoría)). */
  private totalTokens = new Map<IdCategoria, number>()
  /** Todas las palabras conocidas por el modelo. */
  private vocabulario = new Set<string>()
  /** Peso total de ejemplos aprendidos. */
  private ejemplos = 0

  constructor(semilla: [string, IdCategoria][] = SEMILLA) {
    semilla.forEach(([t, c]) => this.aprender(t, c, 1))
  }

  /** Suma un ejemplo al modelo. `peso` > 1 hace que cuente como varios ejemplos iguales. */
  aprender(texto: string, categoria: IdCategoria, peso = 1) {
    const ts = tokens(texto)
    if (!ts.length) return
    this.ejemplos += peso
    this.conteoClase.set(categoria, (this.conteoClase.get(categoria) ?? 0) + peso)
    const mapa = this.conteoToken.get(categoria) ?? new Map<string, number>()
    for (const t of ts) {
      mapa.set(t, (mapa.get(t) ?? 0) + peso)
      this.vocabulario.add(t)
    }
    this.conteoToken.set(categoria, mapa)
    this.totalTokens.set(categoria, (this.totalTokens.get(categoria) ?? 0) + ts.length * peso)
  }

  /** Devuelve las categorías ordenadas por probabilidad (softmax de log-probabilidades). */
  predecir(texto: string, monto?: number): { categoria: IdCategoria; probabilidad: number }[] {
    const ts = tokens(texto)
    const V = this.vocabulario.size || 1
    const conocidos = ts.filter((t) => this.vocabulario.has(t))
    const puntajes: [IdCategoria, number][] = []
    for (const [clase, n] of this.conteoClase) {
      // Regla de dominio: montos positivos casi siempre son ingresos y viceversa.
      if (monto !== undefined && monto > 0 && clase !== 'ingresos' && clase !== 'transferencias') continue
      if (monto !== undefined && monto < 0 && clase === 'ingresos') continue
      // log P(clase) + Σ log P(palabra | clase). Se suma en logaritmos para no perder precisión
      // multiplicando muchas probabilidades pequeñas. El "+1" es el suavizado de Laplace: una palabra
      // nunca vista en la clase no anula toda la probabilidad.
      let lp = Math.log(n / this.ejemplos)
      const mapa = this.conteoToken.get(clase)!
      const total = this.totalTokens.get(clase)!
      for (const t of conocidos) lp += Math.log(((mapa.get(t) ?? 0) + 1) / (total + V))
      puntajes.push([clase, lp])
    }
    if (!puntajes.length) return [{ categoria: monto && monto > 0 ? 'ingresos' : 'otros', probabilidad: 0.5 }]
    // Softmax estable: se resta el máximo antes de exponenciar para evitar desbordes.
    const max = Math.max(...puntajes.map((p) => p[1]))
    const exp = puntajes.map(([c, lp]) => [c, Math.exp(lp - max)] as const)
    const suma = exp.reduce((a, [, v]) => a + v, 0)
    const res = exp.map(([categoria, v]) => ({ categoria, probabilidad: v / suma })).sort((a, b) => b.probabilidad - a.probabilidad)
    // Sin ninguna palabra conocida no hay evidencia: confianza baja para pedir confirmación.
    if (!conocidos.length) res[0] = { ...res[0], probabilidad: Math.min(res[0].probabilidad, 0.3) }
    return res
  }

  /** Categoría más probable y su confianza (0-1, con 3 decimales). */
  categorizar(texto: string, monto?: number) {
    const [mejor] = this.predecir(texto, monto)
    return { categoria: mejor.categoria, confianza: Number(mejor.probabilidad.toFixed(3)) }
  }
}

/**
 * Modelo personal: la semilla más los ejemplos del usuario. Las categorías puestas o confirmadas a mano
 * (`confianza === null`) pesan 3 veces la semilla, para que sus costumbres manden sobre el corpus genérico.
 */
export function entrenarConUsuario(movs: Movimiento[]) {
  const modelo = new ClasificadorCategorias()
  for (const m of movs) if (m.confianza === null) modelo.aprender(m.descripcion, m.categoria, 3)
  return modelo
}

/**
 * Precisión del modelo con validación "dejando uno fuera" sobre las categorías confirmadas por el
 * usuario. Alimenta el KPI de la oferta: precisión de categorización >= 90 %.
 * No se muestra en la interfaz.
 */
export function evaluarPrecision(movs: Movimiento[]) {
  // Máximo los 200 más recientes: el costo crece con el cuadrado de la muestra.
  const etiquetados = movs.filter((m) => m.confianza === null).slice(-200)
  if (etiquetados.length < 5) return null
  let aciertos = 0
  // Para cada ejemplo se entrena un modelo con todos los demás y se mira si lo acierta.
  etiquetados.forEach((m, i) => {
    const modelo = new ClasificadorCategorias()
    etiquetados.forEach((o, j) => j !== i && modelo.aprender(o.descripcion, o.categoria, 3))
    if (modelo.categorizar(m.descripcion, m.monto).categoria === m.categoria) aciertos++
  })
  return { precision: aciertos / etiquetados.length, muestras: etiquetados.length }
}
