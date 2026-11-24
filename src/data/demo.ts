/**
 * Generador de datos de ejemplo para el modo demo (y para las pruebas del motor).
 * Las fechas son relativas a hoy, así que la demo siempre muestra los últimos cuatro meses.
 */
import type { Actividad, Aliado, AporteMeta, Cuenta, Extracto, IdCategoria, Meta, Movimiento, Presupuesto, Promocion } from '../lib/tipos'
import { fechaISO, mesActual, mesAnterior, mesDe, parseFecha, sumarDias } from '../lib/formato'
import type { FilaExtracto } from '../ml/extractos'

// Perfil de ejemplo coherente: Valentina Gómez, 26 años, analista en Cali (persona ficticia).
//  - Gana $3.400.000 al mes en dos quincenas (días 15 y último del mes); paga $950.000 de arriendo.
//  - Abrió su cuenta en FinTrack el día 1 de hace cuatro meses: no hay movimientos anteriores.
//  - Gasta unos $2,7 M al mes; con lo que sobra aparta plata para tres metas (lo apartado sigue dentro de su
//    saldo: las metas son "bolsillos", así que su saldo total siempre es mayor que lo ahorrado en metas).
//  - Subió los extractos de los meses ya cerrados; el del mes pasado todavía no (ahí se le olvidaron
//    algunos gastos con tarjeta, que el extracto de ejemplo trae para probar la comparación).
// Todo es determinista (semilla fija) para que la demo se vea igual en cada instalación.

/** Generador pseudoaleatorio con semilla (congruencial lineal): misma semilla, misma secuencia. */
function rng(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Un hecho financiero "real" de la persona. De aquí salen tanto lo que anotó como lo que trae su extracto. */
interface Evento {
  fecha: string
  /** Cómo lo anotaría ella en la app. */
  descripcion: string
  /** Cómo aparece en el extracto del banco (en mayúsculas, con códigos). */
  descBanco: string
  monto: number
  categoria: IdCategoria
  cuenta: 'banco' | 'tarjeta' | 'efectivo' | 'billetera'
}

export const CUENTAS_DEMO: Cuenta[] = [
  { id: 'banco', nombre: 'Cuenta de ahorros', tipo: 'banco' },
  { id: 'tarjeta', nombre: 'Tarjeta de crédito', tipo: 'tarjeta' },
  { id: 'billetera', nombre: 'Billetera digital', tipo: 'billetera' },
  { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo' },
]

/** Primer día de la cuenta demo (hace cuatro meses). */
export const inicioDemo = () => `${mesAnterior(mesActual(), 4)}-01`

const SUELDO_QUINCENA = 1_700_000

/** Todos los eventos desde el inicio de la cuenta hasta hoy, en orden de fecha. */
function eventos(hoy: string): Evento[] {
  const r = rng(20261120)
  /** Monto aleatorio entre a y b, redondeado a centenas (como los precios reales). */
  const entre = (a: number, b: number) => Math.round((a + r() * (b - a)) / 100) * 100
  const ev: Evento[] = []
  const inicio = inicioDemo()
  // Lo que tenía en sus cuentas al empezar a usar la app (no es ingreso del mes).
  ev.push({ fecha: inicio, descripcion: 'Saldo inicial de mis cuentas', descBanco: 'SALDO ANTERIOR', monto: 1_800_000, categoria: 'transferencias', cuenta: 'banco' })
  for (let f = inicio; f <= hoy; f = sumarDias(f, 1)) {
    const d = parseFecha(f)
    const dia = d.getDate()
    const dow = d.getDay()
    const finDeMes = parseFecha(sumarDias(f, 1)).getDate() === 1
    const push = (descripcion: string, monto: number, categoria: IdCategoria, cuenta: Evento['cuenta'], descBanco?: string) =>
      ev.push({ fecha: f, descripcion, descBanco: descBanco ?? descripcion.toUpperCase(), monto, categoria, cuenta })

    // Ingresos y pagos fijos.
    if (dia === 15 || finDeMes) push('Pago nómina', SUELDO_QUINCENA, 'ingresos', 'banco', 'ABONO NOMINA ACME SAS')
    if (dia === 2) push('Smart Fit', -79_900, 'salud', 'tarjeta', 'SMART FIT CALI')
    if (dia === 5) push('Arriendo apartaestudio', -950_000, 'vivienda', 'banco', 'TRANSF CANON ARRENDAMIENTO')
    if (dia === 8) push('Spotify', -16_900, 'entretenimiento', 'tarjeta', 'SPOTIFY P1A2B3 STOCKHOLM')
    if (dia === 12) push('Netflix', -26_900, 'entretenimiento', 'tarjeta', 'NETFLIX.COM')
    if (dia === 14) push('Claro hogar internet', -89_900, 'servicios', 'banco', 'PAGO PSE CLARO HOGAR')
    if (dia === 18) push('Emcali servicios', -entre(85_000, 115_000), 'servicios', 'banco', 'PAGO PSE EMCALI EICE')
    if (dia === 20) push('Disney Plus', -27_900, 'entretenimiento', 'tarjeta', 'DISNEYPLUS')
    if (dia === 22) push('Plan celular Claro', -42_900, 'servicios', 'banco', 'PAGO PSE CLARO MOVIL')
    if (dia === 25) push('Platzi', -45_000, 'educacion', 'tarjeta', 'PLATZI.COM')

    // Mercado grande después de cada pago y compras pequeñas entre semana.
    if (dia === 1) push('Almacenes Éxito', -entre(170_000, 240_000), 'mercado', 'banco', 'COMPRA POS ALMACENES EXITO')
    if (dia === 16) push('Tiendas D1', -entre(150_000, 220_000), 'mercado', 'banco', 'COMPRA POS TIENDAS D1 CALI')
    if (dow === 3 && r() < 0.45) push('Tiendas Ara', -entre(25_000, 65_000), 'mercado', 'banco', 'COMPRA POS TIENDAS ARA CALI')

    // Comida: almuerzos entre semana, salidas los viernes y sábados, café de vez en cuando.
    if (dow >= 1 && dow <= 5 && r() < 0.5) push(r() < 0.5 ? 'Almuerzo ejecutivo' : 'Corrientazo', -entre(14_000, 20_000), 'comida', 'efectivo')
    if ((dow === 5 || dow === 6) && r() < 0.45) {
      const op = [
        ['Crepes & Waffles', 'CREPES Y WAFFLES CHIPICHAPE'],
        ['Rappi restaurante', 'RAPPI COLOMBIA*REST'],
        ['Frisby', 'FRISBY CALI'],
        ['El Corral', 'HAMB EL CORRAL UNICENTRO'],
      ][Math.floor(r() * 4)]
      push(op[0], -entre(35_000, 85_000), 'comida', 'tarjeta', op[1])
    }
    if (dow >= 1 && dow <= 5 && r() < 0.3) push('Juan Valdez Café', -entre(7_500, 12_900), 'comida', 'billetera', 'JUAN VALDEZ CAFE')
    if (r() < 0.15) push('Tostao café y pan', -entre(4_000, 9_000), 'comida', 'efectivo')

    // Transporte, compras, salud y salidas.
    if (dow >= 1 && dow <= 5 && r() < 0.45) push('Recarga MIO', -entre(10_000, 18_000), 'transporte', 'billetera', 'RECARGA MIO CALI')
    if (r() < 0.12) {
      const app = r() < 0.5 ? ['Uber', 'UBER *TRIP'] : ['DiDi', 'DIDI RIDES CO']
      push(app[0], -entre(9_000, 26_000), 'transporte', 'tarjeta', app[1])
    }
    if (r() < 0.04) push('Mercado Libre', -entre(45_000, 180_000), 'compras', 'tarjeta', 'MERCADOLIBRE*COLOMBIA')
    if (r() < 0.04) push('Droguería La Rebaja', -entre(12_000, 60_000), 'salud', 'banco', 'COMPRA POS DROG LA REBAJA')
    if (dow === 6 && r() < 0.25) push('Cine Colombia', -entre(30_000, 55_000), 'entretenimiento', 'tarjeta', 'CINE COLOMBIA CHIPICHAPE')
  }
  // Dos casos para revisar el mes pasado: una compra grande poco habitual y un cobro doble.
  const mesPasado = mesAnterior(mesActual())
  ev.push({ fecha: `${mesPasado}-17`, descripcion: 'Falabella', descBanco: 'FALABELLA CHIPICHAPE', monto: -459_000, categoria: 'compras', cuenta: 'tarjeta' })
  ev.push({ fecha: `${mesPasado}-21`, descripcion: 'Rappi restaurante', descBanco: 'RAPPI COLOMBIA*REST', monto: -48_500, categoria: 'comida', cuenta: 'tarjeta' })
  ev.push({ fecha: `${mesPasado}-21`, descripcion: 'Rappi restaurante', descBanco: 'RAPPI COLOMBIA*REST', monto: -48_500, categoria: 'comida', cuenta: 'tarjeta' })
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Cobros que solo aparecen en el extracto del banco (nadie los anota). */
const SOLO_BANCO = (mes: string): [string, string, string, number, IdCategoria][] => [
  [`${mes}-03`, 'CUOTA MANEJO TARJETA', 'Cuota de manejo tarjeta', -21_500, 'servicios'],
  [`${mes}-28`, 'GMF 4X1000', 'Impuesto 4x1000', -14_800, 'otros'],
  [`${mes}-28`, 'INTERESES AHORRO', 'Intereses cuenta de ahorros', 1_200, 'ingresos'],
]

/** El efectivo y la billetera digital no salen en el extracto bancario. */
const enExtracto = (e: Evento) => e.cuenta === 'banco' || e.cuenta === 'tarjeta'

/** Meses con extracto subido: todos los cerrados menos el último (ese queda pendiente para probar). */
export function mesesConExtracto() {
  return [4, 3, 2].map((i) => mesAnterior(mesActual(), i))
}

/**
 * Movimientos y extractos de la demo a partir de los eventos: simula lo que la persona anotó (con olvidos,
 * redondeos y días de retraso) y lo que ya concilió con sus extractos.
 */
export function generarDemo(hoy = fechaISO(new Date())) {
  const r = rng(77)
  const evs = eventos(hoy)
  const conExtracto = new Set(mesesConExtracto())
  const movimientos: Movimiento[] = []
  const extractos: Extracto[] = []
  const porMes = new Map<string, { filas: number; conciliados: number; agregados: number }>()

  evs.forEach((e, i) => {
    const mes = mesDe(e.fecha)
    const id = `demo-${i}`
    // En los meses ya cerrados se le pasó anotar ~12 % de los gastos con tarjeta o cuenta (no el arriendo).
    const olvidado = mes < mesActual() && enExtracto(e) && e.monto < 0 && e.monto > -500_000 && r() < 0.12
    const subido = conExtracto.has(mes)
    if (subido && enExtracto(e) && e.categoria !== 'transferencias') {
      const c = porMes.get(mes) ?? { filas: 0, conciliados: 0, agregados: 0 }
      c.filas++
      if (olvidado) c.agregados++
      else c.conciliados++
      porMes.set(mes, c)
    }
    if (olvidado && !subido) return // el mes pasado: aún no subió el extracto, así que siguen faltando
    // A veces anota al día siguiente o redondea el monto.
    const retraso = r() < 0.2 ? 1 : 0
    const monto = !olvidado && e.cuenta !== 'efectivo' && r() < 0.1 ? Math.round(e.monto / 1000) * 1000 : e.monto
    const idExtracto = subido && enExtracto(e) && e.categoria !== 'transferencias' ? `ext-${mes}` : null
    movimientos.push({
      id,
      fecha: e.fecha,
      descripcion: e.descripcion,
      monto,
      categoria: e.categoria,
      confianza: null,
      cuentaId: e.cuenta,
      origen: olvidado ? 'extracto' : 'manual',
      conciliado: !!idExtracto,
      extractoId: idExtracto,
      // Lo agregado desde el extracto se creó el día en que lo subió (día 3 del mes siguiente).
      creadoEn: olvidado ? `${sumarDias(`${mes}-01`, 33).slice(0, 8)}03T19:40:00` : `${sumarDias(e.fecha, retraso)}T${String(12 + Math.floor(r() * 9)).padStart(2, '0')}:15:00`,
    })
  })

  // Lo que solo trae el banco se agregó al subir cada extracto.
  for (const mes of conExtracto) {
    const subidoEl = `${sumarDias(`${mes}-01`, 33).slice(0, 8)}03T19:40:00`
    SOLO_BANCO(mes).forEach(([fecha, , descripcion, monto, categoria], k) => {
      movimientos.push({
        id: `demo-banco-${mes}-${k}`, fecha, descripcion, monto, categoria, confianza: null, cuentaId: 'banco',
        origen: 'extracto', conciliado: true, extractoId: `ext-${mes}`, creadoEn: subidoEl,
      })
    })
    const c = porMes.get(mes) ?? { filas: 0, conciliados: 0, agregados: 0 }
    extractos.push({
      id: `ext-${mes}`, banco: 'Banco Andino', periodo: mes, archivo: `extracto-${mes}.pdf`,
      filas: c.filas + SOLO_BANCO(mes).length, conciliados: c.conciliados, agregados: c.agregados + SOLO_BANCO(mes).length, creadoEn: subidoEl,
    })
  }
  return { movimientos, eventos: evs, extractos }
}

/** Filas del extracto bancario de un mes según los datos de ejemplo (para la descarga de prueba). */
export function filasBancoDemo(mes: string, hoy = fechaISO(new Date())): FilaExtracto[] {
  let saldo = 2_950_000
  const filas: FilaExtracto[] = []
  for (const e of eventos(hoy)) {
    if (!e.fecha.startsWith(mes) || !enExtracto(e) || e.categoria === 'transferencias') continue
    saldo += e.monto
    filas.push({ fecha: e.fecha, descripcion: e.descBanco, monto: e.monto, saldo, linea: '' })
  }
  SOLO_BANCO(mes).forEach(([fecha, descripcion, , monto]) => filas.push({ fecha, descripcion, monto, saldo: (saldo += monto), linea: '' }))
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Presupuesto mensual por categoría que define la persona de ejemplo. */
const CATEGORIAS_PRESUPUESTO: [IdCategoria, number][] = [['comida', 550_000], ['mercado', 550_000], ['transporte', 250_000], ['entretenimiento', 150_000], ['compras', 250_000]]

/** Presupuestos desde su segundo mes en la app (el primero solo anotó). */
export function presupuestosDemo(): Presupuesto[] {
  const meses = [3, 2, 1, 0].map((i) => mesAnterior(mesActual(), i))
  return meses.flatMap((m) => CATEGORIAS_PRESUPUESTO.map(([categoria, limite]) => ({ id: `ppto-${m}-${categoria}`, categoria, limite, mes: m })))
}

/**
 * Metas: lo ahorrado en cada una es exactamente la suma de sus aportes. Aporta el día 1 (fondo y portátil)
 * y el 16 (viaje), justo después de cada pago.
 */
export function metasDemo(hoy = fechaISO(new Date())): { metas: Meta[]; aportes: AporteMeta[] } {
  const inicio = inicioDemo()
  const meses = [4, 3, 2, 1, 0].map((i) => mesAnterior(mesActual(), i))
  const aportes: AporteMeta[] = []
  const aportar = (metaId: string, monto: number, fecha: string) => {
    if (fecha <= hoy) aportes.push({ id: `ap-${metaId}-${fecha}`, metaId, monto, fecha })
  }
  aportar('meta-fondo', 800_000, inicio) // pasó a la meta parte de lo que ya tenía ahorrado
  meses.forEach((m, i) => {
    aportar('meta-viaje', 150_000, `${m}-16`)
    if (i > 0) {
      aportar('meta-fondo', 200_000, `${m}-01`)
      aportar('meta-portatil', 100_000, `${m}-01`)
    }
  })
  const suma = (id: string) => aportes.filter((a) => a.metaId === id).reduce((s, a) => s + a.monto, 0)
  const anio = Number(mesActual().slice(0, 4))
  return {
    metas: [
      { id: 'meta-viaje', nombre: 'Viaje a Cartagena', objetivo: 1_800_000, ahorrado: suma('meta-viaje'), fechaLimite: `${anio + 1}-06-20`, icono: 'playa' },
      { id: 'meta-fondo', nombre: 'Fondo de emergencia', objetivo: 6_000_000, ahorrado: suma('meta-fondo'), fechaLimite: null, icono: 'emergencia' },
      { id: 'meta-portatil', nombre: 'Portátil nuevo', objetivo: 3_200_000, ahorrado: suma('meta-portatil'), fechaLimite: `${anio + 1}-03-31`, icono: 'tecnologia' },
    ],
    aportes,
  }
}

/**
 * Lo que hizo en la app además de anotar: revisar presupuestos y el asistente y completar retos semanales.
 * Fue tomando el hábito: poco el primer mes, constante después. (Las semanas en curso las registra la app sola.)
 */
export function actividadesDemo(hoy = fechaISO(new Date())): Actividad[] {
  const meses = [4, 3, 2, 1, 0].map((i) => mesAnterior(mesActual(), i))
  // Por mes: semanas con revisión (días del mes) y retos completados.
  const plan: { revisiones: number[]; retos: number }[] = [
    { revisiones: [], retos: 0 },
    { revisiones: [6, 20], retos: 1 },
    { revisiones: [4, 11, 18, 25], retos: 3 },
    { revisiones: [7, 14, 21], retos: 2 },
    { revisiones: [3, 10], retos: 1 },
  ]
  const res: Actividad[] = []
  meses.forEach((m, i) => {
    plan[i].revisiones.forEach((dia, k) => {
      const fecha = `${m}-${String(dia).padStart(2, '0')}`
      if (fecha >= hoy) return
      res.push({ id: `act-${m}-p${k}`, tipo: 'revision_presupuesto', fecha: `${fecha}T20:10:00` })
      res.push({ id: `act-${m}-i${k}`, tipo: 'revision_insights', fecha: `${sumarDias(fecha, 1)}T08:30:00` })
    })
    for (let k = 0; k < plan[i].retos; k++) {
      const fecha = `${m}-${String(8 + k * 7).padStart(2, '0')}`
      if (fecha >= sumarDias(hoy, -7)) continue
      res.push({ id: `act-${m}-r${k}`, tipo: 'reto_completado', ref: `${fecha}:registro5`, fecha: `${fecha}T21:00:00` })
    }
  })
  return res
}

// Comercios aliados ficticios para la demo (los reales se administran desde el panel).
export const ALIADOS_DEMO: Aliado[] = [
  { id: 'al-cafe', nombre: 'Café Origen del Valle', nit: '901456789-1', categoria: 'comida', ciudad: 'Cali', logo: '' },
  { id: 'al-fogata', nombre: 'La Fogata Caleña', nit: '900321654-7', categoria: 'comida', ciudad: 'Cali', logo: '' },
  { id: 'al-mercado', nombre: 'Mercado Fresco Express', nit: '901112233-4', categoria: 'mercado', ciudad: 'Cali', logo: '' },
  { id: 'al-libros', nombre: 'Librería Páginas Vivas', nit: '900998877-2', categoria: 'educacion', ciudad: 'Cali', logo: '' },
]

/** Promociones vigentes de los aliados de ejemplo (siempre activas alrededor del mes actual). */
export function promocionesDemo(): Promocion[] {
  const mes = mesActual()
  const fin = sumarDias(`${mes}-01`, 40)
  return [
    {
      id: 'pr-fogata', aliadoId: 'al-fogata', titulo: '15 % en tu próximo almuerzo',
      descripcion: 'Registra en FinTrack la factura de tu consumo en La Fogata Caleña y recibe un bono para tu próxima visita.',
      beneficio: 'Bono del 15 % en tu próximo consumo', montoMinimo: 30_000, desde: `${mesAnterior(mes)}-15`, hasta: fin, activa: true, puntos: 0,
      reglas: ['Factura electrónica o tiquete POS a tu nombre o sin nombre.', 'Consumo mínimo de $30.000.', 'Una participación por usuario.', 'La factura debe ser de la vigencia de la promoción.'],
    },
    {
      id: 'pr-cafe', aliadoId: 'al-cafe', titulo: 'Café gratis por tu racha',
      descripcion: 'Sube la factura de cualquier compra en Café Origen del Valle y llévate un café filtrado gratis.',
      beneficio: 'Un café filtrado gratis', montoMinimo: 8_000, desde: `${mes}-01`, hasta: fin, activa: true, puntos: 0,
      reglas: ['Compra mínima de $8.000.', 'Válido en todas las sedes de Cali.', 'Una participación por usuario.'],
    },
    {
      id: 'pr-mercado', aliadoId: 'al-mercado', titulo: '$20.000 de descuento en tu mercado',
      descripcion: 'Por compras desde $150.000 en Mercado Fresco Express recibe un cupón para tu siguiente mercado.',
      beneficio: 'Cupón de $20.000', montoMinimo: 150_000, desde: `${mes}-01`, hasta: fin, activa: true, puntos: 0,
      reglas: ['Compra mínima de $150.000.', 'No acumulable con otras promociones del comercio.', 'Una participación por usuario.'],
    },
  ]
}
