/** Íconos de las metas de ahorro: el usuario elige uno al crear la meta y se guarda su id en `Meta.icono`. */
import { Car, Gem, GraduationCap, Heart, Home, Laptop, LifeBuoy, PawPrint, Plane, Target, Umbrella, type LucideProps } from 'lucide-react'

/** Catálogo de íconos de metas (un solo set de líneas, en lugar de emoji): id → componente y nombre. */
export const ICONOS_META = {
  meta: { i: Target, n: 'Meta' },
  viaje: { i: Plane, n: 'Viaje' },
  playa: { i: Umbrella, n: 'Vacaciones' },
  emergencia: { i: LifeBuoy, n: 'Emergencias' },
  tecnologia: { i: Laptop, n: 'Tecnología' },
  casa: { i: Home, n: 'Vivienda' },
  carro: { i: Car, n: 'Vehículo' },
  estudio: { i: GraduationCap, n: 'Estudio' },
  compromiso: { i: Gem, n: 'Compromiso' },
  mascota: { i: PawPrint, n: 'Mascota' },
  salud: { i: Heart, n: 'Salud' },
} as const

export type IdIconoMeta = keyof typeof ICONOS_META

// Metas guardadas antes con emoji (solo lectura de datos antiguos, nunca se muestran).
const LEGADO: Record<string, IdIconoMeta> = { '🎯': 'meta', '🏖️': 'playa', '🛟': 'emergencia', '💻': 'tecnologia', '🏠': 'casa', '🚗': 'carro', '🎓': 'estudio', '💍': 'compromiso', '✈️': 'viaje', '🐶': 'mascota' }

/** Normaliza el valor guardado a un id válido (acepta emoji antiguos; si no lo reconoce, usa el genérico). */
export const idIcono = (icono: string): IdIconoMeta => (icono in ICONOS_META ? (icono as IdIconoMeta) : (LEGADO[icono] ?? 'meta'))

/** Dibuja el ícono de una meta. Acepta las mismas props que un ícono de lucide (tamaño, clase…). */
export function IconoMeta({ icono, ...p }: { icono: string } & LucideProps) {
  const I = ICONOS_META[idIcono(icono)].i
  return <I strokeWidth={1.75} {...p} />
}
