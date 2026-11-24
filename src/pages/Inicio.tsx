/**
 * Inicio: balance del mes, acciones rápidas, resumen por categoría, próximos pagos, racha y el consejo
 * principal del asistente. La tarjeta de balance se arrastra (o se toca) para ver todos los movimientos.
 */
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowDown, ArrowDownLeft, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, CreditCard, Eye, EyeOff, FileUp, Flame, Megaphone, MoreHorizontal,
  PiggyBank, ScanLine, Sparkles, Target, Trophy,
} from 'lucide-react'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useUI } from '../store/ui'
import { EASE_OUT, Hoja, Progreso, Tarjeta, Titulo, Vacio, claseEnlace, entrada } from '../components/ui'
import { DonaCategorias, Monto, TarjetaInsight, curvaSuave } from '../components/finanzas'
import { useConteo } from '../components/Marcador'
import { fechaISO, hoyISO, mesAnterior, mesDe, nombreMes, pesos, pesosCorto, sumarDias } from '../lib/formato'
import { PanelMovimientos } from '../components/PanelMovimientos'
import { PistaArrastre, VeloArrastre, useArrastreTarjeta } from '../components/Expandible'
import { registrarEvento } from '../lib/telemetria'

/** Tarjeta principal: balance del mes con su onda de los últimos días, ingresos y gastos. */
function TarjetaBalance({ onVer, refTarjeta }: { onVer: () => void; refTarjeta: React.RefObject<HTMLDivElement | null> }) {
  const d = useDatos()
  const a = useAnalitica()
  const [oculto, setOculto] = useState(false)
  const { serie, balance } = useMemo(() => {
    const meses = [5, 4, 3, 2, 1, 0].map((i) => mesAnterior(a.mes, i))
    let acum = d.movimientos.filter((m) => mesDe(m.fecha) < meses[0]).reduce((s, m) => s + m.monto, 0)
    const s = meses.map((m) => (acum += d.movimientos.filter((x) => mesDe(x.fecha) === m).reduce((t, x) => t + x.monto, 0)))
    return { serie: s, balance: acum }
  }, [d.movimientos, a.mes])
  const animado = useConteo(Math.round(balance), 900)
  const cambio = serie[4] ? ((serie[5] - serie[4]) / Math.abs(serie[4])) * 100 : 0
  const min = Math.min(...serie)
  const max = Math.max(...serie)
  const puntos = serie.map((v, i) => [(i / (serie.length - 1)) * 320, 70 - ((v - min) / (max - min || 1)) * 52] as [number, number])
  const linea = curvaSuave(puntos)

  return (
    <div ref={refTarjeta} className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#8f7cfb] via-[#6d4ff0] to-[#5b47e0] px-6 pb-14 pt-5 text-white shadow-[0_18px_40px_-18px_rgba(99,56,238,.7)]">
      <div className="relative z-10">
        {/* Etiqueta y botón en la misma fila, centrados entre sí; el monto tiene todo el ancho debajo. */}
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1 whitespace-nowrap text-[15px] text-white/85">
            Balance total
            <button onClick={() => setOculto(!oculto)} className="tocable grid h-8 w-8 place-items-center rounded-full" aria-label={oculto ? 'Mostrar saldo' : 'Ocultar saldo'}>
              {oculto ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </p>
          <button
            onClick={onVer}
            className="tocable -mr-1.5 flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/[0.18] pl-3.5 pr-2.5 text-[13px] font-bold text-white ring-1 ring-inset ring-white/25 hover:bg-white/25"
          >
            {/* En pantallas angostas (menos de 380 px) el texto corto evita partir "Balance total" en dos líneas. */}
            <span className="max-[379px]:hidden">Ver movimientos</span>
            <span className="min-[380px]:hidden">Movimientos</span>
            <ChevronDown size={16} strokeWidth={2.6} />
          </button>
        </div>
        <p className="num mt-1.5 text-[38px] font-extrabold leading-none tracking-[-0.02em]">{oculto ? '$ •••••••' : pesos(animado)}</p>
        <p className="mt-3 flex items-center gap-1 text-[15px] text-white/90">
          {cambio >= 0 ? <ArrowUpRight size={17} className="text-menta-100" /> : <ArrowDownLeft size={17} className="text-coral-100" />}
          <span className="font-semibold">{Math.abs(cambio).toFixed(1).replace('.', ',')} %</span> frente al mes pasado
        </p>
      </div>
      <svg viewBox="0 0 320 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-24 w-full" aria-hidden="true">
        <defs>
          <linearGradient id="onda" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path d={`${linea} L320,80 L0,80 Z`} fill="url(#onda)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
        <motion.path d={linea} fill="none" stroke="#e9e7ff" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.15 }} />
      </svg>
    </div>
  )
}

/** Botón redondo de acción rápida (Gasto, Ingreso, Extracto, Más). */
function Accion({ icono: I, texto, onClick }: { icono: typeof ArrowDown; texto: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tocable group flex flex-col items-center gap-2">
      <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-superficie text-marca-600 shadow-suave transition-shadow duration-200 group-hover:shadow-flotante dark:text-marca-200">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-marca-50 dark:bg-marca-500/20"><I size={21} /></span>
      </span>
      <span className="text-[13px] font-semibold text-tinta">{texto}</span>
    </button>
  )
}

/** Resumen del mes: dona de gasto por categoría. */
function Resumen() {
  const a = useAnalitica()
  const d = useDatos()
  const ahorro = d.metas.reduce((s, m) => s + m.ahorrado, 0)
  const pct = (x: number, y: number) => (y ? ((x - y) / y) * 100 : null)
  const tarjetas = [
    { t: 'Ingresos', v: a.ingresos, c: pct(a.ingresos, a.ingresosAnt), i: ArrowUp, col: 'bg-menta-100 text-menta-600 dark:bg-menta-500/15 dark:text-menta-400', bueno: (x: number) => x >= 0 },
    { t: 'Gastos', v: a.gastos, c: pct(a.gastos, a.gastosAnt), i: ArrowDown, col: 'bg-coral-100 text-coral-500 dark:bg-coral-500/15', bueno: (x: number) => x <= 0 },
    { t: 'Ahorros', v: ahorro, c: null, i: PiggyBank, col: 'bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200', bueno: () => true },
  ]
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {tarjetas.map(({ t, v, c, i: I, col, bueno }, k) => (
        <motion.div key={t} {...entrada(k + 3)} className="rounded-[20px] bg-superficie p-3 shadow-suave sm:p-4 dark:shadow-none dark:ring-1 dark:ring-linea">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full', col)}><I size={16} strokeWidth={2.4} /></span>
            <span className="text-[13px] text-tenue">{t}</span>
          </div>
          <p className="num mt-2 text-[15px] font-extrabold text-tinta sm:mt-2.5 sm:text-lg">
            {/* En el celular los millones se abrevian para que el monto quepa completo. */}
            <span className="sm:hidden">{v >= 1_000_000 ? pesosCorto(v).replace('$', '$ ') : pesos(v)}</span>
            <span className="hidden sm:inline">{pesos(v)}</span>
          </p>
          <p className={clsx('mt-0.5 text-[13px] font-semibold', c === null ? 'text-tenue' : bueno(c) ? 'text-menta-600 dark:text-menta-400' : 'text-coral-500')}>
            {/* Un cambio menor a 0,05 % se muestra como 0,0 % (sin "-0,0 %"). */}
            {t === 'Ahorros' ? `${d.metas.length} metas` : c === null ? 'Sin comparar' : Math.abs(c) < 0.05 ? '0,0 %' : `${c > 0 ? '+' : ''}${c.toFixed(1).replace('.', ',')} %`}
          </p>
        </motion.div>
      ))}
    </div>
  )
}

/** La gamificación en el Inicio: racha de la semana, puntos del mes y la misión de hoy. */
function TuRacha() {
  const d = useDatos()
  const a = useAnalitica()
  const abrir = useUI((s) => s.abrirRegistro)
  const nav = useNavigate()
  const hoy = hoyISO()
  const registrados = new Set(d.movimientos.filter((m) => m.origen !== 'extracto').map((m) => fechaISO(new Date(m.creadoEn))))
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6))
  const registroHoy = registrados.has(hoy)
  const reto = a.retos.retos.find((r) => !r.completado)
  const meta = a.finscore.total >= 85 ? 100 : 85
  const dias = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

  return (
    <Tarjeta className="!p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 dark:bg-amber-500/15"><Flame size={24} className="fill-amber-400 text-amber-500" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold">{a.racha} {a.racha === 1 ? 'día' : 'días'} seguidos</p>
          <p className="text-[13px] text-tenue">{registroHoy ? '¡Hoy ya sumaste! Vuelve mañana.' : 'Registra algo hoy para no perder tu racha.'}</p>
        </div>
        <Link to="/finscore" className="tocable flex items-center gap-1 rounded-full bg-marca-50 px-3 py-1.5 text-sm font-bold text-marca-700 dark:bg-marca-500/20 dark:text-marca-200">
          <Trophy size={15} /> {a.finscore.total}
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {semana.map((f, i) => {
          const on = registrados.has(f)
          return (
            <div key={f} className="flex flex-col items-center gap-1.5">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.35, delay: 0.25 + i * 0.05 }}
                className={clsx('grid h-9 w-9 place-items-center rounded-full', on ? 'bg-amber-400 text-white' : f === hoy ? 'border-2 border-dashed border-amber-400 bg-superficie' : 'bg-elevada')}
              >
                {on && <Flame size={16} className="fill-white" />}
              </motion.span>
              <span className={clsx('text-xs font-semibold', f === hoy ? 'text-tinta' : 'text-tenue')}>{dias[new Date(f + 'T12:00').getDay()]}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-5">
        <div className="mb-2 flex justify-between gap-2 text-[13px]">
          <span className="font-semibold">FinScore de {nombreMes(a.mes, false)}</span>
          <span className="text-tenue">{a.finscore.total >= 100 ? '¡Mes perfecto!' : `${meta - a.finscore.total} pts para ${meta === 85 ? 'tu cupón' : 'el mes gratis'}`}</span>
        </div>
        <Progreso valor={a.finscore.total / 100} color={a.finscore.total >= 85 ? '#22c39a' : '#6338ee'} alto={10} />
      </div>
      <button
        onClick={() => (registroHoy ? nav('/finscore') : abrir('gasto'))}
        className="tocable mt-4 flex w-full items-center gap-3 rounded-2xl bg-elevada p-3 text-left"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-superficie text-marca-600"><Target size={19} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-tenue">Misión de hoy</span>
          <span className="block truncate text-[15px] font-semibold">{!registroHoy ? 'Registra tu primer gasto del día · +2 pts' : reto ? `${reto.titulo} · ${reto.progreso}/${reto.meta}` : 'Todo listo por hoy'}</span>
        </span>
        <ChevronRight size={18} className="text-tenue" />
      </button>
    </Tarjeta>
  )
}

/** Pantalla de inicio (ruta `/`). */
export default function Inicio() {
  const a = useAnalitica()
  const abrir = useUI((s) => s.abrirRegistro)
  const nav = useNavigate()
  const [mas, setMas] = useState(false)
  // Movimientos a pantalla completa: crecen desde el rectángulo de la tarjeta de balance.
  const [panel, setPanel] = useState<DOMRect | null>(null)
  const tarjeta = useRef<HTMLDivElement>(null)
  const verMovimientos = (via: 'boton' | 'gesto') => {
    if (!tarjeta.current) return
    setPanel(tarjeta.current.getBoundingClientRect())
    registrarEvento('accion', 'movimientos_abiertos', { via })
  }
  // Arrastrar la tarjeta hacia abajo también los abre (el resto de la app se desenfoca mientras tanto).
  const arrastre = useArrastreTarjeta(() => verMovimientos('gesto'))
  const proximos = a.recurrentes.filter((r) => r.proximo >= hoyISO()).sort((x, y) => x.proximo.localeCompare(y.proximo)).slice(0, 4)
  const hallazgo = a.insights[0]
  const atajos = [
    { t: 'Escanear factura', i: ScanLine, a: '/promociones?escanear=1' },
    { t: 'Importar extracto', i: FileUp, a: '/extractos' },
    { t: 'Presupuestos y metas', i: PiggyBank, a: '/presupuestos' },
    { t: 'Promociones', i: Megaphone, a: '/promociones' },
    { t: 'Planes', i: CreditCard, a: '/planes' },
    { t: 'Retos y FinScore', i: Trophy, a: '/finscore' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
      <div className="min-w-0 space-y-7">
        <h1 className="sr-only">Inicio</h1>
        <motion.div {...arrastre.props} className={clsx('relative', arrastre.activo && 'z-40')}>
          <PistaArrastre y={arrastre.y} listo={arrastre.listo} accion="ver tus movimientos" />
          <motion.div {...entrada(0)}><TarjetaBalance refTarjeta={tarjeta} onVer={() => verMovimientos('boton')} /></motion.div>
          <motion.div {...entrada(1)} className="relative z-10 -mt-9 grid grid-cols-4 px-1">
            <Accion icono={ArrowDown} texto="Gasto" onClick={() => abrir('gasto')} />
            <Accion icono={ArrowUp} texto="Ingreso" onClick={() => abrir('ingreso')} />
            <Accion icono={FileUp} texto="Extracto" onClick={() => nav('/extractos')} />
            <Accion icono={MoreHorizontal} texto="Más" onClick={() => setMas(true)} />
          </motion.div>
        </motion.div>

        <section>
          <Titulo accion={<Link to="/insights" className={claseEnlace}>Ver todo</Link>}>Resumen de {nombreMes(a.mes, false)}</Titulo>
          <Resumen />
        </section>

        <section>
          <Titulo accion={<Link to="/insights" aria-label="Abrir el asistente"><ChevronRight size={20} className="text-tenue" /></Link>}>
            <span className="flex items-center gap-2"><Sparkles size={18} className="text-marca-500" /> Consejos de tu asistente</span>
          </Titulo>
          {hallazgo ? <TarjetaInsight i={hallazgo} onVer={() => nav('/insights')} /> : <Vacio titulo="Aún aprendiendo" texto="Con unos días de registros te daremos consejos personalizados." />}
        </section>

        <div className="lg:hidden"><TuRacha /></div>
        {/* Los movimientos no se repiten aquí: viven dentro de la tarjeta de balance (botón o deslizar hacia abajo). */}
      </div>

      <div className="space-y-6">
        <div className="hidden lg:block"><TuRacha /></div>
        <div className="rounded-tarjeta bg-noche-900 p-6 text-white">
          <p className="mb-5 text-[17px] font-bold">¿En qué se va tu plata?</p>
          {a.categorias.length ? <DonaCategorias datos={a.categorias} total={a.gastos} oscuro alto={140} /> : <p className="text-white/70">Aún no hay gastos este mes.</p>}
        </div>
        <Tarjeta>
          <Titulo>Próximos pagos</Titulo>
          {proximos.length ? (
            <ul className="space-y-1">
              {proximos.map((r) => (
                <li key={r.clave} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{r.nombre}</p>
                    <p className="text-[13px] text-tenue">{new Date(r.proximo + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                  </div>
                  <Monto valor={-r.montoTipico} className="text-[15px]" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-tenue">Cuando detectemos pagos que se repiten, te avisaremos antes de cada uno.</p>
          )}
        </Tarjeta>
      </div>

      <VeloArrastre y={arrastre.y} visible={arrastre.activo} />
      <AnimatePresence>{panel && <PanelMovimientos origen={panel} onCerrar={() => setPanel(null)} />}</AnimatePresence>

      <Hoja abierto={mas} onCerrar={() => setMas(false)} titulo="¿Qué quieres hacer?">
        <div className="grid grid-cols-3 gap-3 pb-2">
          {atajos.map(({ t, i: I, a: to }) => (
            <button key={t} onClick={() => { setMas(false); nav(to) }} className="tocable flex flex-col items-center gap-2 rounded-2xl p-3 text-center active:bg-elevada">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200"><I size={24} /></span>
              <span className="text-[13px] font-semibold leading-tight">{t}</span>
            </button>
          ))}
        </div>
      </Hoja>
    </div>
  )
}
