/** Descarga de archivos generados por la app (CSV de movimientos, PDF de ejemplo), en web y en Android. */
import { esNativo } from './plataforma'

/** Contenido de un Blob en base64 puro (sin el prefijo `data:…;base64,`), que es lo que pide Filesystem. */
const aBase64 = (blob: Blob) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => mal(r.error)
    r.readAsDataURL(blob)
  })

/**
 * Descarga un archivo generado por la app.
 * En el navegador usa un enlace de descarga; dentro del APK el WebView no descarga blobs, así que el
 * archivo se guarda en la caché de la app y se abre la hoja de compartir de Android (Drive, WhatsApp, Archivos…).
 */
export async function guardarArchivo(nombre: string, blob: Blob, titulo = nombre) {
  if (!esNativo) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    // Se libera la URL después de que el navegador empezó la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  // Los plugins nativos se importan solo aquí, para no cargarlos en la web.
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const { uri } = await Filesystem.writeFile({ path: nombre, data: await aBase64(blob), directory: Directory.Cache })
  try {
    await Share.share({ title: titulo, files: [uri], dialogTitle: titulo })
  } catch (e) {
    // Cerrar la hoja de compartir sin elegir nada no es un error.
    if (!/cancel/i.test((e as Error).message)) throw e
  }
}
