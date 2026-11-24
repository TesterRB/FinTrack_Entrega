/**
 * Lectura y validación de facturas para las promociones de aliados.
 * El OCR lo hace `lectorDocumentos.ts`; aquí se interpreta el texto y se aplican las reglas de la promoción.
 */
import type { Aliado, DatosOcr, Promocion } from '../lib/tipos'
import { parseFechaExtracto, parseMonto } from './extractos'
import { normalizar, similitud } from './texto'

/** Extrae NIT, total, fecha y comercio del texto OCR de una factura/tiquete POS colombiano. */
export function interpretarFactura(texto: string, confianzaOcr: number, hoy = new Date()): DatosOcr {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const plano = lineas.join('\n')

  // "NIT", "N.I.T." o "Nit:" seguido de dígitos con puntos y el dígito de verificación opcional.
  const nitMatch = plano.match(/N\.?\s?I\.?\s?T\.?\s*[:.#]?\s*([\d.\s]{6,15}[-–]?\s?\d?)/i)
  const nit = nitMatch ? nitMatch[1].replace(/[^\d-]/g, '').replace(/-$/, '') : null

  // Total: la línea con "total" (sin "sub") y el monto más alto en esa zona.
  let total: number | null = null
  for (const l of lineas) {
    if (!/total|valor a pagar|neto a pagar|vr\.? pagar/i.test(l) || /sub\s?total|iva|impoconsumo|base/i.test(l)) continue
    const montos = [...l.matchAll(/\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\$?\s?\d{4,}/g)].map((m) => parseMonto(m[0]) ?? 0)
    const max = Math.max(0, ...montos)
    if (max > (total ?? 0)) total = max
  }
  // Respaldo: si ninguna línea dice "total", se toma el monto con $ más alto de la factura.
  if (total === null) {
    const todos = [...plano.matchAll(/\$\s?\d{1,3}(?:[.,]\d{3})+/g)].map((m) => parseMonto(m[0]) ?? 0)
    if (todos.length) total = Math.max(...todos)
  }

  let fecha: string | null = null
  const mf = plano.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/)
  if (mf) fecha = parseFechaExtracto(mf[1], hoy.getFullYear())

  // El comercio suele ser la primera línea con texto que no es un dato legal (NIT, dirección, resolución…).
  const comercio = lineas.find((l) => /[a-záéíóúñ]{3,}/i.test(l) && !/nit|factura|fecha|direcci|tel|resoluci|regimen|caja/i.test(l)) ?? null

  return { texto, nit, total, fecha, comercio, confianza: confianzaOcr }
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')

/**
 * Validación automática de una factura contra las reglas de la promoción.
 * Sin alertas => aprobada automáticamente; con alertas => queda pendiente para revisión del admin.
 */
export function validarFactura(ocr: DatosOcr, promo: Promocion, aliado: Aliado, yaParticipo: boolean) {
  const alertas: string[] = []
  // Se comparan los 9 dígitos del NIT sin el dígito de verificación (el OCR a veces no lo lee).
  const nitOk = ocr.nit && soloDigitos(ocr.nit).slice(0, 9) === soloDigitos(aliado.nit).slice(0, 9)
  const nombreOk = similitud(ocr.texto.slice(0, 300), aliado.nombre) > 0 || normalizar(ocr.texto).includes(normalizar(aliado.nombre))
  if (!nitOk && !nombreOk) alertas.push(`No se encontró el NIT (${aliado.nit}) ni el nombre de ${aliado.nombre} en la factura.`)
  else if (!nitOk) alertas.push('El nombre del comercio coincide, pero no se pudo leer el NIT.')
  if (ocr.total === null) alertas.push('No se pudo leer el total de la factura.')
  else if (ocr.total < promo.montoMinimo) alertas.push(`El total leído es menor al mínimo de la promoción.`)
  if (!ocr.fecha) alertas.push('No se pudo leer la fecha de la factura.')
  else if (ocr.fecha < promo.desde || ocr.fecha > promo.hasta) alertas.push('La fecha de la factura está fuera de la vigencia de la promoción.')
  if (ocr.confianza < 60) alertas.push('La foto no se ve lo bastante clara para leer todos los datos.')
  if (yaParticipo) alertas.push('Ya registraste una factura para esta promoción.')
  // Casos que no tienen arreglo con revisión humana: se rechazan de una vez.
  const rechazoAutomatico = yaParticipo || (ocr.fecha !== null && (ocr.fecha < promo.desde || ocr.fecha > promo.hasta))
  return { alertas, aprobada: alertas.length === 0, rechazoAutomatico }
}
