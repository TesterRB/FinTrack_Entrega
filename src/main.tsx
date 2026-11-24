/** Punto de entrada: aplica el tema guardado, prepara el entorno nativo y monta la app. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Fuente incluida en la app (no depende de Google Fonts ni de tener internet al abrir el APK).
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App'
import { prepararNativo } from './lib/plataforma'
import { iniciarTelemetria } from './lib/telemetria'

// El tema se aplica antes de pintar para evitar un destello claro al abrir en modo oscuro.
// Sin preferencia guardada, se sigue la del sistema.
try {
  const tema = localStorage.getItem('fintrack-tema')
  if (tema === 'oscuro' || (!tema && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark')
} catch {
  /* sin almacenamiento: tema claro */
}

prepararNativo()
iniciarTelemetria()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* v7_startTransition: al navegar, React mantiene la pantalla actual hasta que la nueva está lista (sin indicadores de carga). */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
