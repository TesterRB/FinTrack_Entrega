/**
 * Interpretación de extractos bancarios (texto de PDF/OCR o CSV) a filas normalizadas.
 * Funciones puras: el texto llega desde lectorDocumentos.ts (pdf.js / Tesseract) o desde un CSV.
 *
 * Cada banco arma su extracto distinto, así que el lector es tolerante: busca líneas que EMPIEZAN con
 * una fecha y que contienen al menos un monto; el resto (encabezados, publicidad, totales) se ignora.
 */

/** Un movimiento leído del extracto, antes de convertirlo en `Movimiento`. */
export interface FilaExtracto {
  fecha: string // YYYY-MM-DD
  descripcion: string
  monto: number // negativo = débito
  saldo: number | null
  /** Línea original, para mostrarla si el usuario quiere revisar la lectura. */
  linea: string
}

export interface ExtractoInterpretado {
  banco: string
  titular: string | null
  /** Mes con más movimientos en el extracto (el que se concilia y suma al FinScore). */
  periodo: string | null // YYYY-MM
  filas: FilaExtracto[]
  /** Líneas que no parecían movimientos (útil para diagnosticar extractos que no se leen bien). */
  lineasIgnoradas: number
}

/** Abreviaturas de meses como aparecen en extractos ("05 OCT 2026"). `set` es la forma usada por algunos bancos. */
const MESES_ABREV: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** Convierte "1.234.567,89", "1,234,567.89", "-$125.400", "125400" o "(45.000)" a número. */
export function parseMonto(txt: string): number | null {
  let s = txt.trim().replace(/\s/g, '').replace(/\$|COP/gi, '')
  // El signo negativo puede venir como "(45.000)", "-45.000" o "45.000-" según el banco.
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = true; s = s.slice(1) }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1) }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const ultimoPunto = s.lastIndexOf('.')
  const ultimaComa = s.lastIndexOf(',')
  // El último separador es decimal solo si le siguen 1-2 dígitos ("125.400" son miles).
  const posDec = Math.max(ultimoPunto, ultimaComa)
  const decimales = posDec >= 0 ? s.length - posDec - 1 : 0
  if (posDec >= 0 && decimales > 0 && decimales <= 2) {
    const entero = s.slice(0, posDec).replace(/[.,]/g, '')
    s = `${entero}.${s.slice(posDec + 1)}`
  } else {
    s = s.replace(/[.,]/g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** Fechas: dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, aaaa/mm/dd, dd/mm (con año por defecto), "05 OCT 2026". */
export function parseFechaExtracto(txt: string, anioPorDefecto: number): string | null {
  const t = txt.trim().toLowerCase()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return armar(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) return armar(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/)
  if (m) return armar(anioPorDefecto, +m[2], +m[1])
  m = t.match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-]?(\d{4})?$/)
  if (m && MESES_ABREV[m[2]]) return armar(m[3] ? +m[3] : anioPorDefecto, MESES_ABREV[m[2]], +m[1])
  return null
}

/** Arma `YYYY-MM-DD` validando rangos básicos (no valida que el 31 exista en ese mes). */
function armar(a: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Fecha al inicio de la línea, en cualquiera de los formatos de `parseFechaExtracto`, seguida de espacio.
const RE_FECHA_INICIO = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{1,2}[\s-](?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*(?:[\s-]\d{4})?)\s+/i
// Montos: con separadores de miles ("1.234.567,89") o sin ellos ("125400"), con $, signo o paréntesis opcionales.
const RE_MONTO = /(?:^|\s)(\(?-?\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?-?\)?|\(?-?\$?\s?\d+(?:[.,]\d{1,2})?-?\)?)(?=\s|$)/g
// Cuando el banco no pone signo, estas palabras indican si el dinero salió o entró.
const PALABRAS_DEBITO = /(compra|pago|retiro|cargo|debito|cuota|comision|gmf|4x1000|transferencia enviada|envio|iva|avance)/i
const PALABRAS_CREDITO = /(abono|nomina|consignacion|transferencia recibida|recibida|deposito|intereses|reembolso|devolucion)/i

/** Interpreta el texto plano de un extracto (una línea por movimiento, como sale de pdf.js u OCR). */
export function interpretarTextoExtracto(texto: string, hoy = new Date()): ExtractoInterpretado {
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // Banco, titular y año se buscan solo en las primeras líneas (el encabezado del extracto).
  const cabecera = lineas.slice(0, 15).join(' ')
  const banco = cabecera.match(/\b(banco [a-záéíóú ]{3,30}?|nequi|daviplata|bancolombia|davivienda|bbva|scotiabank|itau|nu|lulo bank)\b/i)?.[0]?.trim() ?? 'Banco'
  const titular = cabecera.match(/(?:titular|cliente|señor\(a\)|nombre)\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{4,40}?)(?=\s{2,}|\s+(?:cuenta|nit|c\.?c|periodo|fecha|desde)|$)/i)?.[1]?.trim() ?? null
  const anioCab = cabecera.match(/\b(20\d{2})\b/)?.[1]
  const anio = anioCab ? Number(anioCab) : hoy.getFullYear()
  const usaColumnaSaldo = /saldo/i.test(cabecera)

  const filas: FilaExtracto[] = []
  let ignoradas = 0
  for (const linea of lineas) {
    const mf = linea.match(RE_FECHA_INICIO)
    if (!mf) { ignoradas++; continue }
    const fecha = parseFechaExtracto(mf[1], anio)
    if (!fecha) { ignoradas++; continue }
    let resto = linea.slice(mf[0].length)
    // Si viene una segunda fecha (fecha valor), se descarta.
    const mf2 = resto.match(RE_FECHA_INICIO)
    if (mf2 && parseFechaExtracto(mf2[1], anio)) resto = resto.slice(mf2[0].length)

    const montos: { valor: number; idx: number; txt: string }[] = []
    for (const mm of resto.matchAll(RE_MONTO)) {
      const txt = mm[1]
      const valor = parseMonto(txt)
      // Evita confundir referencias numéricas largas sin separadores con montos.
      if (valor === null || (/^\d{7,}$/.test(txt.replace(/[-$()]/g, '')) && !/[.,]/.test(txt))) continue
      montos.push({ valor, idx: mm.index ?? 0, txt })
    }
    if (!montos.length) { ignoradas++; continue }
    const primeraPos = montos[0].idx
    const descripcion = resto.slice(0, primeraPos).replace(/\s+\d{4,}$/, '').trim()
    if (!descripcion || /^(saldo|total|subtotal)/i.test(descripcion)) { ignoradas++; continue }

    let monto: number
    let saldo: number | null = null
    if (montos.length >= 3) {
      // Columnas débito | crédito | saldo: una de las dos primeras suele ser 0.
      const [a, b, c] = montos.slice(-3)
      monto = a.valor !== 0 ? -Math.abs(a.valor) : Math.abs(b.valor)
      saldo = c.valor
    } else if (montos.length === 2 && usaColumnaSaldo) {
      monto = montos[0].valor
      saldo = montos[1].valor
    } else {
      monto = montos[0].valor
    }
    // Si el banco no pone signo, se infiere por palabras clave.
    if (monto > 0 && !/^\(?-|-\)?$/.test(montos[0].txt) && !PALABRAS_CREDITO.test(descripcion) && PALABRAS_DEBITO.test(descripcion)) monto = -monto
    if (monto === 0) { ignoradas++; continue }
    filas.push({ fecha, descripcion: limpiarDescripcion(descripcion), monto, saldo, linea })
  }

  // El periodo es el mes que más se repite (un extracto puede traer movimientos de los últimos días del mes anterior).
  const conteoMes = new Map<string, number>()
  filas.forEach((f) => conteoMes.set(f.fecha.slice(0, 7), (conteoMes.get(f.fecha.slice(0, 7)) ?? 0) + 1))
  const periodo = [...conteoMes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { banco: titleCase(banco), titular, periodo, filas, lineasIgnoradas: ignoradas }
}

/** CSV con encabezados en español o inglés (fecha, descripción, valor | débito/crédito). */
export function interpretarCsv(filasCsv: Record<string, string>[], hoy = new Date()): ExtractoInterpretado {
  const claves = Object.keys(filasCsv[0] ?? {})
  // Busca la columna cuyo encabezado (sin tildes ni mayúsculas) coincide con el patrón.
  const buscar = (re: RegExp) => claves.find((k) => re.test(k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')))
  const kFecha = buscar(/fecha|date/)
  const kDesc = buscar(/descrip|concepto|detalle|description|comercio/)
  const kValor = buscar(/^(valor|monto|importe|amount)/)
  const kDeb = buscar(/debito|cargo|retiro|debit/)
  const kCred = buscar(/credito|abono|deposito|credit/)
  const kSaldo = buscar(/saldo|balance/)
  const filas: FilaExtracto[] = []
  let ignoradas = 0
  for (const r of filasCsv) {
    const fecha = kFecha ? parseFechaExtracto(r[kFecha] ?? '', hoy.getFullYear()) : null
    let monto: number | null = null
    if (kValor) monto = parseMonto(r[kValor] ?? '')
    else {
      const d = kDeb ? parseMonto(r[kDeb] ?? '') : null
      const c = kCred ? parseMonto(r[kCred] ?? '') : null
      monto = d ? -Math.abs(d) : c ? Math.abs(c) : null
    }
    const descripcion = kDesc ? (r[kDesc] ?? '').trim() : ''
    if (!fecha || !monto || !descripcion) { ignoradas++; continue }
    filas.push({ fecha, descripcion: limpiarDescripcion(descripcion), monto, saldo: kSaldo ? parseMonto(r[kSaldo] ?? '') : null, linea: Object.values(r).join(' | ') })
  }
  const periodo = filas.length ? filas[Math.floor(filas.length / 2)].fecha.slice(0, 7) : null
  return { banco: 'Archivo CSV', titular: null, periodo, filas, lineasIgnoradas: ignoradas }
}

/** Quita prefijos genéricos ("Compra en", "Pago PSE") y deja la descripción en formato título. */
function limpiarDescripcion(d: string) {
  return titleCase(d.replace(/\b(compra|pago)\s+(en|pse|pos)\b\s*/i, '').replace(/\s{2,}/g, ' ').trim()) || d
}

/** "TIENDAS D1 SAS" → "Tiendas D1 SAS": mayúscula inicial, pero respeta siglas conocidas. */
function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|\s|-)([a-záéíóúñ])/g, (_, p, l) => p + l.toUpperCase())
    .replace(/\b(Sas|Ltda|Pse|Gmf|Iva|Atm|Epm|Mio|D1|Eps)\b/g, (x) => x.toUpperCase())
}
