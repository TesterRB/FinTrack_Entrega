/*
 * FinScore mensual (0-100). Premia la CONSTANCIA, que es el dolor principal que valida FinTrack.
 * Se reinicia cada mes. Las mismas reglas están en supabase/migrations (función finscore_mes)
 * para que la emisión de recompensas sea autoritativa en el servidor. Las dos versiones son idénticas.
 *
 *  Registro constante ........ 40  (2 pts por día con al menos un registro, hasta 20 días)
 *  Racha ...................... 10  (racha de 7 días = 5, de 14 días = 10)
 *  Extracto conciliado ........ 15  (importar y conciliar al menos un extracto en el mes)
 *  Presupuestos ............... 15  (3+ presupuestos del mes = 5; revisarlos en 4 semanas = 10)
 *  Metas de ahorro ............ 10  (aportes en 2 días distintos; 1 aporte = 5)
 *  Retos semanales ............ 10  (2,5 por reto completado, máximo 4)
 *
 * Este archivo también define los retos semanales que alimentan el último componente.
 */
import type { Actividad, AporteMeta, Extracto, Factura, Movimiento, Presupuesto, Recompensa } from './tipos'
import { diasDelMes, fechaISO, mesDe, parseFecha, sumarDias, uid } from './formato'
import { RECOMPENSAS } from './planes'

/** Una fila del desglose del FinScore, tal como se muestra en la pantalla FinScore. */
export interface ComponenteScore {
  id: string
  nombre: string
  /** Regla en lenguaje sencillo. */
  descripcion: string
  puntos: number
  maximo: number
  /** Progreso legible ("12 de 20 días"). */
  detalle: string
}

/** Lo que necesita el cálculo: un subconjunto del estado de la app. */
export interface DatosScore {
  movimientos: Movimiento[]
  presupuestos: Presupuesto[]
  aportes: AporteMeta[]
  extractos: Extracto[]
  actividades: Actividad[]
  facturas: Factura[]
  /** Si no hay promociones activas, el reto "Compra aliada" no se puede cumplir y no se propone. */
  promociones?: { activa: boolean; desde: string; hasta: string }[]
}

/** Día local (`YYYY-MM-DD`) de una marca de tiempo ISO; si ya es un día, lo devuelve igual. */
const fechaLocal = (iso: string) => (iso.length > 10 ? fechaISO(new Date(iso)) : iso)

/**
 * Días (YYYY-MM-DD) del mes en los que el usuario registró algo a mano o con factura.
 * Cuenta el día en que se ANOTÓ (`creadoEn`), no la fecha del gasto: lo que se premia es el hábito.
 * Los movimientos importados de un extracto no cuentan, porque no requieren constancia.
 */
export function diasConRegistro(movs: Movimiento[], mes: string) {
  return new Set(movs.filter((m) => m.origen !== 'extracto').map((m) => fechaLocal(m.creadoEn)).filter((d) => mesDe(d) === mes))
}

/** Racha más larga de días consecutivos dentro del conjunto. */
export function rachaMaxima(dias: Set<string>) {
  let max = 0
  for (const d of dias) {
    // Solo se empieza a contar desde el primer día de cada racha.
    if (dias.has(sumarDias(d, -1))) continue
    let n = 1
    while (dias.has(sumarDias(d, n))) n++
    max = Math.max(max, n)
  }
  return max
}

/**
 * Racha vigente (la que se muestra en la barra superior).
 * Si hoy todavía no registró nada, la racha de ayer sigue viva hasta que termine el día.
 */
export function rachaActual(movs: Movimiento[], hoy: string) {
  const dias = new Set(movs.filter((m) => m.origen !== 'extracto').map((m) => fechaLocal(m.creadoEn)))
  let d = dias.has(hoy) ? hoy : sumarDias(hoy, -1)
  let n = 0
  while (dias.has(d)) { n++; d = sumarDias(d, -1) }
  return n
}

/** Lunes de la semana de una fecha (las semanas van de lunes a domingo). */
export const semanaDe = (fecha: string) => {
  const d = parseFecha(fecha)
  // getDay(): 0 = domingo … 6 = sábado. Se convierte a días desde el lunes.
  const lunes = (d.getDay() + 6) % 7
  return sumarDias(fecha, -lunes)
}

/** Calcula el FinScore de un mes (`YYYY-MM`) con su desglose por componente. */
export function calcularFinScore(datos: DatosScore, mes: string): { total: number; componentes: ComponenteScore[] } {
  const dias = diasConRegistro(datos.movimientos, mes)
  const racha = rachaMaxima(dias)
  // El extracto cuenta para el mes que cubre (suele llegar a inicios del mes siguiente, por eso existe el periodo de gracia).
  const extractosMes = datos.extractos.filter((e) => e.periodo === mes && e.filas > 0)
  const pptos = datos.presupuestos.filter((p) => p.mes === mes)
  const semanasRevision = new Set(
    datos.actividades
      .filter((a) => (a.tipo === 'revision_presupuesto' || a.tipo === 'revision_insights') && mesDe(fechaLocal(a.fecha)) === mes)
      .map((a) => semanaDe(fechaLocal(a.fecha))),
  )
  const diasAporte = new Set(datos.aportes.filter((a) => mesDe(a.fecha) === mes).map((a) => a.fecha))
  const retos = new Set(datos.actividades.filter((a) => a.tipo === 'reto_completado' && mesDe(fechaLocal(a.fecha)) === mes).map((a) => a.ref))

  const componentes: ComponenteScore[] = [
    {
      id: 'registro',
      nombre: 'Registro constante',
      descripcion: '2 puntos por cada día en que registras al menos un movimiento.',
      puntos: Math.min(40, dias.size * 2),
      maximo: 40,
      detalle: `${dias.size} de 20 días`,
    },
    {
      id: 'racha',
      nombre: 'Racha',
      descripcion: 'Registra varios días seguidos: 7 días = 5 pts, 14 días = 10 pts.',
      puntos: racha >= 14 ? 10 : racha >= 7 ? 5 : 0,
      maximo: 10,
      detalle: `Mejor racha: ${racha} ${racha === 1 ? 'día' : 'días'}`,
    },
    {
      id: 'extracto',
      nombre: 'Extracto del banco',
      descripcion: 'Importa el extracto bancario del mes (tienes hasta el día 5 del mes siguiente).',
      puntos: extractosMes.length ? 15 : 0,
      maximo: 15,
      detalle: extractosMes.length ? `${extractosMes.length} extracto(s)` : 'Pendiente',
    },
    {
      id: 'presupuesto',
      nombre: 'Presupuestos',
      descripcion: 'Define 3 presupuestos (5 pts) y revísalos cada semana (2,5 pts por semana).',
      puntos: (pptos.length >= 3 ? 5 : 0) + Math.min(4, semanasRevision.size) * 2.5,
      maximo: 15,
      detalle: `${pptos.length} presupuestos · ${Math.min(4, semanasRevision.size)}/4 semanas revisadas`,
    },
    {
      id: 'metas',
      nombre: 'Metas de ahorro',
      descripcion: 'Aporta a tus metas: 1 aporte = 5 pts, aportes en 2 días distintos = 10 pts.',
      puntos: diasAporte.size >= 2 ? 10 : diasAporte.size === 1 ? 5 : 0,
      maximo: 10,
      detalle: `${diasAporte.size} aporte(s) este mes`,
    },
    {
      id: 'retos',
      nombre: 'Retos semanales',
      descripcion: '2,5 puntos por cada reto completado (máximo 4 en el mes).',
      puntos: Math.min(4, retos.size) * 2.5,
      maximo: 10,
      detalle: `${Math.min(4, retos.size)}/4 retos`,
    },
  ]
  return { total: Math.round(componentes.reduce((a, c) => a + c.puntos, 0)), componentes }
}

/** Un mes se cierra (y se emite su recompensa) a partir de este día del mes siguiente. */
export const DIA_CIERRE = 6

/** Recompensa que corresponde a un puntaje (o null si no alcanza el umbral del cupón). */
export function nivelRecompensa(puntaje: number) {
  if (puntaje >= RECOMPENSAS.umbralMesExtra) return 'cupon_y_mes' as const
  if (puntaje >= RECOMPENSAS.umbralCupon) return 'cupon' as const
  return null
}

/** Puntos que aún pueden ganarse en lo que queda del mes (para mostrar si 100 es alcanzable). */
export function maximoAlcanzable(actual: { componentes: ComponenteScore[] }, mes: string, hoy: string) {
  // Días que quedan en el mes, contando hoy. Solo el registro diario depende del calendario;
  // los demás componentes todavía pueden completarse enteros.
  const restantes = Math.max(0, diasDelMes(mes) - Number(hoy.slice(8, 10)) + 1)
  return actual.componentes.reduce((a, c) => {
    if (c.id === 'registro') return a + Math.min(40, c.puntos + restantes * 2)
    return a + c.maximo
  }, 0)
}

/**
 * Recompensa del cierre de mes (modo demo). En Supabase la emite el servidor con `finscore_mes`.
 * Devuelve null si el puntaje no alcanza el umbral del cupón.
 */
export function crearRecompensa(mes: string, puntaje: number, hoy: string): Recompensa | null {
  const tipo = nivelRecompensa(puntaje)
  if (!tipo) return null
  const perfecto = tipo === 'cupon_y_mes'
  return {
    id: uid(),
    mes,
    puntaje,
    tipo,
    // Ejemplo: noviembre de 2026 → "FIN2611-K3P9Q".
    codigo: `FIN${mes.replace('-', '').slice(2)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    descuento: perfecto ? RECOMPENSAS.descuentoPerfecto : RECOMPENSAS.descuentoCupon,
    diasPremium: perfecto ? RECOMPENSAS.diasPremiumPerfecto : 0,
    usado: false,
    venceEn: sumarDias(hoy, RECOMPENSAS.diasVigenciaCupon),
  }
}

// ---------------- Retos semanales ----------------

/** Reto de la semana con su progreso actual. */
export interface Reto {
  /** `"<lunes>:<id del reto>"`: así el mismo reto cuenta una vez por semana. */
  id: string
  titulo: string
  descripcion: string
  meta: number
  progreso: number
  completado: boolean
}

/** Definición de un reto: `medir` cuenta cuánto lleva el usuario entre `desde` y `hasta` (ambos incluidos). */
type DefReto = { id: string; titulo: string; descripcion: string; meta: number; medir: (d: DatosScore, desde: string, hasta: string) => number }

/** Todos los retos posibles. Cada semana se eligen 3. */
const POOL: DefReto[] = [
  {
    id: 'registro5', titulo: 'Semana constante', descripcion: 'Registra movimientos en 5 días distintos esta semana.', meta: 5,
    medir: (d, a, b) => new Set(d.movimientos.filter((m) => m.origen !== 'extracto').map((m) => fechaLocal(m.creadoEn)).filter((x) => x >= a && x <= b)).size,
  },
  {
    id: 'insights2', titulo: 'Mira tus números', descripcion: 'Abre tu Asistente en 2 días distintos.', meta: 2,
    medir: (d, a, b) => new Set(d.actividades.filter((x) => x.tipo === 'revision_insights').map((x) => fechaLocal(x.fecha)).filter((x) => x >= a && x <= b)).size,
  },
  {
    id: 'aliado', titulo: 'Compra aliada', descripcion: 'Registra una factura de un comercio aliado.', meta: 1,
    medir: (d, a, b) => d.facturas.filter((f) => fechaLocal(f.creadoEn) >= a && fechaLocal(f.creadoEn) <= b).length,
  },
  {
    id: 'meta', titulo: 'Paso a paso', descripcion: 'Haz un aporte a cualquiera de tus metas de ahorro.', meta: 1,
    medir: (d, a, b) => d.aportes.filter((x) => x.fecha >= a && x.fecha <= b).length,
  },
  {
    id: 'notas3', titulo: 'Con contexto', descripcion: 'Agrega una nota a 3 de tus gastos.', meta: 3,
    medir: (d, a, b) => d.movimientos.filter((m) => m.nota && fechaLocal(m.creadoEn) >= a && fechaLocal(m.creadoEn) <= b).length,
  },
]

/** 3 retos por semana, rotando del pool según la semana para que no se repitan siempre. */
export function retosDeSemana(datos: DatosScore, hoy: string): { semana: string; retos: Reto[] } {
  const semana = semanaDe(hoy)
  const fin = sumarDias(semana, 6)
  // Número de la semana desde 1970: es el mismo para todos los usuarios, así la rotación es determinista.
  const n = Math.floor(parseFecha(semana).getTime() / (7 * 86_400_000))
  const hayAliados = !datos.promociones || datos.promociones.some((p) => p.activa && p.desde <= hoy && p.hasta >= hoy)
  const pool = POOL.filter((r) => r.id !== 'aliado' || hayAliados)
  // Se toman retos salteados (n, n+2, n+4) para que la combinación cambie de una semana a otra.
  const elegidos = [0, 1, 2].map((i) => pool[(n + i * 2) % pool.length])
  // Con un pool pequeño pueden repetirse: se quitan duplicados.
  const unicos = [...new Map(elegidos.map((r) => [r.id, r])).values()]
  return {
    semana,
    retos: unicos.map((r) => {
      const progreso = Math.min(r.meta, r.medir(datos, semana, fin))
      return { id: `${semana}:${r.id}`, titulo: r.titulo, descripcion: r.descripcion, meta: r.meta, progreso, completado: progreso >= r.meta }
    }),
  }
}
