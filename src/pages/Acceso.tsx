/**
 * Pantalla de acceso: iniciar sesión, crear cuenta, entrar con Google y recuperar la contraseña.
 * En modo demo cualquier correo entra al perfil de ejemplo.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, MailCheck } from 'lucide-react'
import { useApp, modoBackend } from '../store/app'
import { Boton, Campo, claseInput } from '../components/ui'
import { Logo, Marca } from '../components/Logo'
import { esNativo } from '../lib/plataforma'
import { BETA } from '../lib/planes'
import { registrarError } from '../lib/telemetria'

type Modo = 'entrar' | 'registro' | 'recuperar'

/** "G" oficial de Google (colores de la marca, según sus pautas para botones de acceso). */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** Supabase permite un correo cada 60 s por dirección: el botón espera lo mismo. */
function useEspera() {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (!segundos) return
    const t = setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [segundos])
  return [segundos, () => setSegundos(60)] as const
}

/** Aviso de "revisa tu correo" con reenvío. Sirve para la confirmación y para la recuperación. */
function CorreoEnviado({ titulo, texto, onReenviar }: { titulo: string; texto: string; onReenviar: () => Promise<void> }) {
  const [espera, empezarEspera] = useEspera()
  const [reenviando, setReenviando] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  useEffect(empezarEspera, []) // eslint-disable-line react-hooks/exhaustive-deps -- el primer correo acaba de salir
  return (
    <div className="mt-6 rounded-2xl bg-menta-100 p-4 text-sm text-menta-600 dark:bg-menta-500/15 dark:text-menta-400" role="status">
      <p className="flex items-center gap-2 font-semibold"><MailCheck size={18} /> {titulo}</p>
      <p className="mt-1.5 leading-relaxed">{texto}</p>
      <p className="mt-2 leading-relaxed">¿No te llegó? Revisa la carpeta de spam o promociones.</p>
      <button
        type="button" disabled={espera > 0 || reenviando}
        className="mt-3 font-semibold underline underline-offset-2 disabled:no-underline disabled:opacity-60"
        onClick={async () => {
          setReenviando(true)
          setEstado(null)
          try {
            await onReenviar()
            setEstado('Te enviamos otro correo.')
            empezarEspera()
          } catch (err) {
            setEstado((err as Error).message)
          } finally {
            setReenviando(false)
          }
        }}
      >
        {espera > 0 ? `Reenviar en ${espera} s` : reenviando ? 'Enviando…' : 'Reenviar el correo'}
      </button>
      {estado && <p className="mt-1.5">{estado}</p>}
    </div>
  )
}

export default function Acceso() {
  const { entrar, registrar, entrarConGoogle, recuperarClave, reenviarConfirmacion, error, esperandoGoogle } = useApp()
  const [params] = useSearchParams()
  const [modo, setModo] = useState<Modo>(params.get('modo') === 'registro' ? 'registro' : 'entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [cargandoGoogle, setCargandoGoogle] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<'confirmacion' | 'recuperacion' | null>(null)
  const [reenvioLogin, setReenvioLogin] = useState<string | null>(null)

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo)
    setEnviado(null)
    setFallo(null)
    setReenvioLogin(null)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setFallo(null)
    setReenvioLogin(null)
    try {
      if (modo === 'entrar') await entrar(email, clave)
      else if (modo === 'recuperar') {
        await recuperarClave(email)
        setEnviado('recuperacion')
      } else if ((await registrar(nombre, email, clave)).confirmar) setEnviado('confirmacion')
    } catch (err) {
      setFallo((err as Error).message)
      registrarError(modo === 'entrar' ? 'Acceso: correo fallido' : modo === 'recuperar' ? 'Recuperación: fallida' : 'Registro: fallido', { mensaje: (err as Error).message })
    } finally {
      setCargando(false)
    }
  }

  async function conGoogle() {
    setCargandoGoogle(true)
    setFallo(null)
    try {
      await entrarConGoogle()
    } catch (err) {
      setFallo((err as Error).message)
      registrarError('Google: no se pudo abrir', { mensaje: (err as Error).message })
    } finally {
      setCargandoGoogle(false)
    }
  }

  const titulos: Record<Modo, [string, string]> = {
    entrar: ['Bienvenido de nuevo', 'Tu racha te está esperando.'],
    registro: ['Crea tu cuenta', BETA ? 'Acceso anticipado: todo FinTrack gratis mientras lo probamos.' : 'Empieza con 30 días de Premium gratis.'],
    recuperar: ['Recupera tu contraseña', 'Te enviaremos un enlace para crear una nueva.'],
  }
  const mensajeError = fallo || error
  // Correo sin confirmar al iniciar sesión: se ofrece reenviar el enlace ahí mismo.
  const sinConfirmar = modo === 'entrar' && !!fallo?.startsWith('Confirma tu correo')
  const enlaceEnCelular = esNativo ? 'Ábrelo desde este celular' : 'Ábrelo en este mismo navegador'

  return (
    <div className="grid min-h-svh grid-cols-1 bg-suelo text-tinta lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-marca-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="relative flex items-center gap-2 text-sm font-semibold text-white/85 hover:text-white"><ArrowLeft size={16} /> Volver al inicio</Link>
        <div className="relative max-w-lg">
          <h1 className="text-[clamp(2.6rem,4.4vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">Anota el gasto. Gana el mes.</h1>
          <p className="mt-6 text-lg text-white/85">Tus primeros 30 días tienen todo desbloqueado. Llega a 85 puntos de FinScore y tu primer cupón es tuyo.</p>
        </div>
        {/* El símbolo a gran escala, recortado por el borde: la marca como paisaje. */}
        <Logo tam={520} className="pointer-events-none absolute -bottom-40 -right-32 text-white/10" />
        <p className="relative text-sm text-white/70">FinTrack · finanzas personales para Colombia</p>
      </section>

      <section className="flex items-center justify-center px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="w-full max-w-sm">
          {/* En la app no hay página de inicio a la cual volver: el logo es solo marca. */}
          {esNativo ? (
            <div className="mb-10"><Marca tam={34} /></div>
          ) : (
            <Link to="/" className="mb-10 inline-block lg:hidden" aria-label="Volver al inicio"><Marca tam={34} /></Link>
          )}
          <h2 className="text-3xl font-extrabold tracking-[-0.03em]">{titulos[modo][0]}</h2>
          <p className="mt-2 text-[15px] text-tenue">{titulos[modo][1]}</p>

          {modoBackend === 'demo' && (
            <p className="mt-6 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
              Modo demo: los datos se guardan solo aquí. «Entrar» con cualquier correo carga un perfil de ejemplo con 4 meses de
              movimientos; «Crear cuenta» empieza vacío.
            </p>
          )}

          {enviado === 'confirmacion' ? (
            <CorreoEnviado
              titulo="Confirma tu correo"
              texto={`Te enviamos un enlace a ${email.trim()}. ${enlaceEnCelular} y entrarás directo a FinTrack. Si lo abres en otro celular o en un computador, tu cuenta igual queda confirmada: vuelve aquí e inicia sesión.`}
              onReenviar={() => reenviarConfirmacion(email)}
            />
          ) : enviado === 'recuperacion' ? (
            <CorreoEnviado
              titulo="Revisa tu correo"
              texto={`Si existe una cuenta con ${email.trim()}, te llegará un enlace para crear una contraseña nueva. ${enlaceEnCelular}: por seguridad, el enlace solo funciona donde lo pediste.`}
              onReenviar={() => recuperarClave(email)}
            />
          ) : (
            <>
              {modo !== 'recuperar' && (
                <>
                  <button
                    type="button"
                    onClick={conGoogle}
                    disabled={cargandoGoogle || esperandoGoogle}
                    className="tocable mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-superficie text-[15px] font-semibold text-tinta shadow-suave ring-1 ring-linea transition-opacity disabled:opacity-70 dark:shadow-none"
                  >
                    {cargandoGoogle || esperandoGoogle ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-marca-200 border-t-marca-600" /> : <LogoGoogle />}
                    {esperandoGoogle ? 'Esperando a Google…' : 'Continuar con Google'}
                  </button>

                  <div className="my-6 flex items-center gap-3 text-[13px] font-medium text-tenue" role="separator">
                    <span className="h-px flex-1 bg-linea" /> o con tu correo <span className="h-px flex-1 bg-linea" />
                  </div>
                </>
              )}

              <form onSubmit={enviar} className={modo === 'recuperar' ? 'mt-7 space-y-4' : 'space-y-4'}>
                {modo === 'registro' && (
                  <Campo etiqueta="Nombre"><input required className={claseInput} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" autoCapitalize="words" enterKeyHint="next" /></Campo>
                )}
                <Campo etiqueta="Correo">
                  <input
                    required type="email" inputMode="email" className={claseInput} value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint={modo === 'recuperar' ? 'send' : 'next'}
                  />
                </Campo>
                {modo !== 'recuperar' && (
                  <Campo etiqueta="Contraseña" ayuda={modo === 'registro' && modoBackend === 'supabase' ? 'Mínimo 8 caracteres.' : undefined}>
                    <div className="relative">
                      <input
                        required type={verClave ? 'text' : 'password'} minLength={modoBackend === 'demo' ? 1 : 8}
                        className={`${claseInput} pr-12`} value={clave} onChange={(e) => setClave(e.target.value)}
                        autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} enterKeyHint="go"
                      />
                      <button
                        type="button" onClick={() => setVerClave(!verClave)}
                        className="absolute inset-y-0 right-1 my-auto grid h-10 w-10 place-items-center rounded-full text-tenue"
                        aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verClave}
                      >
                        {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Campo>
                )}
                {modo === 'entrar' && modoBackend === 'supabase' && (
                  <div className="-mt-1 text-right">
                    <button type="button" className="text-sm font-semibold text-marca-600 dark:text-marca-300" onClick={() => cambiarModo('recuperar')}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}
                {mensajeError && (
                  <div className="text-sm text-coral-600 dark:text-[#ff8a9b]" role="alert">
                    <p>{mensajeError}</p>
                    {sinConfirmar && (
                      <button
                        type="button" className="mt-1 font-semibold underline underline-offset-2"
                        onClick={async () => {
                          try {
                            await reenviarConfirmacion(email)
                            setReenvioLogin('Te enviamos otro enlace de confirmación.')
                          } catch (err) {
                            setReenvioLogin((err as Error).message)
                          }
                        }}
                      >
                        Reenviar el enlace de confirmación
                      </button>
                    )}
                    {reenvioLogin && <p className="mt-1 text-tenue">{reenvioLogin}</p>}
                  </div>
                )}
                <Boton type="submit" className="w-full !rounded-full !py-3" cargando={cargando}>
                  {modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace'}
                </Boton>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-sm text-tenue">
            {modo === 'recuperar' ? (
              <button className="font-semibold text-marca-600 dark:text-marca-300" onClick={() => cambiarModo('entrar')}>Volver a iniciar sesión</button>
            ) : (
              <>
                {modo === 'entrar' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button className="font-semibold text-marca-600 dark:text-marca-300" onClick={() => cambiarModo(modo === 'entrar' ? 'registro' : 'entrar')}>
                  {modo === 'entrar' ? 'Regístrate' : 'Inicia sesión'}
                </button>
              </>
            )}
          </p>
          {BETA && modoBackend === 'supabase' && (
            <p className="mt-8 text-center text-xs text-tenue">Versión de prueba · tus datos se guardan de forma segura en tu cuenta.</p>
          )}
        </div>
      </section>
    </div>
  )
}
