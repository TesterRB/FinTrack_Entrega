/** Escáner de facturas: toma o elige la foto, la comprime y la lee con OCR en el propio dispositivo. */
import { useRef, useState } from 'react'
import { Camera, ImagePlus, RefreshCw, Wand2 } from 'lucide-react'
import { Boton, Progreso } from './ui'
import { comprimirImagen, leerComoDataUrl, ocrImagen } from '../ml/lectorDocumentos'
import { interpretarFactura } from '../ml/facturas'
import type { Aliado, DatosOcr } from '../lib/tipos'
import { hoyISO } from '../lib/formato'
import { registrarError } from '../lib/telemetria'

/** Dibuja un tiquete POS de prueba para ensayar el OCR sin tener una factura física. */
export function facturaEjemplo(aliado: Pick<Aliado, 'nombre' | 'nit'>, total: number, fecha = hoyISO()): string {
  const c = document.createElement('canvas')
  c.width = 560
  c.height = 760
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#111'
  let y = 60
  const linea = (t: string, tam = 24, centro = false, negrita = false) => {
    g.font = `${negrita ? 'bold ' : ''}${tam}px "Courier New", monospace`
    g.textAlign = centro ? 'center' : 'left'
    g.fillText(t, centro ? c.width / 2 : 36, y)
    y += tam + 14
  }
  const iva = Math.round(total * 0.08)
  linea(aliado.nombre.toUpperCase(), 26, true, true)
  linea(`NIT ${aliado.nit}`, 24, true)
  linea('Cra 100 # 11-60 Cali', 22, true)
  linea('FACTURA ELECTRONICA DE VENTA', 22, true)
  linea(`No. FE-${Math.floor(Math.random() * 90000 + 10000)}`, 22, true)
  linea(`Fecha: ${fecha}  12:41`, 22)
  linea('--------------------------------', 22)
  linea(`1 PRODUCTO PRINCIPAL   ${(total - iva - 6000).toLocaleString('es-CO')}`, 22)
  linea('1 BEBIDA                6.000', 22)
  linea(`SUBTOTAL               ${(total - iva).toLocaleString('es-CO')}`, 22)
  linea(`IMPOCONSUMO 8%         ${iva.toLocaleString('es-CO')}`, 22)
  linea('--------------------------------', 22)
  linea(`TOTAL A PAGAR  $${total.toLocaleString('es-CO')}`, 26, false, true)
  linea('Medio de pago: TARJETA', 22)
  linea('Gracias por su compra', 22, true)
  return c.toDataURL('image/png')
}

/** Foto ya comprimida (JPEG en dataURL) y los datos leídos de ella. */
export interface ResultadoEscaneo {
  imagen: string
  ocr: DatosOcr
}

/** Captura (cámara en Android / archivo en PC) + OCR en el dispositivo. */
export function EscanerFactura({ onListo, ejemplo }: { onListo: (r: ResultadoEscaneo) => void; ejemplo?: () => string }) {
  const [estado, setEstado] = useState<{ etapa: string; avance: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)

  async function procesar(dataUrl: string) {
    setError(null)
    setEstado({ etapa: 'Preparando imagen', avance: 0 })
    try {
      const imagen = await comprimirImagen(dataUrl)
      const lectura = await ocrImagen(imagen, (etapa, avance) => setEstado({ etapa, avance }))
      onListo({ imagen, ocr: interpretarFactura(lectura.texto, lectura.confianza) })
    } catch (e) {
      registrarError('Factura: no se pudo leer', { mensaje: (e as Error).message })
      setError('No pudimos leer la imagen. Prueba con otra foto, con buena luz y la factura completa.')
    } finally {
      setEstado(null)
    }
  }

  const elegir = async (f?: File) => f && procesar(await leerComoDataUrl(f))

  // Mientras lee: progreso del OCR (la primera vez descarga el modelo de idioma).

  if (estado)
    return (
      <div className="rounded-[10px] bg-elevada p-6 text-center">
        <RefreshCw className="mx-auto mb-2 animate-spin text-marca-700 dark:text-marca-300" />
        <p className="text-sm font-semibold">{estado.etapa}…</p>
        <div className="mt-3"><Progreso valor={estado.avance} /></div>
        <p className="mt-2 text-xs text-tenue">Leemos la factura aquí mismo, en tu celular. La primera vez tarda unos segundos más.</p>
      </div>
    )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Boton type="button" variante="secundario" onClick={() => camara.current?.click()}><Camera size={16} /> Tomar foto</Boton>
        <Boton type="button" variante="secundario" onClick={() => archivo.current?.click()}><ImagePlus size={16} /> Subir imagen</Boton>
      </div>
      {ejemplo && (
        <button type="button" onClick={() => procesar(ejemplo())} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-marca-700 dark:text-marca-300">
          <Wand2 size={14} /> Probar con una factura de ejemplo
        </button>
      )}
      {error && <p className="text-sm text-coral-600">{error}</p>}
      {/* capture="environment" abre directamente la cámara trasera en el celular. */}
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => elegir(e.target.files?.[0])} />
      <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => elegir(e.target.files?.[0])} />
    </div>
  )
}
