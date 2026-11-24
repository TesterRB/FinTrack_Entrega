// Ícono, splash y silueta de FinTrack a partir del logo aprobado (public/logo.svg: el gusanito «f» con su moneda).
// Uso: npm run android:iconos
//   1. public/logo-silueta.svg: el gusanito y la moneda en un solo color (marca de agua de la web y capa monocromática).
//   2. android/app/src/main/res: íconos del lanzador (clásico, redondo y adaptativo con capa monocromática) y splash.
//   3. assets/: imágenes maestras grandes (formato de @capacitor/assets, también útiles como ícono de tienda).
//
// Los PNG de Android se dibujan aquí, a la resolución exacta de cada densidad (108 dp para las capas adaptativas),
// en vez de con @capacitor/assets: esa herramienta deja las capas a 48 dp y las agranda 1,5× con un inset, y el
// logo se veía borroso.
// sharp no está en package.json: llega como dependencia de @capacitor/assets (devDependencies).
import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const RES = 'android/app/src/main/res'
const VIOLETA = '#6338ee'
const logo = readFileSync('public/logo.svg', 'utf8')

// ---------------------------------------------------------------- piezas del logo
// Las expresiones dependen de cómo está armado el logo aprobado; si se reemplaza el archivo, el error dice qué falta.
function pieza(re, que, fuente = logo) {
  const m = fuente.match(re)
  if (!m) throw new Error(`No encontré ${que} en public/logo.svg`)
  return m
}

const LADO = Number(pieza(/viewBox="0 0 ([\d.]+) [\d.]+"/, 'el viewBox')[1])
const C = LADO / 2
const defs = pieza(/<defs>[\s\S]*?<\/defs>/, 'las definiciones (<defs>)')[0]
const contenido = logo.slice(logo.indexOf('</defs>') + 7, logo.lastIndexOf('</svg>'))

// La baldosa son los rectángulos redondeados que cubren el lienzo; el filo es el trazo claro del borde.
// (El rectángulo sin esquinas que está dentro del recorte del cuerpo es parte del gusanito, no de la baldosa.)
const reBaldosa = /<rect (?:x="[\d.]+" y="[\d.]+" )?width="[\d.]+" height="[\d.]+" rx="[\d.]+"[^>]*\/>/g
const capasBaldosa = contenido.match(reBaldosa) ?? []
const rellenosBaldosa = capasBaldosa.map((r) => r.match(/fill="url\(#([^)]+)\)"/)?.[1]).filter(Boolean)
if (rellenosBaldosa.length === 0) throw new Error('No encontré la baldosa en public/logo.svg')
const arte = contenido.replace(reBaldosa, '')

// Baldosa a sangre (sin esquinas ni filo), para el fondo del ícono adaptativo y del redondo.
const fondoBaldosa = (x, lado) =>
  rellenosBaldosa.map((id) => `<rect x="${x}" y="${x}" width="${lado}" height="${lado}" fill="url(#${id})"/>`).join('')

// Silueta: cuerpo, antenas, rayitas de movimiento y moneda; ojo, sonrisa y «$» van calados.
const idCuerpo = pieza(/<path id="([^"]+)" d="/, 'el cuerpo', defs)[1]
const dCuerpo = pieza(new RegExp(`<path id="${idCuerpo}" d="([^"]+)"`), 'el cuerpo', defs)[1]
const rayitas = pieza(/<path d="([^"]+)" fill="#c9b5fc"/, 'las rayitas de movimiento')[1]
const bolitas = [...contenido.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="url\(#gv-bolita\)"\/>/g)]
const cara = pieza(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#120f2e"\/>\s*<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/, 'el ojo')
const sonrisa = pieza(/<path d="([^"]+)" fill="#120f2e"/, 'la sonrisa')[1]
const elipse = (relleno) => pieza(new RegExp(`<ellipse cx="([\\d.]+)" cy="([\\d.]+)" rx="([\\d.]+)" ry="([\\d.]+)" fill="url\\(#${relleno}\\)"/>`), `la moneda (${relleno})`)
const canto = elipse('gv-canto')
const frenteMoneda = elipse('gv-moneda')
const signo = pieza(/<g transform="(translate\([^)]+\) scale\([^)]+\))"[^>]*>[\s\S]*?<g stroke="#065a44">([\s\S]*?)<\/g>/, 'el signo $')
if (bolitas.length !== 2) throw new Error('Esperaba dos antenas en public/logo.svg')

const ovalo = (m, extra) => `<ellipse cx="${m[1]}" cy="${m[2]}" rx="${m[3]}" ry="${m[4]}" ${extra}/>`
const silueta = (tinta = '#fff') => `
  <defs>
    <path id="s-cuerpo" d="${dCuerpo}"/>
    <mask id="s-recorte" maskUnits="userSpaceOnUse" x="0" y="0" width="${LADO}" height="${LADO}">
      <use href="#s-cuerpo" fill="#fff"/>
      <path d="${rayitas}" fill="#fff"/>
      ${bolitas.map((b) => `<circle cx="${b[1]}" cy="${b[2]}" r="${b[3]}" fill="#fff"/>`).join('')}
      ${ovalo(canto, 'fill="#000" stroke="#000" stroke-width="22"')}
      ${ovalo(frenteMoneda, 'fill="#000" stroke="#000" stroke-width="22"')}
      ${ovalo(canto, 'fill="#fff"')}
      ${ovalo(frenteMoneda, 'fill="#fff" stroke="#000" stroke-width="7"')}
      <ellipse cx="${cara[1]}" cy="${cara[2]}" rx="${cara[3]}" ry="${cara[4]}" fill="#000"/>
      <circle cx="${cara[5]}" cy="${cara[6]}" r="${cara[7]}" fill="#fff"/>
      <path d="${sonrisa}" fill="#000"/>
      <g transform="${signo[1]}" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${signo[2]}</g>
    </mask>
  </defs>
  <rect width="${LADO}" height="${LADO}" fill="${tinta}" mask="url(#s-recorte)"/>`

// ---------------------------------------------------------------- medidas
// Radio del dibujo (gusanito, antenas, moneda y sombras visibles) medido desde el centro de la baldosa.
const svg = (vista, px, cuerpo, d = defs) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vista}" width="${px}" height="${px}">${d}${cuerpo}</svg>`
async function radioDelArte() {
  const { data, info } = await sharp(Buffer.from(svg(`0 0 ${LADO} ${LADO}`, LADO, arte))).raw().toBuffer({ resolveWithObject: true })
  let r = 0
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] >= 10) r = Math.max(r, Math.hypot(x + 0.5 - C, y + 0.5 - C))
  return r
}
const radio = await radioDelArte()

// Ícono adaptativo: capas de 108 dp, de las que se ven 72 dp; lo importante debe caber en el círculo seguro
// de 66 dp (radio 33). El dibujo se ajusta a un radio de 32,5 dp, centrado como en la baldosa del logo.
const UNIDADES_POR_DP = radio / 32.5
// El fondo: la baldosa del logo ocupa justo el área visible de 72 dp y su degradado se prolonga hasta los 108.
const BORDE = (LADO * 18) / 72
// Proporción del dibujo frente a la baldosa en el ícono adaptativo (≈ 0,87: algo más chico que en el logo).
const K = LADO / 72 / UNIDADES_POR_DP

const vistaCapa = () => {
  const v = 108 * UNIDADES_POR_DP
  return `${C - v / 2} ${C - v / 2} ${v} ${v}`
}
const defsFondo = defs.replace(
  new RegExp(`<(linear|radial)Gradient id="(${rellenosBaldosa.join('|')})"`, 'g'),
  '$& gradientTransform="translate(0.1666667 0.1666667) scale(0.6666667)"',
)
const capa = {
  frente: (px) => svg(vistaCapa(), px, arte),
  fondo: (px) => svg(`${-BORDE} ${-BORDE} ${LADO + 2 * BORDE} ${LADO + 2 * BORDE}`, px, fondoBaldosa(-BORDE, LADO + 2 * BORDE), defsFondo),
  monocromo: (px) => svg(vistaCapa(), px, silueta(), ''),
}

// Ícono redondo (Android 7 y splash): el ícono adaptativo tal como lo recorta un lanzador circular, con el filo del logo.
const redondo = (px) =>
  svg(
    `0 0 ${LADO} ${LADO}`,
    px,
    `<clipPath id="r-circulo"><circle cx="${C}" cy="${C}" r="${C}"/></clipPath>
    <g clip-path="url(#r-circulo)">
      ${fondoBaldosa(0, LADO)}
      <g transform="translate(${C * (1 - K)} ${C * (1 - K)}) scale(${K})">${arte}</g>
    </g>
    <circle cx="${C}" cy="${C}" r="${C - 3}" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="6"/>`,
  )

// Ícono clásico (Android 7): el logo aprobado tal cual, con el mismo margen de 2 dp de 48 que tenía el anterior.
const clasico = (px, margenDp = 2) => {
  const margen = (LADO * margenDp) / (48 - 2 * margenDp)
  return logo.replace(/<svg [^>]*>/, (raiz) =>
    raiz
      .replace(/viewBox="[^"]*"/, `viewBox="${-margen} ${-margen} ${LADO + 2 * margen} ${LADO + 2 * margen}"`)
      .replace(/width="[^"]*"/, `width="${px}"`)
      .replace(/height="[^"]*"/, `height="${px}"`),
  )
}

// ---------------------------------------------------------------- salida
const png = (texto, archivo) => sharp(Buffer.from(texto)).png({ compressionLevel: 9 }).toFile(archivo)

/** Fondo violeta con el ícono redondo al centro (28 % del lado corto, como el símbolo del splash anterior). */
async function splash(ancho, alto, archivo) {
  const d = Math.round(Math.min(ancho, alto) * 0.28)
  const insignia = await sharp(Buffer.from(redondo(d))).png().toBuffer()
  await sharp({ create: { width: ancho, height: alto, channels: 4, background: VIOLETA } })
    .composite([{ input: insignia, left: Math.round((ancho - d) / 2), top: Math.round((alto - d) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(archivo)
}

const DENSIDADES = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
// Tamaños de splash que usa el proyecto (los mismos que generaba @capacitor/assets).
const SPLASH = {
  drawable: [320, 480], 'drawable-night': [320, 240],
  ldpi: [240, 320], mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920],
}

writeFileSync('public/logo-silueta.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}">
  <!-- Silueta del logo (generada por scripts/generar-iconos.mjs a partir de public/logo.svg). -->${silueta()}
</svg>
`)

const tareas = []
for (const [densidad, f] of Object.entries(DENSIDADES)) {
  const dir = `${RES}/mipmap-${densidad}`
  const a48 = Math.round(48 * f)
  const a108 = Math.round(108 * f)
  tareas.push(
    png(clasico(a48), `${dir}/ic_launcher.png`),
    png(redondo(a48), `${dir}/ic_launcher_round.png`),
    png(capa.frente(a108), `${dir}/ic_launcher_foreground.png`),
    png(capa.fondo(a108), `${dir}/ic_launcher_background.png`),
    png(capa.monocromo(a108), `${dir}/ic_launcher_monochrome.png`),
  )
}
for (const [carpeta, [ancho, alto]] of Object.entries(SPLASH)) {
  if (carpeta.startsWith('drawable')) {
    tareas.push(splash(ancho, alto, `${RES}/${carpeta}/splash.png`))
    continue
  }
  for (const noche of ['', '-night']) {
    tareas.push(
      splash(ancho, alto, `${RES}/drawable-port${noche}-${carpeta}/splash.png`),
      splash(alto, ancho, `${RES}/drawable-land${noche}-${carpeta}/splash.png`),
    )
  }
}

const adaptativo = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <!-- Íconos temáticos (Android 13+): el sistema tiñe la silueta con los colores del fondo de pantalla. -->
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`
for (const f of ['ic_launcher', 'ic_launcher_round']) writeFileSync(`${RES}/mipmap-anydpi-v26/${f}.xml`, adaptativo)

// Maestras con las convenciones de @capacitor/assets (el frente y el fondo equivalen al área visible de 72 dp).
mkdirSync('assets', { recursive: true })
const vistaVisible = () => {
  const v = 72 * UNIDADES_POR_DP
  return `${C - v / 2} ${C - v / 2} ${v} ${v}`
}
tareas.push(
  png(clasico(1024, 0), 'assets/icon-only.png'),
  png(svg(vistaVisible(), 1024, arte), 'assets/icon-foreground.png'),
  png(svg(`0 0 ${LADO} ${LADO}`, 1024, fondoBaldosa(0, LADO)), 'assets/icon-background.png'),
  splash(2732, 2732, 'assets/splash.png'),
  splash(2732, 2732, 'assets/splash-dark.png'),
)

await Promise.all(tareas)
console.log(`Listo: silueta, ${tareas.length} imágenes y los XML del ícono adaptativo (dibujo con radio ${(radio / UNIDADES_POR_DP).toFixed(1)} dp de 33 dp seguros).`)
