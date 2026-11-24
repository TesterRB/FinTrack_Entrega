/**
 * Raíz de la app: decide qué mostrar según el estado de la sesión y define las rutas.
 *
 *  - Sin sesión: landing (solo web), acceso y entrada directa a la demo.
 *  - Con sesión: todas las secciones dentro del `Marco` (barra superior y navegación).
 */
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp, modoBackend } from './store/app'
import { Marco } from './components/Marco'
import { LimiteError } from './components/LimiteError'
import { AvisoVersion, ErrorCarga, IntegracionNativa } from './components/Nativo'
import { esNativo, ocultarSplash } from './lib/plataforma'
import { registrarEvento } from './lib/telemetria'
import Acceso from './pages/Acceso'
import Inicio from './pages/Inicio'
import NuevaClave from './pages/NuevaClave'

// La landing solo se ve en la web y sin sesión: se carga aparte para no pesar en la app.
const Landing = lazy(() => import('./pages/Landing'))

// Las secciones se cargan por separado (la web abre más rápido), pero se precargan todas apenas el usuario entra:
// junto con las navegaciones en transición (main.tsx), cambiar de pantalla nunca muestra un indicador de carga.
const SECCIONES = {
  movimientos: () => import('./pages/Movimientos'),
  insights: () => import('./pages/Insights'),
  presupuestos: () => import('./pages/Presupuestos'),
  extractos: () => import('./pages/Extractos'),
  finscore: () => import('./pages/FinScore'),
  promociones: () => import('./pages/Promociones'),
  planes: () => import('./pages/Planes'),
  perfil: () => import('./pages/Perfil'),
  notificaciones: () => import('./pages/Notificaciones'),
  admin: () => import('./pages/Admin'),
}
const Movimientos = lazy(SECCIONES.movimientos)
const Insights = lazy(SECCIONES.insights)
const Presupuestos = lazy(SECCIONES.presupuestos)
const Extractos = lazy(SECCIONES.extractos)
const FinScore = lazy(SECCIONES.finscore)
const Promociones = lazy(SECCIONES.promociones)
const Planes = lazy(SECCIONES.planes)
const PerfilPagina = lazy(SECCIONES.perfil)
const Notificaciones = lazy(SECCIONES.notificaciones)
const Admin = lazy(SECCIONES.admin)

/** Indicador de carga centrado. */
function Cargando() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-marca-200 border-t-marca-600" />
    </div>
  )
}

/** /demo?ir=/insights entra directo al perfil de ejemplo (solo en modo demo). */
function EntrarDemo() {
  const entrar = useApp((s) => s.entrar)
  const [params] = useSearchParams()
  const navegar = useNavigate()
  useEffect(() => {
    if (modoBackend !== 'demo') {
      navegar('/entrar', { replace: true })
      return
    }
    const destino = params.get('ir') ?? '/'
    entrar('valentina.gomez@demo.fintrack', 'demo').then(() => navegar(destino.startsWith('/') ? destino : '/', { replace: true }))
  }, [entrar, navegar, params])
  return <Cargando />
}

/** Ya con sesión: /demo?ir=… y /entrar llevan directo al destino. */
function IrA() {
  const [params] = useSearchParams()
  const destino = params.get('ir') ?? '/'
  return <Navigate to={destino.startsWith('/') ? destino : '/'} replace />
}

/** `IntegracionNativa` va fuera de las rutas: escucha enlaces profundos y el botón atrás de Android en cualquier pantalla. */
export default function App() {
  return (
    <>
      <IntegracionNativa />
      <Pantallas />
    </>
  )
}

/** Elige la pantalla según el estado de la sesión (en este orden de prioridad). */
function Pantallas() {
  const { listo, autenticado, iniciar, fallaCarga, recuperandoClave } = useApp()
  const esAdmin = useApp((s) => s.datos?.perfil.rol === 'admin')
  const hayDatos = useApp((s) => !!s.datos)

  useEffect(() => {
    iniciar()
  }, [iniciar])

  // El splash nativo cubre la carga inicial; se retira cuando ya hay algo que mostrar.
  useEffect(() => {
    if (listo) void ocultarSplash()
  }, [listo])

  // Con la sesión lista, se precargan todas las secciones en segundo plano.
  useEffect(() => {
    if (!autenticado || !hayDatos) return
    const t = setTimeout(() => Object.values(SECCIONES).forEach((cargar) => void cargar().catch(() => undefined)), 400)
    return () => clearTimeout(t)
  }, [autenticado, hayDatos])

  if (!listo) return <div className="min-h-svh"><Cargando /></div>
  if (recuperandoClave) return <NuevaClave />
  if (fallaCarga) return <ErrorCarga mensaje={fallaCarga} />
  if (!autenticado || !hayDatos)
    return (
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/entrar" element={<PantallaAcceso />} />
          <Route path="/demo" element={<EntrarDemo />} />
          {/* En la app no hay página de presentación: se entra directo al acceso. */}
          <Route path="*" element={esNativo ? <Navigate to="/entrar" replace /> : <Landing />} />
        </Routes>
      </Suspense>
    )

  return (
    <LimiteError>
    <AvisoVersion />
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route element={<Marco />}>
          <Route index element={<Inicio />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route path="insights" element={<Insights />} />
          <Route path="presupuestos" element={<Presupuestos />} />
          <Route path="extractos" element={<Extractos />} />
          <Route path="finscore" element={<FinScore />} />
          <Route path="promociones" element={<Promociones />} />
          <Route path="planes" element={<Planes />} />
          <Route path="perfil" element={<PerfilPagina />} />
          <Route path="notificaciones" element={<Notificaciones />} />
          {esAdmin && <Route path="admin" element={<Admin />} />}
          <Route path="demo" element={<IrA />} />
          <Route path="entrar" element={<IrA />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
    </LimiteError>
  )
}

/** Acceso con registro de la vista (las demás pantallas lo registran desde `Marco`). */
function PantallaAcceso() {
  useEffect(() => registrarEvento('pantalla', '/entrar'), [])
  return <Acceso />
}
