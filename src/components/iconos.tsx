/** Íconos de movimientos: uno por categoría y, cuando se reconoce el comercio, uno más específico. */
import {
  ArrowDownLeft, ArrowLeftRight, BookOpen, Bus, Car, CircleEllipsis, Clapperboard, Coffee, Dumbbell, Fuel, GraduationCap,
  HeartPulse, Home, Landmark, Lightbulb, Music2, Pill, Pizza, Plane, ShoppingBag, ShoppingCart, Smartphone, Ticket, Tv,
  UtensilsCrossed, Wallet, Wifi, Zap, type LucideIcon,
} from 'lucide-react'
import type { IdCategoria } from '../lib/tipos'

/** Ícono por defecto de cada categoría. */
export const ICONO_CATEGORIA: Record<IdCategoria, LucideIcon> = {
  comida: UtensilsCrossed,
  mercado: ShoppingCart,
  transporte: Bus,
  entretenimiento: Clapperboard,
  servicios: Lightbulb,
  compras: ShoppingBag,
  salud: HeartPulse,
  educacion: GraduationCap,
  vivienda: Home,
  transferencias: ArrowLeftRight,
  ingresos: Wallet,
  otros: CircleEllipsis,
}

// Íconos más precisos según el comercio o la descripción (lo que la persona reconoce de un vistazo).
const POR_PALABRA: [RegExp, LucideIcon][] = [
  [/n[oó]mina|salario|sueldo|honorario|abono|prima/i, ArrowDownLeft],
  [/spotify|apple music|deezer|youtube music/i, Music2],
  [/netflix|disney|hbo|max\b|prime video|crunchyroll|paramount|star\+/i, Tv],
  [/cine|procinal|cinemark|concierto|tuboleta|boleta/i, Ticket],
  [/uber|didi|cabify|indriver|taxi/i, Car],
  [/mio|transmilenio|metro|bus|sitp/i, Bus],
  [/terpel|gasolina|primax|texaco|combustible|biomax/i, Fuel],
  [/avianca|latam|vuelo|wingo/i, Plane],
  [/caf[eé]|juan valdez|tostao|starbucks|panader/i, Coffee],
  [/pizza|domino|frisby|corral|hamburgues|kokoriko|mcdonald|rappi/i, Pizza],
  [/d1|[eé]xito|carulla|ara\b|olimpica|jumbo|mercado|supermercado|fruver/i, ShoppingCart],
  [/drogu|farmatodo|cruz verde|rebaja|locatel/i, Pill],
  [/gimnasio|smart fit|bodytech/i, Dumbbell],
  [/claro|movistar|tigo|wom|etb|internet/i, Wifi],
  [/celular|plan m[oó]vil/i, Smartphone],
  [/emcali|epm|enel|codensa|celsia|energ[ií]a|vanti|gas natural/i, Zap],
  [/platzi|udemy|coursera|libro|librer/i, BookOpen],
  [/arriendo|arrendamiento|administraci[oó]n/i, Home],
  [/transfer|nequi|daviplata|bre-b|retiro|cajero/i, ArrowLeftRight],
  [/banco|cuota manejo|4x1000|gmf|intereses/i, Landmark],
]

/** Ícono para un movimiento: el del primer patrón que coincida con la descripción o, si no, el de su categoría. */
export function iconoPara(descripcion: string | undefined, categoria: IdCategoria): LucideIcon {
  if (descripcion) for (const [re, I] of POR_PALABRA) if (re.test(descripcion)) return I
  return ICONO_CATEGORIA[categoria] ?? CircleEllipsis
}

/** Ícono de una categoría (selectores, presupuestos, gráficas). */
