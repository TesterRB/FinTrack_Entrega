/**
 * Movimientos: lista del mes con búsqueda, filtro por categoría, totales y descarga en CSV.
 * También se abre como panel a pantalla completa desde la tarjeta de balance del Inicio.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, ChevronDown, Download, LayoutGrid, Search, Sparkles } from 'lucide-react'
import { useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { Boton, ChipCategoria, EASE_OUT, Hoja, Segmentado, Selector, Tarjeta, Vacio } from '../components/ui'
import { FilaMovimiento, Monto } from '../components/finanzas'
import { ICONO_CATEGORIA } from '../components/iconos'
import { CATEGORIAS, LISTA_CATEGORIAS } from '../lib/categorias'
import { capitalizar, mesActual, mesDe, nombreMes, pesos } from '../lib/formato'
import { tieneFuncion } from '../lib/planes'
import type { IdCategoria, Movimiento } from '../lib/tipos'
import { guardarArchivo } from '../lib/archivos'

/** Descarga los movimientos en CSV (separado por punto y coma, como lo abre Excel en español). */
function exportarCsv(movs: Movimiento[]) {
  const filas = [['fecha', 'descripcion', 'categoria', 'monto', 'origen', 'conciliado', 'nota']]
  movs.forEach((m) => filas.push([m.fecha, m.descripcion, CATEGORIAS[m.categoria].nombre, String(m.monto), m.origen, m.conciliado ? 'si' : 'no', m.nota ?? '']))
  const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
  // BOM para que Excel lea bien las tildes. En Android se abre la hoja de compartir.
  return guardarArchivo('fintrack-movimientos.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'Movimientos de FinTrack')
}

/** `alCerrar`: abierta como panel desde la tarjeta de balance (Inicio), con su botón para volver. */
export default function Movimientos({ alCerrar }: { alCerrar?: () => void } = {}) {
  const d = useDatos()
  const { actualizarMovimiento, avisar } = useApp()
  const [mes, setMes] = useState(mesActual())
  const [categoria, setCategoria] = useState<IdCategoria | 'todas'>('todas')
  const [buscar, setBuscar] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'gastos' | 'ingresos'>('todos')
  const [corregir, setCorregir] = useState<Movimiento | null>(null)

  const meses = useMemo(() => [...new Set(d.movimientos.map((m) => mesDe(m.fecha)).concat(mesActual()))].sort().reverse(), [d.movimientos])
  const lista = useMemo(
    () =>
      d.movimientos
        .filter((m) => (mes === 'todos' || mesDe(m.fecha) === mes) && (categoria === 'todas' || m.categoria === categoria))
        .filter((m) => tipo === 'todos' || (tipo === 'gastos' ? m.monto < 0 : m.monto > 0))
        .filter((m) => !buscar || m.descripcion.toLowerCase().includes(buscar.toLowerCase()))
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn)),
    [d.movimientos, mes, categoria, buscar, tipo],
  )
  const porConfirmar = d.movimientos.filter((m) => m.confianza !== null && m.confianza < 0.6)
  const primero = porConfirmar[0]
  const gastos = lista.filter((m) => m.monto < 0).reduce((a, m) => a - m.monto, 0)
  const ingresos = lista.filter((m) => m.monto > 0).reduce((a, m) => a + m.monto, 0)

  const grupos = useMemo(() => {
    const g = new Map<string, Movimiento[]>()
    lista.forEach((m) => g.set(m.fecha, [...(g.get(m.fecha) ?? []), m]))
    return [...g]
  }, [lista])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          {alCerrar && (
            <button onClick={alCerrar} className="tocable -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-tinta" aria-label="Cerrar movimientos">
              <ChevronDown size={26} />
            </button>
          )}
          <h1 className="truncate text-[26px] font-extrabold tracking-[-0.02em]">Movimientos</h1>
        </div>
        <button
          onClick={() => (tieneFuncion(d.perfil, 'reportes') ? exportarCsv(lista).catch(() => avisar('No se pudieron descargar tus movimientos. Inténtalo de nuevo.', 'error')) : avisar('Descargar tus movimientos es parte del plan Pro', 'error'))}
          className="tocable grid h-11 w-11 place-items-center rounded-full bg-superficie text-tinta shadow-suave" aria-label="Exportar informe"
        >
          <Download size={19} />
        </button>
      </div>

      {/* Resumen del filtro: lo que la persona quiere saber primero. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[20px] bg-superficie p-4 shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea">
          <p className="text-[13px] text-tenue">Gastaste</p>
          <p className="num text-xl font-extrabold">{pesos(gastos)}</p>
        </div>
        <div className="rounded-[20px] bg-superficie p-4 shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea">
          <p className="text-[13px] text-tenue">Recibiste</p>
          <p className="num text-xl font-extrabold text-menta-600 dark:text-menta-400">{pesos(ingresos)}</p>
        </div>
      </div>

      <label className="relative block">
        <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tenue" />
        <input
          type="search" enterKeyHint="search" placeholder="Buscar un gasto o comercio" aria-label="Buscar"
          value={buscar} onChange={(e) => setBuscar(e.target.value)}
          className="h-12 w-full rounded-full bg-superficie pl-12 pr-4 text-base shadow-suave outline-none ring-marca-500 focus:ring-2 dark:shadow-none dark:ring-1 dark:ring-linea"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Segmentado etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={[{ valor: 'todos', etiqueta: 'Todos' }, { valor: 'gastos', etiqueta: 'Gastos' }, { valor: 'ingresos', etiqueta: 'Ingresos' }]} />
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <Selector
            etiqueta="Mes" valor={mes} onCambio={setMes} className="sm:w-48"
            opciones={[...meses.map((m) => ({ valor: m, etiqueta: m === mesActual() ? 'Este mes' : capitalizar(nombreMes(m)), icono: CalendarDays })), { valor: 'todos', etiqueta: 'Todos los meses', icono: CalendarDays }]}
          />
          <Selector
            etiqueta="Categoría" valor={categoria} onCambio={setCategoria} className="sm:w-56"
            opciones={[{ valor: 'todas' as const, etiqueta: 'Todas', icono: LayoutGrid }, ...LISTA_CATEGORIAS.map((c) => ({ valor: c.id, etiqueta: c.nombre, icono: ICONO_CATEGORIA[c.id] }))]}
          />
        </div>
      </div>

      {/* La IA pregunta una cosa a la vez, en lenguaje simple. */}
      <AnimatePresence mode="popLayout">
        {primero && (
          <motion.div key={primero.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3, ease: EASE_OUT }}
            className="rounded-tarjeta bg-marca-50 p-4 dark:bg-marca-500/15">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-marca-700 dark:text-marca-200"><Sparkles size={15} /> Tu asistente tiene una duda ({porConfirmar.length})</p>
            <div className="mt-3 flex items-center gap-3">
              <ChipCategoria id={primero.categoria} texto={primero.descripcion} tam={44} />
              <p className="min-w-0 flex-1 text-[15px]">¿<b>{primero.descripcion}</b> ({pesos(Math.abs(primero.monto))}) fue <b>{CATEGORIAS[primero.categoria].nombre.toLowerCase()}</b>?</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Boton className="!h-11" onClick={() => actualizarMovimiento(primero.id, { confianza: null })}>Sí, correcto</Boton>
              <Boton variante="fantasma" className="!h-11 bg-superficie" onClick={() => setCorregir(primero)}>Cambiar</Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {grupos.length ? (
        <div className="space-y-5">
          {grupos.map(([fecha, movs]) => {
            const total = movs.reduce((s, m) => s + m.monto, 0)
            return (
              <section key={fecha}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-[15px] font-bold">{capitalizar(new Date(fecha + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>
                  <Monto valor={total} className="text-[13px] !font-semibold text-tenue" />
                </div>
                <Tarjeta className="!px-2 !py-1.5">{movs.map((m, i) => <FilaMovimiento key={m.id} m={m} indice={i} />)}</Tarjeta>
              </section>
            )
          })}
        </div>
      ) : (
        <Vacio icono={Search} titulo="No encontramos movimientos" texto="Prueba con otro mes, otra categoría o una palabra distinta." />
      )}

      <Hoja abierto={!!corregir} onCerrar={() => setCorregir(null)} titulo="¿Qué categoría es?">
        {corregir && (
          <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
            {LISTA_CATEGORIAS.map((c) => {
              return (
                <button key={c.id} onClick={async () => { await actualizarMovimiento(corregir.id, { categoria: c.id }); setCorregir(null); avisar('Gracias, tu asistente aprendió algo nuevo') }}
                  className={clsx('tocable flex flex-col items-center gap-2 rounded-2xl p-3', c.id === corregir.categoria ? 'bg-marca-50 ring-2 ring-marca-500' : 'bg-elevada')}>
                  <ChipCategoria id={c.id} tam={44} seleccionado={c.id === corregir.categoria} />
                  <span className="text-center text-xs font-semibold leading-tight">{c.nombre}</span>
                </button>
              )
            })}
          </div>
        )}
      </Hoja>
    </div>
  )
}
