/**
 * Normalización de descripciones bancarias colombianas y estadística básica para los modelos.
 *
 * Una misma compra aparece escrita de muchas formas ("COMPRA POS JUAN VALDEZ BOG", "Juan Valdez Café"):
 * estas funciones la reducen a palabras comparables para clasificar, agrupar y emparejar movimientos.
 */

/** Palabras que aparecen en casi cualquier extracto y no dicen nada del comercio. */
const RUIDO = new Set([
  'compra', 'pago', 'pse', 'pos', 'tarj', 'tarjeta', 'debito', 'credito', 'cr', 'db', 'trx', 'transaccion',
  'ref', 'no', 'nro', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'por', 'con', 'sas', 's', 'ltda',
  'col', 'co', 'bog', 'cali', 'med', 'www', 'com', 'sa', 'cia', 'int', 'internacional', 'nal',
])

/** Minúsculas, sin tildes ni signos y con espacios simples: `"Café  Ñapa!"` → `"cafe napa"`. */
export function normalizar(texto: string) {
  return texto
    .toLowerCase()
    // NFD separa cada letra de su tilde; luego se borran las marcas diacríticas (U+0300–U+036F).
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokens de palabra (sin números ni ruido) + bigramas para capturar "juan valdez", "mercado libre", etc. */
export function tokens(texto: string): string[] {
  const palabras = normalizar(texto)
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !RUIDO.has(w))
  const out = [...palabras]
  for (let i = 0; i < palabras.length - 1; i++) out.push(palabras[i] + '_' + palabras[i + 1])
  return out
}

/**
 * Clave estable de comercio para agrupar movimientos (recurrentes, anomalías): las dos primeras palabras
 * significativas, sin números (que suelen ser referencias o sucursales que cambian en cada cobro).
 */
export function claveComercio(texto: string) {
  return normalizar(texto)
    .split(' ')
    .filter((w) => w.length > 2 && !/\d/.test(w) && !RUIDO.has(w))
    .slice(0, 2)
    .join(' ')
}

/** Similitud de Jaccard entre conjuntos de palabras (0-1): palabras en común / palabras distintas en total. */
export function similitud(a: string, b: string) {
  const ta = new Set(normalizar(a).split(' ').filter((w) => w.length > 2 && !RUIDO.has(w)))
  const tb = new Set(normalizar(b).split(' ').filter((w) => w.length > 2 && !RUIDO.has(w)))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  ta.forEach((w) => tb.has(w) && inter++)
  return inter / (ta.size + tb.size - inter)
}

// ---------------- Estadística ----------------
// Las tres devuelven 0 con una lista vacía, para no tener que validar en cada modelo.

/** Mediana: el valor del medio. Resiste valores atípicos mejor que el promedio. */
export const mediana = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** Promedio aritmético. */
export const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** Desviación estándar poblacional. */
export const desviacion = (xs: number[]) => {
  const p = promedio(xs)
  return Math.sqrt(promedio(xs.map((x) => (x - p) ** 2)))
}
