import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { useApp } from '../store/app'
import { Boton, Campo, claseInput } from '../components/ui'
import { Marca } from '../components/Logo'
import { registrarError } from '../lib/telemetria'

/** Se muestra al abrir el enlace de "¿Olvidaste tu contraseña?": la sesión ya existe, falta la clave nueva. */
export default function NuevaClave() {
  const cambiarClave = useApp((s) => s.cambiarClave)
  const salir = useApp((s) => s.salir)
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (clave !== repetir) return setFallo('Las contraseñas no coinciden.')
    setGuardando(true)
    setFallo(null)
    try {
      await cambiarClave(clave)
    } catch (err) {
      setFallo((err as Error).message)
      registrarError('Recuperación: no se pudo cambiar la contraseña', { mensaje: (err as Error).message })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-suelo px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] text-tinta">
      <div className="w-full max-w-sm">
        <div className="mb-10"><Marca tam={34} /></div>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-superficie text-marca-600 shadow-suave"><KeyRound size={24} /></span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.03em]">Crea tu nueva contraseña</h1>
        <p className="mt-2 text-[15px] text-tenue">Úsala la próxima vez que entres con tu correo.</p>

        <form onSubmit={guardar} className="mt-7 space-y-4">
          <Campo etiqueta="Contraseña nueva" ayuda="Mínimo 8 caracteres.">
            <div className="relative">
              <input
                required minLength={8} type={ver ? 'text' : 'password'} autoComplete="new-password" enterKeyHint="next"
                className={`${claseInput} pr-12`} value={clave} onChange={(e) => setClave(e.target.value)}
              />
              <button
                type="button" onClick={() => setVer(!ver)}
                className="absolute inset-y-0 right-1 my-auto grid h-10 w-10 place-items-center rounded-full text-tenue"
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver}
              >
                {ver ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Campo>
          <Campo etiqueta="Repite la contraseña">
            <input
              required minLength={8} type={ver ? 'text' : 'password'} autoComplete="new-password" enterKeyHint="done"
              className={claseInput} value={repetir} onChange={(e) => setRepetir(e.target.value)}
            />
          </Campo>
          {fallo && <p className="text-sm text-coral-600 dark:text-[#ff8a9b]" role="alert">{fallo}</p>}
          <Boton type="submit" className="w-full !rounded-full !py-3" cargando={guardando}>Guardar y entrar</Boton>
        </form>
        <button className="mt-6 w-full text-center text-sm font-semibold text-tenue" onClick={() => void salir()}>Cancelar</button>
      </div>
    </div>
  )
}
