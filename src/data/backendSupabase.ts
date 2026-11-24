/**
 * Backend real con Supabase: Auth (correo y Google), Postgres, Storage (fotos de facturas),
 * funciones RPC (cierre de mes) y Edge Functions (pagos con Wompi).
 *
 * La seguridad NO depende de este archivo: la llave anónima es pública y las políticas RLS de cada tabla
 * limitan a cada usuario a sus propias filas (los administradores, además, revisan facturas y gestionan
 * aliados). Ver `supabase/migrations`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Estado, Tabla, VersionPublicada } from './backend'
import type { CierreMes, Pago, Perfil, Recompensa } from '../lib/tipos'
import { esNativo, URL_RETORNO_NATIVA } from '../lib/plataforma'

// Conversión camelCase (app) <-> snake_case (Postgres).
const aSnake = (k: string) => k.replace(/[A-Z]/g, (l) => '_' + l.toLowerCase())
const aCamel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase())
function mapear<T>(obj: Record<string, unknown>, f: (k: string) => string): T {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [f(k), v])) as T
}
/** Filas de Postgres → objetos de la app. */
const deFila = <T,>(filas: Record<string, unknown>[] | null) => (filas ?? []).map((f) => mapear<T>(f, aCamel))

/** Tablas que se cargan al iniciar sesión (todas filtradas por RLS al usuario actual). */
const TABLAS: Tabla[] = [
  'cuentas', 'movimientos', 'presupuestos', 'metas', 'aportes', 'extractos', 'actividades',
  'recompensas', 'cierres', 'pagos', 'facturas', 'aliados', 'promociones',
]

/** Convierte una dataURL en Blob para subirla a Storage. */
async function dataUrlABlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob()
}

/** Mensajes de Supabase Auth en español y en palabras de la app. */
export function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de entrar: revisa tu bandeja de entrada (y la de spam).'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (m.includes('password should be') || m.includes('weak password') || m.includes('password is known')) return 'Elige una contraseña más segura: mínimo 8 caracteres, mezclando letras y números.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.'
  if (m.includes('not authorized') || m.includes('error sending')) return 'No pudimos enviar el correo de confirmación. Intenta entrar con Google.'
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'El acceso con Google todavía no está activado.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Los registros están cerrados por ahora.'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Revisa el correo: parece que tiene un error.'
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  if (m.includes('code verifier') || m.includes('flow state')) return 'El enlace expiró o se abrió en otro celular. Vuelve a intentarlo desde este.'
  if (m.includes('for security purposes')) return 'Por seguridad, espera un minuto antes de pedir otro correo.'
  if (m.includes('should be different')) return 'La nueva contraseña debe ser distinta a la anterior.'
  if (m.includes('session missing') || m.includes('session not found')) return 'El enlace expiró. Pide uno nuevo.'
  if (m.includes('otp_expired') || m.includes('link is invalid') || m.includes('has expired')) return 'El enlace ya se usó o expiró. Pide uno nuevo.'
  // Cualquier otro error: un mensaje claro (el detalle técnico queda en el monitoreo).
  return 'Algo no salió bien. Inténtalo de nuevo en un momento.'
}

export function crearBackendSupabase(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // PKCE: el proveedor devuelve un código que se canjea en el mismo dispositivo (web y Android).
      flowType: 'pkce',
      // En Android la sesión llega por el enlace profundo, no por la URL de la página.
      detectSessionInUrl: !esNativo,
    },
  })
  /** Devuelve `data` o lanza el error de Supabase. */
  const exigir = <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message)
    return r.data
  }
  /** A dónde vuelve el usuario después de Google o de un enlace de correo. */
  const urlRetorno = () => (esNativo ? URL_RETORNO_NATIVA : `${location.origin}/entrar`)
  // Llegó una sesión desde un enlace de recuperación: la app debe pedir la contraseña nueva antes de entrar.
  // (En la web lo avisa el evento PASSWORD_RECOVERY; en Android, completarRetorno.)
  let recuperando = false
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') recuperando = true
  })

  return {
    modo: 'supabase',
    async sesion() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.id ?? null
    },
    async entrar(email, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave })
      if (error) throw new Error(traducirError(error.message))
    },
    async registrar(nombre, email, clave) {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password: clave,
        options: { data: { nombre: nombre.trim() }, emailRedirectTo: urlRetorno() },
      })
      if (error) throw new Error(traducirError(error.message))
      // Con la confirmación activa, Supabase responde "ok" sin identidades si el correo ya existía.
      if (data.user && !data.session && data.user.identities?.length === 0) throw new Error(traducirError('already registered'))
      return { confirmar: !data.session }
    },
    async entrarConGoogle() {
      // Si Google no está activado en Supabase, se avisa aquí en vez de abrir el navegador con un error crudo.
      const ajustes = (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
        .then((r) => r.json())
        .catch(() => null)) as { external?: Record<string, boolean> } | null
      if (ajustes?.external?.google === false) throw new Error(traducirError('provider is not enabled'))
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: urlRetorno(), skipBrowserRedirect: esNativo, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw new Error(traducirError(error.message))
      if (!esNativo) return 'redirigiendo'
      const { Browser } = await import('@capacitor/browser')
      // Pestaña personalizada de Chrome: el usuario ve accounts.google.com real, con sus cuentas guardadas.
      await Browser.open({ url: data.url, toolbarColor: '#6338ee' })
      return 'redirigiendo'
    },
    async completarRetorno(enlace) {
      const u = new URL(enlace)
      // Supabase devuelve el código en la query; los errores pueden venir en la query o en el fragmento.
      const fragmento = new URLSearchParams(u.hash.replace(/^#/, ''))
      const fallo = u.searchParams.get('error_description') ?? fragmento.get('error_description')
      if (fallo) throw new Error(traducirError(fallo.replace(/\+/g, ' ')))
      const codigo = u.searchParams.get('code')
      if (!codigo) throw new Error('El inicio de sesión no se completó. Vuelve a intentarlo.')
      const { data, error } = await sb.auth.exchangeCodeForSession(codigo)
      if (error) throw new Error(traducirError(error.message))
      // supabase-js devuelve redirectType ('recovery' si el código vino de resetPasswordForEmail), aunque no esté en sus tipos.
      if ((data as { redirectType?: string | null }).redirectType === 'recovery') {
        recuperando = true
        return 'recuperacion'
      }
      return 'sesion'
    },
    necesitaNuevaClave() {
      return recuperando
    },
    async recuperarClave(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlRetorno() })
      if (error) throw new Error(traducirError(error.message))
    },
    async cambiarClave(nueva) {
      const { error } = await sb.auth.updateUser({ password: nueva })
      if (error) throw new Error(traducirError(error.message))
      recuperando = false
    },
    async reenviarConfirmacion(email) {
      const { error } = await sb.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: urlRetorno() } })
      if (error) throw new Error(traducirError(error.message))
    },
    async salir() {
      recuperando = false
      await sb.auth.signOut()
    },
    async cargar() {
      const perfil = mapear<Perfil>(exigir(await sb.from('perfiles').select('*').single()) as Record<string, unknown>, aCamel)
      // Todas las tablas en paralelo. El límite evita respuestas enormes; un usuario normal está muy por debajo.
      const resultados = await Promise.all(TABLAS.map((t) => sb.from(t).select('*').limit(5000)))
      const estado = { perfil } as Estado
      TABLAS.forEach((t, i) => {
        ;(estado[t] as unknown) = deFila(exigir(resultados[i]) as Record<string, unknown>[])
      })
      return estado
    },
    async guardar(tabla, filas) {
      if (!(filas as unknown[]).length) return
      const datos = (filas as object[]).map((f) => mapear<Record<string, unknown>>(f as Record<string, unknown>, aSnake))
      exigir(await sb.from(tabla).upsert(datos))
    },
    async eliminar(tabla, id) {
      exigir(await sb.from(tabla).delete().eq('id', id))
    },
    async actualizar(tabla, id, cambios) {
      exigir(await sb.from(tabla).update(mapear<Record<string, unknown>>(cambios, aSnake)).eq('id', id))
    },
    async actualizarPerfil(cambios) {
      // Plan, rol y fechas de premium solo los cambia el servidor (webhook / cierre de mes).
      const permitidos: (keyof Perfil)[] = ['nombre', 'diaDePago']
      const datos = Object.fromEntries(Object.entries(cambios).filter(([k]) => permitidos.includes(k as keyof Perfil)).map(([k, v]) => [aSnake(k), v]))
      const { data } = await sb.auth.getUser()
      exigir(await sb.from('perfiles').update(datos).eq('id', data.user!.id))
    },
    async subirImagen(dataUrl, id) {
      const { data } = await sb.auth.getUser()
      // Una carpeta por usuario: la política del bucket solo permite escribir en la propia.
      const ruta = `${data.user!.id}/${id}.jpg`
      exigir(await sb.storage.from('facturas').upload(ruta, await dataUrlABlob(dataUrl), { contentType: 'image/jpeg', upsert: true }))
      return ruta
    },
    async urlImagen(ref) {
      const { data } = await sb.storage.from('facturas').createSignedUrl(ref, 600)
      return data?.signedUrl ?? ''
    },
    async cerrarMes(mes) {
      // El puntaje se recalcula en el servidor (función finscore_mes): el cliente no decide la recompensa.
      const r = exigir(await sb.rpc('cerrar_mes_usuario', { p_mes: mes })) as { cierre: Record<string, unknown>; recompensa: Record<string, unknown> | null }
      return {
        cierre: mapear<CierreMes>(r.cierre, aCamel),
        recompensa: r.recompensa ? mapear<Recompensa>(r.recompensa, aCamel) : null,
      }
    },
    async iniciarPago(plan, cupon) {
      // La Edge Function calcula el monto (con el cupón validado), crea el pago y firma la integridad.
      const { data, error } = await sb.functions.invoke('wompi-firma', { body: { plan, cupon, redirectUrl: `${location.origin}/planes` } })
      if (error) throw new Error('No se pudo iniciar el pago: ' + error.message)
      const r = data as { pago: Record<string, unknown>; url: string }
      return { pago: mapear<Pago>(r.pago, aCamel), url: r.url }
    },
    async reportar(eventos) {
      // usuario_id lo pone la base de datos (auth.uid()): nadie puede reportar a nombre de otro.
      const filas = eventos.map(({ versionApp, ...e }) => ({ ...e, version_app: versionApp }))
      const { error } = await sb.from('eventos').insert(filas)
      if (error) throw new Error(error.message)
    },
    async enviarComentario(c) {
      exigir(await sb.from('comentarios').insert(c))
    },
    async versionPublicada(plataforma) {
      const { data } = await sb.from('version_app').select('codigo, nombre, url, notas, obligatoria').eq('plataforma', plataforma).maybeSingle()
      return (data as VersionPublicada | null) ?? null
    },
  }
}
