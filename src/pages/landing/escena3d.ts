/**
 * Escena 3D de la landing (three.js): un celular con pantallas reales de la app, monedas con el signo $
 * y el logo en volumen. Es la misma escena de la presentación del proyecto, adaptada a una página que se desplaza.
 *
 * Cómo funciona:
 *  - La página marca "ranuras" con el atributo `data-3d` (`telefono`, `monedas` o `logo`). Las ranuras son cajas
 *    normales del diseño: su tamaño y su posición deciden dónde y qué tan grande se dibuja cada objeto.
 *  - En cada cuadro se busca, por tipo, la ranura visible más cercana al centro de la pantalla y el objeto vuela
 *    hacia ella. Al desplazarse, el celular viaja de sección en sección y cambia de pantalla girando
 *    (`data-pantalla`); las monedas cambian de formación (`data-formacion`).
 *  - El lienzo es fijo, cubre la ventana y no recibe toques. Si no hay WebGL, la escena no arranca y la página
 *    deja visibles las imágenes planas que hay dentro de cada ranura.
 *  - Con "reducir movimiento" los objetos se ubican sin vuelos, giros ni balanceo.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const BASE = import.meta.env.BASE_URL
type Tipo = 'telefono' | 'logo' | 'monedas'

// ---------------- Utilidades de dibujo ----------------

function lienzo2d(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function cargarImagen(src: string) {
  return new Promise<HTMLImageElement>((ok, mal) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => mal(new Error(`No se pudo cargar ${src.slice(0, 60)}`))
    img.src = src
  })
}

/** Rectángulo de esquinas redondeadas centrado en (cx, cy), para extruir o rellenar. */
function rectRedondo(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** UV de 0 a 1 según la caja de la figura, para que una imagen la cubra entera. */
function uvNormalizados(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox()
  const b = geo.boundingBox!
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - b.min.x) / (b.max.x - b.min.x), (pos.getY(i) - b.min.y) / (b.max.y - b.min.y))
  uv.needsUpdate = true
  return geo
}

// El signo $ de la moneda del logo, para la cara de las monedas.
const RUTA_PESO = new Path2D('M22 -25.5 C16.7 -34.3 -24.2 -36.1 -22.9 -16.7 C-21.6 -0.9 21.6 0.9 22.9 16.7 C24.2 36.1 -16.7 34.3 -22 25.5')
const RUTA_BARRA = new Path2D('M0 -49 V-33 M0 33 V49')
function glifo(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.save()
  g.translate(cx, cy)
  g.scale(s * 0.5, s * 0.5)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = color
  g.lineWidth = 14
  g.stroke(RUTA_PESO)
  g.lineWidth = 11
  g.stroke(RUTA_BARRA)
  g.restore()
}

/**
 * Capas del logo a partir de public/logo.svg: el logo completo, la baldosa (fondo) y el gusanito con su moneda
 * (figura), para dibujar la figura un poco por delante de la baldosa. La separación usa la misma regla que
 * scripts/generar-iconos.mjs; si el logo cambia y no se encuentra la baldosa, se usa el logo completo.
 */
const RE_BALDOSA = /<rect (?:x="[\d.]+" y="[\d.]+" )?width="[\d.]+" height="[\d.]+" rx="[\d.]+"[^>]*\/>/g
async function capasLogo() {
  const svg = await (await fetch(`${BASE}logo.svg`)).text()
  const completo = await cargarImagen('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0]
  if (!viewBox || !defs) return { completo, fondo: null, figura: null }
  const contenido = svg.slice(svg.indexOf('</defs>') + 7, svg.lastIndexOf('</svg>'))
  const baldosa = contenido.match(RE_BALDOSA) ?? []
  if (!baldosa.length) return { completo, fondo: null, figura: null }
  const armar = (cuerpo: string) =>
    cargarImagen('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1024" height="1024">${defs}${cuerpo}</svg>`))
  const [fondo, figura] = await Promise.all([armar(baldosa.join('')), armar(contenido.replace(RE_BALDOSA, ''))])
  return { completo, fondo, figura }
}

// ---------------- Curvas de animación ----------------

type Curva = (t: number) => number
const salidaExpo: Curva = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
const salidaAtras: Curva = (t) => {
  const c = 1.7
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

/** Formaciones de monedas: x e y relativos a la mitad del ancho/alto de la ranura; z y tamaño relativos a su radio. */
const FORMACIONES: Record<string, [number, number, number, number][]> = {
  orbita: [[-0.86, 0.62, 0.35, 0.17], [0.88, 0.74, -0.3, 0.13], [0.95, -0.42, 0.45, 0.16], [-0.8, -0.72, -0.1, 0.13], [0.2, 0.98, -0.6, 0.1], [-1.02, 0.02, -0.5, 0.1], [0.6, -0.95, 0.25, 0.12]],
  marco: [[-0.92, 0.78, 0.3, 0.22], [0.96, 0.66, -0.2, 0.17], [1.0, -0.5, 0.4, 0.24], [-0.88, -0.78, -0.1, 0.17], [0.08, 1.02, -0.5, 0.12], [-1.06, -0.02, -0.4, 0.13], [0.42, -1.02, 0.2, 0.15]],
}

const PALETAS = {
  oro: { claro: '#ffeaa6', base: '#f7c948', oscuro: '#c48a17', glifo: '#dca22a', sombra: '#9c6a0c', luz: '#fff6d2', canto: 0xe8b43a },
  menta: { claro: '#c4f7e7', base: '#4fd8b4', oscuro: '#14916f', glifo: '#2bbd95', sombra: '#0c6f53', luz: '#eafff8', canto: 0x34c89f },
}
type Paleta = (typeof PALETAS)['oro']

/** Estado de un objeto que sigue a una ranura (celular o logo). */
interface Pieza {
  cont: THREE.Group
  /** Grupo interno que gira y se balancea; `cont` solo se mueve y escala. */
  giro: THREE.Group
  /** Escala actual y escala objetivo (0 = oculto). */
  s: number
  sObj: number
  objetivo: THREE.Vector3
  /** Giro base pedido por la ranura (`data-giro`, en radianes) y giro extra animado al cambiar de ranura. */
  giroBase: number
  giroObj: number
  giroExtra: { v: number }
  el: HTMLElement | null
  /** Saltar directo a la ranura (al aparecer) en vez de volar desde la posición anterior. */
  saltar: boolean
  /** Momento del último cambio de ranura (para saber cuándo ya se asentó). */
  cambio: number
  /** Escala del objeto para el tamaño de la ranura (en unidades de la escena). */
  ajuste: (w: number, h: number) => number
}

/**
 * Monta la escena en `capa` (un contenedor fijo que cubre la ventana) y sigue las ranuras de `raiz`.
 * `alListo` se llama tras el primer cuadro dibujado, para ocultar las imágenes planas. La escena se desmonta
 * y libera la memoria de la tarjeta gráfica cuando se aborta `senal` (al salir de la landing).
 */
export async function montarEscena(capa: HTMLElement, raiz: HTMLElement, senal: AbortSignal, alListo: () => void) {
  if (senal.aborted) return
  const lienzo = document.createElement('canvas')
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true })
  } catch {
    return // Sin WebGL: quedan las imágenes planas.
  }

  const reducir = matchMedia('(prefers-reduced-motion: reduce)')
  const RM = () => reducir.matches
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, 0)
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  // Lo que hay que esperar antes del primer cuadro: la pantalla de la portada y el logo.
  const cargador = new THREE.TextureLoader()
  const texturas: Record<string, THREE.Texture> = {}
  function textura(nombre: string) {
    if (!texturas[nombre]) {
      const t = cargador.load(`${BASE}landing/${nombre}.webp`)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = maxAniso
      texturas[nombre] = t
    }
    return texturas[nombre]
  }
  let logo: Awaited<ReturnType<typeof capasLogo>>
  try {
    const [inicio, capas] = await Promise.all([cargador.loadAsync(`${BASE}landing/inicio.webp`), capasLogo()])
    inicio.colorSpace = THREE.SRGBColorSpace
    inicio.anisotropy = maxAniso
    texturas.inicio = inicio
    logo = capas
  } catch {
    renderer.dispose()
    return
  }
  if (senal.aborted) {
    renderer.dispose()
    return
  }

  lienzo.style.position = 'absolute'
  lienzo.style.inset = '0'
  capa.appendChild(lienzo)

  const escena = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  escena.environment = entorno
  escena.environmentIntensity = 0.85

  const camara = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.1, 100)
  camara.position.set(0, 0, 14)
  /** Alto visible (en unidades de la escena) en el plano z = 0: convierte píxeles en unidades. */
  const altoVisible = 2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.position.z

  // Luces: clave blanca, contraluz violeta y relleno menta (los colores de la marca).
  escena.add(new THREE.HemisphereLight(0xf3f2ff, 0x5428d9, 0.55))
  const clave = new THREE.DirectionalLight(0xffffff, 1.5)
  clave.position.set(4, 6, 9)
  const contraluz = new THREE.DirectionalLight(0x9282fc, 1.4)
  contraluz.position.set(-7, 3, -5)
  const relleno = new THREE.PointLight(0x4fd8b4, 18, 30, 2)
  relleno.position.set(-5, -4, 5)
  escena.add(clave, contraluz, relleno)

  const texturaDe = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = maxAniso
    return t
  }

  // Sombra suave de contacto bajo cada objeto.
  const texSombra = (() => {
    const c = lienzo2d(128, 128)
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(46,26,120,.42)')
    r.addColorStop(0.55, 'rgba(46,26,120,.14)')
    r.addColorStop(1, 'rgba(46,26,120,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  function sombra(ancho: number, alto: number, y: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false, toneMapped: false }))
    m.scale.set(ancho, alto, 1)
    m.position.set(0, y, -0.8)
    m.renderOrder = -1
    return m
  }

  function pieza(cont: THREE.Group, giro: THREE.Group, ajuste: Pieza['ajuste']): Pieza {
    cont.visible = false
    escena.add(cont)
    return { cont, giro, s: 0, sObj: 0, objetivo: new THREE.Vector3(), giroBase: 0, giroObj: 0, giroExtra: { v: 0 }, el: null, saltar: true, cambio: -10, ajuste }
  }

  // ---------------- Celular ----------------
  // Cuerpo metálico extruido, bisel negro, pantalla con una captura real, brillo que se desliza al girar y
  // una tapa trasera violeta con el logo (se ve a mitad de cada giro).
  const W = 1.0
  const H = 2.15
  const R = 0.15
  const zF = 0.065
  const anchoP = 0.94
  const altoP = (0.94 * 1600) / 720
  const telCont = new THREE.Group()
  const telGiro = new THREE.Group()
  telCont.add(telGiro)
  const cuerpoGeo = new THREE.ExtrudeGeometry(rectRedondo(W, H, R), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 6, curveSegments: 18 })
  cuerpoGeo.center()
  telGiro.add(new THREE.Mesh(cuerpoGeo, new THREE.MeshPhysicalMaterial({ color: 0x2b2556, metalness: 0.8, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.18 })))
  const bisel = new THREE.Mesh(new THREE.ShapeGeometry(rectRedondo(0.975, 2.125, 0.14), 18), new THREE.MeshPhysicalMaterial({ color: 0x06070d, roughness: 0.2, clearcoat: 1 }))
  bisel.position.z = zF + 0.0006
  telGiro.add(bisel)
  const pantallaGeo = uvNormalizados(new THREE.ShapeGeometry(rectRedondo(anchoP, altoP, 0.115), 20))
  const matPantalla = new THREE.MeshBasicMaterial({ map: texturas.inicio, toneMapped: false })
  const pantalla = new THREE.Mesh(pantallaGeo, matPantalla)
  pantalla.position.z = zF + 0.0012
  telGiro.add(pantalla)
  const brilloTex = (() => {
    const c = lienzo2d(256, 512)
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 256, 512)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(0.38, 'rgba(255,255,255,0)')
    gr.addColorStop(0.47, 'rgba(255,255,255,.16)')
    gr.addColorStop(0.56, 'rgba(255,255,255,0)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 512)
    return new THREE.CanvasTexture(c)
  })()
  const brillo = new THREE.Mesh(pantallaGeo, new THREE.MeshBasicMaterial({ map: brilloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  brillo.position.z = zF + 0.0024
  telGiro.add(brillo)
  const camFrontal = new THREE.Mesh(new THREE.CircleGeometry(0.019, 24), new THREE.MeshBasicMaterial({ color: 0x05060c }))
  camFrontal.position.set(0, altoP / 2 - 0.036, zF + 0.003)
  telGiro.add(camFrontal)
  const traseraTex = (() => {
    const c = lienzo2d(512, 1100)
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 512, 1100)
    gr.addColorStop(0, '#8f7cfb')
    gr.addColorStop(0.5, '#6d4ff0')
    gr.addColorStop(1, '#4b2fd6')
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 1100)
    const luz = g.createRadialGradient(140, 240, 10, 140, 240, 460)
    luz.addColorStop(0, 'rgba(255,255,255,.22)')
    luz.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = luz
    g.fillRect(0, 0, 512, 1100)
    g.drawImage(logo.completo, 256 - 150, 600 - 150, 300, 300)
    return texturaDe(c)
  })()
  const tapa = new THREE.Mesh(
    uvNormalizados(new THREE.ShapeGeometry(rectRedondo(W - 0.01, H - 0.01, R - 0.005), 18)),
    new THREE.MeshPhysicalMaterial({ map: traseraTex, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 }),
  )
  tapa.rotation.y = Math.PI
  tapa.position.z = -zF - 0.0008
  telGiro.add(tapa)
  const modulo = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rectRedondo(0.3, 0.32, 0.09), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10 }),
    new THREE.MeshPhysicalMaterial({ color: 0x3b2f8f, metalness: 0.4, roughness: 0.2, clearcoat: 1 }),
  )
  modulo.rotation.y = Math.PI
  modulo.position.set(0.27, 0.8, -zF)
  telGiro.add(modulo)
  const lenteMat = new THREE.MeshPhysicalMaterial({ color: 0x07080f, roughness: 0.05, clearcoat: 1 })
  for (const y of [0.87, 0.73]) {
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 32), lenteMat)
    lente.rotation.x = Math.PI / 2
    lente.position.set(0.27, y, -zF - 0.03)
    telGiro.add(lente)
  }
  telCont.add(sombra(1.5, 0.32, -1.2))
  const tel = pieza(telCont, telGiro, (w, h) => Math.min(h / 2.34, w / 1.16) * 0.98)

  // ---------------- Logo en volumen ----------------
  // Baldosa violeta extruida con la cara del logo encima y el gusanito un poco más adelante (da relieve al girar).
  const logoCont = new THREE.Group()
  const logoGiro = new THREE.Group()
  const logoCuerpo = new THREE.Group()
  logoCont.add(logoGiro)
  logoGiro.add(logoCuerpo)
  logoCuerpo.scale.setScalar(1 / 32) // el logo se modela en un cuadro de 64 unidades
  const baldosaGeo = new THREE.ExtrudeGeometry(rectRedondo(59, 59, 12.5), { depth: 6, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.5, bevelSegments: 10, curveSegments: 28 })
  baldosaGeo.translate(0, 0, -6)
  logoCuerpo.add(new THREE.Mesh(baldosaGeo, new THREE.MeshPhysicalMaterial({ color: 0x5512e6, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 })))
  const planoLogo = new THREE.PlaneGeometry(59, 59)
  const texCapa = (img: HTMLImageElement) => {
    const c = lienzo2d(1024, 1024)
    c.getContext('2d')!.drawImage(img, 0, 0, 1024, 1024)
    return texturaDe(c)
  }
  const caraLogo = new THREE.Mesh(planoLogo, new THREE.MeshBasicMaterial({ map: texCapa(logo.fondo ?? logo.completo), transparent: true, toneMapped: false }))
  caraLogo.position.z = 3.05
  logoCuerpo.add(caraLogo)
  const zFigura = 4.8
  const figura = logo.figura ? new THREE.Mesh(planoLogo, new THREE.MeshBasicMaterial({ map: texCapa(logo.figura), transparent: true, toneMapped: false, depthWrite: false })) : null
  if (figura) {
    figura.position.z = zFigura
    logoCuerpo.add(figura)
  }
  logoCont.add(sombra(2.6, 0.5, -1.55))
  const logoPieza = pieza(logoCont, logoGiro, (w, h) => (Math.min(w, h) * 0.5) / 1.1)
  /** Avance (0 → 1) del "salto" de la figura al aparecer el logo. */
  const saltoFigura = { v: 1 }

  // ---------------- Monedas ----------------
  function texturaMoneda(p: Paleta) {
    const c = lienzo2d(512, 512)
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(196, 170, 20, 256, 256, 280)
    gr.addColorStop(0, p.claro)
    gr.addColorStop(0.6, p.base)
    gr.addColorStop(1, p.oscuro)
    g.fillStyle = gr
    g.fillRect(0, 0, 512, 512)
    g.lineWidth = 20
    g.strokeStyle = p.oscuro
    g.beginPath()
    g.arc(256, 256, 212, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 0.75
    g.lineWidth = 5
    g.strokeStyle = p.luz
    g.beginPath()
    g.arc(256, 256, 228, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
    // El $ en tres pasadas (sombra, luz y color) para que se lea grabado.
    glifo(g, 261, 263, 5, p.sombra)
    glifo(g, 252, 253, 5, p.luz)
    glifo(g, 256, 258, 5, p.glifo)
    return texturaDe(c)
  }
  // Mapa de relieve de la cara (el $ y el aro sobresalen) y del canto (estrías).
  const relieve = (() => {
    const c = lienzo2d(512, 512)
    const g = c.getContext('2d')!
    g.fillStyle = '#6a6a6a'
    g.fillRect(0, 0, 512, 512)
    g.lineWidth = 20
    g.strokeStyle = '#b0b0b0'
    g.beginPath()
    g.arc(256, 256, 212, 0, Math.PI * 2)
    g.stroke()
    glifo(g, 256, 258, 5, '#d8d8d8')
    return new THREE.CanvasTexture(c)
  })()
  const canto = (() => {
    const c = lienzo2d(64, 8)
    const g = c.getContext('2d')!
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = '#fff'
      g.fillRect(x, 0, 4, 8)
      g.fillStyle = '#555'
      g.fillRect(x + 4, 0, 4, 8)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(26, 1)
    return t
  })()
  const monedaGeo = new THREE.CylinderGeometry(1, 1, 0.15, 72, 1)
  monedaGeo.rotateX(Math.PI / 2)
  monedaGeo.rotateZ(Math.PI / 2) // el $ de la cara queda derecho
  /** Materiales del cilindro en su orden: canto, cara superior y cara inferior. */
  const materialMoneda = (p: Paleta): THREE.Material[] => {
    const cara = new THREE.MeshStandardMaterial({ map: texturaMoneda(p), bumpMap: relieve, bumpScale: 2.2, metalness: 0.85, roughness: 0.3 })
    const lado = new THREE.MeshStandardMaterial({ color: p.canto, bumpMap: canto, bumpScale: 1.5, metalness: 0.9, roughness: 0.32 })
    return [lado, cara, cara]
  }
  const materialesMoneda = { oro: materialMoneda(PALETAS.oro), menta: materialMoneda(PALETAS.menta) }
  const monedas = (['oro', 'oro', 'menta', 'oro', 'oro', 'menta', 'oro'] as const).map((tipo, i) => {
    const cont = new THREE.Group()
    const giro = new THREE.Group()
    cont.add(giro)
    giro.add(new THREE.Mesh(monedaGeo, materialesMoneda[tipo]))
    cont.visible = false
    escena.add(cont)
    return { cont, giro, s: 0, sObj: 0, fase: i * 1.7, vel: 0.55 + (i % 3) * 0.18, objetivo: new THREE.Vector3(), desde: 0, saltar: true }
  })
  let ranuraMonedas: HTMLElement | null = null

  // ---------------- Ranuras ----------------
  const ranuras: Record<Tipo, HTMLElement[]> = { telefono: [], logo: [], monedas: [] }
  raiz.querySelectorAll<HTMLElement>('[data-3d]').forEach((el) => ranuras[el.getAttribute('data-3d') as Tipo]?.push(el))

  let ancho = innerWidth
  let alto = innerHeight
  function redimensionar() {
    ancho = innerWidth
    alto = innerHeight
    renderer.setSize(ancho, alto)
    camara.aspect = ancho / alto
    camara.updateProjectionMatrix()
  }
  redimensionar()

  /** Ranura visible más cercana al centro de la pantalla. Con histéresis, para no dudar entre dos ranuras. */
  function elegir(lista: HTMLElement[], actual: HTMLElement | null) {
    let mejor: HTMLElement | null = null
    let dMejor = Infinity
    let dActual = Infinity
    for (const el of lista) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.bottom <= 0 || r.top >= alto) continue
      const d = Math.abs(r.top + r.height / 2 - alto / 2)
      if (el === actual) dActual = d
      if (d < dMejor) {
        dMejor = d
        mejor = el
      }
    }
    if (dActual !== Infinity && dActual - dMejor < 80) return actual
    return mejor
  }

  /** Centro y tamaño de una ranura en unidades de la escena (origen en el centro de la pantalla). */
  function ubicar(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return null
    const k = altoVisible / alto
    return { x: (r.left + r.width / 2 - ancho / 2) * k, y: -(r.top + r.height / 2 - alto / 2) * k, w: r.width * k, h: r.height * k }
  }

  // ---------------- Animaciones ----------------
  let reloj = 0
  const tweens: { obj: { v: number }; desde: number; hasta: number; inicio: number; dur: number; curva: Curva }[] = []
  function animar(obj: { v: number }, desde: number, hasta: number, dur: number, curva: Curva) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj) tweens.splice(i, 1)
    obj.v = desde
    tweens.push({ obj, desde, hasta, inicio: reloj, dur, curva })
  }
  function avanzarTweens() {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i]
      const p = Math.min(1, (reloj - t.inicio) / t.dur)
      t.obj.v = t.desde + (t.hasta - t.desde) * t.curva(p)
      if (p >= 1) tweens.splice(i, 1)
    }
  }

  // Pantalla del celular: al cambiar de ranura el celular da una vuelta completa y la captura se cambia
  // a mitad de giro, cuando la pantalla mira hacia atrás (así el cambio no se ve).
  let pantallaActual = 'inicio'
  let pantallaPendiente: string | null = null
  function ponerPantalla(nombre: string) {
    pantallaPendiente = null
    if (nombre === pantallaActual) return
    matPantalla.map = textura(nombre)
    matPantalla.needsUpdate = true
    pantallaActual = nombre
  }

  /** La pieza cambió de ranura: vuela hacia la nueva con un giro (o aparece en su lugar si estaba oculta). */
  function cambiarRanura(p: Pieza, el: HTMLElement | null) {
    const estaba = p.s > 0.05
    p.el = el
    p.cambio = reloj
    if (!el) return
    p.giroObj = parseFloat(el.dataset.giro ?? '0')
    if (!estaba) {
      p.saltar = true
      p.giroBase = p.giroObj
    }
    const nombre = el.dataset.pantalla
    if (RM()) {
      if (p === tel && nombre) ponerPantalla(nombre)
      return
    }
    animar(p.giroExtra, -Math.PI * 2, 0, estaba ? 1.5 : 1.8, salidaExpo)
    if (p === tel && nombre) {
      if (estaba) pantallaPendiente = nombre
      else ponerPantalla(nombre)
    }
    if (p === logoPieza) animar(saltoFigura, 0, 1, 1.1, salidaAtras)
  }

  /** Mueve y escala la pieza hacia su ranura con un amortiguado exponencial (igual a 60 y a 120 Hz). */
  function seguir(p: Pieza, dt: number) {
    const u = p.el && ubicar(p.el)
    if (u) {
      p.objetivo.set(u.x, u.y, 0)
      p.sObj = p.ajuste(u.w, u.h)
    } else p.sObj = 0
    if (p.saltar && u) {
      p.cont.position.copy(p.objetivo)
      p.saltar = false
    }
    // Ya asentada, la pieza va pegada a su ranura (sigue el desplazamiento sin retraso).
    const asentada = reloj - p.cambio > 1.2 && p.s > 0.01
    p.cont.position.lerp(p.objetivo, RM() || asentada ? 1 : 1 - Math.exp(-dt * 6.5))
    p.s += (p.sObj - p.s) * (RM() ? 1 : 1 - Math.exp(-dt * 7))
    if (p.s < 0.0005 && p.sObj === 0) p.s = 0
    p.cont.scale.setScalar(Math.max(p.s, 1e-4))
    p.cont.visible = p.s > 0.002
    p.giroBase += (p.giroObj - p.giroBase) * (RM() ? 1 : 1 - Math.exp(-dt * 3))
  }

  // ---------------- Bucle ----------------
  const puntero = { x: 0, y: 0, tx: 0, ty: 0 }
  const alMover = (e: PointerEvent) => {
    puntero.tx = (e.clientX / ancho) * 2 - 1
    puntero.ty = (e.clientY / alto) * 2 - 1
  }
  addEventListener('pointermove', alMover, { passive: true })
  addEventListener('resize', redimensionar)

  let antes = performance.now()
  let cuadroId = 0
  let habiaAlgo = true
  let primero = true
  function cuadro(ahora: number) {
    cuadroId = requestAnimationFrame(cuadro)
    const dt = Math.min(0.5, Math.max(0, (ahora - antes) / 1000))
    antes = ahora
    reloj += dt
    avanzarTweens()
    const rm = RM()
    const vida = rm ? 0 : 1 // amplitud del balanceo en reposo
    const kp = 1 - Math.exp(-dt * 4)
    puntero.x += (puntero.tx - puntero.x) * kp
    puntero.y += (puntero.ty - puntero.y) * kp
    const px = rm ? 0 : puntero.x
    const py = rm ? 0 : puntero.y

    // Celular: sigue su ranura, se balancea suave y gira un poco hacia el puntero.
    const elTel = elegir(ranuras.telefono, tel.el)
    if (elTel !== tel.el) cambiarRanura(tel, elTel)
    seguir(tel, dt)
    if (pantallaPendiente && tel.giroExtra.v >= -Math.PI) ponerPantalla(pantallaPendiente)
    tel.giro.rotation.y = tel.giroBase + tel.giroExtra.v + vida * Math.sin(reloj * 0.55) * 0.16 + px * 0.22
    tel.giro.rotation.x = 0.04 + vida * Math.sin(reloj * 0.43) * 0.05 + py * 0.12
    tel.giro.rotation.z = vida * Math.sin(reloj * 0.37) * 0.02
    tel.giro.position.y = vida * Math.sin(reloj * 0.9) * 0.035
    brilloTex.offset.x = -tel.giro.rotation.y * 0.35

    // Logo
    const elLogo = elegir(ranuras.logo, logoPieza.el)
    if (elLogo !== logoPieza.el) cambiarRanura(logoPieza, elLogo)
    seguir(logoPieza, dt)
    logoPieza.giro.rotation.y = logoPieza.giroBase + logoPieza.giroExtra.v + vida * Math.sin(reloj * 0.5) * 0.3 + px * 0.25
    logoPieza.giro.rotation.x = 0.16 + vida * Math.sin(reloj * 0.41) * 0.06 + py * 0.14
    logoPieza.giro.position.y = vida * Math.sin(reloj * 0.8) * 0.06
    if (figura) {
      figura.scale.setScalar(0.55 + 0.45 * saltoFigura.v)
      figura.position.z = 3.1 + (zFigura - 3.1) * Math.min(1, saltoFigura.v)
    }

    // Monedas: cada una toma su lugar en la formación de la ranura activa, escalonadas al llegar.
    const elMonedas = elegir(ranuras.monedas, ranuraMonedas)
    if (elMonedas !== ranuraMonedas) {
      const habia = ranuraMonedas !== null
      ranuraMonedas = elMonedas
      monedas.forEach((m, i) => {
        m.desde = reloj + (rm ? 0 : 0.25 + i * 0.07)
        if (!habia) m.saltar = true
      })
    }
    const uM = ranuraMonedas && ubicar(ranuraMonedas)
    const formacion = ranuraMonedas ? (FORMACIONES[ranuraMonedas.dataset.formacion ?? ''] ?? FORMACIONES.orbita) : []
    monedas.forEach((m, i) => {
      const f = formacion[i]
      if (uM && f && reloj >= m.desde) {
        const radio = Math.min(uM.w, uM.h) / 2
        m.objetivo.set(uM.x + (f[0] * uM.w) / 2, uM.y + (f[1] * uM.h) / 2, f[2] * radio)
        m.sObj = f[3] * radio
      } else m.sObj = 0
      if (m.saltar && m.sObj > 0) {
        m.cont.position.copy(m.objetivo)
        m.saltar = false
      }
      m.cont.position.lerp(m.objetivo, rm ? 1 : 1 - Math.exp(-dt * 5))
      m.s += (m.sObj - m.s) * (rm ? 1 : 1 - Math.exp(-dt * 6))
      if (m.s < 0.0005 && m.sObj === 0) m.s = 0
      m.cont.scale.setScalar(Math.max(m.s, 1e-4))
      m.cont.visible = m.s > 0.002
      m.giro.rotation.y = m.fase + (rm ? 0.5 : reloj * m.vel)
      m.giro.rotation.x = 0.3 + vida * Math.sin(reloj * 0.6 + m.fase) * 0.3 + py * 0.1
      m.giro.position.y = vida * Math.sin(reloj * 1.1 + m.fase) * 0.1 * m.s
    })

    // Solo se dibuja si hay algo en pantalla (y una vez más al desaparecer todo, para limpiar el lienzo).
    const hayAlgo = tel.cont.visible || logoPieza.cont.visible || monedas.some((m) => m.cont.visible)
    if (hayAlgo || habiaAlgo) renderer.render(escena, camara)
    habiaAlgo = hayAlgo
    if (primero) {
      primero = false
      alListo()
    }
  }
  cuadroId = requestAnimationFrame((t) => {
    antes = t
    cuadro(t)
  })

  // ---------------- Limpieza ----------------
  senal.addEventListener('abort', () => {
    cancelAnimationFrame(cuadroId)
    removeEventListener('pointermove', alMover)
    removeEventListener('resize', redimensionar)
    escena.traverse((o) => {
      const malla = o as THREE.Mesh
      malla.geometry?.dispose()
      const mats = malla.material ? (Array.isArray(malla.material) ? malla.material : [malla.material]) : []
      mats.forEach((m) => {
        ;(m as THREE.MeshStandardMaterial).map?.dispose()
        ;(m as THREE.MeshStandardMaterial).bumpMap?.dispose()
        m.dispose()
      })
    })
    Object.values(texturas).forEach((t) => t.dispose())
    entorno.dispose()
    pmrem.dispose()
    renderer.dispose()
    lienzo.remove()
  })
}
