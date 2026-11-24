// Utilidades compartidas por las Edge Functions (corren en Deno, no en Node).

/** Cabeceras CORS: la app web llama a las funciones desde otro dominio (Vercel). */
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Respuesta JSON con las cabeceras CORS. */
export function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** Hash SHA-256 en hexadecimal (lo usa Wompi para la firma de integridad y el checksum de eventos). */
export async function sha256(texto: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Comparación en tiempo constante para firmas: no revela, por el tiempo de respuesta, cuántos caracteres coinciden. */
export function iguales(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// Precios en COP (deben coincidir con src/lib/planes.ts).
export const PRECIOS: Record<string, number> = { plus: 9_900, pro: 14_900 }

/** Lee una variable de entorno obligatoria (secreto de Supabase) o falla con un mensaje claro. */
export function env(nombre: string) {
  const v = Deno.env.get(nombre)
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`)
  return v
}
