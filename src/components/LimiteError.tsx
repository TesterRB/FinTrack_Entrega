import { Component, type ErrorInfo, type ReactNode } from 'react'
import { registrarError } from '../lib/telemetria'

/**
 * Límite de errores (Error Boundary): evita la pantalla en blanco si una vista falla, registra el error
 * en el monitoreo y muestra un mensaje con un botón para recargar.
 * Tiene que ser una clase: React no ofrece todavía un equivalente con hooks.
 */
export class LimiteError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la vista', error)
    registrarError(error.message || 'Error en la vista', { pila: error.stack?.slice(0, 1500), componentes: info.componentStack?.slice(0, 1000) })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-16 max-w-md rounded-tarjeta border border-linea bg-superficie p-8 text-center">
        <p className="text-lg font-bold">Algo salió mal en esta sección</p>
        <p className="mt-2 text-sm text-tenue">Ya nos llegó el aviso. Recarga para seguir usando FinTrack: tus datos están a salvo.</p>
        <button className="mt-5 rounded-[10px] bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}
