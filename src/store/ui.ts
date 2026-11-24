/**
 * Estado de interfaz compartido entre pantallas: la hoja de registro rápido
 * (`components/RegistroRapido.tsx`), que se abre desde el botón "+" de cualquier pantalla.
 */
import { create } from 'zustand'
import type { Movimiento } from '../lib/tipos'

interface UI {
  /** `editar` trae el movimiento a modificar; null para uno nuevo. */
  registro: { abierto: boolean; tipo: 'gasto' | 'ingreso'; editar: Movimiento | null }
  abrirRegistro(tipo?: 'gasto' | 'ingreso', editar?: Movimiento | null): void
  cerrarRegistro(): void
}

export const useUI = create<UI>((set) => ({
  registro: { abierto: false, tipo: 'gasto', editar: null },
  abrirRegistro: (tipo = 'gasto', editar = null) => set({ registro: { abierto: true, tipo, editar } }),
  // Al cerrar se conserva el resto del estado para que la hoja no cambie de contenido durante su animación de salida.
  cerrarRegistro: () => set((s) => ({ registro: { ...s.registro, abierto: false } })),
}))
