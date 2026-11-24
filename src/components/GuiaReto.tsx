/**
 * Guías de los retos semanales: al tocar un reto, la app navega a la pantalla donde se cumple y
 * muestra ahí una hoja con los pasos.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, PenLine, StickyNote, Store, Target, type LucideIcon } from 'lucide-react'
import { Boton, Hoja } from './ui'
import { registrarEvento } from '../lib/telemetria'

/** Adónde lleva cada reto semanal y qué hay que hacer al llegar. */
export const GUIAS: Record<string, { destino: string; icono: LucideIcon; titulo: string; pasos: string[] }> = {
  registro5: {
    destino: '/',
    icono: PenLine,
    titulo: 'Semana constante',
    pasos: [
      'Toca el botón + de la barra inferior.',
      'Escribe el monto y en qué fue, y guarda. Toma tres segundos.',
      'Cada día distinto en que registres algo cuenta: con 5 días esta semana completas el reto. Lo importado de extractos no cuenta.',
    ],
  },
  insights2: {
    destino: '/insights',
    icono: BarChart3,
    titulo: 'Mira tus números',
    pasos: [
      '¡Ya está! Abrir el Asistente cuenta como la revisión de hoy.',
      'Aprovecha para leer tus consejos y los pagos que se repiten.',
      'Vuelve otro día de esta semana y completas el reto.',
    ],
  },
  aliado: {
    destino: '/promociones',
    icono: Store,
    titulo: 'Compra aliada',
    pasos: [
      'Elige la promoción de un comercio aliado y toca Participar.',
      'Toma una foto clara de la factura de tu compra.',
      'Al enviarla, el reto queda cumplido.',
    ],
  },
  meta: {
    destino: '/presupuestos?seccion=metas',
    icono: Target,
    titulo: 'Paso a paso',
    pasos: [
      'Estás en tus metas de ahorro.',
      'Toca Aportar en una de ellas y escribe cuánto guardaste.',
      'Si aún no tienes metas, crea una con Nueva meta y luego aporta.',
    ],
  },
  notas3: {
    destino: '/movimientos',
    icono: StickyNote,
    titulo: 'Con contexto',
    pasos: [
      'Toca un gasto que hayas registrado esta semana.',
      'Escribe en el campo Nota con quién o para qué fue, y guarda.',
      'Con tres gastos con nota completas el reto. Al registrar uno nuevo también puedes agregarla.',
    ],
  },
}

/** Clave de localStorage con los ids de las guías que el usuario pidió no volver a ver. */
const CLAVE = 'fintrack-guias-ocultas'
const ocultas = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Para navegar hacia un reto: la pantalla de destino muestra su guía al llegar. */
export const estadoReto = (id: string) => ({ guiaReto: id })

/**
 * Guía del reto que llevó a esta pantalla: aparece al llegar, explica qué hacer aquí y se cierra con
 * "Entendido". Con "No volver a mostrar" esa guía ya no aparece más (se recuerda en el dispositivo).
 */
export function GuiaReto() {
  const { state, pathname, search } = useLocation()
  const navegar = useNavigate()
  const pedido = (state as { guiaReto?: string } | null)?.guiaReto
  const [abierta, setAbierta] = useState<string | null>(null)
  const [noMostrar, setNoMostrar] = useState(false)

  useEffect(() => {
    if (!pedido || !GUIAS[pedido] || ocultas().includes(pedido)) return
    // Un instante después de llegar: primero se ve la pantalla, luego la explicación.
    const t = setTimeout(() => {
      setNoMostrar(false)
      setAbierta(pedido)
    }, 420)
    return () => clearTimeout(t)
  }, [pedido, pathname])

  const cerrar = () => {
    if (!abierta) return
    if (noMostrar) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify([...new Set([...ocultas(), abierta])]))
      } catch {
        /* sin almacenamiento */
      }
    }
    registrarEvento('accion', 'guia_reto_cerrada', { reto: abierta, no_mostrar: noMostrar })
    setAbierta(null)
    // Se limpia el estado para que la guía no vuelva al regresar a esta pantalla.
    navegar(pathname + search, { replace: true, state: null })
  }

  const guia = abierta ? GUIAS[abierta] : null
  return (
    <Hoja abierto={!!guia} onCerrar={cerrar} titulo={guia ? `Reto: ${guia.titulo}` : 'Reto'}>
      {guia && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-marca-50 p-3.5 dark:bg-marca-500/15">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-superficie text-marca-600 dark:text-marca-200"><guia.icono size={21} /></span>
            <p className="text-[15px] font-semibold leading-snug text-tinta">Así lo cumples desde esta pantalla · <span className="text-marca-700 dark:text-marca-200">+2,5 pts</span></p>
          </div>
          <ol className="space-y-3">
            {guia.pasos.map((p, i) => (
              <li key={p} className="flex gap-3 text-[15px] leading-snug text-tinta">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marca-600 text-[13px] font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
          <label className="flex items-center gap-3 rounded-2xl bg-elevada px-4 py-3 text-[15px]">
            <input type="checkbox" checked={noMostrar} onChange={(e) => setNoMostrar(e.target.checked)} className="h-5 w-5 rounded accent-marca-600" />
            No volver a mostrar esta guía
          </label>
          <Boton className="w-full" onClick={cerrar}>Entendido</Boton>
        </div>
      )}
    </Hoja>
  )
}
