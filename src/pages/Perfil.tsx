/**
 * Perfil: datos de la cuenta y día de pago, accesos a las secciones, preferencias (tema y sonido),
 * comentarios para el equipo, cerrar sesión y, en modo demo, reiniciar los datos de ejemplo.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, Database, FileUp, LayoutList, LogOut, Megaphone, MessageSquareText, Moon, PiggyBank, RotateCcw, Send, Shield, Sun } from 'lucide-react'
import { useDatos } from '../hooks/useAnalitica'
import { useApp, modoBackend } from '../store/app'
import { Boton, Campo, Segmentado, Tarjeta, Titulo, claseInput } from '../components/ui'
import { reiniciarDemo } from '../data/backendDemo'
import { BETA, planEfectivo } from '../lib/planes'
import { backend } from '../data'
import type { ComentarioApp } from '../data/backend'
import { infoDispositivo, VERSION_APP } from '../lib/plataforma'
import { registrarError, registrarEvento } from '../lib/telemetria'

/** Canal directo de los probadores de la beta: llega a la tabla `comentarios` de Supabase. */
function Comentarios() {
  const avisar = useApp((s) => s.avisar)
  const [tipo, setTipo] = useState<ComentarioApp['tipo']>('idea')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (mensaje.trim().length < 3) return
    setEnviando(true)
    try {
      const contexto = await infoDispositivo().catch(() => ({}))
      await backend.enviarComentario({ tipo, mensaje: mensaje.trim(), pantalla: '/perfil', contexto: { ...contexto, version: VERSION_APP } })
      registrarEvento('accion', 'comentario_enviado', { tipo })
      setMensaje('')
      avisar('¡Gracias! Leemos cada comentario.')
    } catch (err) {
      registrarError('Comentario no enviado', { mensaje: (err as Error).message })
      avisar('No se pudo enviar tu comentario. Revisa tu conexión e inténtalo de nuevo.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <Titulo><span className="flex items-center gap-2"><MessageSquareText size={18} className="text-marca-500" /> Cuéntanos cómo te va</span></Titulo>
      <p className="-mt-1 mb-4 text-[15px] text-tenue">Estás probando una versión anticipada de FinTrack. Si algo falla o se te ocurre una mejora, escríbenos aquí.</p>
      <form onSubmit={enviar} className="space-y-3">
        <Segmentado
          etiqueta="Tipo de comentario" valor={tipo} onCambio={setTipo}
          opciones={[{ valor: 'error', etiqueta: 'Algo falla' }, { valor: 'idea', etiqueta: 'Una idea' }, { valor: 'otro', etiqueta: 'Otro' }]}
        />
        <textarea
          required minLength={3} maxLength={2000} rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
          placeholder={tipo === 'error' ? '¿Qué estabas haciendo y qué pasó?' : '¿Qué te gustaría que hiciera FinTrack?'}
          className={`${claseInput} h-auto resize-none py-3 leading-relaxed`}
        />
        <Boton type="submit" className="w-full" cargando={enviando} disabled={mensaje.trim().length < 3}><Send size={17} /> Enviar comentario</Boton>
      </form>
    </Tarjeta>
  )
}

export default function Perfil() {
  const d = useDatos()
  const { actualizarPerfil, salir, avisar } = useApp()
  const [nombre, setNombre] = useState(d.perfil.nombre)
  const [dia, setDia] = useState(d.perfil.diaDePago)
  const [oscuro, setOscuro] = useState(document.documentElement.classList.contains('dark'))

  function cambiarTema() {
    const nuevo = !oscuro
    setOscuro(nuevo)
    document.documentElement.classList.toggle('dark', nuevo)
    try {
      localStorage.setItem('fintrack-tema', nuevo ? 'oscuro' : 'claro')
    } catch {
      /* sin almacenamiento */
    }
  }

  const enlaces = [
    { a: '/movimientos', t: 'Movimientos', i: LayoutList },
    { a: '/presupuestos', t: 'Presupuestos y metas', i: PiggyBank },
    { a: '/extractos', t: 'Importar extracto', i: FileUp },
    { a: '/promociones', t: 'Promociones', i: Megaphone },
    { a: '/planes', t: 'Planes', i: CreditCard },
    ...(d.perfil.rol === 'admin' ? [{ a: '/admin', t: 'Panel de aliados', i: Shield }] : []),
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold">Perfil</h1>

      <Tarjeta>
        <div className="mb-5 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-marca-100 text-xl font-bold text-marca-800">{d.perfil.nombre.slice(0, 1).toUpperCase()}</span>
          <div>
            <p className="text-lg font-bold">{d.perfil.nombre}</p>
            <p className="text-sm text-tenue">{d.perfil.email}</p>
            <p className="text-xs font-semibold text-marca-700 dark:text-marca-300">{BETA ? 'Todo desbloqueado mientras probamos la app' : `Plan ${planEfectivo(d.perfil) === 'pro' ? 'Pro' : planEfectivo(d.perfil) === 'plus' ? 'Plus' : 'Starter'}`}</p>
          </div>
        </div>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={async (e) => { e.preventDefault(); await actualizarPerfil({ nombre, diaDePago: dia }); avisar('Perfil actualizado') }}
        >
          <Campo etiqueta="Nombre"><input className={claseInput} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
          <Campo etiqueta="Día en que recibes tu ingreso" ayuda="Lo usamos para calcular cómo podría cerrar tu mes.">
            <input type="number" min={1} max={31} className={claseInput} value={dia} onChange={(e) => setDia(Number(e.target.value))} />
          </Campo>
          <div className="sm:col-span-2"><Boton type="submit">Guardar</Boton></div>
        </form>
      </Tarjeta>

      <Tarjeta className="lg:hidden">
        <Titulo>Secciones</Titulo>
        <ul className="-mx-2">
          {enlaces.map(({ a, t, i: I }) => (
            <li key={a}><Link to={a} className="flex items-center gap-3 rounded-[10px] px-2 py-3 text-sm font-semibold hover:bg-elevada"><I size={18} className="text-marca-700 dark:text-marca-300" /> <span className="flex-1">{t}</span> <ChevronRight size={16} className="text-slate-300" /></Link></li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta>
        <Titulo>Preferencias</Titulo>
        <button onClick={cambiarTema} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-3 text-left text-sm font-semibold hover:bg-elevada">
          {oscuro ? <Sun size={18} /> : <Moon size={18} />} <span className="flex-1">Tema {oscuro ? 'claro' : 'oscuro'}</span>
        </button>
        <div className="flex items-center gap-3 rounded-[10px] px-2 py-3 text-sm">
          <Database size={18} />
          <span className="flex-1">
            <b>Tus datos:</b> {modoBackend === 'demo' ? 'perfil de ejemplo, guardado solo aquí' : 'guardados en tu cuenta; los ves en cualquier celular donde entres'}
          </span>
        </div>
        <p className="px-2 text-xs text-tenue">
          Tu asistente clasifica tus gastos, lee tus facturas y hace sus cálculos aquí mismo, en tu celular: tus documentos no se comparten con nadie.
          {modoBackend === 'supabase' && ' Mientras probamos la app registramos qué pantallas usas y si algo falla (nunca tus montos ni tus movimientos) para mejorarla.'}
        </p>
      </Tarjeta>

      {modoBackend === 'supabase' && <Comentarios />}

      <div className="flex flex-wrap gap-2">
        {modoBackend === 'demo' && (
          <Boton variante="secundario" onClick={() => { if (confirm('¿Borrar los datos de la demo y empezar de nuevo?')) { reiniciarDemo(); location.href = '/' } }}>
            <RotateCcw size={16} /> Reiniciar demo
          </Boton>
        )}
        <Boton variante="peligro" onClick={salir}><LogOut size={16} /> Cerrar sesión</Boton>
      </div>
      <p className="pb-2 text-center text-xs text-tenue">FinTrack · versión {VERSION_APP}</p>
    </div>
  )
}
