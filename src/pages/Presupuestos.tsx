/**
 * Presupuestos y metas: límites de gasto del mes por categoría y metas de ahorro con aportes.
 * Abrir la pantalla cuenta como revisión semanal de presupuestos para el FinScore.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { Copy, Pencil, PiggyBank, Plus, Target, Trash2 } from 'lucide-react'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { AnilloScore, Boton, Campo, ChipCategoria, EASE_OUT, Modal, Progreso, Segmentado, Selector, Tarjeta, Titulo, Vacio, claseInput } from '../components/ui'
import { ICONO_CATEGORIA } from '../components/iconos'
import { CATEGORIAS, CATEGORIAS_GASTO } from '../lib/categorias'
import { diasDelMes, diasEntre, hoyISO, mesActual, mesAnterior, nombreMes, pesos, uid } from '../lib/formato'
import type { IdCategoria, Meta, Presupuesto } from '../lib/tipos'
import { celebrar } from '../lib/estimulos'
import { ICONOS_META, IconoMeta, idIcono, type IdIconoMeta } from '../components/IconoMeta'


export default function Presupuestos() {
  const d = useDatos()
  const a = useAnalitica()
  const { guardarPresupuesto, eliminarPresupuesto, guardarMeta, eliminarMeta, aportarMeta, registrarActividad, avisar } = useApp()
  const mes = mesActual()
  const [editP, setEditP] = useState<Presupuesto | null>(null)
  const [editM, setEditM] = useState<Meta | null>(null)
  const [aporte, setAporte] = useState<{ meta: Meta; monto: string } | null>(null)
  const [params] = useSearchParams()
  const [pestana, setPestana] = useState<'presupuestos' | 'metas'>(params.get('seccion') === 'metas' ? 'metas' : 'presupuestos')

  // Abrir la pantalla cuenta como revisión de presupuestos (una vez por día; el FinScore cuenta semanas).
  useEffect(() => {
    if (!d.actividades.some((x) => x.tipo === 'revision_presupuesto' && x.fecha.slice(0, 10) === hoyISO())) registrarActividad('revision_presupuesto')
    // Solo al abrir la pantalla: si dependiera de `d`, se volvería a evaluar con cada cambio de datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pptos = d.presupuestos.filter((p) => p.mes === mes)
  const gastado = new Map(a.categorias)
  const anteriores = d.presupuestos.filter((p) => p.mes === mesAnterior(mes))
  const totalLimite = pptos.reduce((s, p) => s + p.limite, 0)
  const totalGastado = pptos.reduce((s, p) => s + (gastado.get(p.categoria) ?? 0), 0)

  /** Copia al mes actual los presupuestos del mes anterior que todavía no existen. */
  async function copiarAnterior() {
    await Promise.all(anteriores.filter((p) => !pptos.some((x) => x.categoria === p.categoria)).map((p) => guardarPresupuesto({ ...p, id: uid(), mes })))
    avisar('Presupuestos copiados del mes anterior')
  }

  const disponible = Math.max(0, totalLimite - totalGastado)
  const diasRestantes = Math.max(1, diasDelMes(mes) - Number(hoyISO().slice(8, 10)) + 1)

  return (
    <div className="space-y-6">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Tu plan</h1>
      <Segmentado etiqueta="Sección" valor={pestana} onCambio={setPestana} opciones={[{ valor: 'presupuestos', etiqueta: 'Presupuestos' }, { valor: 'metas', etiqueta: 'Metas de ahorro' }]} />

      {pestana === 'presupuestos' ? (
        <motion.div key="p" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="space-y-6">
          {pptos.length > 0 && (
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#8f7cfb] via-[#6d4ff0] to-[#5b47e0] p-6 text-white shadow-[0_18px_40px_-18px_rgba(99,56,238,.7)]">
              <div className="flex items-center gap-5">
                <AnilloScore valor={totalLimite ? Math.min(100, (totalGastado / totalLimite) * 100) : 0} tam={96} grosor={10} color="#ffffff">
                  <div><p className="num text-2xl font-extrabold leading-none">{totalLimite ? Math.round((totalGastado / totalLimite) * 100) : 0} %</p><p className="text-[11px] text-white/75">usado</p></div>
                </AnilloScore>
                <div className="min-w-0">
                  <p className="text-[15px] text-white/80">Te quedan en {nombreMes(mes, false)}</p>
                  <p className="num text-[26px] font-extrabold leading-tight sm:text-[30px]">{pesos(disponible)}</p>
                  <p className="mt-1 text-sm text-white/90">Puedes gastar <b className="num">{pesos(disponible / diasRestantes)}</b> por día</p>
                </div>
              </div>
            </div>
          )}

          <section>
            <Titulo accion={anteriores.length > 0 && pptos.length < anteriores.length ? <button onClick={copiarAnterior} className="flex items-center gap-1 text-sm font-semibold text-marca-600 dark:text-marca-300"><Copy size={15} /> Copiar el mes pasado</button> : undefined}>
              Por categoría
            </Titulo>
            {pptos.length ? (
              <Tarjeta className="!p-2">
                {pptos.sort((x, y) => y.limite - x.limite).map((p, i) => {
                  const g = gastado.get(p.categoria) ?? 0
                  const proy = a.pronostico.porCategoria.find((c) => c.categoria === p.categoria)
                  const ratio = g / p.limite
                  const riesgo = ratio <= 1 && (proy?.probSuperar ?? 0) > 0.6
                  return (
                    <motion.button
                      key={p.id} onClick={() => setEditP(p)}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE_OUT, delay: i * 0.05 }}
                      className="tocable flex w-full items-center gap-3.5 rounded-2xl p-3 text-left hover:bg-elevada"
                    >
                      <ChipCategoria id={p.categoria} tam={46} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{CATEGORIAS[p.categoria].nombre}</span>
                        <span className="mt-2 block"><Progreso valor={ratio} alto={8} color={ratio > 1 ? '#f0526b' : riesgo ? '#f7a948' : '#6338ee'} /></span>
                        <span className="mt-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="num text-tenue"><b className="text-tinta">{pesos(g)}</b> de {pesos(p.limite)}</span>
                          <span className={clsx('shrink-0 font-semibold', ratio > 1 ? 'text-coral-500' : riesgo ? 'text-amber-600' : 'text-menta-600 dark:text-menta-400')}>
                            {ratio > 1 ? `Te pasaste ${pesos(g - p.limite)}` : riesgo ? 'Vas muy rápido' : `Quedan ${pesos(p.limite - g)}`}
                          </span>
                        </span>
                      </span>
                    </motion.button>
                  )
                })}
              </Tarjeta>
            ) : (
              <Vacio icono={PiggyBank} titulo="Aún no tienes presupuestos" texto="Ponle un tope a lo que más gastas. Con 3 presupuestos ganas 5 puntos de FinScore." />
            )}
            <Boton className="mt-4 w-full" onClick={() => setEditP({ id: uid(), categoria: CATEGORIAS_GASTO.find((c) => !pptos.some((p) => p.categoria === c.id))?.id ?? 'comida', limite: 0, mes })}>
              <Plus size={18} /> Nuevo presupuesto
            </Boton>
          </section>
        </motion.div>
      ) : (
        <motion.div key="m" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="space-y-4">
          {d.metas.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {d.metas.map((m, i) => {
                const ratio = m.objetivo ? m.ahorrado / m.objetivo : 0
                const dias = m.fechaLimite ? diasEntre(hoyISO(), m.fechaLimite) : null
                const mensual = dias && dias > 0 ? (m.objetivo - m.ahorrado) / Math.max(1, dias / 30) : null
                return (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: i * 0.07 }}>
                    <Tarjeta className="flex h-full flex-col">
                      <div className="flex items-start gap-4">
                        <AnilloScore valor={ratio * 100} tam={76} grosor={8} color="#22c39a">
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-menta-100 text-menta-600 dark:bg-menta-500/15"><IconoMeta icono={m.icono} size={22} /></span>
                        </AnilloScore>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-base font-bold leading-snug">{m.nombre}</p>
                            <button onClick={() => setEditM(m)} className="tocable -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-tenue hover:bg-elevada" aria-label={`Editar ${m.nombre}`}><Pencil size={16} /></button>
                          </div>
                          <p className="num mt-1 text-[15px]"><b>{pesos(m.ahorrado)}</b> <span className="text-tenue">de {pesos(m.objetivo)}</span></p>
                          <p className="mt-1 text-[13px] font-semibold text-menta-600 dark:text-menta-400">{Math.round(ratio * 100)} % completado</p>
                        </div>
                      </div>
                      <p className="mt-4 flex-1 text-[13px] text-tenue">
                        {ratio >= 1 ? '¡Lo lograste! Esta meta está cumplida.' : mensual ? `Ahorrando ${pesos(mensual)} al mes llegas a tiempo.` : 'Cada aporte suma puntos a tu FinScore.'}
                      </p>
                      <Boton className="mt-4 w-full !h-11" onClick={() => setAporte({ meta: m, monto: '' })}><Plus size={17} /> Aportar</Boton>
                    </Tarjeta>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <Vacio icono={Target} titulo="Sin metas todavía" texto="¿Un viaje, un fondo de emergencia, un portátil? Ponle nombre a eso que quieres lograr." />
          )}
          <Boton variante="secundario" className="w-full" onClick={() => setEditM({ id: uid(), nombre: '', objetivo: 0, ahorrado: 0, fechaLimite: null, icono: 'meta' })}><Plus size={18} /> Nueva meta</Boton>
        </motion.div>
      )}

      <Modal abierto={!!editP} onCerrar={() => setEditP(null)} titulo="Presupuesto">
        {editP && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              await guardarPresupuesto(editP)
              setEditP(null)
              avisar('Presupuesto guardado')
            }}
          >
            <Campo etiqueta="Categoría">
              <Selector
                etiqueta="Categoría" valor={editP.categoria} onCambio={(v: IdCategoria) => setEditP({ ...editP, categoria: v })}
                opciones={CATEGORIAS_GASTO.filter((c) => c.id === editP.categoria || !pptos.some((p) => p.categoria === c.id && p.id !== editP.id)).map((c) => ({ valor: c.id, etiqueta: c.nombre, icono: ICONO_CATEGORIA[c.id] }))}
              />
            </Campo>
            <Campo etiqueta="Límite mensual" ayuda={gastado.get(editP.categoria) ? `Llevas ${pesos(gastado.get(editP.categoria)!)} este mes` : undefined}>
              <input required inputMode="numeric" className={claseInput} value={editP.limite ? editP.limite.toLocaleString('es-CO') : ''} onChange={(e) => setEditP({ ...editP, limite: Number(e.target.value.replace(/\D/g, '')) })} />
            </Campo>
            <div className="flex gap-2">
              {pptos.some((p) => p.id === editP.id) && <Boton type="button" variante="peligro" onClick={async () => { await eliminarPresupuesto(editP.id); setEditP(null) }} aria-label="Eliminar"><Trash2 size={16} /></Boton>}
              <Boton type="submit" className="flex-1" disabled={!editP.limite}>Guardar</Boton>
            </div>
          </form>
        )}
      </Modal>

      <Modal abierto={!!editM} onCerrar={() => setEditM(null)} titulo="Meta de ahorro">
        {editM && (
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await guardarMeta(editM); setEditM(null); avisar('Meta guardada') }}>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ICONOS_META) as IdIconoMeta[]).map((i) => <button type="button" key={i} aria-label={ICONOS_META[i].n} aria-pressed={idIcono(editM.icono) === i} onClick={() => setEditM({ ...editM, icono: i })} className={`grid h-10 w-10 place-items-center rounded-[10px] ${idIcono(editM.icono) === i ? 'bg-marca-100 text-marca-800 outline outline-2 outline-marca-500' : 'bg-elevada text-tenue'}`}><IconoMeta icono={i} size={18} /></button>)}
            </div>
            <Campo etiqueta="Nombre"><input required className={claseInput} value={editM.nombre} onChange={(e) => setEditM({ ...editM, nombre: e.target.value })} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Objetivo"><input required inputMode="numeric" className={claseInput} value={editM.objetivo ? editM.objetivo.toLocaleString('es-CO') : ''} onChange={(e) => setEditM({ ...editM, objetivo: Number(e.target.value.replace(/\D/g, '')) })} /></Campo>
              <Campo etiqueta="Fecha límite (opcional)"><input type="date" className={claseInput} value={editM.fechaLimite ?? ''} onChange={(e) => setEditM({ ...editM, fechaLimite: e.target.value || null })} /></Campo>
            </div>
            <div className="flex gap-2">
              {d.metas.some((m) => m.id === editM.id) && <Boton type="button" variante="peligro" onClick={async () => { await eliminarMeta(editM.id); setEditM(null) }} aria-label="Eliminar"><Trash2 size={16} /></Boton>}
              <Boton type="submit" className="flex-1" disabled={!editM.nombre || !editM.objetivo}>Guardar</Boton>
            </div>
          </form>
        )}
      </Modal>

      <Modal abierto={!!aporte} onCerrar={() => setAporte(null)} titulo={`Aportar a ${aporte?.meta.nombre ?? ''}`}>
        {aporte && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const m = aporte.meta
              const monto = Number(aporte.monto.replace(/\D/g, ''))
              await aportarMeta(m.id, monto)
              setAporte(null)
              // Hitos de la meta (25/50/75/100 %): el progreso hacia algo propio merece su propio momento.
              const hito = [1, 0.75, 0.5, 0.25].find((h) => m.ahorrado / m.objetivo < h && (m.ahorrado + monto) / m.objetivo >= h)
              if (hito) {
                celebrar(hito === 1 ? 'celebracion' : 'logro')
                avisar(hito === 1 ? `¡Cumpliste tu meta «${m.nombre}»!` : `Vas en el ${hito * 100} % de «${m.nombre}»`, 'premio')
              } else avisar(`Aporte a «${m.nombre}» registrado`)
            }}
          >
            <Campo etiqueta="Monto"><input autoFocus required inputMode="numeric" className={claseInput} value={aporte.monto ? Number(aporte.monto.replace(/\D/g, '')).toLocaleString('es-CO') : ''} onChange={(e) => setAporte({ ...aporte, monto: e.target.value })} /></Campo>
            <div className="flex flex-wrap gap-2">
              {[20_000, 50_000, 100_000, 200_000].map((v) => <button type="button" key={v} className="rounded-[10px] bg-elevada px-3 py-1.5 text-xs font-semibold" onClick={() => setAporte({ ...aporte, monto: String(v) })}>{pesos(v)}</button>)}
            </div>
            <Boton type="submit" className="w-full" disabled={!Number(aporte.monto.replace(/\D/g, ''))}>Aportar</Boton>
          </form>
        )}
      </Modal>
    </div>
  )
}
