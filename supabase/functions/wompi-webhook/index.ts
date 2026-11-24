// Recibe los eventos de Wompi (transaction.updated), verifica el checksum y activa el plan.
// Configura en el panel de Wompi (sandbox) la URL de eventos:
//   https://<proyecto>.supabase.co/functions/v1/wompi-webhook
// Despliega con --no-verify-jwt (Wompi no envía token de Supabase).
//
// Secreto requerido: WOMPI_EVENTS_SECRET (test_events_...)
import { createClient } from 'npm:@supabase/supabase-js@2.47.10'
import { env, iguales, json, sha256 } from '../_compartido/utilidades.ts'

/** Forma del evento que envía Wompi (solo los campos que se usan). */
interface EventoWompi {
  event: string
  data: { transaction: Record<string, unknown> & { id: string; reference: string; status: string; amount_in_cents: number } }
  signature: { properties: string[]; checksum: string }
  timestamp: number
}

/** Lee un valor anidado por ruta con puntos: valor(data, 'transaction.id'). */
const valor = (obj: Record<string, unknown>, ruta: string) => ruta.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  try {
    const evento = (await req.json()) as EventoWompi
    // Checksum = SHA256(valores de signature.properties en orden + timestamp + secreto de eventos).
    const concatenado = evento.signature.properties.map((p) => String(valor(evento.data, p))).join('') + evento.timestamp + env('WOMPI_EVENTS_SECRET')
    if (!iguales(await sha256(concatenado), evento.signature.checksum.toLowerCase())) return json({ error: 'Firma inválida' }, 401)
    if (evento.event !== 'transaction.updated') return json({ ok: true, ignorado: evento.event })

    const t = evento.data.transaction
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: pago } = await db.from('pagos').select('*').eq('referencia', t.reference).maybeSingle()
    if (!pago) return json({ error: 'Pago no encontrado' }, 404)
    // Wompi puede reenviar el mismo evento: si el pago ya se procesó, no se vuelve a sumar el plan.
    if (pago.estado !== 'pendiente') return json({ ok: true, yaProcesado: true })
    if (Number(t.amount_in_cents) !== Number(pago.monto_centavos)) return json({ error: 'Monto no coincide' }, 400)

    const estado = t.status === 'APPROVED' ? 'aprobado' : t.status === 'PENDING' ? 'pendiente' : 'rechazado'
    await db.from('pagos').update({ estado, wompi_id: t.id }).eq('id', pago.id)

    // Pago aprobado: suma 30 días al plan (desde hoy o desde el vencimiento actual, lo que sea mayor) y gasta el cupón.
    if (estado === 'aprobado') {
      const { data: perfil } = await db.from('perfiles').select('plan_hasta').eq('id', pago.usuario_id).single()
      const hoy = new Date().toISOString().slice(0, 10)
      const base = perfil?.plan_hasta && perfil.plan_hasta > hoy ? new Date(perfil.plan_hasta) : new Date(hoy)
      base.setDate(base.getDate() + 30)
      await db.from('perfiles').update({ plan: pago.plan, plan_hasta: base.toISOString().slice(0, 10) }).eq('id', pago.usuario_id)
      if (pago.cupon) await db.from('recompensas').update({ usado: true }).eq('codigo', pago.cupon)
    }
    return json({ ok: true, estado })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
