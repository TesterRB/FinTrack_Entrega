/** Marcador del FinScore y racha: es el destino visual de los puntos que vuelan (`lib/estimulos.ts`). */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Flame } from 'lucide-react'
import { movimientoReducido } from '../lib/estimulos'

/** Número que cuenta hasta su nuevo valor en vez de saltar (el cambio se lee como progreso). */
export function useConteo(valor: number, duracion = 650) {
  const [mostrado, setMostrado] = useState(valor)
  const desde = useRef(valor)
  useEffect(() => {
    if (movimientoReducido() || desde.current === valor) {
      desde.current = valor
      setMostrado(valor)
      return
    }
    const inicio = performance.now()
    const a = desde.current
    let raf = 0
    const paso = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracion)
      // Curva ease-out cúbica: arranca rápido y frena al llegar.
      const e = 1 - Math.pow(1 - p, 3)
      setMostrado(Math.round(a + (valor - a) * e))
      if (p < 1) raf = requestAnimationFrame(paso)
      else desde.current = valor
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, duracion])
  return mostrado
}

/**
 * Marcador persistente del FinScore en la barra superior: el destino de los puntos que vuelan.
 * El arco muestra el avance hacia el siguiente umbral (85 = cupón, 100 = mes gratis).
 */
export function Marcador({ puntaje, racha }: { puntaje: number; racha: number }) {
  const n = useConteo(puntaje)
  // Anillo de progreso: el trazo del círculo se "recorta" con strokeDashoffset según el puntaje.
  const r = 13
  const c = 2 * Math.PI * r
  const meta = puntaje >= 85 ? 100 : 85
  return (
    <Link
      to="/finscore"
      data-destino-puntos
      aria-label={`FinScore ${puntaje} de 100, racha de ${racha} días`}
      className="group flex items-center gap-2 rounded-full border border-linea bg-superficie py-1 pl-1 pr-3 transition-[border-color] duration-150 hover:border-marca-300"
    >
      <span className="relative grid h-8 w-8 place-items-center">
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
          <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3.5" className="stroke-elevada" />
          <circle
            cx="16" cy="16" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
            stroke={puntaje >= 85 ? '#247b50' : '#6338ee'}
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, n / 100))}
          />
        </svg>
        <span className="num relative text-[11px] font-extrabold text-tinta">{n}</span>
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-xs text-tenue">FinScore</span>
        <span className="block text-xs font-bold text-tinta">{puntaje >= 100 ? 'Mes perfecto' : `${meta - puntaje} para ${meta === 85 ? 'tu cupón' : 'el mes gratis'}`}</span>
      </span>
      <span className={clsx('flex items-center gap-0.5 text-xs font-bold', racha > 0 ? 'text-amber-600' : 'text-slate-400')}>
        <Flame size={15} className={racha > 0 ? 'fill-amber-400 text-amber-500' : ''} />
        <span className="num">{racha}</span>
      </span>
    </Link>
  )
}
