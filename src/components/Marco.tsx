/**
 * Marco de la app con sesión: barra lateral (escritorio), cabecera, barra inferior (celular), transición
 * entre pantallas y gestos laterales. También es el centro de la gamificación: detecta cuándo sube el
 * FinScore o se completa un reto y dispara el estímulo correspondiente, sin que cada pantalla lo sepa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import clsx from 'clsx'
import { motion, MotionConfig } from 'motion/react'
import {
  Bell, CreditCard, FileUp, Flame, Home, LayoutList, Megaphone, PiggyBank, Plus, Shield, Sparkles, Trophy, User, Volume2, VolumeX,
} from 'lucide-react'
import { Marca } from './Logo'
import { useConteo } from './Marcador'
import { cambiarSonido, celebrar, sonidoActivo } from '../lib/estimulos'
import { useApp, modoBackend } from '../store/app'
import { useUI } from '../store/ui'
import { useAnalitica, useDatos } from '../hooks/useAnalitica'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { RegistroRapido } from './RegistroRapido'
import { GuiaReto } from './GuiaReto'
import { AnilloScore, EASE_OUT } from './ui'
import { diasEntre, hoyISO } from '../lib/formato'
import { BETA, enPrueba } from '../lib/planes'
import { registrarEvento } from '../lib/telemetria'

/** Secciones de la barra lateral de escritorio: ruta (a), texto (t) e ícono (i). */
const NAV = [
  { a: '/', t: 'Inicio', i: Home },
  { a: '/movimientos', t: 'Movimientos', i: LayoutList },
  { a: '/insights', t: 'Asistente', i: Sparkles },
  { a: '/presupuestos', t: 'Presupuestos y metas', i: PiggyBank },
  { a: '/extractos', t: 'Importar extracto', i: FileUp },
  { a: '/finscore', t: 'FinScore y retos', i: Trophy },
  { a: '/promociones', t: 'Promociones', i: Megaphone },
  { a: '/planes', t: 'Planes', i: CreditCard },
]

// Cuatro pestañas; el botón de registrar va al centro, al alcance del pulgar.
const NAV_MOVIL = [
  { a: '/', t: 'Inicio', i: Home },
  { a: '/insights', t: 'Asistente', i: Sparkles },
  { a: '/finscore', t: 'FinScore', i: Trophy },
  { a: '/perfil', t: 'Perfil', i: User },
]

/** Orden de las pestañas de la barra inferior: los gestos laterales se mueven en este orden. */
const PESTANAS = NAV_MOVIL.map((x) => x.a)

/** Donde un deslizamiento lateral es de otro elemento (carruseles, campos, gráficas) y no cambia de pantalla. */
function bloqueaGesto(el: Element | null) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches('input, textarea, select, [contenteditable="true"], [data-sin-gesto], .recharts-wrapper')) return true
    const s = getComputedStyle(n)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true
  }
  return false
}

/**
 * Gestos laterales en el celular: en las pestañas (Inicio, Asistente, FinScore, Perfil) deslizar a la izquierda
 * o a la derecha pasa a la pestaña vecina; en las demás pantallas, deslizar a la derecha vuelve atrás.
 * Se ignoran los bordes de la pantalla (ahí vive el gesto "atrás" de Android) y lo que tenga su propio scroll lateral.
 */
function useGestosLaterales(pathname: string, alVolver: () => void) {
  const navegar = useNavigate()
  useEffect(() => {
    let inicio: { x: number; y: number; t: number } | null = null
    const empezar = (e: TouchEvent) => {
      inicio = null
      if (e.touches.length !== 1 || innerWidth >= 1024) return
      const t = e.touches[0]
      // Los 28 px de cada borde son del gesto "atrás" del sistema.
      if (t.clientX < 28 || t.clientX > innerWidth - 28) return
      if (document.querySelector('[role="dialog"]') || bloqueaGesto(e.target as Element)) return
      inicio = { x: t.clientX, y: t.clientY, t: performance.now() }
    }
    const terminar = (e: TouchEvent) => {
      if (!inicio) return
      const t = e.changedTouches[0]
      const dx = t.clientX - inicio.x
      const dy = t.clientY - inicio.y
      const rapido = performance.now() - inicio.t < 700
      inicio = null
      // Claramente horizontal, con recorrido suficiente y en un gesto (no un arrastre lento).
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 2 || !rapido) return
      const i = PESTANAS.indexOf(pathname)
      if (i >= 0) {
        const j = i + (dx < 0 ? 1 : -1)
        if (j >= 0 && j < PESTANAS.length) navegar(PESTANAS[j])
      } else if (dx > 0) {
        alVolver()
        const indice = (window.history.state as { idx?: number } | null)?.idx ?? 0
        if (indice > 0) navegar(-1)
        else navegar('/', { replace: true })
      }
    }
    window.addEventListener('touchstart', empezar, { passive: true })
    window.addEventListener('touchend', terminar, { passive: true })
    return () => {
      window.removeEventListener('touchstart', empezar)
      window.removeEventListener('touchend', terminar)
    }
  }, [navegar, pathname, alVolver])
}

/** Aviso emergente (toast) sobre la barra inferior. Lo dispara `avisar()` del store. */
function Avisos() {
  const aviso = useApp((s) => s.aviso)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6">
      {aviso && (
        <motion.div
          key={aviso.texto} role="status"
          initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }}
          className={clsx(
            'pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-flotante',
            aviso.tipo === 'ok' && 'bg-noche-900 text-white',
            aviso.tipo === 'error' && 'bg-coral-600 text-white',
            aviso.tipo === 'premio' && 'bg-marca-600 text-white',
          )}
        >
          {aviso.texto}
        </motion.div>
      )}
    </div>
  )
}

/** Registra los retos semanales en cuanto se completan (suman al FinScore). */
function useRetosAutomaticos(retos: { id: string; titulo: string; completado: boolean }[], registrados: Set<string | undefined>) {
  const { registrarActividad, avisar } = useApp()
  const enviados = useRef(new Set<string>())
  const montado = useRef(performance.now())
  useEffect(() => {
    // Lo que ya estaba cumplido al abrir la app se registra en silencio: celebrar sin un gesto del usuario confunde.
    const silencioso = performance.now() - montado.current < 1500
    retos
      .filter((r) => r.completado && !registrados.has(r.id) && !enviados.current.has(r.id))
      .forEach((r) => {
        enviados.current.add(r.id)
        registrarActividad('reto_completado', r.id)
        if (!silencioso) avisar(`Reto completado: ${r.titulo}. +2,5 pts`, 'premio')
      })
  }, [retos, registrados, registrarActividad, avisar])
}

/**
 * La columna vertebral de la gamificación: cualquier acción, en cualquier pantalla, que suba el
 * FinScore dispara su estímulo aquí, proporcional a lo ganado. Las pantallas no necesitan saber de puntos.
 */
function useEstimulosDePuntaje(puntaje: number) {
  const avisar = useApp((s) => s.avisar)
  const previo = useRef<number | null>(null)
  const montado = useRef(performance.now())
  useEffect(() => {
    const antes = previo.current
    previo.current = puntaje
    // Solo celebra subidas causadas por el usuario (no la carga inicial ni las bajadas).
    if (antes === null || puntaje <= antes || performance.now() - montado.current < 1500) return
    const delta = puntaje - antes
    if (antes < 100 && puntaje >= 100) {
      celebrar('celebracion', delta)
      avisar(BETA ? '¡100 puntos! Mes perfecto: así se construye el hábito.' : '¡100 puntos! Ganaste un cupón del 30 % y 30 días Premium al cerrar el mes.', 'premio')
    } else if (antes < 85 && puntaje >= 85) {
      celebrar('celebracion', delta)
      avisar(BETA ? '¡Llegaste a 85 puntos! Vas por el mes perfecto.' : '¡Llegaste a 85! Tu cupón de descuento está asegurado este mes.', 'premio')
    } else {
      celebrar(delta >= 5 ? 'logro' : 'chispa', delta)
    }
  }, [puntaje, avisar])
}

/** Chip de racha y puntos para la cabecera del celular: la racha siempre a la vista. */
function ChipRacha({ puntaje, racha }: { puntaje: number; racha: number }) {
  const n = useConteo(puntaje)
  return (
    <NavLink to="/finscore" data-destino-puntos className="tocable flex h-10 items-center gap-2 rounded-full bg-superficie pl-1.5 pr-3 shadow-suave" aria-label={`FinScore ${puntaje}, racha de ${racha} días`}>
      <span className="num grid h-7 min-w-7 place-items-center rounded-full bg-marca-600 px-1.5 text-xs font-bold text-white">{n}</span>
      <span className="flex items-center gap-0.5 text-sm font-bold text-amber-600"><Flame size={16} className="fill-amber-400 text-amber-500" />{racha}</span>
    </NavLink>
  )
}

/** Tarjeta del FinScore en la barra lateral de escritorio: siempre visible, destino de los puntos. */
function TarjetaFinScore({ puntaje, racha }: { puntaje: number; racha: number }) {
  const n = useConteo(puntaje)
  const meta = puntaje >= 85 ? 100 : 85
  return (
    <NavLink to="/finscore" data-destino-puntos className="tocable mt-4 flex items-center gap-3 rounded-3xl bg-marca-600 p-4 text-white shadow-boton">
      <AnilloScore valor={puntaje} tam={56} grosor={6} color="#ffffff"><span className="num text-base font-extrabold">{n}</span></AnilloScore>
      <div className="min-w-0 text-sm leading-tight">
        <p className="font-bold">FinScore del mes</p>
        <p className="mt-0.5 text-white/80">{puntaje >= 100 ? '¡Mes perfecto!' : `${meta - puntaje} pts para ${meta === 85 ? 'tu cupón' : 'el mes gratis'}`}</p>
        <p className="mt-1 flex items-center gap-1 font-semibold text-amber-200"><Flame size={14} className="fill-amber-300 text-amber-300" /> {racha} días seguidos</p>
      </div>
    </NavLink>
  )
}

/** Contenedor de todas las pantallas con sesión (las rutas hijas se pintan en `useOutlet`). */
export function Marco() {
  const d = useDatos()
  const { finscore, retos, racha } = useAnalitica()
  const { noLeidas } = useNotificaciones()
  const [sonido, setSonido] = useState(sonidoActivo)
  const registrados = useMemo(() => new Set(d.actividades.filter((x) => x.tipo === 'reto_completado').map((x) => x.ref)), [d.actividades])
  useRetosAutomaticos(retos.retos, registrados)
  useEstimulosDePuntaje(finscore.total)
  const abrirRegistro = useUI((s) => s.abrirRegistro)
  const { pathname } = useLocation()
  const salida = useOutlet()

  // Dirección de la transición: entre pestañas, según su orden (la nueva entra desde su lado); al volver, desde la izquierda.
  const volviendo = useRef(false)
  const alVolver = useCallback(() => {
    volviendo.current = true
  }, [])
  useGestosLaterales(pathname, alVolver)
  // Se calcula durante el render (no en un efecto) para que la pantalla nueva ya entre con la dirección correcta.
  const anterior = useRef(pathname)
  const direccion = useRef(0)
  if (anterior.current !== pathname) {
    const a = PESTANAS.indexOf(anterior.current)
    const b = PESTANAS.indexOf(pathname)
    direccion.current = a >= 0 && b >= 0 ? Math.sign(b - a) : volviendo.current ? -1 : 0
    volviendo.current = false
    anterior.current = pathname
  }
  const perfil = d.perfil
  const diasPrueba = !BETA && enPrueba(perfil) ? diasEntre(hoyISO(), perfil.pruebaHasta) : null
  const pendientesAdmin = perfil.rol === 'admin' ? d.facturas.filter((f) => f.estado === 'pendiente').length : 0
  const iniciales = perfil.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const nombre = perfil.nombre.split(' ')[0]

  // Cada pantalla nueva empieza arriba y queda registrada en el monitoreo.
  useEffect(() => {
    window.scrollTo(0, 0)
    registrarEvento('pantalla', pathname)
  }, [pathname])

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-suelo text-tinta">
        {/* Barra lateral de escritorio */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col px-4 py-6 lg:flex">
          <div className="mb-8 px-3"><Marca tam={36} /></div>
          <nav className="flex-1 space-y-1" aria-label="Navegación">
            {[...NAV, ...(perfil.rol === 'admin' ? [{ a: '/admin', t: 'Panel de aliados', i: Shield }] : [])].map(({ a, t, i: I }) => {
              const activo = a === '/' ? pathname === '/' : pathname.startsWith(a)
              return (
                <NavLink key={a} to={a} end={a === '/'} className={clsx('relative flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition-colors duration-200', activo ? 'text-marca-700 dark:text-white' : 'text-tenue hover:text-tinta')}>
                  {activo && <motion.span layoutId="nav-activo" className="absolute inset-0 rounded-2xl bg-superficie shadow-suave dark:bg-marca-500/20 dark:shadow-none" transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }} />}
                  <I size={20} className="relative" />
                  <span className="relative">{t}</span>
                  {a === '/admin' && pendientesAdmin > 0 && <span className="relative ml-auto rounded-full bg-coral-600 px-2 text-xs font-bold text-white">{pendientesAdmin}</span>}
                </NavLink>
              )
            })}
          </nav>
          <TarjetaFinScore puntaje={finscore.total} racha={racha} />
        </aside>

        <div className="overflow-x-clip lg:pl-[264px]">
          {/* Cabecera */}
          <header className="sticky top-0 z-20 bg-suelo/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
            <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-5 py-3 lg:px-8 lg:py-5">
              <div className="min-w-0 flex-1">
                <div className="lg:hidden"><Marca tam={32} className="max-[379px]:[&>span:last-child]:hidden" /></div>
                <div className="hidden lg:block">
                  <p className="text-[15px] text-tenue">Hola, {nombre}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    {diasPrueba !== null && <span className="rounded-full bg-menta-100 px-2.5 py-0.5 font-semibold text-menta-600 dark:bg-menta-500/15 dark:text-menta-400">Prueba Premium · {diasPrueba} días</span>}
                    {BETA && modoBackend === 'supabase' && <span className="rounded-full bg-marca-50 px-2.5 py-0.5 font-semibold text-marca-700 dark:bg-marca-500/20 dark:text-marca-200">Versión de prueba</span>}
                    {modoBackend === 'demo' && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Modo demo</span>}
                  </p>
                </div>
              </div>
              <div className="lg:hidden"><ChipRacha puntaje={finscore.total} racha={racha} /></div>
              <button
                onClick={() => { const v = !sonido; setSonido(v); cambiarSonido(v) }}
                className="tocable hidden h-11 w-11 place-items-center rounded-full text-tenue hover:bg-superficie sm:grid"
                aria-label={sonido ? 'Silenciar sonidos' : 'Activar sonidos'} aria-pressed={sonido}
              >
                {sonido ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
              <NavLink to="/notificaciones" className="tocable relative grid h-11 w-11 place-items-center rounded-full text-tinta hover:bg-superficie" aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}>
                <Bell size={21} />
                {noLeidas > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-coral-500 ring-2 ring-[rgb(var(--suelo))]" />}
              </NavLink>
              <button onClick={() => abrirRegistro('gasto')} className="tocable hidden h-11 items-center gap-2 rounded-full bg-marca-600 px-5 text-[15px] font-semibold text-white shadow-boton hover:bg-marca-700 lg:flex">
                <Plus size={18} /> Registrar
              </button>
              <NavLink to="/perfil" className="tocable grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-marca-300 to-marca-600 text-sm font-bold text-white" aria-label="Perfil">
                {iniciales || <User size={18} />}
              </NavLink>
            </div>
          </header>

          <main className="mx-auto max-w-[1180px] px-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-2 lg:px-8 lg:pb-12">
            {/* Transición entre pantallas: corta y solo de entrada (se navega muchas veces al día). */}
            <motion.div
              key={pathname}
              initial={direccion.current ? { opacity: 0, x: direccion.current * 48 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              {salida}
            </motion.div>
          </main>
        </div>

        {/* Barra inferior (celular / Android) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 rounded-t-[28px] bg-superficie px-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgba(30,27,75,.18)] lg:hidden" aria-label="Navegación">
          <div className="mx-auto grid max-w-md grid-cols-5 items-center pt-2">
            {NAV_MOVIL.slice(0, 2).map((x) => <Pestana key={x.a} {...x} pathname={pathname} />)}
            <button onClick={() => abrirRegistro('gasto')} className="tocable mx-auto -mt-7 grid h-[60px] w-[60px] place-items-center rounded-full bg-marca-600 text-white shadow-boton ring-[6px] ring-suelo" aria-label="Registrar movimiento">
              <Plus size={28} strokeWidth={2.5} />
            </button>
            {NAV_MOVIL.slice(2).map((x) => <Pestana key={x.a} {...x} pathname={pathname} />)}
          </div>
        </nav>

        <RegistroRapido />
        <GuiaReto />
        <Avisos />
      </div>
    </MotionConfig>
  )
}

/** Pestaña de la barra inferior; la píldora de la activa se desliza entre pestañas (layoutId). */
function Pestana({ a, t, i: I, pathname }: { a: string; t: string; i: typeof Home; pathname: string }) {
  const activo = a === '/' ? pathname === '/' : pathname.startsWith(a)
  return (
    <NavLink to={a} end={a === '/'} className="relative mx-auto flex h-[60px] w-full max-w-[76px] flex-col items-center justify-center gap-1">
      {activo && <motion.span layoutId="pestana-activa" className="absolute inset-x-1 inset-y-1.5 rounded-2xl bg-marca-50 dark:bg-marca-500/20" transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }} />}
      <I size={22} className={clsx('relative transition-colors duration-200', activo ? 'text-marca-600 dark:text-marca-200' : 'text-tenue')} strokeWidth={activo ? 2.4 : 2} />
      <span className={clsx('relative text-[11px] font-semibold transition-colors duration-200', activo ? 'text-marca-700 dark:text-white' : 'text-tenue')}>{t}</span>
    </NavLink>
  )
}
