/**
 * Asistente (ruta /insights): consejos con evidencia, tendencia de gasto, pagos que se repiten,
 * movimientos para revisar y cómo podría cerrar el mes. Abrirlo cuenta como revisión para el FinScore.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { AlertTriangle, CalendarDays, ChevronRight, Goal, PiggyBank, Repeat, Sparkles, TrendingUp } from 'lucide-react'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { Boton, EASE_OUT, Hoja, Selector, SoloPremium, Tarjeta, Titulo, Vacio, ChipCategoria, claseEnlace, entrada } from '../components/ui'
import { DonaCategorias, FilaMovimiento, Monto, Sparkline, TarjetaInsight } from '../components/finanzas'
import { capitalizar, hoyISO, mesActual, mesAnterior, mesDe, nombreMes, pesos, pesosCorto } from '../lib/formato'
import { costoMensual } from '../ml/recurrentes'
import type { Insight } from '../ml/insights'
import { tieneFuncion } from '../lib/planes'

/** Ilustración de la recomendación: una matera con una planta que crece (ahorro que crece). */
function Planta() {
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="matera" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c9cff" /><stop offset="1" stopColor="#4f6ef0" /></linearGradient>
        <linearGradient id="hoja" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8be3c8" /><stop offset="1" stopColor="#22c39a" /></linearGradient>
      </defs>
      <motion.path d="M18 88 L96 34" stroke="#b6aeff" strokeWidth="3" strokeLinecap="round" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.4, ease: EASE_OUT }} />
      <motion.path d="M84 32 L97 33 L94 46" stroke="#b6aeff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} />
      <motion.g initial={{ scaleY: 0.4, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.9, bounce: 0.3, delay: 0.3 }} style={{ transformOrigin: '60px 80px' }}>
        <path d="M60 80 V52" stroke="#22c39a" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M60 62 C46 62 38 52 38 40 C52 40 60 48 60 62Z" fill="url(#hoja)" />
        <path d="M60 56 C74 56 84 46 84 32 C68 32 60 42 60 56Z" fill="url(#hoja)" />
      </motion.g>
      <path d="M40 78 H80 L75 108 Q74 112 70 112 H50 Q46 112 45 108Z" fill="url(#matera)" />
      <rect x="37" y="74" width="46" height="9" rx="4.5" fill="#94adff" />
    </svg>
  )
}

export default function Insights() {
  const d = useDatos()
  const nav = useNavigate()
  const registrarActividad = useApp((s) => s.registrarActividad)
  const [mes, setMes] = useState(mesActual())
  const a = useAnalitica(mes)
  const [evidencia, setEvidencia] = useState<Insight | null>(null)
  const [todosRecurrentes, setTodosRecurrentes] = useState(false)

  // Revisar el asistente suma al FinScore (una vez por día).
  useEffect(() => {
    if (!d.actividades.some((x) => x.tipo === 'revision_insights' && x.fecha.slice(0, 10) === hoyISO())) registrarActividad('revision_insights')
    // Solo al abrir la pantalla: si dependiera de `d`, se volvería a evaluar con cada cambio de datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Gasto por semana del mes (días 1-7, 8-14…); la quinta semana solo aparece si tiene gasto.
  const semanas = useMemo(() => {
    const s = [0, 0, 0, 0, 0]
    a.delMes.filter((m) => m.monto < 0 && m.categoria !== 'transferencias').forEach((m) => (s[Math.min(4, Math.floor((Number(m.fecha.slice(8, 10)) - 1) / 7))] += -m.monto))
    return s.map((v, i) => ({ etiqueta: `Sem ${i + 1}`, valor: v })).filter((x, i) => i < 4 || x.valor > 0)
  }, [a.delMes])
  const maxSemana = Math.max(1, ...semanas.map((s) => s.valor))
  const escala = Math.ceil(maxSemana / 100_000) * 100_000 || 100_000

  // Ahorro de cada mes (ingresos − gastos) y crecimiento de las metas, para las dos tarjetas pequeñas.
  const { ahorros, metas } = useMemo(() => {
    const meses = [5, 4, 3, 2, 1, 0].map((i) => mesAnterior(mes, i))
    const ahorros = meses.map((m) => d.movimientos.filter((x) => mesDe(x.fecha) === m && x.categoria !== 'transferencias').reduce((s, x) => s + x.monto, 0))
    const totalMetas = d.metas.reduce((s, m) => s + m.ahorrado, 0)
    const aportesTras = (m: string) => d.aportes.filter((x) => mesDe(x.fecha) > m).reduce((s, x) => s + x.monto, 0)
    const metas = meses.map((m) => totalMetas - aportesTras(m))
    return { ahorros, metas }
  }, [d.movimientos, d.metas, d.aportes, mes])
  const ahorroMes = ahorros[5]
  const metasCambio = metas[4] ? ((metas[5] - metas[4]) / metas[4]) * 100 : 0

  const meses = [...new Set(d.movimientos.map((m) => mesDe(m.fecha)).concat(mesActual()))].sort().reverse()
  const recomendacion = a.insights.find((i) => i.tipo === 'ahorro')
  const visibles = a.insights.filter((i) => i.id !== recomendacion?.id && (!i.avanzado || tieneFuncion(d.perfil, 'insights_avanzados')))
  const ocultos = a.insights.filter((i) => i.avanzado && !tieneFuncion(d.perfil, 'insights_avanzados')).length
  const movsEvidencia = evidencia ? d.movimientos.filter((m) => evidencia.evidencia.includes(m.id)).sort((x, y) => y.fecha.localeCompare(x.fecha)) : []
  const inusuales = a.anomalias.slice(0, 4).map((x) => ({ x, m: d.movimientos.find((y) => y.id === x.movimientoId) })).filter((z) => z.m)

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-[26px] font-extrabold tracking-[-0.02em]">Asistente</h1>
        <Selector
          compacto etiqueta="Mes" valor={mes} onCambio={setMes} className="w-40 shrink-0"
          opciones={meses.map((m) => ({ valor: m, etiqueta: m === mesActual() ? 'Este mes' : capitalizar(nombreMes(m)), icono: CalendarDays }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div {...entrada(0)} className="rounded-tarjeta bg-noche-900 p-5 text-white sm:p-6 shadow-[0_18px_40px_-20px_rgba(18,21,44,.8)]">
          <p className="mb-5 text-[17px] font-bold">Así se reparte tu gasto</p>
          {a.categorias.length ? <DonaCategorias datos={a.categorias} total={a.gastos} oscuro alto={150} /> : <p className="text-white/70">Aún no hay gastos en este mes.</p>}
        </motion.div>

        <motion.div {...entrada(1)} className="relative flex items-center gap-2 overflow-hidden rounded-tarjeta bg-gradient-to-br from-marca-50 via-white to-[#e7f0ff] p-6 shadow-suave dark:from-marca-500/20 dark:via-noche-900 dark:to-noche-900">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-marca-600 dark:text-marca-300"><Sparkles size={15} /> Recomendación de tu asistente</p>
            <p className="mt-2 text-xl font-extrabold leading-snug">{recomendacion?.titulo ?? 'Sigue registrando tus gastos'}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-tenue">{recomendacion?.mensaje ?? 'Con unos días más de datos te diremos dónde puedes ahorrar.'}</p>
            {recomendacion && <Boton className="mt-4 !h-10" onClick={() => setEvidencia(recomendacion)}>Ver consejos</Boton>}
          </div>
          <Planta />
        </motion.div>
      </div>

      <section>
        <Titulo accion={<ChevronRight size={20} className="text-tenue" />}>Tendencia de gasto</Titulo>
        <motion.div {...entrada(2)}>
          <Tarjeta>
            <div className="flex h-56 gap-3">
              <div className="flex flex-col justify-between pb-7 text-right text-xs text-tenue">
                {[1, 0.5, 0].map((f) => <span key={f} className="num">{pesosCorto(escala * f)}</span>)}
              </div>
              <div className="relative grid flex-1 items-end gap-3 sm:gap-6" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))` }}>
                {semanas.map((s, i) => {
                  const mayor = s.valor === maxSemana && s.valor > 0
                  return (
                    <div key={s.etiqueta} className="flex h-full flex-col items-center justify-end gap-2">
                      <div className="flex w-full max-w-[56px] flex-1 items-end">
                        <motion.div
                          title={pesos(s.valor)}
                          className={clsx('w-full origin-bottom rounded-t-xl rounded-b-md', mayor ? 'bg-gradient-to-t from-marca-700 to-marca-500' : 'bg-gradient-to-t from-marca-300 to-marca-200')}
                          style={{ height: `${Math.max(3, (s.valor / escala) * 100)}%` }}
                          initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: 'spring', duration: 0.8, bounce: 0.2, delay: 0.2 + i * 0.08 }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-xs font-medium text-tenue">{s.etiqueta}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Tarjeta>
        </motion.div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        <motion.div {...entrada(3)} className="rounded-tarjeta bg-marca-50 p-4 sm:p-5 dark:bg-marca-500/15">
          <p className="flex items-center gap-2 text-[13px] font-semibold"><span className="grid h-8 w-8 place-items-center rounded-full bg-superficie text-marca-600"><PiggyBank size={16} /></span> Ahorro del mes</p>
          <div className="mt-3 flex items-end gap-2">
            <div className="min-w-0">
              <p className={clsx('num truncate text-lg font-extrabold sm:text-xl', ahorroMes < 0 && 'text-coral-500')}>{pesos(ahorroMes)}</p>
              <p className="text-[13px] text-tenue">{a.ingresos ? `${Math.round((ahorroMes / a.ingresos) * 100)} % de tus ingresos` : 'Aún sin ingresos'}</p>
            </div>
          </div>
          <Sparkline valores={ahorros} color="#6338ee" />
        </motion.div>
        <motion.div {...entrada(4)} className="rounded-tarjeta bg-menta-100/70 p-4 sm:p-5 dark:bg-menta-500/15">
          <p className="flex items-center gap-2 text-[13px] font-semibold"><span className="grid h-8 w-8 place-items-center rounded-full bg-superficie text-menta-600"><Goal size={16} /></span> Tus metas</p>
          <p className="num mt-3 truncate text-lg font-extrabold sm:text-xl">{pesos(metas[5])}</p>
          <p className="text-[13px] font-semibold text-menta-600 dark:text-menta-400">{metasCambio > 0 ? `+${metasCambio.toFixed(1).replace('.', ',')} % este mes` : 'Sin aportes este mes'}</p>
          <Sparkline valores={metas} color="#22c39a" />
        </motion.div>
      </div>

      <section>
        <Titulo>Más consejos para ti</Titulo>
        {visibles.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{visibles.map((i) => <TarjetaInsight key={i.id} i={i} onVer={() => setEvidencia(i)} />)}</div>
        ) : (
          <Vacio titulo="Todo en orden" texto="Cuando encontremos algo que valga la pena contarte, aparecerá aquí." />
        )}
        {ocultos > 0 && <div className="mt-3"><SoloPremium funcion="insights_avanzados" compacto><span /></SoloPremium></div>}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Tarjeta>
          <Titulo><span className="flex items-center gap-2"><Repeat size={18} className="text-marca-500" /> Pagos que se repiten</span></Titulo>
          <SoloPremium funcion="recurrentes">
            {a.recurrentes.length ? (
              <ul>
                {(todosRecurrentes ? a.recurrentes : a.recurrentes.slice(0, 5)).map((r) => (
                  <li key={r.clave} className="flex min-h-[60px] items-center gap-3">
                    <ChipCategoria id={r.categoria} texto={r.nombre} tam={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{r.nombre}</p>
                      <p className="text-[13px] text-tenue">Cada {r.frecuencia === 'mensual' ? 'mes' : r.frecuencia === 'quincenal' ? 'quincena' : 'semana'} · unos {pesos(costoMensual(r))} al mes</p>
                    </div>
                    <Monto valor={-r.montoTipico} className="text-[15px]" />
                  </li>
                ))}
                {a.recurrentes.length > 5 && (
                  <li className="pt-2"><button onClick={() => setTodosRecurrentes(!todosRecurrentes)} className={claseEnlace + ' text-[15px]'}>{todosRecurrentes ? 'Ver menos' : `Ver todos (${a.recurrentes.length})`}</button></li>
                )}
              </ul>
            ) : (
              <p className="text-[15px] text-tenue">Cuando un pago se repita tres veces, lo verás aquí con su próxima fecha.</p>
            )}
          </SoloPremium>
        </Tarjeta>

        <Tarjeta>
          <Titulo><span className="flex items-center gap-2"><AlertTriangle size={18} className="text-coral-500" /> Movimientos para revisar</span></Titulo>
          <SoloPremium funcion="anomalias">
            {inusuales.length ? (
              <ul className="space-y-2">
                {inusuales.map(({ x, m }) => (
                  <li key={x.movimientoId + x.tipo} className="flex items-start gap-3 rounded-2xl bg-elevada p-3">
                    <ChipCategoria id={m!.categoria} texto={m!.descripcion} tam={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center justify-between gap-2 text-[15px] font-semibold"><span className="truncate">{m!.descripcion}</span><Monto valor={m!.monto} className="shrink-0 text-[15px]" /></p>
                      <p className="mt-0.5 text-[13px] text-tenue">{x.tipo === 'posible_duplicado' ? '¿Te cobraron dos veces? Hay otro cargo igual el mismo día.' : x.tipo === 'monto_atipico' ? 'Es mucho más de lo que sueles gastar en esta categoría.' : 'Primera compra aquí y por un valor alto.'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-tenue">Nada fuera de lo normal en las últimas semanas.</p>
            )}
          </SoloPremium>
        </Tarjeta>
      </div>

      {mes === mesActual() && (
        <Tarjeta>
          <Titulo><span className="flex items-center gap-2"><TrendingUp size={18} className="text-marca-500" /> Así podría cerrar tu mes</span></Titulo>
          <SoloPremium funcion="pronostico">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ['Llevas gastado', pesos(a.pronostico.gastadoHastaHoy), ''],
                ['Gastarías en total', pesos(a.pronostico.proyeccionCierre), 'text-marca-600 dark:text-marca-300'],
                [a.pronostico.saldoProyectado >= 0 ? 'Te sobrarían' : 'Te faltarían', pesos(Math.abs(a.pronostico.saldoProyectado)), a.pronostico.saldoProyectado >= 0 ? 'text-menta-600 dark:text-menta-400' : 'text-coral-500'],
              ].map(([t, v, c]) => (
                <div key={t} className="rounded-2xl bg-elevada p-4">
                  <p className="text-[13px] text-tenue">{t}</p>
                  <p className={clsx('num mt-1 text-xl font-extrabold', c)}>{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-tenue">Calculado con tu ritmo de este mes y tus meses anteriores.</p>
          </SoloPremium>
        </Tarjeta>
      )}

      <Hoja abierto={!!evidencia} onCerrar={() => setEvidencia(null)} titulo="¿Por qué te lo decimos?">
        {evidencia && (
          <div className="space-y-4">
            <p className="text-[17px] font-bold leading-snug">{evidencia.titulo}</p>
            <p className="text-[15px] text-tenue">{evidencia.mensaje}</p>
            {movsEvidencia.length > 0 && <p className="text-sm font-semibold">Los movimientos que lo muestran</p>}
            <div className="-mx-2">{movsEvidencia.slice(0, 30).map((m, i) => <FilaMovimiento key={m.id} m={m} indice={i} />)}</div>
            <Boton variante="secundario" className="w-full" onClick={() => { setEvidencia(null); nav('/presupuestos') }}>Crear un presupuesto</Boton>
          </div>
        )}
      </Hoja>
    </div>
  )
}
