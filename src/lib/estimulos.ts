/**
 * Sistema de estímulos: partículas, sonido y vibración para los momentos que ganan puntos.
 * Sin dependencias ni archivos de audio: canvas 2D + WebAudio sintetizado.
 *
 * La intensidad es proporcional a la rareza del momento: un registro (varias veces al día) recibe una
 * chispa corta; un reto o un extracto, un logro; un cupón o un mes gratis, la celebración.
 * Se respeta `prefers-reduced-motion` y el usuario puede silenciar el sonido.
 */

import { esNativo, vibrarNativo } from './plataforma'

/** Qué tan grande es el momento. Define partículas, sonido y patrón de vibración. */
export type Intensidad = 'chispa' | 'logro' | 'celebracion'
export type Sonido = 'moneda' | 'logro' | 'fanfarria' | 'tic'

const COLORES = ['#9282fc', '#6338ee', '#4fd8b4', '#22c39a', '#f7c948', '#ffffff']
/** Clave de localStorage con la preferencia de sonido (`on` / `off`). */
const CLAVE_SONIDO = 'fintrack-sonido'

/** ¿El sistema pide reducir el movimiento? En ese caso no hay partículas ni vuelos. */
export const movimientoReducido = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------------- Sonido ----------------

let ctx: AudioContext | null = null
/**
 * Contexto de audio compartido, creado en el primer uso. Los navegadores lo crean "suspendido" hasta
 * que hay un gesto del usuario; como los sonidos siempre responden a un toque, se reanuda aquí.
 */
function audio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Preferencia de sonido del usuario (activo por defecto). */
export function sonidoActivo() {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== 'off'
  } catch {
    return true
  }
}
/** Guarda la preferencia de sonido; al activarlo suena un "tic" de confirmación. */
export function cambiarSonido(activo: boolean) {
  try {
    localStorage.setItem(CLAVE_SONIDO, activo ? 'on' : 'off')
  } catch {
    /* sin almacenamiento */
  }
  if (activo) sonar('tic')
}

/** Una nota con envolvente percusiva (ataque corto, caída exponencial). */
function nota(ac: AudioContext, frecuencia: number, inicio: number, duracion: number, volumen: number, tipo: OscillatorType = 'triangle') {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frecuencia, inicio)
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.exponentialRampToValueAtTime(volumen, inicio + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)
  osc.connect(g).connect(ac.destination)
  osc.start(inicio)
  osc.stop(inicio + duracion + 0.02)
}

const PRIORIDAD: Record<Sonido, number> = { tic: 0, moneda: 1, logro: 2, fanfarria: 3 }
/** Último sonido reproducido y cuándo (ms), para no encimar dos sonidos del mismo gesto. */
let ultimo = { s: 'tic' as Sonido, t: 0 }

/** Reproduce un sonido sintetizado (las frecuencias son notas musicales: 523,25 Hz = Do5, etc.). */
export function sonar(s: Sonido) {
  if (!sonidoActivo()) return
  // Si dos partes de la app reaccionan al mismo gesto, suena solo el sonido más importante.
  const ahora = performance.now()
  if (ahora - ultimo.t < 250 && PRIORIDAD[s] <= PRIORIDAD[ultimo.s]) return
  ultimo = { s, t: ahora }
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.01
  switch (s) {
    case 'tic':
      nota(ac, 1760, t, 0.05, 0.05, 'sine')
      break
    case 'moneda': // dos notas ascendentes, como una moneda que cae en la alcancía
      nota(ac, 987.77, t, 0.09, 0.09, 'square')
      nota(ac, 1318.51, t + 0.07, 0.28, 0.08, 'square')
      break
    case 'logro': // arpegio mayor
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(ac, f, t + i * 0.075, 0.32, 0.09))
      break
    case 'fanfarria':
      ;[523.25, 659.25, 783.99].forEach((f, i) => nota(ac, f, t + i * 0.09, 0.25, 0.08))
      ;[1046.5, 1318.51, 1567.98].forEach((f) => nota(ac, f, t + 0.3, 0.9, 0.06))
      ;[2093, 2637].forEach((f, i) => nota(ac, f, t + 0.42 + i * 0.06, 0.4, 0.03, 'sine'))
      break
  }
}

/** Vibración acorde a la intensidad. En la web solo funciona en navegadores que soportan `navigator.vibrate`. */
export function vibrar(i: Intensidad) {
  // En Android se usa el motor háptico del sistema (más fino que navigator.vibrate y sin permisos extra).
  if (esNativo) {
    void vibrarNativo(i === 'chispa' ? 'leve' : i === 'logro' ? 'medio' : 'fuerte').catch(() => undefined)
    return
  }
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  navigator.vibrate(i === 'chispa' ? 12 : i === 'logro' ? [14, 40, 22] : [20, 50, 20, 50, 60])
}

// ---------------- Partículas ----------------

interface Particula {
  /** nace: marca de tiempo (ms); max: vida en ms. */
  x: number; y: number; vx: number; vy: number; nace: number; max: number
  tam: number; color: string; giro: number; vgiro: number; forma: 0 | 1 | 2
}

let lienzo: HTMLCanvasElement | null = null
let particulas: Particula[] = []
let animando = false

/** Canvas a pantalla completa por encima de todo, que no intercepta toques. Se crea solo cuando hace falta. */
function obtenerLienzo() {
  if (lienzo) return lienzo
  lienzo = document.createElement('canvas')
  lienzo.setAttribute('aria-hidden', 'true')
  Object.assign(lienzo.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '70' })
  document.body.appendChild(lienzo)
  return lienzo
}

let ultimoCuadro = 0

/** Dibuja un cuadro de la animación y programa el siguiente mientras queden partículas vivas. */
function cuadro(ahora: number) {
  // Física por tiempo transcurrido (no por cuadro): igual a 60 y a 120 Hz, y si la pestaña se
  // pausa las partículas vencen por reloj en vez de quedarse congeladas en pantalla.
  const dt = ultimoCuadro ? Math.min(3, (ahora - ultimoCuadro) / 16.67) : 1
  ultimoCuadro = ahora
  const c = obtenerLienzo()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (c.width !== innerWidth * dpr) {
    c.width = innerWidth * dpr
    c.height = innerHeight * dpr
  }
  const g = c.getContext('2d')!
  // Se dibuja en píxeles CSS; la escala por densidad de pantalla la aplica la transformación.
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, innerWidth, innerHeight)
  particulas = particulas.filter((p) => ahora - p.nace < p.max)
  for (const p of particulas) {
    p.vy += 0.18 * dt // gravedad
    const arrastre = Math.pow(0.985, dt) // arrastre del aire
    p.vx *= arrastre
    p.vy *= arrastre
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.giro += p.vgiro * dt
    const resto = 1 - (ahora - p.nace) / p.max
    g.globalAlpha = Math.min(1, resto * 1.6)
    g.fillStyle = p.color
    g.save()
    g.translate(p.x, p.y)
    g.rotate(p.giro)
    if (p.forma === 0) {
      g.beginPath()
      g.arc(0, 0, p.tam / 2, 0, Math.PI * 2)
      g.fill()
    } else if (p.forma === 1) {
      g.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2) // confeti
    } else {
      // destello de cuatro puntas
      g.beginPath()
      const r = p.tam / 2
      g.moveTo(0, -r); g.lineTo(r * 0.25, -r * 0.25); g.lineTo(r, 0); g.lineTo(r * 0.25, r * 0.25)
      g.lineTo(0, r); g.lineTo(-r * 0.25, r * 0.25); g.lineTo(-r, 0); g.lineTo(-r * 0.25, -r * 0.25)
      g.fill()
    }
    g.restore()
  }
  g.globalAlpha = 1
  if (particulas.length) requestAnimationFrame(cuadro)
  else {
    animando = false
    ultimoCuadro = 0
    // Fuera del DOM cuando no hay partículas: nada debe quedar encima del contenido.
    lienzo?.remove()
    lienzo = null
  }
}

/** Ráfaga de partículas desde un punto. */
export function rafaga(x: number, y: number, i: Intensidad) {
  if (movimientoReducido() || typeof document === 'undefined') return
  const nace = performance.now()
  const n = i === 'chispa' ? 14 : i === 'logro' ? 36 : 0
  for (let k = 0; k < n; k++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5
    const vel = (i === 'chispa' ? 2.5 : 4) + Math.random() * (i === 'chispa' ? 3 : 5)
    particulas.push({
      x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      nace, max: 650 + Math.random() * 430, tam: 4 + Math.random() * (i === 'chispa' ? 4 : 7),
      color: COLORES[k % COLORES.length], giro: Math.random() * 6, vgiro: (Math.random() - 0.5) * 0.3,
      forma: (k % 3) as 0 | 1 | 2,
    })
  }
  if (i === 'celebracion') {
    // Lluvia de confeti desde arriba, a todo el ancho.
    for (let k = 0; k < 140; k++) {
      particulas.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, nace, max: 2000 + Math.random() * 1000,
        tam: 6 + Math.random() * 7, color: COLORES[k % COLORES.length], giro: Math.random() * 6,
        vgiro: (Math.random() - 0.5) * 0.25, forma: k % 4 === 0 ? 2 : 1,
      })
    }
  }
  if (!animando) {
    animando = true
    requestAnimationFrame(cuadro)
  }
}

// ---------------- Puntos que vuelan al marcador ----------------

// Se recuerda dónde tocó el usuario por última vez para que los puntos salgan "del botón" que tocó.
let ultimoToque: { x: number; y: number } | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => (ultimoToque = { x: e.clientX, y: e.clientY }), { capture: true, passive: true })
}

/** Punto de origen razonable: el último toque del usuario, o el centro de la pantalla. */
export function origenActual() {
  return ultimoToque ?? { x: innerWidth / 2, y: innerHeight / 2 }
}

/**
 * Hace volar "+N pts" desde el origen hasta el marcador del FinScore (elemento con
 * `data-destino-puntos`). Así el usuario ve de dónde vienen los puntos y adónde llegan.
 */
export function volarPuntos(texto: string, desde = origenActual()): Promise<void> {
  const destino = [...document.querySelectorAll<HTMLElement>('[data-destino-puntos]')].find((el) => el.offsetParent !== null)
  if (!destino || movimientoReducido()) return Promise.resolve()
  const r = destino.getBoundingClientRect()
  const hasta = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  const el = document.createElement('div')
  el.textContent = texto
  el.setAttribute('aria-hidden', 'true')
  el.className = 'ft-puntos-vuelo'
  el.style.left = `${desde.x}px`
  el.style.top = `${desde.y}px`
  document.body.appendChild(el)
  const dx = hasta.x - desde.x
  const dy = hasta.y - desde.y
  // Arco: primero sube un poco (impulso) y luego viaja al marcador encogiéndose.
  const anim = el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0 },
      { transform: 'translate(-50%, -120%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.9 },
    ],
    { duration: 820, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'forwards' },
  )
  return anim.finished.then(() => {
    el.remove()
    destino.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
    rafaga(hasta.x, hasta.y, 'chispa')
  })
}

/** Atajo: el estímulo completo para una acción que ganó puntos. */
export function celebrar(i: Intensidad, puntos?: number, desde = origenActual()) {
  sonar(i === 'chispa' ? 'moneda' : i === 'logro' ? 'logro' : 'fanfarria')
  vibrar(i)
  rafaga(desde.x, desde.y, i)
  if (puntos) void volarPuntos(`+${String(puntos).replace('.', ',')} pts`, desde)
}
