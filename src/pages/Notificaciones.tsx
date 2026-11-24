/**
 * Notificaciones: lista de avisos calculados en el dispositivo (`hooks/useNotificaciones.ts`).
 * Al entrar se marcan como vistos.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { AlertTriangle, Bell, CalendarClock, ChevronRight, Flame, PiggyBank, Repeat, Sparkles, Trophy, type LucideIcon } from 'lucide-react'
import { useNotificaciones, useVistos, type Aviso, type TipoAviso } from '../hooks/useNotificaciones'
import { useUI } from '../store/ui'
import { EASE_OUT, Vacio } from '../components/ui'
import { diasEntre, hoyISO } from '../lib/formato'

/** Ícono y colores de cada tipo de aviso. */
const ESTILO: Record<TipoAviso, { i: LucideIcon; col: string }> = {
  alerta: { i: AlertTriangle, col: 'bg-coral-100 text-coral-600 dark:bg-coral-500/15 dark:text-[#ff8a9b]' },
  pago: { i: Repeat, col: 'bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200' },
  presupuesto: { i: PiggyBank, col: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  racha: { i: Flame, col: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  logro: { i: Trophy, col: 'bg-menta-100 text-menta-600 dark:bg-menta-500/15 dark:text-menta-400' },
  cierre: { i: CalendarClock, col: 'bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200' },
  consejo: { i: Sparkles, col: 'bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200' },
}

/** "Hoy", "Ayer", "Hace 3 días" o la fecha corta. */
function cuando(fecha: string) {
  const dias = diasEntre(fecha.slice(0, 10), hoyISO())
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 7) return `Hace ${dias} días`
  return new Date(fecha.slice(0, 10) + 'T12:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Fila de un aviso; las nuevas se resaltan. */
function Fila({ aviso, nueva, indice, onAbrir }: { aviso: Aviso; nueva: boolean; indice: number; onAbrir: () => void }) {
  const { i: I, col } = ESTILO[aviso.tipo]
  return (
    <motion.button
      onClick={onAbrir}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT, delay: Math.min(indice, 8) * 0.04 }}
      className={clsx('tocable flex w-full items-start gap-3.5 rounded-[20px] p-3.5 text-left', nueva ? 'bg-superficie shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea' : 'hover:bg-superficie/60')}
    >
      <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-full', col)}><I size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={clsx('text-[15px] leading-snug text-tinta', nueva ? 'font-bold' : 'font-semibold')}>{aviso.titulo}</span>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-tenue">
            {cuando(aviso.fecha)}
            {nueva && <span className="h-2 w-2 rounded-full bg-coral-500" aria-label="Nueva" />}
          </span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-tenue">{aviso.texto}</span>
      </span>
      <ChevronRight size={18} className="mt-3 shrink-0 text-tenue" />
    </motion.button>
  )
}

export default function Notificaciones() {
  const { lista, vistos } = useNotificaciones()
  const marcar = useVistos((s) => s.marcar)
  const abrirRegistro = useUI((s) => s.abrirRegistro)
  const nav = useNavigate()
  // Las nuevas de esta visita se resaltan, aunque al entrar ya queden marcadas como vistas.
  const [nuevas] = useState(() => new Set(lista.filter((x) => !vistos.includes(x.id)).map((x) => x.id)))

  useEffect(() => {
    marcar(lista.map((x) => x.id))
  }, [lista, marcar])

  const abrir = (a: Aviso) => {
    if (a.destino === 'registrar') abrirRegistro('gasto')
    else nav(a.destino)
  }

  const recientes = lista.filter((x) => nuevas.has(x.id))
  const anteriores = lista.filter((x) => !nuevas.has(x.id))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Notificaciones</h1>
        <p className="mt-1 text-[15px] text-tenue">Cobros que se acercan, gastos para revisar y tus logros.</p>
      </div>

      {!lista.length && <Vacio icono={Bell} titulo="Todo al día" texto="Aquí te avisaremos de cobros que se acercan, gastos inusuales, presupuestos en riesgo y tus logros." />}

      {recientes.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.06em] text-tenue">Nuevas</h2>
          <div className="space-y-2">{recientes.map((x, i) => <Fila key={x.id} aviso={x} nueva indice={i} onAbrir={() => abrir(x)} />)}</div>
        </section>
      )}
      {anteriores.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.06em] text-tenue">{recientes.length ? 'Anteriores' : 'Recientes'}</h2>
          <div className="space-y-1">{anteriores.map((x, i) => <Fila key={x.id} aviso={x} nueva={false} indice={i + recientes.length} onAbrir={() => abrir(x)} />)}</div>
        </section>
      )}
    </div>
  )
}
