/**
 * Generador mínimo de PDF (texto con Helvetica) para crear extractos bancarios de prueba sin
 * dependencias. Sirve para probar el lector de extractos: la pantalla Extractos ofrece
 * "Descargar extracto de ejemplo".
 *
 * Escribe el PDF a mano siguiendo la especificación 1.4: catálogo, árbol de páginas, dos fuentes
 * estándar (no hay que incrustarlas) y, por cada página, su objeto y su flujo de contenido.
 */
import type { FilaExtracto } from '../ml/extractos'

/** Escapa los caracteres especiales de las cadenas literales de PDF: `\`, `(` y `)`. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
/** Monto con formato bancario colombiano: `-12.345,00`. */
const montoCo = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
const fechaCo = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

/** Crea un extracto de un mes en PDF (tamaño carta), con encabezado, tabla de movimientos y saldo final. */
export function pdfExtracto(opciones: { banco: string; titular: string; cuenta: string; mes: string; filas: FilaExtracto[] }): Blob {
  const { banco, titular, cuenta, mes, filas } = opciones
  const porPagina = 38
  const paginas: string[] = []
  const ultimoDia = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()
  for (let p = 0; p * porPagina < Math.max(1, filas.length); p++) {
    // Operadores de dibujo de la página. Coordenadas en puntos desde la esquina inferior izquierda (carta = 612×792).
    const ops: string[] = []
    // BT/ET = bloque de texto; Tf = fuente y tamaño; Td = posición; Tj = mostrar texto.
    const texto =(x: number, y: number, s: string, negrita = false, tam = 9) => ops.push(`BT /${negrita ? 'F2' : 'F1'} ${tam} Tf ${x} ${y} Td (${esc(s)}) Tj ET`)
    texto(40, 750, banco, true, 16)
    texto(40, 732, 'Extracto de cuenta de ahorros', false, 10)
    texto(40, 712, `Titular: ${titular}`)
    texto(300, 712, `Cuenta No. ${cuenta}`)
    texto(40, 698, `Periodo: 01/${mes.slice(5, 7)}/${mes.slice(0, 4)} al ${ultimoDia}/${mes.slice(5, 7)}/${mes.slice(0, 4)}`)
    texto(300, 698, `Pagina ${p + 1}`)
    // Franja gris detrás de los títulos de la tabla (re = rectángulo, f = rellenar, g = gris).
    ops.push('0.85 g 40 670 532 18 re f 0 g')
    texto(46, 676, 'Fecha', true)
    texto(110, 676, 'Descripcion', true)
    texto(400, 676, 'Valor', true)
    texto(490, 676, 'Saldo', true)
    let y = 656
    for (const f of filas.slice(p * porPagina, (p + 1) * porPagina)) {
      texto(46, y, fechaCo(f.fecha))
      texto(110, y, f.descripcion.slice(0, 48))
      texto(400, y, montoCo(f.monto))
      texto(490, y, f.saldo !== null ? montoCo(f.saldo) : '')
      y -= 16
    }
    if ((p + 1) * porPagina >= filas.length && filas.length) {
      texto(110, y - 10, 'Saldo final', true)
      texto(490, y - 10, montoCo(filas[filas.length - 1].saldo ?? 0), true)
    }
    texto(40, 40, 'Documento de prueba generado por FinTrack. No es un extracto real.', false, 7)
    paginas.push(ops.join('\n'))
  }

  // Objetos numerados desde 1: 1 catálogo, 2 árbol de páginas, 3-4 fuentes,
  // y luego un par por página (5 página, 6 contenido; 7 página, 8 contenido…).
  const objetos: string[] = []
  const n = paginas.length
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>')
  objetos.push(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`)
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  paginas.forEach((contenido, i) => {
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`)
    objetos.push(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`)
  })
  // La tabla xref al final indica en qué byte empieza cada objeto: los lectores la usan para saltar directo.
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objetos.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  // Latin-1: un byte por carácter (tildes incluidas) para que la longitud y los offsets coincidan.
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return new Blob([bytes], { type: 'application/pdf' })
}
