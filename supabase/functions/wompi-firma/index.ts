// Crea un pago pendiente y devuelve la URL del Web Checkout de Wompi con firma de integridad.
// El monto se calcula AQUÍ (con el cupón validado en la base de datos): el cliente no lo decide.
//
// Secretos requeridos (supabase secrets set ...):
//   WOMPI_PUBLIC_KEY       pub_test_...
//   WOMPI_INTEGRITY_SECRET test_integrity_...
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.47.10'
import { PRECIOS, cors, env, json, sha256 } from '../_compartido/utilidades.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Cliente con el token del usuario: solo para saber quién llama.
    const comoUsuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await comoUsuario.auth.getUser()
    if (!auth.user) return json({ error: 'Sin sesión' }, 401)

    const { plan, cupon, redirectUrl } = (await req.json()) as { plan: string; cupon: string | null; redirectUrl: string }
    const precio = PRECIOS[plan]
    if (!precio) return json({ error: 'Plan no válido' }, 400)

    // Cliente de servicio (salta RLS): valida el cupón y crea el pago, que el usuario no puede escribir.
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    let descuento = 0
    let codigo: string | null = null
    // El cupón solo cuenta si es del usuario, no se ha usado y sigue vigente.
    if (cupon) {
      const { data: r } = await admin
        .from('recompensas')
        .select('codigo, descuento')
        .eq('codigo', cupon.trim().toUpperCase())
        .eq('usuario_id', auth.user.id)
        .eq('usado', false)
        .gte('vence_en', new Date().toISOString().slice(0, 10))
        .maybeSingle()
      if (r) {
        descuento = r.descuento
        codigo = r.codigo
      }
    }

    // Wompi trabaja en centavos de peso.
    const montoCentavos = Math.round(precio * (1 - descuento / 100)) * 100
    const referencia = `FT-${auth.user.id.slice(0, 8)}-${Date.now()}`
    const { data: pago, error } = await admin
      .from('pagos')
      .insert({ usuario_id: auth.user.id, referencia, plan, monto_centavos: montoCentavos, cupon: codigo })
      .select()
      .single()
    if (error) throw error

    // Firma de integridad de Wompi: SHA256(referencia + monto en centavos + moneda + secreto de integridad).
    // Impide que alguien cambie el monto en la URL del checkout.
    const firma = await sha256(`${referencia}${montoCentavos}COP${env('WOMPI_INTEGRITY_SECRET')}`)
    const url = new URL('https://checkout.wompi.co/p/')
    url.searchParams.set('public-key', env('WOMPI_PUBLIC_KEY'))
    url.searchParams.set('currency', 'COP')
    url.searchParams.set('amount-in-cents', String(montoCentavos))
    url.searchParams.set('reference', referencia)
    url.searchParams.set('signature:integrity', firma)
    url.searchParams.set('redirect-url', redirectUrl)
    return json({ pago, url: url.toString() })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
