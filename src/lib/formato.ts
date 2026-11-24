/**
 * Formato de dinero y utilidades de fechas.
 *
 * Las fechas se manejan como texto `YYYY-MM-DD` en la hora local del dispositivo (no UTC): así un gasto
 * anotado a las 11 p. m. en Colombia no "salta" al día siguiente, como pasaría con `toISOString()`.
 */

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const copCorto = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 })

/** `1234567` → `"$ 1.234.567"`. */
export const pesos = (n: number) => cop.format(Math.round(n))
/** `1234567` → `"$1,2 M"` (para ejes de gráficas y espacios pequeños). */
export const pesosCorto = (n: number) => '$' + copCorto.format(n)
/** Monto con signo explícito: `"+ $ 50.000"` o `"- $ 12.000"`. */
export const signo = (n: number) => (n > 0 ? '+ ' : n < 0 ? '- ' : '') + pesos(Math.abs(n))
/** `12.345` → `"+12,3%"` (coma decimal, como se escribe en Colombia). */
export const porcentaje = (n: number, dec = 1) => `${n > 0 ? '+' : ''}${n.toFixed(dec).replace('.', ',')}%`

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Convierte un `Date` a `YYYY-MM-DD` en hora local. */
export function fechaISO(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}
/** Fecha de hoy (`YYYY-MM-DD`). */
export const hoyISO = () => fechaISO(new Date())
/** Mes de una fecha: `"2026-11-23"` → `"2026-11"`. */
export const mesDe = (fecha: string) => fecha.slice(0, 7)
/** Mes en curso (`YYYY-MM`). */
export const mesActual = () => hoyISO().slice(0, 7)
/** Mes `n` meses antes de `mes` (acepta cruces de año: `"2026-01"`, 1 → `"2025-12"`). */
export function mesAnterior(mes: string, n = 1) {
  const [a, m] = mes.split('-').map(Number)
  return fechaISO(new Date(a, m - 1 - n, 1)).slice(0, 7)
}
/** `"2026-11"` → `"noviembre 2026"` (o solo `"noviembre"`). */
export function nombreMes(mes: string, conAnio = true) {
  const [a, m] = mes.split('-').map(Number)
  const n = MESES[m - 1]
  return conAnio ? `${n} ${a}` : n
}
/** Número de días del mes (`"2026-02"` → 28). El día 0 del mes siguiente es el último del actual. */
export function diasDelMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}
/** Convierte `YYYY-MM-DD` (o un ISO completo) a `Date` a medianoche local. */
export function parseFecha(f: string) {
  const [a, m, d] = f.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}
/** Días de `a` a `b` (positivo si `b` es posterior). Redondea para absorber los cambios de horario. */
export function diasEntre(a: string, b: string) {
  return Math.round((parseFecha(b).getTime() - parseFecha(a).getTime()) / 86_400_000)
}
/** Suma (o resta, con `n` negativo) días a una fecha. */
export function sumarDias(f: string, n: number) {
  const d = parseFecha(f)
  d.setDate(d.getDate() + n)
  return fechaISO(d)
}
/** Primera letra en mayúscula: `"noviembre 2026"` → `"Noviembre 2026"`. */
export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Fecha para mostrar en listas: "Hoy", "Ayer", "23 nov" o "23 nov 2025" si es de otro año. */
export function fechaLegible(f: string) {
  const dif = diasEntre(f, hoyISO())
  if (dif === 0) return 'Hoy'
  if (dif === 1) return 'Ayer'
  const d = parseFecha(f)
  const anio = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${anio}`
}

/** Identificador único. Usa `crypto.randomUUID` y, en WebViews antiguos que no lo tienen, un respaldo aleatorio. */
export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
