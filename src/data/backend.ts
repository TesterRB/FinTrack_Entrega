/**
 * Contrato de la capa de datos.
 *
 * La app nunca llama a Supabase ni a localStorage directamente: todo pasa por la interfaz `Backend`.
 * Hay dos implementaciones intercambiables (se elige en `data/index.ts`):
 *  - `backendDemo.ts`: todo en el navegador, sin cuentas. Para probar la app sin configurar nada.
 *  - `backendSupabase.ts`: Auth, Postgres con RLS, Storage y Edge Functions.
 */
import type {
  Actividad, Aliado, AporteMeta, CierreMes, Cuenta, Extracto, Factura, Meta, Movimiento, Pago, Perfil, Plan,
  Presupuesto, Promocion, Recompensa,
} from '../lib/tipos'

/** Todos los datos del usuario que la app tiene en memoria. Cada clave (menos `perfil`) es una tabla. */
export interface Estado {
  perfil: Perfil
  cuentas: Cuenta[]
  movimientos: Movimiento[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  aportes: AporteMeta[]
  extractos: Extracto[]
  actividades: Actividad[]
  recompensas: Recompensa[]
  cierres: CierreMes[]
  pagos: Pago[]
  facturas: Factura[]
  aliados: Aliado[]
  promociones: Promocion[]
}

/** Nombre de una tabla guardable (coincide con el nombre de la tabla en Postgres). */
export type Tabla = Exclude<keyof Estado, 'perfil'>

export interface InicioPago {
  pago: Pago
  /** URL del checkout de Wompi (sandbox). Ausente en modo demo: se simula en la app. */
  url?: string
}

/** Clases de evento de monitoreo: apertura de la app, pantalla vista, acción del usuario o error. */
export type TipoEvento = 'inicio' | 'pantalla' | 'accion' | 'error'

/** Evento de monitoreo (tabla `eventos`). Sin datos financieros. */
export interface EventoApp {
  sesion: string
  tipo: TipoEvento
  nombre: string
  datos: Record<string, unknown>
  plataforma: 'android' | 'ios' | 'web'
  versionApp: string
}

/** Comentario que el probador envía desde Perfil (tabla `comentarios`). */
export interface ComentarioApp {
  tipo: 'error' | 'idea' | 'otro'
  mensaje: string
  pantalla: string
  contexto: Record<string, unknown>
}

/** Última versión publicada del APK (tabla `version_app`). */
export interface VersionPublicada {
  codigo: number
  nombre: string
  url: string
  notas: string
  obligatoria: boolean
}

/** Contrato común para el modo demo (localStorage) y Supabase. La app solo habla con esto. */
export interface Backend {
  modo: 'demo' | 'supabase'
  /** Id del usuario con sesión guardada, o null si no hay sesión. */
  sesion(): Promise<string | null>
  /** Inicia sesión con correo y contraseña. Lanza un error con un mensaje listo para mostrar. */
  entrar(email: string, clave: string): Promise<void>
  /** Devuelve `confirmar: true` si la cuenta necesita confirmarse por correo antes de entrar. */
  registrar(nombre: string, email: string, clave: string): Promise<{ confirmar: boolean }>
  /**
   * Inicia sesión con Google. En la web redirige la página; en Android abre el navegador del sistema
   * y la sesión llega después por el enlace profundo (`completarRetorno`).
   */
  entrarConGoogle(): Promise<'redirigiendo' | 'listo'>
  /**
   * Android: canjea el código del enlace profundo (Google, confirmación de correo o recuperación de
   * contraseña) por una sesión. Devuelve 'recuperacion' si el enlace era para crear una contraseña nueva.
   */
  completarRetorno(url: string): Promise<'sesion' | 'recuperacion'>
  /** true mientras la sesión viene de un enlace de recuperación y falta elegir la contraseña nueva. */
  necesitaNuevaClave(): boolean
  /** Envía el correo con el enlace para crear una contraseña nueva. */
  recuperarClave(email: string): Promise<void>
  cambiarClave(nueva: string): Promise<void>
  reenviarConfirmacion(email: string): Promise<void>
  salir(): Promise<void>
  /** Envía un lote de eventos de monitoreo (ver `lib/telemetria.ts`). */
  reportar(eventos: EventoApp[]): Promise<void>
  enviarComentario(c: ComentarioApp): Promise<void>
  /** Última versión publicada del APK, para avisar al usuario que actualice (null en la demo). */
  versionPublicada(plataforma: 'android' | 'ios' | 'web'): Promise<VersionPublicada | null>
  /** Carga el perfil y todas las tablas del usuario. */
  cargar(): Promise<Estado>
  /** Inserta o actualiza (upsert por `id`) filas de una tabla. */
  guardar<T extends Tabla>(tabla: T, filas: Estado[T]): Promise<void>
  eliminar(tabla: Tabla, id: string): Promise<void>
  /** UPDATE puro (sin upsert): para filas de otros usuarios, como la revisión de facturas del admin. */
  actualizar(tabla: Tabla, id: string, cambios: Record<string, unknown>): Promise<void>
  actualizarPerfil(cambios: Partial<Perfil>): Promise<void>
  /** Sube la foto de una factura y devuelve la referencia a guardar. */
  subirImagen(dataUrl: string, id: string): Promise<string>
  /** URL temporal para ver una imagen guardada (en Supabase, firmada por 10 minutos). */
  urlImagen(ref: string): Promise<string>
  /** Cierra el FinScore de un mes y emite la recompensa que corresponda. */
  cerrarMes(mes: string, puntaje: number): Promise<{ cierre: CierreMes; recompensa: Recompensa | null }>
  /** Crea un pago pendiente y devuelve la URL del checkout de Wompi. */
  iniciarPago(plan: Plan, cupon: string | null, montoCentavos: number): Promise<InicioPago>
  /** Solo demo: simula la respuesta del webhook de Wompi. */
  confirmarPagoDemo?(referencia: string, aprobado: boolean): Promise<void>
}
