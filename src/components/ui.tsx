/**
 * Biblioteca de componentes de interfaz de FinTrack: tarjetas, botones, hojas, selectores, insignias,
 * barras y anillos de progreso, estados vacíos y los velos de "solo Premium" y "Próximamente".
 *
 * Lenguaje visual: fondo lavanda, tarjetas blancas de 24 px con sombra suave, íconos en círculos pastel
 * y controles redondeados. Movimiento: salidas rápidas (ease-out fuerte), resortes en hojas y gestos,
 * y nada aparece desde scale(0). Los colores vienen de los tokens de `tailwind.config.js` e `index.css`.
 */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { Check, ChevronDown, Lock, Sparkles, X, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { tonoCategoria } from '../lib/categorias'
import type { IdCategoria } from '../lib/tipos'
import { useApp } from '../store/app'
import { planMinimo, tieneFuncion, type Funcion } from '../lib/planes'
import { iconoPara } from './iconos'
import { bloquearScroll } from '../lib/bloqueoScroll'

/** Curva de salida para la mayoría de transiciones (cubic-bezier). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
/** Curva de las hojas inferiores y paneles: arranca firme y se asienta suave. */
export const EASE_HOJA = [0.32, 0.72, 0, 1] as const

/**
 * Props de motion para que las tarjetas de una pantalla aparezcan escalonadas (sube 14 px y se aclara).
 * Uso: `<motion.div {...entrada(2)}>`, donde el número es su orden en la pantalla.
 */
export const entrada = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE_OUT, delay: 0.06 * i },
})

/** Teléfono (o pantalla angosta): las elecciones se hacen en hojas inferiores, no en menús flotantes. */
export function useEsMovil() {
  const consulta = '(max-width: 639px)'
  const [movil, setMovil] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(consulta).matches)
  useEffect(() => {
    const mq = matchMedia(consulta)
    const f = () => setMovil(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return movil
}

/** Contenedor base de contenido (fondo de superficie, esquinas de 24 px, sombra suave). */
export function Tarjeta({ children, className, ...p }: { children: ReactNode; className?: string } & React.ComponentPropsWithRef<'div'>) {
  return (
    <div className={clsx('rounded-tarjeta bg-superficie p-5 shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea', className)} {...p}>
      {children}
    </div>
  )
}

/** Título de sección con una acción opcional a la derecha (p. ej. "Ver todo"). */
export function Titulo({ children, accion, nivel = 2 }: { children: ReactNode; accion?: ReactNode; nivel?: 2 | 3 }) {
  const H = nivel === 2 ? 'h2' : 'h3'
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <H className="text-[17px] font-bold text-tinta">{children}</H>
      {accion && <div className="shrink-0 text-sm">{accion}</div>}
    </div>
  )
}

/** Clases para enlaces de texto dentro de tarjetas. */
export const claseEnlace = 'font-semibold text-marca-600 dark:text-marca-300'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
/** Botón redondeado. Con `cargando` muestra un indicador y queda deshabilitado. */
export function Boton({ variante = 'primario', className, children, cargando, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      className={clsx(
        'tocable inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        variante === 'primario' && 'bg-marca-600 text-white shadow-boton hover:bg-marca-700',
        variante === 'secundario' && 'bg-marca-50 text-marca-700 hover:bg-marca-100 dark:bg-marca-500/15 dark:text-marca-200',
        variante === 'fantasma' && 'text-tenue hover:bg-elevada hover:text-tinta',
        variante === 'peligro' && 'bg-coral-100 text-coral-600 hover:bg-coral-600 hover:text-white',
        className,
      )}
      disabled={cargando || p.disabled}
      {...p}
    >
      {cargando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

/**
 * Hoja inferior en el celular (sube con resorte, se cierra deslizando hacia abajo o tocando fuera) y
 * diálogo centrado en escritorio. Es el contenedor de todo lo que interrumpe: registrar, elegir, editar.
 */
export function Hoja({ abierto, onCerrar, titulo, children, ancho = 'sm:max-w-lg', sinTitulo }: { abierto: boolean; onCerrar: () => void; titulo: string; children: ReactNode; ancho?: string; sinTitulo?: boolean }) {
  const movil = useEsMovil()
  const reducido = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)

  // Al abrir: Escape cierra, la página de fondo no se desplaza y el foco pasa a la hoja.
  // Al cerrar: todo se deshace y el foco vuelve a donde estaba (accesibilidad con teclado y lector de pantalla).
  useEffect(() => {
    if (!abierto) return
    const previo = document.activeElement as HTMLElement | null
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', f)
    const liberar = bloquearScroll()
    requestAnimationFrame(() => panel.current?.focus())
    return () => {
      window.removeEventListener('keydown', f)
      liberar()
      previo?.focus?.()
    }
  }, [abierto, onCerrar])

  return (
    <AnimatePresence>
      {abierto && (
        <CapaHoja key="hoja">
          {(presente) => (
          <>
          <motion.div
            className="absolute inset-0 bg-noche-950/45"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCerrar}
          />
          <motion.div
            ref={panel}
            role={presente ? 'dialog' : undefined} aria-modal={presente ? 'true' : undefined} aria-label={titulo} tabIndex={-1}
            className={clsx('desplazable relative max-h-[92dvh] w-full bg-superficie outline-none', movil ? 'rounded-t-[28px] pb-[calc(1.5rem+env(safe-area-inset-bottom))]' : 'rounded-[28px] pb-6 shadow-flotante', ancho)}
            initial={movil ? { y: '100%' } : { opacity: 0, scale: reducido ? 1 : 0.96, y: reducido ? 0 : 8 }}
            animate={movil ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={movil ? { y: '100%' } : { opacity: 0, scale: reducido ? 1 : 0.97, transition: { duration: 0.15 } }}
            transition={movil ? { duration: reducido ? 0.01 : 0.45, ease: EASE_HOJA } : { duration: 0.22, ease: EASE_OUT }}
            drag={movil && !reducido ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              // Un gesto rápido basta: se mira la velocidad, no solo la distancia recorrida.
              if (info.offset.y > 120 || info.velocity.y > 500) onCerrar()
            }}
          >
            {movil && <div className="sticky top-0 z-10 flex justify-center bg-superficie pb-1 pt-3"><span className="h-1.5 w-11 rounded-full bg-linea" /></div>}
            <div className={clsx('px-6', movil ? 'pt-2' : 'pt-6')}>
              {!sinTitulo && (
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-tinta">{titulo}</h2>
                  <button onClick={onCerrar} className="tocable grid h-10 w-10 place-items-center rounded-full bg-elevada text-tenue hover:text-tinta" aria-label="Cerrar">
                    <X size={18} />
                  </button>
                </div>
              )}
              {children}
            </div>
          </motion.div>
          </>
          )}
        </CapaHoja>
      )}
    </AnimatePresence>
  )
}

/**
 * Capa de la hoja. Mientras se cierra deja de recibir toques y de contar como ventana abierta (sin role="dialog"):
 * aunque la animación de salida tarde o se trabe, nunca bloquea la pantalla, el botón atrás ni los gestos.
 */
function CapaHoja({ children }: { children: (presente: boolean) => ReactNode }) {
  const presente = useIsPresent()
  return (
    <div className={clsx('fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6', !presente && 'pointer-events-none')} inert={!presente}>
      {children(presente)}
    </div>
  )
}

/** Atajo de `Hoja` con su firma anterior (`ancho` sin el prefijo `sm:`). Lo usan Admin, Planes y Presupuestos. */
export function Modal({ abierto, onCerrar, titulo, children, ancho }: { abierto: boolean; onCerrar: () => void; titulo: string; children: ReactNode; ancho?: string }) {
  return <Hoja abierto={abierto} onCerrar={onCerrar} titulo={titulo} ancho={ancho ? `sm:${ancho}` : undefined}>{children}</Hoja>
}

/** Opción de un `Selector`. `color` tiñe el ícono. */
export interface OpcionSelector<T extends string> {
  valor: T
  etiqueta: string
  detalle?: string
  icono?: LucideIcon
  color?: string
}

/**
 * Lista desplegable propia (reemplaza al <select> nativo, que no respeta el diseño).
 * Escritorio: menú que crece desde el botón, navegable con flechas, Enter y Escape.
 * Celular: hoja inferior con filas grandes, fáciles de tocar con el pulgar.
 */
export function Selector<T extends string>({
  valor, opciones, onCambio, etiqueta, className, compacto,
}: { valor: T; opciones: OpcionSelector<T>[]; onCambio: (v: T) => void; etiqueta: string; className?: string; compacto?: boolean }) {
  const movil = useEsMovil()
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const id = useId()
  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0]

  // Escritorio: al abrir se resalta la opción actual y un toque fuera del menú lo cierra.
  useEffect(() => {
    if (!abierto || movil) return
    setActivo(Math.max(0, opciones.findIndex((o) => o.valor === valor)))
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, movil, opciones, valor])

  function elegir(v: T) {
    onCambio(v)
    setAbierto(false)
  }

  /** Navegación con teclado del menú de escritorio (patrón "listbox" de WAI-ARIA). */
  function teclado(e: React.KeyboardEvent) {
    if (movil) return
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setAbierto(true); return }
    if (!abierto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(opciones.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Home') setActivo(0)
    else if (e.key === 'End') setActivo(opciones.length - 1)
    else if (e.key === 'Enter') { e.preventDefault(); elegir(opciones[activo].valor) }
    else if (e.key === 'Escape' || e.key === 'Tab') setAbierto(false)
  }

  const Icono = actual?.icono
  return (
    <div ref={caja} className={clsx('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox" aria-expanded={abierto} aria-controls={`${id}-lista`} aria-label={`${etiqueta}: ${actual?.etiqueta}`}
        onClick={() => setAbierto(!abierto)} onKeyDown={teclado}
        className={clsx(
          'tocable flex w-full items-center gap-2.5 rounded-[14px] bg-superficie text-left text-[15px] font-medium text-tinta ring-1 ring-linea hover:ring-marca-300',
          compacto ? 'h-10 px-3.5' : 'h-12 px-4',
          abierto && 'ring-2 ring-marca-500',
        )}
      >
        {Icono && <Icono size={18} style={{ color: actual?.color }} className={actual?.color ? '' : 'text-marca-600'} />}
        <span className="min-w-0 flex-1 truncate">{actual?.etiqueta}</span>
        <ChevronDown size={18} className={clsx('shrink-0 text-tenue transition-transform duration-200 ease-[var(--ease-out)]', abierto && 'rotate-180')} />
      </button>

      {movil ? (
        <Hoja abierto={abierto} onCerrar={() => setAbierto(false)} titulo={etiqueta}>
          <ul role="listbox" id={`${id}-lista`} aria-label={etiqueta} className="-mx-2 pb-2">
            {opciones.map((o) => {
              const I = o.icono
              const sel = o.valor === valor
              return (
                <li key={o.valor} role="option" aria-selected={sel}>
                  <button type="button" onClick={() => elegir(o.valor)} className={clsx('tocable flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 text-left', sel ? 'bg-marca-50 dark:bg-marca-500/15' : 'active:bg-elevada')}>
                    {I && <span className="grid h-10 w-10 place-items-center rounded-full bg-elevada" style={{ color: o.color }}><I size={19} /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-tinta">{o.etiqueta}</span>
                      {o.detalle && <span className="block truncate text-[13px] text-tenue">{o.detalle}</span>}
                    </span>
                    {sel && <Check size={20} className="text-marca-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Hoja>
      ) : (
        <AnimatePresence>
          {abierto && (
            <motion.ul
              role="listbox" id={`${id}-lista`} aria-label={etiqueta} aria-activedescendant={`${id}-${activo}`}
              initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              style={{ transformOrigin: 'top center' }}
              className="desplazable absolute left-0 top-[calc(100%+6px)] z-40 max-h-80 min-w-full rounded-2xl bg-superficie p-1.5 shadow-flotante ring-1 ring-linea"
            >
              {opciones.map((o, i) => {
                const I = o.icono
                const sel = o.valor === valor
                return (
                  <li
                    key={o.valor} id={`${id}-${i}`} role="option" aria-selected={sel}
                    onPointerEnter={() => setActivo(i)} onClick={() => elegir(o.valor)}
                    className={clsx('flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px]', i === activo && 'bg-elevada', sel ? 'font-semibold text-tinta' : 'text-tinta')}
                  >
                    {I && <I size={17} style={{ color: o.color }} className={o.color ? '' : 'text-tenue'} />}
                    <span className="flex-1">{o.etiqueta}</span>
                    {sel && <Check size={16} className="text-marca-600" />}
                  </li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}

/** Control segmentado (Gasto / Ingreso, Semana / Mes) con la píldora que se desliza a la opción elegida. */
export function Segmentado<T extends string>({ valor, opciones, onCambio, etiqueta }: { valor: T; opciones: { valor: T; etiqueta: string }[]; onCambio: (v: T) => void; etiqueta: string }) {
  const indice = Math.max(0, opciones.findIndex((o) => o.valor === valor))
  return (
    <div role="tablist" aria-label={etiqueta} className="relative flex rounded-full bg-elevada p-1">
      {/* Indicador que se desliza con transform: sin animaciones compartidas entre elementos, que pueden trabar
          el cierre de una hoja cuando la opción cambia justo al abrirla (p. ej. al editar un ingreso). */}
      <motion.span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-superficie shadow-suave"
        style={{ width: `calc((100% - 0.5rem) / ${opciones.length})` }}
        initial={false} animate={{ x: `${indice * 100}%` }} transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
      />
      {opciones.map((o) => (
        <button
          key={o.valor} type="button" role="tab" aria-selected={valor === o.valor} onClick={() => onCambio(o.valor)}
          className={clsx('relative h-10 flex-1 rounded-full px-4 text-[15px] font-semibold transition-colors duration-200', valor === o.valor ? 'text-marca-700 dark:text-white' : 'text-tenue')}
        >
          <span className="relative">{o.etiqueta}</span>
        </button>
      ))}
    </div>
  )
}

/** Campo de formulario con etiqueta y texto de ayuda opcional. */
export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-tinta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1.5 block text-[13px] text-tenue">{ayuda}</span>}
    </label>
  )
}

/** Clases comunes de los inputs de texto, número y fecha. */
export const claseInput =
  'h-12 w-full rounded-[14px] bg-superficie px-4 text-base text-tinta ring-1 ring-linea outline-none transition-shadow duration-150 placeholder:text-tenue focus:ring-2 focus:ring-marca-500 [color-scheme:inherit]'

type Tono = 'neutro' | 'ok' | 'alerta' | 'marca' | 'aviso'
/** Etiqueta pequeña tipo píldora (estado, plan, conteo). */
export function Insignia({ children, tono = 'neutro' }: { children: ReactNode; tono?: Tono }) {
  return (
    <span
      className={clsx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold',
        tono === 'neutro' && 'bg-elevada text-tenue',
        tono === 'ok' && 'bg-menta-100 text-menta-600 dark:bg-menta-500/15 dark:text-menta-400',
        tono === 'alerta' && 'bg-coral-100 text-coral-600 dark:bg-coral-500/15 dark:text-[#ff8a9b]',
        tono === 'aviso' && 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
        tono === 'marca' && 'bg-marca-50 text-marca-700 dark:bg-marca-500/20 dark:text-marca-200',
      )}
    >
      {children}
    </span>
  )
}

/**
 * Ícono representativo del movimiento en un círculo lavanda (verde si es dinero que entra, gris si es
 * una transferencia). La categoría la cuenta la forma del ícono, no un color propio.
 */
export function ChipCategoria({ id, texto, tam = 44, seleccionado }: { id: IdCategoria; texto?: string; tam?: number; seleccionado?: boolean }) {
  const t = tonoCategoria(id)
  const I = iconoPara(texto, id)
  return (
    <span
      aria-hidden="true"
      className={clsx('grid shrink-0 place-items-center rounded-full', seleccionado ? 'bg-marca-600 text-white' : 'baldosa')}
      style={{ width: tam, height: tam, '--b-tinte': t.tinte, '--b-dato': t.dato } as React.CSSProperties}
    >
      <I size={Math.round(tam * 0.45)} strokeWidth={2} />
    </span>
  )
}

/** Barra de progreso que se llena al aparecer (transform, no width: corre en la GPU). */
export function Progreso({ valor, color = '#6338ee', alto = 8 }: { valor: number; color?: string; alto?: number }) {
  const v = Math.max(0, Math.min(1, valor))
  return (
    <div className="w-full overflow-hidden rounded-full bg-elevada" style={{ height: alto }}>
      <motion.div
        className="h-full w-full origin-left rounded-full"
        style={{ background: color }}
        initial={{ scaleX: 0 }} animate={{ scaleX: v }} transition={{ duration: 0.8, ease: EASE_OUT }}
      />
    </div>
  )
}

/** Anillo de progreso que se dibuja al aparecer. */
export function AnilloScore({ valor, tam = 140, grosor = 12, children, color }: { valor: number; tam?: number; grosor?: number; children?: ReactNode; color?: string }) {
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90" aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} className="stroke-elevada" />
        <motion.circle
          cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color ?? (valor >= 85 ? '#22c39a' : '#6338ee')} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, valor / 100)) }}
          transition={{ duration: 1, ease: EASE_OUT }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Estado vacío: qué falta y, opcionalmente, el botón para empezar. */
export function Vacio({ titulo, texto, accion, icono: I }: { titulo: string; texto: string; accion?: ReactNode; icono?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tarjeta bg-elevada px-6 py-10 text-center">
      {I && <span className="mb-1 grid h-14 w-14 place-items-center rounded-full bg-superficie text-marca-600 shadow-suave"><I size={24} /></span>}
      <p className="text-base font-bold text-tinta">{titulo}</p>
      <p className="max-w-sm text-[15px] text-tenue">{texto}</p>
      {accion}
    </div>
  )
}

/** Muestra el contenido si el plan incluye la función; si no, una invitación a ver los planes. */
export function SoloPremium({ funcion, children, compacto }: { funcion: Funcion; children: ReactNode; compacto?: boolean }) {
  const perfil = useApp((s) => s.datos!.perfil)
  if (tieneFuncion(perfil, funcion)) return <>{children}</>
  const plan = planMinimo(funcion) === 'plus' ? 'Plus' : 'Pro'
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 rounded-2xl bg-marca-50 text-[15px] dark:bg-marca-500/10', compacto ? 'p-3' : 'p-4')}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-superficie text-marca-600"><Lock size={18} /></span>
      <p className="min-w-0 flex-1 text-tinta">Disponible en FinTrack {plan}. También lo desbloqueas un mes llegando a 100 puntos.</p>
      <Link to="/planes" className={claseEnlace}>Ver planes</Link>
    </div>
  )
}

/**
 * Velo "Próximamente": el contenido se ve desenfocado detrás (para que el probador entienda qué viene)
 * y no se puede tocar ni enfocar. `largo` mantiene la tarjeta visible mientras se desplaza una sección alta.
 */
export function Proximamente({ children, titulo, texto, largo, className }: { children: ReactNode; titulo: string; texto?: string; largo?: boolean; className?: string }) {
  return (
    <div className={clsx('relative isolate', className)}>
      <div aria-hidden="true" inert className="pointer-events-none select-none opacity-75 blur-[6px] saturate-[.85]">
        {children}
      </div>
      <div className={clsx('absolute inset-0 z-10 flex justify-center px-4', largo ? 'items-start pt-10' : 'items-center py-4')}>
        <div
          role="note"
          className={clsx(
            'w-full max-w-[320px] rounded-[22px] bg-superficie/95 px-5 py-4 text-center shadow-flotante ring-1 ring-linea/70 backdrop-blur-sm dark:bg-superficie/90',
            largo && 'sticky top-[calc(env(safe-area-inset-top)+96px)]',
          )}
        >
          <span className="mx-auto mb-2 flex h-7 w-fit items-center gap-1.5 rounded-full bg-marca-50 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-marca-700 dark:bg-marca-500/20 dark:text-marca-200">
            <Sparkles size={13} strokeWidth={2.4} /> Próximamente
          </span>
          <p className="text-[16px] font-bold leading-snug text-tinta">{titulo}</p>
          {texto && <p className="mt-1 text-[13px] leading-snug text-tenue">{texto}</p>}
        </div>
      </div>
    </div>
  )
}
