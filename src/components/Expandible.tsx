/**
 * Tarjetas que se arrastran y se abren en un panel a pantalla completa
 * (Inicio → todos los movimientos, FinScore → detalle de puntos).
 *
 * Piezas: `useArrastreTarjeta` (el gesto), `VeloArrastre` y `PistaArrastre` (la respuesta visual mientras
 * se arrastra) y `PanelExpandible` (el panel que crece desde la tarjeta).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { animate, motion, useIsPresent, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { EASE_HOJA } from './ui'
import { esNativo, vibrarNativo } from '../lib/plataforma'
import { bloquearScroll } from '../lib/bloqueoScroll'

/** Resistencia tipo iOS: crece con el dedo pero se acerca al límite sin llegar nunca a pasarlo. */
const goma = (d: number, limite: number) => limite * (1 - Math.exp(-d / limite))

/** Hacia abajo la tarjeta cede hasta ~120 px; hacia arriba apenas se asoma (28 px). */
const LIMITE_ABAJO = 120
const LIMITE_ARRIBA = 28
/** Desde aquí, al soltar se abre el panel. */
const UMBRAL = 52

/**
 * Arrastre vertical de una tarjeta. Mientras el dedo está sobre ella la página no se desplaza
 * (touch-action: none): la tarjeta sigue el gesto, con límites claros en ambos sentidos.
 * Un gesto horizontal se ignora aquí y lo atienden los gestos laterales entre pestañas.
 */
export function useArrastreTarjeta(alAbrir: () => void) {
  const y = useMotionValue(0)
  const [activo, setActivo] = useState(false)
  const [listo, setListo] = useState(false)
  /** Punto de inicio del gesto, el dedo que lo hace y el eje decidido (null hasta moverse unos píxeles). */
  const gesto = useRef<{ x: number; y: number; id: number; eje: 'x' | 'y' | null } | null>(null)
  /** Copia de `listo` sin re-render, para vibrar solo al cruzar el umbral. */
  const listoRef = useRef(false)

  const soltar = useCallback(() => {
    const g = gesto.current
    gesto.current = null
    if (!g || g.eje !== 'y') return
    if (y.get() >= UMBRAL) alAbrir()
    listoRef.current = false
    setListo(false)
    void animate(y, 0, { type: 'spring', duration: 0.45, bounce: 0.18 }).then(() => setActivo(false))
  }, [alAbrir, y])

  const props = {
    style: { y, touchAction: 'none' as const },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // Con mouse (escritorio) no hay gesto: se usa el botón de la tarjeta.
      if (e.pointerType === 'mouse') return
      gesto.current = { x: e.clientX, y: e.clientY, id: e.pointerId, eje: null }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const g = gesto.current
      if (!g || g.id !== e.pointerId) return
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (!g.eje) {
        // Se decide el eje tras unos píxeles: un toque normal sobre los botones sigue siendo un toque.
        if (Math.hypot(dx, dy) < 8) return
        g.eje = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'
        if (g.eje === 'y') {
          e.currentTarget.setPointerCapture(e.pointerId)
          setActivo(true)
        }
      }
      if (g.eje !== 'y') return
      const valor = dy >= 0 ? goma(dy, LIMITE_ABAJO) : -goma(-dy, LIMITE_ARRIBA)
      y.set(valor)
      const pasa = valor >= UMBRAL
      if (pasa !== listoRef.current) {
        listoRef.current = pasa
        setListo(pasa)
        if (pasa && esNativo) void vibrarNativo('leve').catch(() => undefined)
      }
    },
    onPointerUp: soltar,
    onPointerCancel: soltar,
  }
  return { y, activo, listo, props }
}

/**
 * Desenfoque del resto de la app mientras se arrastra una tarjeta: crece con el gesto, así la tarjeta (que queda
 * por encima) nunca se ve encimada sobre el contenido. Va en document.body para cubrir también la cabecera y la barra.
 */
export function VeloArrastre({ y, visible }: { y: MotionValue<number>; visible: boolean }) {
  const avance = useTransform(y, (v) => Math.min(1, Math.abs(v) / 70))
  const filtro = useTransform(avance, (p) => `blur(${(p * 6).toFixed(2)}px)`)
  const fondo = useTransform(avance, (p) => `rgb(var(--suelo) / ${(p * 0.35).toFixed(3)})`)
  if (!visible) return null
  return createPortal(
    <motion.div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[35]" style={{ backdropFilter: filtro, WebkitBackdropFilter: filtro, backgroundColor: fondo }} />,
    document.body,
  )
}

/** Texto sobre la tarjeta mientras se arrastra: dice qué pasará al soltar. */
export function PistaArrastre({ y, listo, accion }: { y: MotionValue<number>; listo: boolean; accion: string }) {
  const opacidad = useTransform(y, [14, UMBRAL], [0, 1])
  return (
    <motion.p
      style={{ opacity: opacidad }} aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-10 flex items-center justify-center gap-1 text-[13px] font-semibold text-marca-600 dark:text-marca-200"
    >
      <ChevronDown size={16} className={clsx('transition-transform duration-200', listo && 'rotate-180')} />
      {listo ? `Suelta para ${accion}` : `Desliza para ${accion}`}
    </motion.p>
  )
}

/** Recorte que deja ver solo el rectángulo de origen (la tarjeta), con sus esquinas redondeadas. */
function recorte(r: DOMRect, radio = 28) {
  return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radio}px)`
}
/** Recorte que deja ver toda la pantalla. */
const COMPLETO = 'inset(0px 0px 0px 0px round 0px)'

/**
 * Panel a pantalla completa que crece desde una tarjeta: el recorte se abre desde su rectángulo y el color de la
 * tarjeta se funde con el fondo de la app; al cerrar, el recorrido es el inverso. Se cierra con su botón,
 * deslizando hacia abajo desde el inicio del contenido o con el botón "atrás" de Android.
 */
export function PanelExpandible({ origen, onCerrar, etiqueta, fondo, children }: {
  origen: DOMRect
  onCerrar: () => void
  etiqueta: string
  /** Clases del degradado de la tarjeta de origen. */
  fondo: string
  children: ReactNode
}) {
  const reducido = useReducedMotion()
  const lista = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const tiron = useMotionValue(0)
  const opacidadAsa = useTransform(tiron, [0, 60], [0.5, 1])

  // Fondo quieto mientras el panel existe (bloqueo compartido: se libera al desmontarse, en cualquier orden).
  useEffect(() => bloquearScroll(), [])

  // "Atrás" (Escape) lo cierra si no hay una hoja encima.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const otraVentana = [...document.querySelectorAll('[role="dialog"]')].some((d) => d !== panel.current)
      if (e.key === 'Escape' && !otraVentana) onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  // Deslizar hacia abajo desde el inicio del contenido: cede con resistencia y, pasado el umbral, se cierra.
  const inicio = useRef<number | null>(null)
  const alTocar = (e: React.TouchEvent) => {
    inicio.current = (lista.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null
  }
  const alMover = (e: React.TouchEvent) => {
    if (inicio.current === null) return
    const dy = e.touches[0].clientY - inicio.current
    tiron.set(dy > 0 ? goma(dy, 140) : 0)
  }
  const alSoltar = () => {
    if (inicio.current === null) return
    inicio.current = null
    if (tiron.get() > 70) onCerrar()
    else void animate(tiron, 0, { type: 'spring', duration: 0.35, bounce: 0 })
  }

  const presente = useIsPresent()
  const desde = recorte(origen)
  return (
    // Mientras se cierra no recibe toques ni cuenta como ventana abierta (se puede tocar la app de inmediato).
    <div
      ref={panel}
      role={presente ? 'dialog' : undefined} aria-modal={presente ? 'true' : undefined} aria-label={etiqueta}
      className={clsx('fixed inset-0 z-40', !presente && 'pointer-events-none')}
    >
      {/* Capa de la app: fondo y contenido. Aparece cuando la forma de la tarjeta ya cubrió la pantalla y, al
          cerrar, se oculta detrás de ella antes de que empiece a encogerse (así nunca se ve la lista recortada). */}
      <motion.div
        className="absolute inset-0 bg-suelo"
        initial={{ opacity: 0 }}
        // Se vuelve opaca detrás de la forma (ya a pantalla completa) y antes de que esta se disuelva: el Inicio nunca
        // se transparenta por debajo (sin doble exposición).
        animate={{ opacity: 1, transition: reducido ? { duration: 0.2 } : { duration: 0.06, delay: 0.28 } }}
        exit={{ opacity: 0, transition: reducido ? { duration: 0.15 } : { duration: 0.08, delay: 0.12 } }}
      >
      <div
        ref={lista}
        className="desplazable h-full px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]"
        onTouchStart={alTocar} onTouchMove={alMover} onTouchEnd={alSoltar} onTouchCancel={alSoltar}
      >
        <motion.div style={{ y: tiron }} className="mx-auto max-w-3xl">
          {/* Asa: indica que el panel se cierra deslizando hacia abajo. */}
          <motion.div style={{ opacity: opacidadAsa }} className="flex justify-center pb-3 pt-1">
            <span className="h-1.5 w-11 rounded-full bg-linea" />
          </motion.div>
          {children}
        </motion.div>
      </div>
      </motion.div>

      {/* La forma de la tarjeta (su mismo color). Solo esta capa liviana cambia de tamaño:
          · al abrir crece desde la tarjeta hasta la pantalla completa y se disuelve en el fondo de la app;
          · al cerrar aparece sobre la lista, se encoge con un movimiento parejo hasta la tarjeta y se funde con
            ella al llegar (la tarjeta real está debajo, en el mismo lugar), sin quedarse quieta ni saltar. */}
      {!reducido && (
        <motion.div
          aria-hidden="true"
          className={clsx('pointer-events-none absolute inset-0 bg-gradient-to-br', fondo)}
          initial={{ clipPath: desde, opacity: 1 }}
          animate={{
            clipPath: COMPLETO,
            opacity: 0,
            transition: { clipPath: { duration: 0.45, ease: EASE_HOJA }, opacity: { duration: 0.3, delay: 0.36, ease: 'easeOut' } },
          }}
          exit={{
            clipPath: desde,
            opacity: [0, 1, 1, 0],
            transition: {
              clipPath: { duration: 0.36, delay: 0.12, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.56, times: [0, 0.2, 0.72, 1], ease: 'linear' },
            },
          }}
        />
      )}
    </div>
  )
}
