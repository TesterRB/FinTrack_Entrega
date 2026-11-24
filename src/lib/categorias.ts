/**
 * Catálogo de categorías: nombre visible, colores y si cuentan como gasto.
 * Los íconos de cada categoría están en `components/iconos.tsx`.
 */
import type { IdCategoria } from './tipos'

/**
 * Cada categoría es un par de tinte pálido + tinta oscura del mismo tono (paleta pastel): el tinte va en
 * baldosas pequeñas y chips, nunca en paneles enteros. `color` es el tono de datos para gráficas,
 * oscurecido hasta un contraste de al menos 3:1 sobre blanco.
 */
export interface InfoCategoria {
  id: IdCategoria
  nombre: string
  color: string
  tinte: string
  tinta: string
  /** false solo para ingresos: no suma en totales de gasto ni admite presupuesto. */
  esGasto: boolean
}

// Atajo para declarar el catálogo en una línea por categoría.
const c = (id: IdCategoria, nombre: string, color: string, tinte: string, tinta: string, esGasto = true): InfoCategoria => ({ id, nombre, color, tinte, tinta, esGasto })

export const CATEGORIAS: Record<IdCategoria, InfoCategoria> = {
  comida: c('comida', 'Comida y restaurantes', '#6d4fe0', '#eeeafe', '#3f2596'),
  mercado: c('mercado', 'Mercado', '#178a69', '#dbf4eb', '#0b4f3c'),
  transporte: c('transporte', 'Transporte', '#b37a08', '#fcf0d2', '#6b4505'),
  entretenimiento: c('entretenimiento', 'Entretenimiento', '#bb3a85', '#fbe4f1', '#7e1d55'),
  servicios: c('servicios', 'Servicios y facturas', '#2a6ccc', '#dcf1ff', '#0a3a80'),
  compras: c('compras', 'Compras', '#c95a22', '#ffe8dc', '#82300d'),
  salud: c('salud', 'Salud', '#c8364e', '#ffe4e6', '#861b2b'),
  educacion: c('educacion', 'Educación', '#4a8f23', '#e4f5d9', '#2c5512'),
  vivienda: c('vivienda', 'Vivienda', '#5f6787', '#e8eaf0', '#31374f'),
  transferencias: c('transferencias', 'Transferencias', '#7a7a7a', '#ececec', '#3b3b3b'),
  ingresos: c('ingresos', 'Ingresos', '#247b50', '#dcfae5', '#04250e', false),
  otros: c('otros', 'Otros', '#8a8a8a', '#efefef', '#454545'),
}

/*
 * Sistema de color de la app (pocos colores, cada uno con significado):
 *  - Violeta (marca): todo lo normal: íconos, botones, gráficas, progreso.
 *  - Verde: dinero que entra, metas y logros.
 *  - Coral: alertas (presupuesto superado, cobro doble).
 *  - Ámbar: racha y advertencias.
 * La categoría se reconoce por la forma del ícono, no por un color propio.
 */
export const TONO = {
  marca: { tinte: '#efecff', dato: '#6338ee' },
  positivo: { tinte: '#dcfae5', dato: '#1f9d6b' },
  neutro: { tinte: '#eef0f6', dato: '#6b7194' },
}

/** Tono de la baldosa de una categoría en las listas: ingresos en verde, neutras en gris, el resto violeta. */
export function tonoCategoria(id: IdCategoria) {
  if (id === 'ingresos') return TONO.positivo
  if (id === 'transferencias' || id === 'otros') return TONO.neutro
  return TONO.marca
}

/** Todas las categorías, en el orden del catálogo (para selectores). */
export const LISTA_CATEGORIAS = Object.values(CATEGORIAS)
/** Solo las de gasto (presupuestos, gráficas de gasto). */
export const CATEGORIAS_GASTO = LISTA_CATEGORIAS.filter((x) => x.esGasto)

/** Iniciales del comercio para su baldosa ("Tiendas D1" → "D1", "Netflix" → "Ne"). */
export function iniciales(texto: string) {
  const palabras = texto.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  // Marcas cortas con número ("D1", "3B") se reconocen mejor completas.
  const conNumero = palabras.find((p) => /\d/.test(p) && p.length <= 3)
  if (conNumero) return conNumero.toUpperCase()
  // Se saltan palabras de relleno para no terminar con "PD" de "Pago de…".
  const utiles = palabras.filter((p) => !/^(de|del|la|el|los|las|y|en|pago|compra|tiendas?|almacenes)$/i.test(p))
  const base = utiles.length ? utiles : palabras
  if (base.length >= 2) return (base[0][0] + base[1][0]).toUpperCase()
  return (base[0] ?? '?').slice(0, 2).replace(/^./, (l) => l.toUpperCase())
}
