/** Punto de entrada de la capa de datos: decide qué backend usa la app según las variables de entorno. */
import type { Backend } from './backend'
import { crearBackendDemo } from './backendDemo'
import { crearBackendSupabase } from './backendSupabase'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Con las variables de Supabase se usa la nube; sin ellas, la app corre en modo demo.
 * El valor de ejemplo de `.env.example` (`TU-PROYECTO`) también cuenta como "sin configurar".
 */
export const backend: Backend = url && anon && !url.includes('TU-PROYECTO') ? crearBackendSupabase(url, anon) : crearBackendDemo()

export type { Backend, Estado, Tabla } from './backend'
