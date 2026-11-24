/**
 * Lectura de documentos en el dispositivo: pdf.js para PDFs digitales y Tesseract (OCR)
 * para fotos y PDFs escaneados. Ambos se cargan bajo demanda para no inflar el bundle inicial.
 * Nada se envía a un servidor: el documento se procesa en el navegador o en el WebView.
 */

export interface LecturaDocumento {
  texto: string
  confianza: number // 0-100
  metodo: 'pdf-texto' | 'ocr'
}

/** Callback de progreso para la interfaz: etapa legible y avance de 0 a 1. */
type Progreso = (etapa: string, avance: number) => void

/** Carga pdf.js y su worker (Vite entrega la URL del worker con el sufijo `?url`). */
async function cargarPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** OCR en español de una imagen (File, dataURL o canvas). */
export async function ocrImagen(imagen: File | string | HTMLCanvasElement, progreso?: Progreso): Promise<LecturaDocumento> {
  // Tesseract descarga el modelo de español la primera vez que se usa.
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, {
    logger: (m: { status: string; progress: number }) => progreso?.(m.status === 'recognizing text' ? 'Leyendo texto' : 'Preparando OCR', m.progress),
  })
  try {
    const { data } = await worker.recognize(imagen)
    return { texto: data.text, confianza: data.confidence, metodo: 'ocr' }
  } finally {
    await worker.terminate()
  }
}

/**
 * Extrae el texto de un PDF reconstruyendo las líneas por coordenada Y.
 * Si el PDF no tiene capa de texto (escaneado), renderiza cada página y aplica OCR.
 */
export async function leerPdf(archivo: File, progreso?: Progreso): Promise<LecturaDocumento> {
  const pdfjs = await cargarPdfjs()
  const doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise
  const lineas: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    progreso?.('Leyendo PDF', p / doc.numPages)
    const pagina = await doc.getPage(p)
    const contenido = await pagina.getTextContent()
    const filas = new Map<number, { x: number; s: string }[]>()
    for (const item of contenido.items) {
      if (!('str' in item) || !item.str.trim()) continue
      // transform[5] es la coordenada Y del texto. Se redondea a múltiplos de 3 para que los trozos
      // de una misma línea, con pequeñas diferencias de altura, queden juntos.
      const y = Math.round(item.transform[5] / 3) * 3
      filas.set(y, [...(filas.get(y) ?? []), { x: item.transform[4], s: item.str }])
    }
    // En PDF la Y crece hacia arriba: de mayor a menor = de arriba hacia abajo. Dentro de cada línea, de izquierda a derecha.
    ;[...filas.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => lineas.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join('  ')))
  }
  const texto = lineas.join('\n')
  // Con texto suficiente el PDF es digital; si casi no hay, es una imagen escaneada.
  if (texto.replace(/\s/g, '').length > 80) return { texto, confianza: 100, metodo: 'pdf-texto' }

  // PDF escaneado: OCR página por página.
  const partes: string[] = []
  let conf = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p)
    // Escala 2: más resolución mejora bastante el OCR.
    const vista = pagina.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = vista.width
    canvas.height = vista.height
    await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport: vista }).promise
    const r = await ocrImagen(canvas, (e, a) => progreso?.(`${e} (página ${p}/${doc.numPages})`, a))
    partes.push(r.texto)
    conf += r.confianza
  }
  return { texto: partes.join('\n'), confianza: conf / doc.numPages, metodo: 'ocr' }
}

/** Lee un archivo como `data:` URL (para previsualizar y guardar fotos). */
export function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = mal
    r.readAsDataURL(archivo)
  })
}

/** Reduce la foto antes de guardarla (menos almacenamiento en Supabase Storage / localStorage). */
export async function comprimirImagen(dataUrl: string, maxLado = 1400, calidad = 0.8): Promise<string> {
  // onload en vez de img.decode(): decode() puede no resolver en pestañas en segundo plano o WebViews.
  const img = await new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => mal(new Error('Imagen no válida'))
    i.src = dataUrl
  })
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala)
  c.height = Math.round(img.height * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', calidad)
}
