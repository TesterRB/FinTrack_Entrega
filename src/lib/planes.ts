/**
 * Planes, precios, recompensas y control de acceso a funciones.
 *
 * Las pantallas preguntan `tieneFuncion(perfil, 'extractos')` en vez de mirar el plan directamente:
 * así la prueba gratuita, el mes regalado y la beta se resuelven en un solo lugar (`planEfectivo`).
 *
 * Los precios coinciden con `supabase/functions/_compartido/utilidades.ts`
 * (el servidor recalcula el monto antes de firmar el pago) y las recompensas con la migración
 * `supabase/migrations/…_finscore.sql`.
 */
import type { Perfil, Plan } from './tipos'
import { hoyISO } from './formato'

/**
 * Beta cerrada. Con `true`, todos los usuarios tienen todas las funciones y las pantallas de Planes y cupones
 * se muestran con el velo "Próximamente". Con `false` se activan los planes de pago y los cupones.
 */
export const BETA = true

// Precios de los planes (COP por mes).
export const PRECIOS: Record<Plan, number> = { starter: 0, plus: 9_900, pro: 14_900 }

/** Contenido de las tarjetas de la pantalla Planes. */
export const PLANES: { id: Plan; nombre: string; subtitulo: string; incluye: string[] }[] = [
  {
    id: 'starter',
    nombre: 'Starter',
    subtitulo: 'Gratis',
    incluye: ['Anota tus gastos e ingresos', 'Tus gastos se clasifican solos', 'Resumen de cada mes', 'Tus números del mes de un vistazo', 'FinScore y promociones'],
  },
  {
    id: 'plus',
    nombre: 'Plus',
    subtitulo: 'Premium',
    incluye: [
      'Todo lo de Starter',
      'Consejos más completos sobre tus gastos',
      'Recomendaciones hechas para ti',
      'Aviso de los pagos que se repiten',
      'Alertas de cobros raros o duplicados',
      'Compara tu extracto con lo que anotaste',
      'Presupuestos con más detalle',
    ],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    subtitulo: 'Premium avanzado',
    incluye: ['Todo lo de Plus', 'Cómo podría cerrar tu mes', 'Metas con seguimiento detallado', 'Exportar informe', 'Tu asistente aprende tu forma de clasificar'],
  },
]

// Recompensas del FinScore. Los mismos valores están en la migración SQL del FinScore.
export const RECOMPENSAS = {
  umbralCupon: 85,
  umbralMesExtra: 100,
  descuentoCupon: 20,
  descuentoPerfecto: 30,
  diasPremiumPerfecto: 30,
  diasVigenciaCupon: 45,
  diasPrueba: 30,
}

/** Funciones de pago. Lo que no está en esta lista es gratis para todos. */
export type Funcion =
  | 'insights_avanzados'
  | 'recurrentes'
  | 'anomalias'
  | 'extractos'
  | 'presupuestos_avanzados'
  | 'pronostico'
  | 'reportes'
  | 'modelo_personal'

// Qué desbloquea cada plan. Pro incluye todo lo de Plus.
const PLUS: Funcion[] = ['insights_avanzados', 'recurrentes', 'anomalias', 'extractos', 'presupuestos_avanzados']
const FUNCIONES_PLAN: Record<Plan, Funcion[]> = {
  starter: [],
  plus: PLUS,
  pro: [...PLUS, 'pronostico', 'reportes', 'modelo_personal'],
}

// Las fechas son `YYYY-MM-DD`, así que se pueden comparar como texto.
/** ¿Sigue dentro de los 30 días de prueba con todo desbloqueado? */
export const enPrueba = (p: Perfil) => p.pruebaHasta >= hoyISO()
/** ¿Tiene días de Premium vigentes (p. ej. ganados con FinScore 100)? */
export const premiumRegalado = (p: Perfil) => !!p.premiumHasta && p.premiumHasta >= hoyISO()

/** Plan efectivo: durante la prueba o el mes regalado se comporta como Pro. */
export function planEfectivo(p: Perfil): Plan {
  if (BETA || enPrueba(p) || premiumRegalado(p)) return 'pro'
  return p.plan !== 'starter' && p.planHasta && p.planHasta >= hoyISO() ? p.plan : 'starter'
}

/** ¿El usuario puede usar esta función con su plan efectivo? */
export const tieneFuncion = (p: Perfil, f: Funcion) => FUNCIONES_PLAN[planEfectivo(p)].includes(f)
/** Plan más barato que incluye la función (para el mensaje "Disponible en Plus"). */
export const planMinimo = (f: Funcion): Plan => (PLUS.includes(f) ? 'plus' : 'pro')
