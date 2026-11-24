/**
 * Promociones: beneficios de comercios aliados y premios del FinScore. Para participar se sube la foto de
 * la factura: el OCR la lee y la validación decide si se aprueba sola o queda para revisión del admin.
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { Check, CheckCircle2, ChevronDown, Clock, Crown, ScanLine, Store, Ticket, XCircle } from 'lucide-react'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { Boton, ChipCategoria, EASE_OUT, Insignia, Modal, Proximamente, Tarjeta, Titulo, Vacio } from '../components/ui'
import { EscanerFactura, facturaEjemplo, type ResultadoEscaneo } from '../components/EscanerFactura'
import { BETA, RECOMPENSAS } from '../lib/planes'
import { hoyISO, pesos } from '../lib/formato'
import { validarFactura } from '../ml/facturas'
import { celebrar } from '../lib/estimulos'
import type { Aliado, Promocion } from '../lib/tipos'

/** `YYYY-MM-DD` → "23 nov". */
const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

export default function Promociones() {
  const d = useDatos()
  const a = useAnalitica()
  const { enviarFactura, agregarMovimientos, avisar } = useApp()
  const [params, setParams] = useSearchParams()
  const [participar, setParticipar] = useState<{ promo: Promocion; aliado: Aliado } | null>(null)
  const [escaneo, setEscaneo] = useState<ResultadoEscaneo | null>(null)
  const [comoGasto, setComoGasto] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const escanearGasto = params.get('escanear') === '1'
  const hoy = hoyISO()

  const activas = d.promociones.filter((p) => p.activa && p.hasta >= hoy && p.desde <= hoy)
  const aliado = (id: string) => d.aliados.find((x) => x.id === id)!
  const misFacturas = [...d.facturas].filter((f) => f.usuarioId === d.perfil.id).sort((x, y) => y.creadoEn.localeCompare(x.creadoEn))

  function cerrar() {
    setParticipar(null)
    setEscaneo(null)
    if (escanearGasto) setParams({})
  }

  async function enviar() {
    if (!escaneo) return
    setEnviando(true)
    try {
      if (participar) {
        const yaParticipo = d.facturas.some((f) => f.promocionId === participar.promo.id && f.usuarioId === d.perfil.id && f.estado !== 'rechazada')
        const v = validarFactura(escaneo.ocr, participar.promo, participar.aliado, yaParticipo)
        const estado = v.aprobada ? 'aprobada' : v.rechazoAutomatico ? 'rechazada' : 'pendiente'
        await enviarFactura({ promocionId: participar.promo.id, imagen: escaneo.imagen, ocr: escaneo.ocr, estado, motivo: v.rechazoAutomatico ? v.alertas.join(' ') : null, alertas: v.alertas })
        if (estado === 'aprobada') celebrar('logro')
        avisar(
          estado === 'aprobada' ? `¡Factura aprobada! Tu beneficio: ${participar.promo.beneficio}` : estado === 'pendiente' ? 'Factura enviada: nuestro equipo la revisará pronto.' : 'La factura no cumple las reglas de la promoción.',
          estado === 'aprobada' ? 'premio' : estado === 'pendiente' ? 'ok' : 'error',
        )
      }
      if ((comoGasto || !participar) && escaneo.ocr.total) {
        const desc = participar?.aliado.nombre ?? escaneo.ocr.comercio ?? 'Compra con factura'
        await agregarMovimientos([{ descripcion: desc, monto: -escaneo.ocr.total, fecha: escaneo.ocr.fecha && escaneo.ocr.fecha <= hoy ? escaneo.ocr.fecha : hoy, origen: 'factura', cuentaId: 'tarjeta', ...(participar ? { categoria: participar.aliado.categoria, confianza: null } : {}) }])
        if (!participar) avisar(`Gasto registrado desde la factura: ${pesos(escaneo.ocr.total)}`)
      }
      cerrar()
    } finally {
      setEnviando(false)
    }
  }

  const validacion = escaneo && participar ? validarFactura(escaneo.ocr, participar.promo, participar.aliado, d.facturas.some((f) => f.promocionId === participar.promo.id && f.usuarioId === d.perfil.id && f.estado !== 'rechazada')) : null

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Promociones</h1>
        <button onClick={() => setParams({ escanear: '1' })} className="tocable flex h-11 items-center gap-2 rounded-full bg-marca-600 px-4 text-sm font-semibold text-white shadow-boton" aria-label="Escanear factura de un gasto">
          <ScanLine size={18} /> Escanear
        </button>
      </div>

      {/* Cupones de FinTrack: dos premios claros y cuánto te falta. */}
      <section>
        <Titulo accion={<Link to="/finscore" className="text-sm font-semibold text-marca-600 dark:text-marca-300">Cómo ganar puntos</Link>}>Tus premios del mes</Titulo>
        <VeloPremios>
        <div className="grid grid-cols-2 gap-3">
          {[
            { meta: 85, t: `${RECOMPENSAS.descuentoCupon} % de descuento`, d: 'en tu plan Premium', i: Ticket, fondo: 'from-marca-500 to-[#8f7cfb]' },
            { meta: 100, t: `${RECOMPENSAS.descuentoPerfecto} % + 1 mes gratis`, d: 'con todo desbloqueado', i: Crown, fondo: 'from-marca-800 to-marca-600' },
          ].map((c, k) => {
            const ok = a.finscore.total >= c.meta
            return (
              <motion.div key={c.meta} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: k * 0.07 }}
                className={clsx('flex flex-col rounded-tarjeta bg-gradient-to-br p-4 text-white', c.fondo)}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/20"><c.i size={20} /></span>
                <p className="mt-3 text-base font-extrabold leading-tight">{c.t}</p>
                <p className="text-[13px] text-white/85">{c.d}</p>
                <div className="mt-auto pt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-white/25">
                    <motion.div className="h-full origin-left rounded-full bg-white" initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, a.finscore.total / c.meta) }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }} />
                  </div>
                  <p className="mt-1.5 text-xs font-semibold">{ok ? '¡Ya lo tienes!' : `${a.finscore.total} de ${c.meta} pts`}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
        </VeloPremios>
      </section>

      {/* Promociones de aliados */}
      <section>
        <Titulo>Comercios aliados</Titulo>
        {activas.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activas.map((p, k) => {
              const al = aliado(p.aliadoId)
              const mia = misFacturas.find((f) => f.promocionId === p.id && f.estado !== 'rechazada')
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 + k * 0.06 }}>
                  <Tarjeta className="flex h-full flex-col">
                    <div className="flex items-center gap-3">
                      {al ? <ChipCategoria id={al.categoria} texto={al.nombre} tam={50} /> : <Store />}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-tenue">{al?.nombre}</p>
                        <p className="text-base font-bold leading-snug">{p.titulo}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[15px] leading-relaxed text-tenue">{p.descripcion}</p>
                    <details className="group mt-3 rounded-2xl bg-elevada px-4 py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                        Ver reglas <ChevronDown size={17} className="text-tenue transition-transform duration-200 group-open:rotate-180" />
                      </summary>
                      <ul className="mt-2 space-y-1 text-[13px] text-tenue">{p.reglas.map((r) => <li key={r} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-menta-500" />{r}</li>)}</ul>
                    </details>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className="text-[13px] text-tenue">Hasta el {fechaCorta(p.hasta)}</span>
                      {mia ? (
                        <Insignia tono={mia.estado === 'aprobada' ? 'ok' : 'aviso'}>{mia.estado === 'aprobada' ? 'Beneficio ganado' : 'En revisión'}</Insignia>
                      ) : (
                        <Boton className="!h-10" onClick={() => al && setParticipar({ promo: p, aliado: al })}><ScanLine size={16} /> Participar</Boton>
                      )}
                    </div>
                  </Tarjeta>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <Vacio icono={Store} titulo="No hay promociones activas" texto="Pronto tendremos nuevos beneficios de comercios aliados." />
        )}
      </section>

      <Tarjeta>
        <Titulo>Mis participaciones</Titulo>
        {misFacturas.length ? (
          <ul className="divide-y divide-linea">
            {misFacturas.map((f) => {
              const p = d.promociones.find((x) => x.id === f.promocionId)
              return (
                <li key={f.id} className="flex items-center gap-3 py-3">
                  {f.estado === 'aprobada' ? <CheckCircle2 className="text-menta-500" /> : f.estado === 'pendiente' ? <Clock className="text-amber-500" /> : <XCircle className="text-coral-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p?.titulo ?? 'Promoción'}</p>
                    <p className="truncate text-[13px] text-tenue">
                      {f.ocr.total ? pesos(f.ocr.total) : 'Total no leído'} · {new Date(f.creadoEn).toLocaleDateString('es-CO')}
                      {f.estado === 'aprobada' && p ? ` · ${p.beneficio}` : ''}
                      {f.motivo ? ` · ${f.motivo}` : ''}
                    </p>
                  </div>
                  <Insignia tono={f.estado === 'aprobada' ? 'ok' : f.estado === 'pendiente' ? 'aviso' : 'alerta'}>{f.estado}</Insignia>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-tenue">Aún no has participado. Registrar una factura de un aliado también completa el reto «Compra aliada».</p>
        )}
      </Tarjeta>

      <Modal abierto={!!participar || escanearGasto} onCerrar={cerrar} titulo={participar ? participar.promo.titulo : 'Escanear factura'}>
        {!escaneo ? (
          <div className="space-y-4">
            <p className="text-sm text-tenue">
              {participar
                ? `Toma una foto clara de la factura de ${participar.aliado.nombre}. Leeremos el NIT, la fecha y el total para validar las reglas automáticamente.`
                : 'Toma una foto de tu factura y registraremos el gasto con el total y la fecha que leamos.'}
            </p>
            <EscanerFactura
              onListo={setEscaneo}
              ejemplo={() => (participar ? facturaEjemplo(participar.aliado, Math.max(participar.promo.montoMinimo, 30_000) + 12_400) : facturaEjemplo({ nombre: 'Restaurante Ejemplo', nit: '900123456-7' }, 48_900))}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4">
              <img src={escaneo.imagen} alt="Factura" className="h-40 w-28 rounded-[10px] object-cover object-top border border-linea" />
              <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-tenue">Comercio</dt><dd className="truncate font-semibold">{escaneo.ocr.comercio ?? '—'}</dd>
                <dt className="text-tenue">NIT</dt><dd className="font-semibold">{escaneo.ocr.nit ?? '—'}</dd>
                <dt className="text-tenue">Fecha</dt><dd className="font-semibold">{escaneo.ocr.fecha ?? '—'}</dd>
                <dt className="text-tenue">Total</dt><dd className="font-semibold">{escaneo.ocr.total ? pesos(escaneo.ocr.total) : '—'}</dd>
                <dt className="text-tenue">Nitidez</dt><dd className="font-semibold">{Math.round(escaneo.ocr.confianza)} %</dd>
              </dl>
            </div>
            {validacion && (
              <div className={clsx('rounded-[10px] p-3 text-sm', validacion.aprobada ? 'bg-menta-100 text-menta-600 dark:text-[#3fc07a]' : validacion.rechazoAutomatico ? 'bg-coral-100 text-coral-600' : 'bg-amber-50 text-amber-800')}>
                {validacion.aprobada ? 'Cumple todas las reglas: se aprobará automáticamente.' : validacion.rechazoAutomatico ? 'No cumple las reglas:' : 'Nuestro equipo la revisará:'}
                {!validacion.aprobada && <ul className="mt-1 list-inside list-disc text-[13px]">{validacion.alertas.map((x) => <li key={x}>{x}</li>)}</ul>}
              </div>
            )}
            {participar && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={comoGasto} onChange={(e) => setComoGasto(e.target.checked)} /> Registrar también como gasto</label>
            )}
            {!participar && !escaneo.ocr.total && <p className="text-sm text-coral-600">No pudimos leer el total. Intenta con otra foto o regístralo a mano.</p>}
            <div className="flex gap-2">
              <Boton variante="fantasma" onClick={() => setEscaneo(null)}>Repetir</Boton>
              <Boton className="flex-1" onClick={enviar} cargando={enviando} disabled={!participar && !escaneo.ocr.total}>{participar ? 'Enviar factura' : 'Registrar gasto'}</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Velo "Próximamente" sobre los premios del FinScore durante la beta. */
function VeloPremios({ children }: { children: React.ReactNode }) {
  if (!BETA) return <>{children}</>
  return (
    <Proximamente titulo="Premios del FinScore" texto="Los cupones se activarán con los planes de pago. Sigue sumando puntos: cuentan desde ya.">
      {children}
    </Proximamente>
  )
}
