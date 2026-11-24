/**
 * FinScore: puntaje del mes con su nivel, cómo ganar más puntos, camino a los premios, retos semanales,
 * historial mes a mes y cupones (velados en la beta).
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight, BarChart3, CalendarClock, Check, ChevronDown, ChevronRight, Copy, Crown, FileText, Flame, Gift, PenLine, PiggyBank, StickyNote, Store,
  Target, Ticket, Trophy, Zap,
} from 'lucide-react'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { useUI } from '../store/ui'
import { Boton, EASE_OUT, Progreso, Proximamente, Tarjeta, Titulo, entrada } from '../components/ui'
import { useConteo } from '../components/Marcador'
import { PanelExpandible, PistaArrastre, VeloArrastre, useArrastreTarjeta } from '../components/Expandible'
import { GUIAS, estadoReto } from '../components/GuiaReto'
import { calcularFinScore, DIA_CIERRE, maximoAlcanzable, type ComponenteScore } from '../lib/finscore'
import { BETA, RECOMPENSAS } from '../lib/planes'
import { capitalizar, hoyISO, mesActual, mesAnterior, nombreMes } from '../lib/formato'
import { registrarEvento } from '../lib/telemetria'


/** Degradado de la tarjeta de puntaje (el panel de puntos nace de este color). */
const FONDO_TARJETA = 'from-[#8f7cfb] via-[#6d4ff0] to-[#4b2fd6]'

// Cada fuente de puntos con su ícono y adónde ir para ganarla.
const FUENTES: Record<string, { i: typeof PenLine; col: string; ir: string }> = {
  registro: { i: PenLine, col: 'bg-marca-50 text-marca-600', ir: 'registrar' },
  racha: { i: Flame, col: 'bg-amber-100 text-amber-600', ir: 'registrar' },
  extracto: { i: FileText, col: 'bg-marca-50 text-marca-600', ir: '/extractos' },
  presupuesto: { i: PiggyBank, col: 'bg-marca-50 text-marca-600', ir: '/presupuestos' },
  metas: { i: Target, col: 'bg-marca-50 text-marca-600', ir: '/presupuestos?seccion=metas' },
  retos: { i: Trophy, col: 'bg-marca-50 text-marca-600', ir: '#retos' },
}

const ICONO_RETO: Record<string, typeof PenLine> = { registro5: PenLine, insights2: BarChart3, aliado: Store, meta: Target, notas3: StickyNote }

/** Niveles del mes: un nombre para cada tramo del puntaje (lo que se presume, no solo un número). */
const NIVELES = [
  { min: 0, nombre: 'Arrancando' },
  { min: 40, nombre: 'En ritmo' },
  { min: 70, nombre: 'Constante' },
  { min: 85, nombre: 'Imparable' },
  { min: 100, nombre: 'Leyenda' },
]
function nivelDe(total: number) {
  // Último nivel alcanzado (sin findLastIndex, que no existe en WebViews antiguos).
  let i = 0
  while (i + 1 < NIVELES.length && total >= NIVELES[i + 1].min) i++
  return { numero: i + 1, nombre: NIVELES[i].nombre, siguiente: NIVELES[i + 1] ? { nombre: NIVELES[i + 1].nombre, falta: NIVELES[i + 1].min - total } : null }
}

/** Destello de cuatro puntas (los que titilan sobre la tarjeta). */
function Destello({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d="M12 0c.6 5.6 2.9 8.4 12 12-9.1 3.6-11.4 6.4-12 12-.6-5.6-2.9-8.4-12-12C9.1 8.4 11.4 5.6 12 0Z" fill="currentColor" />
    </svg>
  )
}
const DESTELLOS = [
  { left: '58%', top: '12%', t: 12, d: '0s' },
  { left: '88%', top: '30%', t: 9, d: '-1.1s' },
  { left: '46%', top: '62%', t: 7, d: '-2.2s' },
  { left: '8%', top: '74%', t: 10, d: '-0.6s' },
  { left: '92%', top: '72%', t: 8, d: '-1.7s' },
  { left: '30%', top: '8%', t: 6, d: '-2.6s' },
]

/** Anillo del puntaje con degradado menta → blanco y un halo que brilla. */
function AnilloVivo({ valor, tam = 128, children }: { valor: number; tam?: number; children: ReactNode }) {
  const id = useId()
  const grosor = 12
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`anillo-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4fd8b4" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} stroke="rgba(255,255,255,.18)" />
        <motion.circle
          cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={`url(#anillo-${id})`} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, valor / 100)) }}
          transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.15 }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(79,216,180,.75))' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** La tarjeta del puntaje del mes: color, movimiento y la puerta a "cómo ganar más puntos". */
function TarjetaPuntaje({ total, racha, mensaje, mes, onMas, refTarjeta }: {
  total: number; racha: number; mensaje: string; mes: string; onMas: () => void; refTarjeta: React.RefObject<HTMLDivElement | null>
}) {
  const n = useConteo(total, 1000)
  const nivel = nivelDe(total)
  return (
    <div ref={refTarjeta} className="relative isolate overflow-hidden rounded-[28px] bg-[#4b2fd6] p-5 text-white shadow-[0_22px_44px_-18px_rgba(99,56,238,.85)]">
      {/* Fondo vivo: manchas de color que derivan, destellos y un brillo que la recorre de vez en cuando. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className={clsx('absolute inset-0 bg-gradient-to-br', FONDO_TARJETA)} />
        <div className="ft-deriva-a absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#4fd8b4]/45 blur-3xl" />
        <div className="ft-deriva-b absolute -bottom-28 -right-12 h-72 w-72 rounded-full bg-[#f7c948]/35 blur-3xl" />
        <div className="ft-deriva-b absolute right-6 top-2 h-36 w-36 rounded-full bg-[#ff7eb6]/30 blur-3xl" style={{ animationDelay: '-5s' }} />
        {DESTELLOS.map((s) => (
          <Destello key={s.left + s.top} className="ft-titila absolute text-white" style={{ left: s.left, top: s.top, width: s.t, height: s.t, animationDelay: s.d }} />
        ))}
        <div className="ft-barrido absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold ring-1 ring-inset ring-white/20">
          <Crown size={14} className="text-amber-200" /> Nivel {nivel.numero} · {nivel.nombre}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-3 py-1 text-sm font-bold" aria-label={`Racha de ${racha} días`}>
          <Flame size={16} className="ft-llama fill-amber-300 text-amber-300" /> {racha}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <AnilloVivo valor={total}>
          <div><p className="num text-[40px] font-extrabold leading-none">{n}</p><p className="text-xs text-white/75">de 100</p></div>
        </AnilloVivo>
        <div className="min-w-0">
          <p className="text-[15px] text-white/80">Tu puntaje de {nombreMes(mes, false)}</p>
          <p className="mt-1 text-[17px] font-bold leading-snug">{mensaje}</p>
          {nivel.siguiente && <p className="mt-2 text-[13px] text-white/75">{nivel.siguiente.falta} pts para el nivel {nivel.siguiente.nombre}</p>}
        </div>
      </div>

      <button
        onClick={onMas}
        className="tocable mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-bold text-marca-700 shadow-[0_8px_20px_-8px_rgba(0,0,0,.35)]"
      >
        <Zap size={18} className="fill-amber-300 text-amber-500" /> ¿Quieres más puntos? <ChevronDown size={18} />
      </button>
    </div>
  )
}

/** Panel "Gana más puntos": de dónde sale el puntaje del mes y a dónde ir para sumar cada parte. */
function GanarPuntos({ componentes, total, onIr, onCerrar }: { componentes: ComponenteScore[]; total: number; onIr: (destino: string) => void; onCerrar: () => void }) {
  const meta = total >= 85 ? 100 : 85
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <button onClick={onCerrar} className="tocable -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-tinta" aria-label="Cerrar">
          <ChevronDown size={26} />
        </button>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Gana más puntos</h1>
      </div>

      <Tarjeta>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold">Llevas <span className="num font-extrabold">{total}</span> de 100</p>
          <p className="text-[13px] text-tenue">{total >= 100 ? '¡Mes perfecto!' : `${meta - total} pts para llegar a ${meta}`}</p>
        </div>
        <div className="mt-3"><Progreso valor={total / 100} color={total >= 85 ? '#22c39a' : '#6338ee'} alto={10} /></div>
        <p className="mt-3 text-[13px] text-tenue">Toca cada parte para ir directo a donde se gana.</p>
      </Tarjeta>

      <Tarjeta className="!p-2">
        {componentes.map((c, i) => {
          const f = FUENTES[c.id]
          const lleno = c.puntos >= c.maximo
          return (
            <motion.button
              key={c.id} {...entrada(i + 1)} onClick={() => onIr(f.ir)}
              className="tocable flex w-full items-center gap-3.5 rounded-2xl p-3 text-left hover:bg-elevada"
            >
              <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-full dark:bg-white/10', f.col)}><f.i size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{c.nombre}</span>
                  <span className="num shrink-0 text-[15px] font-extrabold">{c.puntos}<span className="font-medium text-tenue"> / {c.maximo}</span></span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-tenue">{c.descripcion}</span>
                <span className="mt-2 block"><Progreso valor={c.puntos / c.maximo} color={lleno ? '#22c39a' : '#6338ee'} alto={6} /></span>
              </span>
              {lleno ? <span className="grid h-7 w-7 place-items-center rounded-full bg-menta-500 text-white"><Check size={15} strokeWidth={3} /></span> : <ChevronRight size={18} className="shrink-0 text-tenue" />}
            </motion.button>
          )
        })}
      </Tarjeta>
      <p className="px-1 text-[13px] text-tenue">El puntaje vuelve a cero el primer día de cada mes. El mes se cierra el día {DIA_CIERRE} del siguiente.</p>
    </div>
  )
}

/** Camino del mes: la barra avanza hasta tu puntaje y marca las dos paradas con premio. */
function Camino({ total }: { total: number }) {
  const paradas = [
    // Espacio que no se parte: "20 %" nunca queda con el signo solo en otra línea.
    { pts: 85, t: `Cupón ${RECOMPENSAS.descuentoCupon}\u00a0%`, i: Ticket },
    { pts: 100, t: 'Mes gratis', i: Crown },
  ]
  return (
    <div className="px-1 pb-2 pt-6">
      <div className="relative mx-4 h-3 rounded-full bg-elevada">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-marca-400 to-marca-600" initial={{ width: 0 }} animate={{ width: `${Math.min(100, total)}%` }} transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.2 }} />
        <motion.div
          className="absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-superficie text-xs font-extrabold text-marca-700 shadow-flotante ring-4 ring-marca-600"
          initial={{ left: '0%' }} animate={{ left: `${Math.min(100, total)}%` }} transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.2 }}
        >
          {total}
        </motion.div>
        {paradas.map((p) => (
          <span key={p.pts} className={clsx('absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full', total >= p.pts ? 'bg-menta-500' : 'bg-linea')} style={{ left: `${p.pts}%` }} />
        ))}
      </div>
      {/* Los premios van debajo: en pantallas angostas 85 y 100 quedan demasiado cerca para rotularlos sobre la barra. */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {paradas.map((p) => {
          const lograda = total >= p.pts
          return (
            <div key={p.pts} className={clsx('flex items-center gap-3 rounded-2xl p-3', lograda ? 'bg-menta-100 dark:bg-menta-500/15' : 'bg-elevada')}>
              <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-full', lograda ? 'bg-menta-500 text-white' : 'bg-superficie text-marca-600')}>
                {lograda ? <Check size={18} strokeWidth={3} /> : <p.i size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">{p.t}</span>
                <span className="block text-xs text-tenue">{lograda ? '¡Logrado!' : `a los ${p.pts} pts`}{BETA && ' · pronto'}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Mes a mes en filas: cada mes con su barra de 0 a 100 y la marca de 85 (la meta del premio), el mes en curso
 * arriba y la diferencia contra el mes anterior. Se lee de un vistazo, sin tener que interpretar un gráfico.
 */
function HistorialMeses({ cierres, actual, mes }: { cierres: { mes: string; puntaje: number }[]; actual: number; mes: string }) {
  const filas = [{ mes, puntaje: actual, enCurso: true }, ...[...cierres].sort((x, y) => y.mes.localeCompare(x.mes)).slice(0, 5).map((c) => ({ ...c, enCurso: false }))]
  return (
    <Tarjeta>
      <ul className="space-y-4">
        {filas.map((f, i) => {
          const previo = filas[i + 1]
          const cambio = previo ? f.puntaje - previo.puntaje : null
          const meta = f.puntaje >= 85
          return (
            <li key={f.mes}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {capitalizar(nombreMes(f.mes, false))}
                  {f.enCurso && <span className="rounded-full bg-marca-50 px-2 py-0.5 text-[11px] font-bold text-marca-700 dark:bg-marca-500/20 dark:text-marca-200">en curso</span>}
                </span>
                <span className="num text-[15px] font-extrabold">{f.puntaje}<span className="text-[13px] font-medium text-tenue"> pts</span></span>
              </div>
              <div className="relative mt-2 h-3 rounded-full bg-elevada">
                <motion.div
                  className={clsx('absolute inset-y-0 left-0 rounded-full', meta ? 'bg-gradient-to-r from-menta-500 to-menta-400' : f.enCurso ? 'bg-gradient-to-r from-marca-400 to-marca-300' : 'bg-gradient-to-r from-marca-500 to-marca-400')}
                  initial={{ width: 0 }} animate={{ width: `${Math.min(100, f.puntaje)}%` }} transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.1 + i * 0.06 }}
                />
                {/* Marca de 85: la meta del premio. */}
                <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-tinta/30" style={{ left: '85%' }} aria-hidden="true" />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-tenue">
                <span>{f.puntaje >= 100 ? 'Mes perfecto' : meta ? 'Meta de 85 cumplida' : f.enCurso ? `Faltan ${85 - f.puntaje} para la meta de 85` : `Quedó a ${85 - f.puntaje} de la meta`}</span>
                {cambio !== null && cambio !== 0 && (
                  <span className={clsx('font-semibold', cambio > 0 ? 'text-menta-600 dark:text-menta-400' : 'text-coral-500')}>
                    {cambio > 0 ? '▲' : '▼'} {Math.abs(cambio)} vs {nombreMes(previo!.mes, false)}
                  </span>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-tenue">
        <span className="h-3 w-0.5 rounded-full bg-tinta/30" aria-hidden="true" /> La raya marca 85 puntos: desde ahí se gana el premio del mes.
      </p>
    </Tarjeta>
  )
}

export default function FinScore() {
  const d = useDatos()
  const a = useAnalitica()
  const avisar = useApp((s) => s.avisar)
  const abrirRegistro = useUI((s) => s.abrirRegistro)
  const nav = useNavigate()
  const hoy = hoyISO()
  const total = a.finscore.total
  const alcanzable = maximoAlcanzable(a.finscore, a.mes, hoy)
  const mesPrevio = mesAnterior(mesActual())
  const previoAbierto = !d.cierres.some((c) => c.mes === mesPrevio) && Number(hoy.slice(8, 10)) < DIA_CIERRE && d.perfil.creadoEn.slice(0, 7) <= mesPrevio
  const scorePrevio = previoAbierto ? calcularFinScore(d, mesPrevio) : null
  const faltaExtractoPrevio = scorePrevio?.componentes.find((c) => c.id === 'extracto')!.puntos === 0
  const cupones = [...d.recompensas].sort((x, y) => y.mes.localeCompare(x.mes))

  const mensaje = BETA
    ? total >= 100 ? '¡Puntaje perfecto este mes!'
      : total >= 85 ? `¡Llegaste a 85! Te faltan ${100 - total} para el mes perfecto.`
        : alcanzable >= 85 ? `Te faltan ${85 - total} pts para llegar a 85.`
          : 'Cada punto de este mes construye el hábito.'
    : total >= 100 ? '¡Puntaje perfecto! Tu premio llega al cerrar el mes.'
      : total >= 85 ? `¡Tu cupón ya es tuyo! Te faltan ${100 - total} pts para el mes gratis.`
        : alcanzable >= 85 ? `Te faltan ${85 - total} pts para ganar tu cupón del ${RECOMPENSAS.descuentoCupon} %.`
          : 'Este mes ya no alcanza el cupón, pero cada punto construye el hábito.'

  // "¿Quieres más puntos?": el panel crece desde la tarjeta (botón o arrastrándola hacia abajo).
  const [panel, setPanel] = useState<DOMRect | null>(null)
  const tarjeta = useRef<HTMLDivElement>(null)
  const abrirPuntos = (via: 'boton' | 'gesto') => {
    if (!tarjeta.current) return
    setPanel(tarjeta.current.getBoundingClientRect())
    registrarEvento('accion', 'ganar_puntos_abierto', { via })
  }
  const arrastre = useArrastreTarjeta(() => abrirPuntos('gesto'))

  function irA(destino: string) {
    if (destino === 'registrar') abrirRegistro('gasto')
    else if (destino.startsWith('#')) document.querySelector(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else nav(destino)
  }
  // Desde el panel: primero se cierra (para que el destino se vea) y luego se va.
  const irDesdePanel = (destino: string) => {
    setPanel(null)
    if (destino.startsWith('#') || destino === 'registrar') setTimeout(() => irA(destino), 450)
    else irA(destino)
  }

  return (
    <div className="space-y-7">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">FinScore</h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div {...arrastre.props} className={clsx('relative', arrastre.activo && 'z-40')}>
          <PistaArrastre y={arrastre.y} listo={arrastre.listo} accion="ganar más puntos" />
          <motion.div {...entrada(0)}>
            <TarjetaPuntaje total={total} racha={a.racha} mensaje={mensaje} mes={a.mes} refTarjeta={tarjeta} onMas={() => abrirPuntos('boton')} />
          </motion.div>
        </motion.div>

        <motion.div {...entrada(1)}>
          <Tarjeta className="h-full">
            <Titulo>Camino a tu premio</Titulo>
            <Camino total={total} />
            <p className="mt-2 text-[13px] text-tenue">El puntaje vuelve a cero el primer día de cada mes. El premio se entrega el día {DIA_CIERRE}.</p>
          </Tarjeta>
        </motion.div>
      </div>

      {scorePrevio && (
        <motion.div {...entrada(2)} className="flex items-center gap-4 rounded-tarjeta bg-amber-100/70 p-4 dark:bg-amber-500/15">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-superficie text-amber-600"><CalendarClock size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">{capitalizar(nombreMes(mesPrevio, false))} todavía no cierra: llevas {scorePrevio.total} pts</p>
            <p className="text-[13px] text-tenue">
              {faltaExtractoPrevio ? `Sube el extracto de ${nombreMes(mesPrevio, false)} antes del día ${DIA_CIERRE} y suma 15 puntos${scorePrevio.total + 15 >= 85 ? ': ¡con eso llegas a 85!' : '.'}` : 'Ya subiste tu extracto. ¡Bien hecho!'}
            </p>
          </div>
          {faltaExtractoPrevio && <Boton className="!h-10 shrink-0" onClick={() => nav('/extractos')}>Subir</Boton>}
        </motion.div>
      )}

      <section id="retos" className="scroll-mt-24">
        <Titulo accion={<span className="text-[13px] text-tenue">+2,5 pts cada uno</span>}>Retos de esta semana</Titulo>
        {/* scroll-px-5: al desplazar, cada tarjeta se detiene en el margen de la app y no contra el borde. */}
        <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:scroll-px-0 sm:px-0">
          {a.retos.retos.map((r, i) => {
            const base = r.id.split(':')[1]
            const I = ICONO_RETO[base] ?? Trophy
            const guia = GUIAS[base]
            const ir = () => {
              registrarEvento('accion', 'reto_abierto', { reto: base })
              nav(guia.destino, { state: estadoReto(base) })
            }
            return (
              <motion.button
                key={r.id} {...entrada(i + 2)} type="button" disabled={r.completado || !guia} onClick={ir}
                className={clsx(
                  'tocable flex w-[78%] shrink-0 snap-start flex-col rounded-tarjeta p-5 text-left disabled:cursor-default sm:w-auto',
                  r.completado ? 'bg-menta-500 text-white' : 'bg-superficie shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className={clsx('grid h-11 w-11 place-items-center rounded-full', r.completado ? 'bg-white/20' : 'bg-marca-50 text-marca-600 dark:bg-marca-500/20')}><I size={21} /></span>
                  {r.completado ? <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">¡Completado!</span> : <span className="num text-sm font-bold text-tenue">{r.progreso}/{r.meta}</span>}
                </div>
                <p className="mt-4 text-base font-bold">{r.titulo}</p>
                <p className={clsx('mt-1 text-[13px] leading-snug', r.completado ? 'text-white/85' : 'text-tenue')}>{r.descripcion}</p>
                {!r.completado && (
                  <>
                    <div className="mt-4 w-full"><Progreso valor={r.progreso / r.meta} alto={8} /></div>
                    <span className="mt-3 flex items-center gap-1 text-[13px] font-bold text-marca-600 dark:text-marca-300">Cómo cumplirlo <ArrowRight size={15} /></span>
                  </>
                )}
              </motion.button>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section>
          <Titulo accion={!BETA && cupones.some((c) => !c.usado && c.venceEn >= hoy) ? <Link to="/planes" className="text-sm font-semibold text-marca-600 dark:text-marca-300">Usar</Link> : undefined}>
            <span className="flex items-center gap-2"><Gift size={18} className="text-marca-500" /> Mis cupones</span>
          </Titulo>
          <VeloCupones>
          {cupones.length ? (
            <ul className="space-y-3">
              {cupones.map((c) => {
                const vigente = !c.usado && c.venceEn >= hoy
                return (
                  <li
                    key={c.id}
                    className={clsx('relative flex overflow-hidden rounded-[20px] text-white', vigente ? 'bg-gradient-to-r from-marca-600 to-[#8f7cfb]' : 'bg-gradient-to-r from-slate-400 to-slate-300 opacity-80 dark:from-slate-600 dark:to-slate-500')}
                    style={{ WebkitMaskImage: 'radial-gradient(circle 12px at 72% 0, transparent 98%, #000), radial-gradient(circle 12px at 72% 100%, transparent 98%, #000)', WebkitMaskComposite: 'source-in', maskComposite: 'intersect' }}
                  >
                    <div className="flex-1 p-4">
                      <p className="text-2xl font-extrabold leading-none">{c.descuento} %<span className="text-sm font-semibold"> de descuento</span></p>
                      {c.diasPremium > 0 && <p className="mt-1 text-sm font-semibold">+ {c.diasPremium} días Premium</p>}
                      <p className="mt-2 text-xs text-white/80">Ganado en {nombreMes(c.mes, false)} con {c.puntaje} pts · {c.usado ? 'Usado' : c.venceEn < hoy ? 'Vencido' : `vence el ${new Date(c.venceEn + 'T12:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`}</p>
                    </div>
                    <div className="flex w-[28%] flex-col items-center justify-center gap-1.5 border-l-2 border-dashed border-white/40 p-3">
                      <Ticket size={22} />
                      {vigente && (
                        <button className="tocable flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold" onClick={() => { navigator.clipboard?.writeText(c.codigo); avisar(`Código ${c.codigo} copiado`) }}>
                          <Copy size={12} /> Copiar
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Tarjeta className="text-center"><p className="text-[15px] text-tenue">Llega a 85 puntos este mes y aquí aparecerá tu primer cupón.</p></Tarjeta>
          )}
          </VeloCupones>
        </section>

        <section>
          <Titulo>Tu FinScore mes a mes</Titulo>
          <HistorialMeses cierres={d.cierres} actual={total} mes={a.mes} />
        </section>
      </div>

      <VeloArrastre y={arrastre.y} visible={arrastre.activo} />
      <AnimatePresence>
        {panel && (
          <PanelExpandible origen={panel} onCerrar={() => setPanel(null)} etiqueta="Gana más puntos" fondo={FONDO_TARJETA}>
            <GanarPuntos componentes={a.finscore.componentes} total={total} onIr={irDesdePanel} onCerrar={() => setPanel(null)} />
          </PanelExpandible>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Beta: los cupones se canjean en los planes de pago, desactivados en la beta. Detrás del velo van siempre los
 * dos cupones de muestra, así la sección tiene la misma altura con o sin cupones ganados.
 */
function VeloCupones({ children }: { children: React.ReactNode }) {
  if (!BETA) return <>{children}</>
  return (
    <Proximamente titulo="Cupones de descuento" texto="Llegan con los planes de pago. Tus puntos del FinScore ya cuentan para ganarlos.">
      <CuponMuestra />
    </Proximamente>
  )
}

/** Cupón de ejemplo para que, detrás del velo, se entienda qué se gana. */
function CuponMuestra() {
  return (
    <ul className="space-y-3">
      {[RECOMPENSAS.descuentoCupon, RECOMPENSAS.descuentoPerfecto].map((descuento) => (
        <li key={descuento} className="flex overflow-hidden rounded-[20px] bg-gradient-to-r from-marca-600 to-[#8f7cfb] text-white">
          <div className="flex-1 p-4">
            <p className="text-2xl font-extrabold leading-none">{descuento} %<span className="text-sm font-semibold"> de descuento</span></p>
            <p className="mt-2 text-xs text-white/80">Ganado con tu FinScore</p>
          </div>
          <div className="grid w-[28%] place-items-center border-l-2 border-dashed border-white/40 p-3"><Ticket size={22} /></div>
        </li>
      ))}
    </ul>
  )
}
