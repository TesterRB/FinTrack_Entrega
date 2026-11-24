/**
 * Planes: comparación de Starter, Plus y Pro, aplicación de cupones y pago con Wompi.
 * En la beta (`BETA = true`) se muestra desenfocada con el aviso "Próximamente".
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'motion/react'
import { Check, CreditCard, ShieldCheck, Ticket } from 'lucide-react'
import { useDatos } from '../hooks/useAnalitica'
import { useApp, modoBackend } from '../store/app'
import { Boton, EASE_OUT, Insignia, Modal, Proximamente, Tarjeta, Titulo } from '../components/ui'
import { BETA, PLANES, PRECIOS, enPrueba, planEfectivo, premiumRegalado } from '../lib/planes'
import { diasEntre, hoyISO, pesos } from '../lib/formato'
import type { Pago, Plan } from '../lib/tipos'
import { backend } from '../data'
import { celebrar } from '../lib/estimulos'

export default function Planes() {
  const d = useDatos()
  const { iniciarPago, confirmarPagoDemo, avisar, iniciar } = useApp()
  const [params, setParams] = useSearchParams()
  const hoy = hoyISO()
  const cupones = d.recompensas.filter((r) => !r.usado && r.venceEn >= hoy)
  const [cupon, setCupon] = useState<string>(cupones[0]?.codigo ?? '')
  const [checkout, setCheckout] = useState<Pago | null>(null)
  const [elegido, setElegido] = useState<Plan>('plus')
  const [cargando, setCargando] = useState<Plan | null>(null)
  const descuento = cupones.find((c) => c.codigo === cupon.trim().toUpperCase())?.descuento ?? 0

  // Regreso desde el checkout de Wompi: el webhook ya actualizó el plan en el servidor.
  useEffect(() => {
    if (!params.get('id') || backend.modo !== 'supabase') return
    avisar('Verificando tu pago…')
    const t = setTimeout(async () => {
      await iniciar()
      setParams({})
    }, 2500)
    return () => clearTimeout(t)
  }, [params, setParams, iniciar, avisar])

  async function suscribirse(plan: Plan) {
    setCargando(plan)
    try {
      const monto = Math.round(PRECIOS[plan] * (1 - descuento / 100)) * 100
      const r = await iniciarPago(plan, descuento ? cupon.trim().toUpperCase() : null, monto)
      if (r.url) window.location.href = r.url
      else setCheckout(r.pago)
    } catch {
      avisar('No se pudo iniciar el pago. Inténtalo de nuevo en un momento.', 'error')
    } finally {
      setCargando(null)
    }
  }

  const estadoActual = enPrueba(d.perfil)
    ? `Estás en tu prueba Premium: te quedan ${diasEntre(hoy, d.perfil.pruebaHasta)} días con todo desbloqueado.`
    : premiumRegalado(d.perfil)
      ? `Tienes Premium de regalo por tu FinScore hasta el ${new Date(d.perfil.premiumHasta + 'T12:00').toLocaleDateString('es-CO')}.`
      : planEfectivo(d.perfil) !== 'starter'
        ? `Tu plan ${d.perfil.plan === 'pro' ? 'Pro' : 'Plus'} está activo hasta el ${new Date(d.perfil.planHasta + 'T12:00').toLocaleDateString('es-CO')}.`
        : 'Tu plan actual es Starter (gratis).'

  const infoElegido = PLANES.find((p) => p.id === elegido)!
  const precioElegido = Math.round(PRECIOS[elegido] * (1 - descuento / 100))
  const elegidoEsActual = d.perfil.plan === elegido && planEfectivo(d.perfil) === elegido && !enPrueba(d.perfil)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Planes</h1>
        <p className="mt-1 text-[15px] text-tenue">{BETA ? 'Mientras probamos la app tienes todas las funciones de FinTrack Pro, sin costo.' : estadoActual}</p>
      </div>

      <Velo>
      {cupones.length > 0 && (
        <section>
          <Titulo>Tus cupones</Titulo>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {cupones.map((c) => {
              const activo = cupon.trim().toUpperCase() === c.codigo
              return (
                <button key={c.id} onClick={() => setCupon(activo ? '' : c.codigo)} aria-pressed={activo}
                  className={clsx('tocable flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold', activo ? 'bg-marca-600 text-white' : 'bg-marca-50 text-marca-700 dark:bg-marca-500/20 dark:text-marca-200')}>
                  {activo ? <Check size={17} strokeWidth={3} /> : <Ticket size={17} />} {c.descuento} % de descuento
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLANES.map((p, k) => {
          const precio = PRECIOS[p.id]
          const final = Math.round(precio * (1 - descuento / 100))
          const sel = elegido === p.id
          return (
            <motion.button
              key={p.id} onClick={() => setElegido(p.id)} aria-pressed={sel}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: k * 0.06 }}
              className={clsx('tocable relative flex items-center gap-4 rounded-tarjeta p-5 text-left md:flex-col md:items-start', sel ? 'bg-marca-600 text-white shadow-boton' : 'bg-superficie shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea')}
            >
              <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', sel ? 'border-white bg-white text-marca-600' : 'border-linea')}>{sel && <Check size={14} strokeWidth={3.5} />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-lg font-extrabold">
                  {p.nombre}
                  {p.id === 'plus' && <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', sel ? 'bg-white/20' : 'bg-menta-100 text-menta-600')}>Más elegido</span>}
                </span>
                <span className={clsx('block text-[13px]', sel ? 'text-white/80' : 'text-tenue')}>{p.subtitulo}</span>
              </span>
              <span className="shrink-0 text-right md:text-left">
                {descuento > 0 && precio > 0 && <span className={clsx('num block text-xs line-through', sel ? 'text-white/60' : 'text-tenue')}>{pesos(precio)}</span>}
                <span className="num block text-xl font-extrabold">{precio ? pesos(final) : 'Gratis'}</span>
                {precio > 0 && <span className={clsx('block text-xs', sel ? 'text-white/75' : 'text-tenue')}>al mes</span>}
              </span>
            </motion.button>
          )
        })}
      </div>

      <Tarjeta>
        <Titulo>Lo que incluye {infoElegido.nombre}</Titulo>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {infoElegido.incluye.map((x, k) => (
            <motion.li key={elegido + x} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: k * 0.03 }} className="flex items-center gap-3 text-[15px]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-menta-100 text-menta-600 dark:bg-menta-500/15 dark:text-menta-400"><Check size={15} strokeWidth={3} /></span> {x}
            </motion.li>
          ))}
        </ul>
        <div className="mt-6">
          {elegidoEsActual ? (
            <Boton variante="secundario" className="w-full" disabled>Es tu plan actual</Boton>
          ) : PRECIOS[elegido] === 0 ? (
            <p className="text-center text-[15px] text-tenue">Starter es gratis. Al terminar tu prueba sigues aquí si no eliges otro plan.</p>
          ) : (
            <Boton className="w-full" onClick={() => suscribirse(elegido)} cargando={cargando === elegido}>
              <CreditCard size={18} /> Suscribirme por {pesos(precioElegido)} al mes
            </Boton>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-tenue">
            <ShieldCheck size={15} className="text-menta-500" /> Pagas seguro con Wompi: tarjeta, PSE o Nequi.{modoBackend === 'demo' && ' En la demo el pago es simulado.'}
          </p>
        </div>
      </Tarjeta>

      {d.pagos.length > 0 && (
        <section>
          <Titulo>Tus pagos</Titulo>
          <Tarjeta className="!p-2">
            {[...d.pagos].reverse().slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl p-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-marca-50 text-marca-600 dark:bg-marca-500/20"><CreditCard size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold capitalize">Plan {p.plan}</p>
                  <p className="text-[13px] text-tenue">{new Date(p.creadoEn).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[15px] font-bold">{pesos(p.montoCentavos / 100)}</p>
                  <Insignia tono={p.estado === 'aprobado' ? 'ok' : p.estado === 'pendiente' ? 'aviso' : 'alerta'}>{p.estado === 'aprobado' ? 'Pagado' : p.estado === 'pendiente' ? 'Pendiente' : 'Rechazado'}</Insignia>
                </div>
              </div>
            ))}
          </Tarjeta>
        </section>
      )}
      </Velo>

      <Modal abierto={!!checkout} onCerrar={() => setCheckout(null)} titulo="Pago de prueba">
        {checkout && (
          <div className="space-y-4 text-sm">
            <div className="rounded-[10px] bg-elevada p-4">
              <p className="text-tenue">Referencia</p>
              <p className="font-mono font-semibold">{checkout.referencia}</p>
              <p className="mt-2 text-tenue">Total a pagar</p>
              <p className="num text-2xl font-extrabold">{pesos(checkout.montoCentavos / 100)}</p>
            </div>
            <p className="text-tenue">Esto es una simulación: no se cobra nada. Elige cómo responde el banco:</p>
            <div className="grid grid-cols-2 gap-2">
              <Boton variante="peligro" onClick={async () => { await confirmarPagoDemo(checkout.referencia, false); setCheckout(null); avisar('Pago rechazado (simulado)', 'error') }}>Simular rechazo</Boton>
              <Boton onClick={async () => { await confirmarPagoDemo(checkout.referencia, true); setCheckout(null); celebrar('celebracion'); avisar(`¡Bienvenido a FinTrack ${checkout.plan === 'pro' ? 'Pro' : 'Plus'}!`, 'premio') }}>Simular aprobado</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** En la beta los pagos están desactivados: la pantalla se ve, desenfocada, con el aviso encima. */
function Velo({ children }: { children: React.ReactNode }) {
  if (!BETA) return <div className="space-y-6">{children}</div>
  return (
    <Proximamente
      largo
      titulo="Planes Plus y Pro"
      texto="Estamos preparando los pagos con tarjeta, PSE y Nequi. Mientras tanto, todo FinTrack está desbloqueado para ti."
    >
      <div className="space-y-6">{children}</div>
    </Proximamente>
  )
}
