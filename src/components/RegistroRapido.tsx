import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { Banknote, CalendarDays, Check, CreditCard, Landmark, Smartphone, Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../store/app'
import { useUI } from '../store/ui'
import { Boton, ChipCategoria, Hoja, Segmentado, claseInput } from './ui'
import { CATEGORIAS, LISTA_CATEGORIAS } from '../lib/categorias'
import { hoyISO, sumarDias } from '../lib/formato'
import { celebrar } from '../lib/estimulos'
import type { IdCategoria } from '../lib/tipos'

const ICONO_CUENTA: Record<string, typeof Banknote> = { banco: Landmark, tarjeta: CreditCard, billetera: Smartphone, efectivo: Banknote }

/**
 * Registro rápido en una hoja inferior: el monto grande primero, luego qué fue. La IA sugiere la categoría
 * mientras escribes y la marca en la cuadrícula; tocar otra la cambia (y el modelo aprende).
 */
export function RegistroRapido() {
  const { abierto, tipo: tipoInicial, editar } = useUI((s) => s.registro)
  const cerrar = useUI((s) => s.cerrarRegistro)
  const { modelo, agregarMovimientos, actualizarMovimiento, eliminarMovimiento, avisar, datos } = useApp()
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [otroDia, setOtroDia] = useState(false)
  const [cuenta, setCuenta] = useState('efectivo')
  const [categoriaManual, setCategoriaManual] = useState<IdCategoria | null>(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const montoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setTipo(editar ? (editar.monto > 0 ? 'ingreso' : 'gasto') : tipoInicial)
    setDescripcion(editar?.descripcion ?? '')
    setMonto(editar ? String(Math.abs(editar.monto)) : '')
    const f = editar?.fecha ?? hoyISO()
    setFecha(f)
    setOtroDia(f !== hoyISO() && f !== sumarDias(hoyISO(), -1))
    setCuenta(editar?.cuentaId ?? 'efectivo')
    setCategoriaManual(editar?.categoria ?? null)
    setNota(editar?.nota ?? '')
    setTimeout(() => montoRef.current?.focus(), 350)
  }, [abierto, editar, tipoInicial])

  const valor = Number(monto.replace(/\D/g, '')) || 0
  const firmado = tipo === 'gasto' ? -valor : valor
  const sugerida = useMemo(() => (descripcion.trim().length > 1 ? modelo.predecir(descripcion, tipo === 'gasto' ? -1 : 1)[0] : null), [descripcion, modelo, tipo])
  const categoria: IdCategoria = categoriaManual ?? sugerida?.categoria ?? (tipo === 'ingreso' ? 'ingresos' : 'otros')
  const categorias = tipo === 'ingreso' ? LISTA_CATEGORIAS.filter((c) => ['ingresos', 'transferencias', 'otros'].includes(c.id)) : LISTA_CATEGORIAS.filter((c) => c.esGasto)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!valor || !descripcion.trim()) return
    setGuardando(true)
    try {
      const base = { descripcion: descripcion.trim(), monto: firmado, fecha, cuentaId: cuenta }
      if (editar) await actualizarMovimiento(editar.id, { ...base, nota: nota.trim(), ...(editar.categoria !== categoria ? { categoria } : {}) })
      else await agregarMovimientos([{ ...base, nota: nota.trim() || undefined, categoria, confianza: categoriaManual !== null ? null : (sugerida?.probabilidad ?? null) }])
      if (editar) avisar('Cambios guardados')
      else {
        celebrar('chispa')
        avisar(`Listo: ${CATEGORIAS[categoria].nombre.toLowerCase()}`)
      }
      cerrar()
    } finally {
      setGuardando(false)
    }
  }

  const fechas = [
    { v: hoyISO(), t: 'Hoy' },
    { v: sumarDias(hoyISO(), -1), t: 'Ayer' },
  ]

  return (
    <Hoja abierto={abierto} onCerrar={cerrar} titulo={editar ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <form onSubmit={guardar} className="space-y-6">
        <Segmentado
          etiqueta="Tipo de movimiento" valor={tipo}
          opciones={[{ valor: 'gasto', etiqueta: 'Gasto' }, { valor: 'ingreso', etiqueta: 'Ingreso' }]}
          onCambio={(t) => { setTipo(t); setCategoriaManual(null) }}
        />

        <label className="block text-center">
          <span className="sr-only">Monto</span>
          <span className={clsx('flex items-baseline justify-center gap-1 text-[44px] font-extrabold tracking-[-0.02em]', tipo === 'ingreso' ? 'text-menta-600 dark:text-menta-400' : 'text-tinta')}>
            <span className="text-3xl text-tenue">$</span>
            <input
              ref={montoRef} inputMode="numeric" enterKeyHint="next" placeholder="0" aria-label="Monto"
              value={valor ? valor.toLocaleString('es-CO') : ''} onChange={(e) => setMonto(e.target.value)}
              className="num w-full max-w-[260px] bg-transparent text-center text-[44px] font-extrabold outline-none placeholder:text-linea"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold">¿En qué fue?</span>
          <input className={claseInput} placeholder={tipo === 'gasto' ? 'Almuerzo, Uber, mercado en el D1…' : 'Nómina, venta, regalo…'} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} enterKeyHint="done" />
        </label>

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            Categoría
            {sugerida && categoriaManual === null && <span className="flex items-center gap-1 rounded-full bg-marca-50 px-2 py-0.5 text-xs font-semibold text-marca-700 dark:bg-marca-500/20 dark:text-marca-200"><Sparkles size={12} /> sugerida por tu asistente</span>}
          </legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {categorias.map((c) => {
              const sel = c.id === categoria
              return (
                <button
                  key={c.id} type="button" onClick={() => setCategoriaManual(c.id)} aria-pressed={sel}
                  className={clsx('tocable relative flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5', sel ? 'bg-marca-50 ring-2 ring-marca-500 dark:bg-marca-500/15' : 'bg-elevada')}
                >
                  <ChipCategoria id={c.id} tam={40} seleccionado={sel} />
                  <span className="line-clamp-1 text-[11px] font-semibold leading-tight">{c.nombre.split(' ')[0]}</span>
                  {sel && (
                    // Aparece en su lugar (sin animación compartida: al editar, la selección cambia justo al abrir la hoja).
                    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.3, bounce: 0.3 }} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-marca-600 text-white">
                      <Check size={12} strokeWidth={3} />
                    </motion.span>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Con qué pagaste?</legend>
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
            {datos?.cuentas.map((c) => {
              const I = ICONO_CUENTA[c.id] ?? Banknote
              return (
                <button key={c.id} type="button" onClick={() => setCuenta(c.id)} aria-pressed={cuenta === c.id}
                  className={clsx('tocable flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold', cuenta === c.id ? 'bg-marca-600 text-white' : 'bg-elevada text-tinta')}>
                  <I size={17} /> {c.nombre}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Cuándo?</legend>
          <div className="flex flex-wrap gap-2">
            {fechas.map((f) => (
              <button key={f.t} type="button" onClick={() => { setFecha(f.v); setOtroDia(false) }} aria-pressed={!otroDia && fecha === f.v}
                className={clsx('tocable h-11 rounded-full px-5 text-sm font-semibold', !otroDia && fecha === f.v ? 'bg-marca-600 text-white' : 'bg-elevada')}>
                {f.t}
              </button>
            ))}
            <button type="button" onClick={() => setOtroDia(true)} aria-pressed={otroDia}
              className={clsx('tocable flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold', otroDia ? 'bg-marca-600 text-white' : 'bg-elevada')}>
              <CalendarDays size={16} /> Otro día
            </button>
          </div>
          {otroDia && <input type="date" aria-label="Fecha" className={clsx(claseInput, 'mt-3')} value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />}
        </fieldset>

        <label className="block">
          <span className="mb-2 flex items-baseline justify-between text-sm font-semibold">Nota <span className="text-[13px] font-normal text-tenue">Opcional</span></span>
          <input className={claseInput} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={140} placeholder="Con quién, para qué…" enterKeyHint="done" />
        </label>

        <div className="flex gap-3 pt-1">
          {editar && (
            <Boton type="button" variante="peligro" className="!px-4" aria-label="Eliminar" onClick={async () => { await eliminarMovimiento(editar.id); avisar('Movimiento eliminado'); cerrar() }}>
              <Trash2 size={18} />
            </Boton>
          )}
          <Boton type="submit" className="flex-1" cargando={guardando} disabled={!valor || !descripcion.trim()}>
            {editar ? 'Guardar cambios' : tipo === 'gasto' ? 'Registrar gasto' : 'Registrar ingreso'}
          </Boton>
        </div>
      </form>
    </Hoja>
  )
}
