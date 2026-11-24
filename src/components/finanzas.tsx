/** Piezas visuales de finanzas reutilizadas en varias pantallas: montos, filas de movimientos, dona, sparkline y tarjeta de consejo. */
import clsx from 'clsx'
import { motion } from 'motion/react'
import { ChevronRight, Lightbulb, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { CATEGORIAS } from '../lib/categorias'
import { fechaLegible, pesos, pesosCorto } from '../lib/formato'
import type { IdCategoria, Movimiento } from '../lib/tipos'
import type { Insight } from '../ml/insights'
import { ChipCategoria, EASE_OUT } from './ui'
import { useUI } from '../store/ui'

/** Monto con signo: ingreso en verde con +, gasto en tinta con −. */
export function Monto({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={clsx('num font-bold', valor > 0 ? 'text-menta-600 dark:text-menta-400' : 'text-tinta', className)}>
      {valor > 0 ? '+ ' : '− '}{pesos(Math.abs(valor))}
    </span>
  )
}

/** Hora corta en formato colombiano ("2:15 p. m."). */
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

/**
 * Fila de movimiento: ícono en círculo, comercio y categoría; monto y fecha. Al tocarla se abre la edición.
 * `indice` escalona la animación de entrada en las listas (hasta el octavo elemento).
 */
export function FilaMovimiento({ m, indice = 0 }: { m: Movimiento; indice?: number }) {
  const abrir = useUI((s) => s.abrirRegistro)
  const c = CATEGORIAS[m.categoria]
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE_OUT, delay: Math.min(indice, 8) * 0.04 }}
      onClick={() => abrir(m.monto > 0 ? 'ingreso' : 'gasto', m)}
      className="tocable flex min-h-[68px] w-full items-center gap-3.5 rounded-2xl px-2 text-left hover:bg-elevada"
    >
      <ChipCategoria id={m.categoria} texto={m.descripcion} tam={46} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-tinta">{m.descripcion}</span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-tenue">
          {c.nombre}
          {/* Clasificada automáticamente con poca seguridad: se invita a confirmar la categoría. */}
          {m.confianza !== null && m.confianza < 0.6 && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600"><Sparkles size={12} /> Revisar</span>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Monto valor={m.monto} className="block text-[15px]" />
        <span className="mt-0.5 block text-[13px] text-tenue">{fechaLegible(m.fecha)}{m.origen !== 'extracto' ? `, ${hora(m.creadoEn)}` : ''}</span>
      </span>
    </motion.button>
  )
}

// Tonos de la marca para la dona: se distinguen por claridad, sin sumar colores nuevos a la app.
const PASTELES = ['#8b78ff', '#b3a6ff', '#6a52e8', '#d6cfff', '#9d8ff0']
const GRIS_OTRAS = '#8e94b8'

// Nombres cortos para la leyenda, donde el espacio es poco.
const CORTO: Partial<Record<IdCategoria, string>> = {
  comida: 'Comida', servicios: 'Servicios', entretenimiento: 'Entretenimiento', transferencias: 'Transferencias',
}
const nombreCorto = (c: IdCategoria) => CORTO[c] ?? CATEGORIAS[c].nombre

/**
 * Desglose del gasto: dona gruesa a la izquierda con el total en un disco central y leyenda a la derecha
 * con porcentajes. Muestra las 5 categorías principales y agrupa el resto en "Otros".
 * Cada segmento se dibuja en orden al aparecer. `oscuro` es para usarla sobre fondos oscuros (landing).
 */
export function DonaCategorias({ datos, total, oscuro, alto = 150 }: { datos: [IdCategoria, number][]; total: number; oscuro?: boolean; alto?: number }) {
  const top = datos.slice(0, 5)
  const resto = datos.slice(5).reduce((a, [, v]) => a + v, 0)
  const filas = [
    ...top.map(([c, v], i) => ({ id: c, nombre: nombreCorto(c), valor: v, color: PASTELES[i] })),
    ...(resto ? [{ id: 'resto', nombre: 'Otros', valor: resto, color: GRIS_OTRAS }] : []),
  ]
  const suma = filas.reduce((s, f) => s + f.valor, 0) || 1
  // Geometría en un viewBox de 100×100: cada segmento es un trazo del mismo círculo, desplazado con strokeDashoffset.
  const grosor = 18
  const r = 50 - grosor / 2
  const c = 2 * Math.PI * r
  const hueco = filas.length > 1 ? 1.4 : 0 // separación fina entre segmentos
  let acumulado = 0
  const segmentos = filas.map((f) => {
    const largo = (f.valor / suma) * c
    const seg = { ...f, largo: Math.max(0.5, largo - hueco), inicio: acumulado }
    acumulado += largo
    return seg
  })

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      {/* En el celular la dona cede espacio para que la leyenda no se corte. */}
      <div className="relative aspect-square shrink-0" style={{ width: `min(34vw, ${alto}px)` }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`Total gastado ${pesos(total)}`}>
          {segmentos.map((s, i) => (
            <motion.circle
              key={s.id} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth={grosor}
              strokeDashoffset={-s.inicio}
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${s.largo} ${c - s.largo}` }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 + i * 0.12 }}
            />
          ))}
          {/* Disco central, un paso más claro que la tarjeta. */}
          <circle cx="50" cy="50" r={r - grosor / 2 - 1} className={oscuro ? 'fill-[#262c55]' : 'fill-elevada'} />
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            {/* En pantallas angostas la dona mide ~120 px: el total completo no cabe en el hueco y se abrevia. */}
            <p className={clsx('num text-[15px] font-extrabold leading-tight', oscuro ? 'text-white' : 'text-tinta')}>
              <span className="max-[399px]:hidden">{pesos(total)}</span>
              <span className="min-[400px]:hidden">{pesosCorto(total).replace('$', '$ ')}</span>
            </p>
            <p className={clsx('text-[10px] leading-tight', oscuro ? 'text-white/65' : 'text-tenue')}>Total gastado</p>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {filas.map((f, i) => (
          <motion.li
            key={f.id} className="flex items-center gap-2 text-[13px] sm:gap-2.5 sm:text-[14px]"
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.2 + i * 0.07 }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.color }} />
            <span className={clsx('min-w-0 flex-1 truncate', oscuro ? 'text-white/85' : 'text-tinta')}>{f.nombre}</span>
            <span className={clsx('num shrink-0 font-bold', oscuro ? 'text-white' : 'text-tinta')}>{Math.round((f.valor / suma) * 100)} %</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Ruta SVG suave que pasa por todos los puntos: convierte la spline de Catmull-Rom en curvas Bézier cúbicas
 * (cada punto de control sale de los puntos vecinos, divididos por 6).
 */
export function curvaSuave(puntos: [number, number][]) {
  if (puntos.length < 2) return ''
  let d = `M${puntos[0][0]},${puntos[0][1]}`
  for (let i = 0; i < puntos.length - 1; i++) {
    const [x0, y0] = puntos[i - 1] ?? puntos[i]
    const [x1, y1] = puntos[i]
    const [x2, y2] = puntos[i + 1]
    const [x3, y3] = puntos[i + 2] ?? puntos[i + 1]
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`
  }
  return d
}

/** Mini curva de tendencia con relleno degradado, que se dibuja al aparecer (tarjetas de ahorro y metas). */
export function Sparkline({ valores, color = '#6338ee', alto = 44 }: { valores: number[]; color?: string; alto?: number }) {
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const pts = valores.map((v, i) => [(i / Math.max(1, valores.length - 1)) * 120, alto - 6 - ((v - min) / (max - min || 1)) * (alto - 12)] as [number, number])
  const d = curvaSuave(pts)
  const id = `sp-${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 120 ${alto}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={`${d} L120,${alto} L0,${alto} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }} />
    </svg>
  )
}

/** Tarjeta de un consejo del asistente: el ícono indica si es buena noticia, alerta o dato neutro. */
export function TarjetaInsight({ i, onVer }: { i: Insight; onVer?: () => void }) {
  const Icono = i.tono === 'positivo' ? TrendingDown : i.tono === 'alerta' ? TrendingUp : Lightbulb
  return (
    <button onClick={onVer} className="tocable flex w-full items-center gap-4 rounded-tarjeta bg-marca-50 p-4 text-left hover:bg-marca-100/70 dark:bg-marca-500/15">
      <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-full bg-superficie shadow-suave', i.tono === 'alerta' ? 'text-coral-500' : i.tono === 'positivo' ? 'text-menta-600' : 'text-marca-600')}>
        <Icono size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug text-tinta">{i.titulo}</span>
        <span className="mt-1 block text-[13px] leading-snug text-tenue">{i.mensaje}</span>
      </span>
      {onVer && <ChevronRight size={20} className="shrink-0 text-tenue" />}
    </button>
  )
}
