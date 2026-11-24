/**
 * Modelo de dominio de FinTrack.
 *
 * Estos tipos los comparten la web, la app Android (Capacitor) y los dos backends (demo y Supabase).
 * Las tablas de Supabase usan los mismos campos en snake_case (`supabase/migrations/…_esquema.sql`);
 * la conversión camelCase ⇄ snake_case la hace `src/data/backendSupabase.ts`.
 *
 * Convenciones:
 *  - Fechas: `YYYY-MM-DD` (día), `YYYY-MM` (mes) o ISO completo (marcas de tiempo `creadoEn`).
 *  - Montos: pesos colombianos (COP) enteros; positivo = ingreso, negativo = gasto.
 */

/** Categorías fijas de movimientos. Sus nombres, colores e íconos están en `categorias.ts`. */
export type IdCategoria =
  | 'comida'
  | 'mercado'
  | 'transporte'
  | 'entretenimiento'
  | 'servicios'
  | 'compras'
  | 'salud'
  | 'educacion'
  | 'vivienda'
  | 'transferencias'
  | 'ingresos'
  | 'otros'

/** Planes comerciales. Qué incluye cada uno está en `planes.ts`. */
export type Plan = 'starter' | 'plus' | 'pro'
/** `admin` ve el Panel de aliados (revisión de facturas y promociones). */
export type Rol = 'usuario' | 'admin'
/** De dónde salió un movimiento: lo anotó el usuario, vino de un extracto o de una factura escaneada. */
export type OrigenMovimiento = 'manual' | 'extracto' | 'factura'

/** Datos de la cuenta del usuario (tabla `perfiles`). */
export interface Perfil {
  id: string
  nombre: string
  email: string
  plan: Plan
  /** Fin del periodo pagado de Plus/Pro (cada pago aprobado suma 30 días). */
  planHasta: string | null
  rol: Rol
  /** Fin de los 30 días con todo desbloqueado. */
  pruebaHasta: string
  /** Premium pagado o regalado (mes extra por FinScore 100). */
  premiumHasta: string | null
  /** Día del mes en que recibe su ingreso principal (para pronóstico). */
  diaDePago: number
  creadoEn: string
}

/** Cuenta o bolsillo donde se mueve el dinero (banco, tarjeta, Nequi, efectivo…). */
export interface Cuenta {
  id: string
  nombre: string
  tipo: 'banco' | 'tarjeta' | 'billetera' | 'efectivo'
}

/** Un ingreso o gasto. Es la unidad básica de la app. */
export interface Movimiento {
  id: string
  fecha: string // YYYY-MM-DD
  descripcion: string
  /** Positivo = ingreso, negativo = gasto. En COP. */
  monto: number
  categoria: IdCategoria
  /** Confianza del clasificador (0-1); null si la puso el usuario. */
  confianza: number | null
  cuentaId: string | null
  origen: OrigenMovimiento
  /** true cuando un extracto bancario confirmó el movimiento. */
  conciliado: boolean
  extractoId: string | null
  nota?: string
  creadoEn: string
}

/** Límite de gasto de una categoría para un mes concreto. */
export interface Presupuesto {
  id: string
  categoria: IdCategoria
  limite: number
  mes: string // YYYY-MM
}

/** Meta de ahorro (viaje, computador, fondo de emergencia…). */
export interface Meta {
  id: string
  nombre: string
  objetivo: number
  /** Suma de los aportes; se guarda para no recalcularla en cada lectura. */
  ahorrado: number
  fechaLimite: string | null
  /** Nombre del ícono (ver `components/IconoMeta.tsx`). */
  icono: string
}

/** Un abono a una meta. Los días con aportes suman puntos de FinScore. */
export interface AporteMeta {
  id: string
  metaId: string
  monto: number
  fecha: string
}

/** Resumen de un extracto bancario importado y conciliado. El archivo no se guarda, solo el resultado. */
export interface Extracto {
  id: string
  banco: string
  periodo: string // YYYY-MM
  /** Nombre del archivo original (solo informativo). */
  archivo: string
  /** Filas leídas del extracto. */
  filas: number
  /** Filas que coincidieron con movimientos ya registrados. */
  conciliados: number
  /** Filas que no estaban registradas y se agregaron como movimientos nuevos. */
  agregados: number
  creadoEn: string
}

/** Registro de actividad usado para el FinScore (revisiones, retos, etc.). */
export interface Actividad {
  id: string
  tipo: 'revision_insights' | 'revision_presupuesto' | 'reto_completado' | 'inicio_sesion'
  /** Identificador opcional de lo revisado o completado (p. ej. el id del reto). */
  ref?: string
  fecha: string // ISO
}

/** Comercio aliado que ofrece promociones a cambio de registrar compras con factura. */
export interface Aliado {
  id: string
  nombre: string
  /** NIT del comercio: el OCR lo busca en la factura para validar la compra. */
  nit: string
  categoria: IdCategoria
  ciudad: string
  logo: string // emoji o URL
}

/** Promoción de un aliado. El usuario participa subiendo la foto de su factura. */
export interface Promocion {
  id: string
  aliadoId: string
  titulo: string
  descripcion: string
  /** Beneficio que se entrega al aprobar la factura. */
  beneficio: string
  /** Total mínimo de la factura para participar (COP). */
  montoMinimo: number
  /** Vigencia (YYYY-MM-DD, ambos días incluidos). */
  desde: string
  hasta: string
  /** Condiciones legibles que se muestran al usuario. */
  reglas: string[]
  activa: boolean
  /** Puntos de FinScore que suma participar (cuentan dentro de "retos"). */
  puntos: number
}

export type EstadoFactura = 'pendiente' | 'aprobada' | 'rechazada'

/** Lo que el OCR logró leer de una factura (`src/ml/facturas.ts`). */
export interface DatosOcr {
  /** Texto completo reconocido. */
  texto: string
  nit: string | null
  total: number | null
  fecha: string | null
  comercio: string | null
  /** Confianza del OCR de 0 a 100 (100 si el PDF ya traía texto digital). Bajo 60 se pide revisión. */
  confianza: number
}

/** Factura enviada para participar en una promoción (o simplemente escaneada para registrar un gasto). */
export interface Factura {
  id: string
  promocionId: string | null
  usuarioId: string
  usuarioNombre: string
  imagen: string // dataURL en demo / ruta de Storage en Supabase
  ocr: DatosOcr
  estado: EstadoFactura
  /** Motivo de rechazo que escribe el administrador. */
  motivo: string | null
  /** Motivos por los que la validación automática no pudo aprobarla. */
  alertas: string[]
  creadoEn: string
}

/** `cupon`: descuento en el plan. `cupon_y_mes`: descuento + días de Premium (FinScore 100). */
export type TipoRecompensa = 'cupon' | 'cupon_y_mes'

/** Premio emitido al cerrar un mes con FinScore alto. */
export interface Recompensa {
  id: string
  mes: string // YYYY-MM del FinScore que la generó
  puntaje: number
  tipo: TipoRecompensa
  /** Código que el usuario aplica al pagar un plan. */
  codigo: string
  descuento: number // porcentaje
  diasPremium: number
  usado: boolean
  venceEn: string
}

/** Cierre mensual del FinScore (histórico y control de recompensas emitidas). */
export interface CierreMes {
  id: string
  mes: string
  puntaje: number
  recompensaId: string | null
  creadoEn: string
}

/** Intento de pago de un plan con Wompi. Lo confirma el webhook (`supabase/functions/wompi-webhook`). */
export interface Pago {
  id: string
  /** Referencia única que se envía a Wompi y vuelve en el webhook. */
  referencia: string
  plan: Plan
  /** Wompi trabaja en centavos de peso. */
  montoCentavos: number
  cupon: string | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  creadoEn: string
}
