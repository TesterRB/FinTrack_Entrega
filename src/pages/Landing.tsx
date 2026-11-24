/**
 * Landing pública (solo en la web y sin sesión; la app de Android entra directo al acceso).
 *
 * Cuatro bloques: portada, cómo funciona en tres pasos, FinScore y cierre. Los elementos 3D (celular con
 * pantallas reales, monedas y logo en volumen) los dibuja `landing/escena3d.ts` sobre las "ranuras" marcadas
 * con `data-3d`. Mientras la escena carga, o si el navegador no tiene WebGL, se ven las imágenes planas que hay
 * dentro de cada ranura; cuando el 3D ya dibujó su primer cuadro, esas imágenes se ocultan.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { motion, MotionConfig } from 'motion/react'
import { ArrowRight, Flame, Sparkles } from 'lucide-react'
import { Logo, Marca } from '../components/Logo'
import { AnilloScore, EASE_OUT, entrada } from '../components/ui'
import { modoBackend } from '../store/app'
import { BETA, PRECIOS, RECOMPENSAS } from '../lib/planes'
import { mesActual, nombreMes, pesos } from '../lib/formato'

const BASE = import.meta.env.BASE_URL

const BOTON =
  'inline-flex items-center justify-center gap-2 rounded-full bg-marca-600 font-semibold text-white shadow-boton transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-marca-700 active:scale-[.97]'

/** Los tres pasos de "Cómo funciona", cada uno con la pantalla real que lo muestra. */
const PASOS = [
  {
    pantalla: 'registrar',
    titulo: 'Anotas en 3 segundos',
    texto: 'Escribe «almuerzo 18.000» y listo. Tu asistente pone la categoría y aprende de cada corrección que le haces.',
    alt: 'Pantalla para registrar un gasto con la categoría sugerida',
  },
  {
    pantalla: 'extracto',
    titulo: 'Tu extracto llena los huecos',
    texto: 'Sube el PDF, CSV o una foto del extracto de tu banco. FinTrack lo compara con lo que anotaste y te muestra lo que se te pasó, sin conectar tu cuenta.',
    alt: 'Pantalla de comparación del extracto con los gastos anotados',
  },
  {
    pantalla: 'asistente',
    titulo: 'Entiendes en qué se va la plata',
    texto: 'Gastos hormiga, suscripciones que se acumulan, cobros dobles y cómo podría cerrar tu mes. Cada consejo trae los movimientos que lo prueban.',
    alt: 'Pantalla del asistente con el gasto por categoría y sus consejos',
  },
] as const

/** Entra con un leve ascenso la primera vez que aparece en pantalla. */
function Aparece({ children, className, retraso = 0 }: { children: ReactNode; className?: string; retraso?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: retraso }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Ranura del celular 3D. Su caja define dónde y de qué tamaño se dibuja; `giro` lo inclina hacia el texto.
 * Adentro va la captura plana, visible solo hasta que el 3D esté listo (o siempre, si no hay WebGL).
 */
function Celular({ pantalla, alt, giro = 0, con3d, className, prioritaria }: {
  pantalla: string
  alt: string
  giro?: number
  con3d: boolean
  className?: string
  prioritaria?: boolean
}) {
  return (
    <div data-3d="telefono" data-pantalla={pantalla} data-giro={giro} className={clsx('relative aspect-[1/2.15]', className)}>
      <img
        src={`${BASE}landing/${pantalla}.webp`} alt={alt} loading={prioritaria ? 'eager' : 'lazy'} decoding="async"
        className={clsx(
          'h-full w-full rounded-[2.1rem] border-[7px] border-[#1d1a3d] bg-white object-cover object-top shadow-[0_30px_60px_-20px_rgba(46,26,120,.45)] transition-opacity duration-500',
          con3d && 'opacity-0',
        )}
      />
    </div>
  )
}

/** Chip flotante junto al celular de la portada. */
function Chip({ children, className, retraso }: { children: ReactNode; className: string; retraso: string }) {
  return (
    <span
      className={clsx('ft-flota absolute flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-noche-900 shadow-[0_12px_30px_-12px_rgba(46,26,120,.4)] ring-1 ring-black/5', className)}
      style={{ animationDelay: retraso }}
    >
      {children}
    </span>
  )
}

/** "clara" en violeta con un trazo menta debajo, como en la presentación. */
function Resaltado({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block text-marca-600">
      {children}
      <svg aria-hidden="true" viewBox="0 0 200 16" preserveAspectRatio="none" className="absolute -bottom-[0.06em] left-0 h-[0.16em] w-full">
        <path d="M3 11 C 50 4, 120 3, 197 8" fill="none" stroke="#4fd8b4" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function Landing() {
  const raiz = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const [con3d, setCon3d] = useState(false)

  // La landing tiene su propia paleta clara; el tema oscuro aplica dentro de la app.
  useEffect(() => {
    const oscuro = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    return () => {
      if (oscuro) document.documentElement.classList.add('dark')
    }
  }, [])

  // three.js se carga aparte, después de pintar el texto: la página se puede leer mientras llega el 3D.
  useEffect(() => {
    const control = new AbortController()
    import('./landing/escena3d')
      .then(({ montarEscena }) => montarEscena(capa.current!, raiz.current!, control.signal, () => setCon3d(true)))
      .catch(() => undefined) // sin 3D: se quedan las imágenes planas
    return () => control.abort()
  }, [])

  const prueba = BETA ? 'Gratis durante la beta, con todo desbloqueado' : `${RECOMPENSAS.diasPrueba} días con todo desbloqueado`

  return (
    <MotionConfig reducedMotion="user">
      <div ref={raiz} className="relative min-h-svh overflow-x-clip bg-[#f6f5fb] text-noche-900">
        {/* Luz de fondo: lavanda arriba a la izquierda y menta a la derecha, como en la presentación. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[130svh] bg-[radial-gradient(55%_45%_at_12%_8%,rgba(146,130,252,.30),transparent_70%),radial-gradient(45%_40%_at_92%_70%,rgba(79,216,180,.24),transparent_70%)]"
        />
        {/* Capa del 3D: fija, sobre el contenido y sin recibir toques. La escena pone aquí su lienzo. */}
        <div ref={capa} aria-hidden="true" className="pointer-events-none fixed inset-0 z-10" />

        <header className="sticky top-0 z-30 bg-[#f6f5fb]/80 backdrop-blur-md">
          <nav className="mx-auto flex max-w-[1180px] items-center gap-6 px-5 py-3.5 sm:px-8" aria-label="Principal">
            <Link to="/" aria-label="FinTrack, inicio"><Marca tam={34} /></Link>
            <div className="ml-4 hidden gap-6 text-[15px] font-medium text-slate-600 md:flex">
              <a href="#como-funciona" className="hover:text-noche-900">Cómo funciona</a>
              <a href="#finscore" className="hover:text-noche-900">FinScore</a>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Link to="/entrar" className="hidden rounded-full px-4 py-2.5 text-[15px] font-semibold hover:bg-white sm:block">Entrar</Link>
              <Link to="/entrar?modo=registro" className={clsx(BOTON, 'px-5 py-2.5 text-[15px]')}>Empieza gratis</Link>
            </div>
          </nav>
        </header>

        <main className="relative">
          {/* ---------------- Portada ---------------- */}
          <section className="mx-auto grid max-w-[1180px] items-center gap-6 px-5 pb-16 pt-8 sm:px-8 lg:min-h-[calc(100svh-68px)] lg:grid-cols-[1.05fr_.95fr] lg:pb-20 lg:pt-2">
            <div>
              <motion.p {...entrada(0)} className="text-[13px] font-bold uppercase tracking-[.09em] text-marca-700">
                Finanzas personales · Hecha en Colombia
              </motion.p>
              <motion.h1 {...entrada(1)} className="mt-5 text-[clamp(2.7rem,6.2vw,4.9rem)] font-extrabold leading-[.98] tracking-[-0.045em]">
                Tu plata, <Resaltado>clara</Resaltado>
                <br className="hidden sm:block" /> en 3 segundos.
              </motion.h1>
              <motion.p {...entrada(2)} className="mt-6 max-w-[33rem] text-[18px] leading-relaxed text-slate-600">
                Anotas en segundos, tu extracto completa lo que se te pasó y un asistente te explica en qué se va la plata. La inteligencia que lo hace corre en tu dispositivo.
              </motion.p>
              <motion.div {...entrada(3)} className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/entrar?modo=registro" className={clsx(BOTON, 'px-6 py-3.5 text-base')}>
                  Empieza gratis <ArrowRight size={18} />
                </Link>
                {modoBackend === 'demo' ? (
                  <Link to="/demo" className="rounded-full px-5 py-3.5 text-base font-semibold hover:bg-white">Ver la demo</Link>
                ) : (
                  <a href="#como-funciona" className="rounded-full px-5 py-3.5 text-base font-semibold hover:bg-white">Cómo funciona</a>
                )}
              </motion.div>
              <motion.p {...entrada(4)} className="mt-6 text-[14px] text-slate-500">{prueba} · Sin conectar tu banco</motion.p>
            </div>

            {/* Celular con monedas alrededor. Va por encima de la capa 3D para que los chips queden delante. */}
            <div className="relative z-20 mx-auto w-[88%] max-w-[440px] lg:w-full">
              <div data-3d="monedas" data-formacion="orbita" className="relative flex aspect-[5/6] w-full items-center justify-center">
                <Celular pantalla="inicio" giro={-0.18} con3d={con3d} prioritaria className="h-[86%]" alt="Pantalla de inicio de FinTrack con el balance y el resumen del mes" />
                <Chip className="left-[-4%] top-[44%]" retraso="0s"><Sparkles size={15} className="text-marca-600" /> Comida · sugerida</Chip>
                <Chip className="right-[2%] top-[9%] !grid h-14 w-14 place-items-center !rounded-full !bg-[#22c39a] !p-0 text-center !text-white" retraso="-2s">
                  <span className="leading-none"><b className="block text-[17px]">+2</b><span className="text-[10px] font-semibold">pts</span></span>
                </Chip>
                <Chip className="bottom-[16%] right-[-6%]" retraso="-3.5s"><Flame size={15} className="fill-amber-400 text-amber-500" /> 18 días seguidos</Chip>
              </div>
            </div>
          </section>

          {/* ---------------- Cómo funciona ---------------- */}
          <section id="como-funciona" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
            <Aparece className="max-w-2xl">
              <h2 className="text-[clamp(2.1rem,4vw,3.3rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">Hace la parte aburrida por ti</h2>
              <p className="mt-4 text-[18px] leading-relaxed text-slate-600">Tres cosas que FinTrack resuelve para que llegues al 30 sabiendo dónde estás.</p>
            </Aparece>
            <div className="mt-14 space-y-16 lg:mt-6 lg:space-y-0">
              {PASOS.map((p, i) => {
                const derecha = i % 2 === 0 // el celular alterna de lado en escritorio
                return (
                  <div key={p.pantalla} className="grid items-center gap-8 lg:min-h-[640px] lg:grid-cols-2 lg:gap-16">
                    <Aparece className={clsx(!derecha && 'lg:order-2')}>
                      <span className="num text-[15px] font-bold text-marca-600">0{i + 1}</span>
                      <h3 className="mt-2 text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.035em]">{p.titulo}</h3>
                      <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed text-slate-600">{p.texto}</p>
                    </Aparece>
                    <div className={clsx('flex justify-center', !derecha && 'lg:order-1')}>
                      <Celular pantalla={p.pantalla} alt={p.alt} giro={derecha ? -0.24 : 0.24} con3d={con3d} className="h-[min(64vh,540px)]" />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ---------------- FinScore ---------------- */}
          <section id="finscore" className="scroll-mt-20 px-3 sm:px-5">
            <div className="mx-auto max-w-[1240px] rounded-[36px] bg-gradient-to-br from-[#8f7cfb] via-[#6d4ff0] to-[#4b2fd6] px-6 py-16 text-white sm:px-12 lg:py-24">
              <div className="mx-auto grid max-w-[1100px] items-center gap-14 lg:grid-cols-2">
                <Aparece>
                  <p className="text-[13px] font-bold uppercase tracking-[.09em] text-white/70">FinScore</p>
                  <h2 className="mt-4 text-[clamp(2.1rem,4vw,3.3rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">Tu constancia vale plata</h2>
                  <p className="mt-5 max-w-[31rem] text-[17px] leading-relaxed text-white/80">
                    Cada mes tienes un puntaje de 0 a 100. Sube cuando anotas, subes tu extracto, revisas tus presupuestos y cumples retos. El primer día del mes vuelve a cero.
                  </p>
                  <ul className="mt-8 space-y-3">
                    {[
                      [`${RECOMPENSAS.umbralCupon} pts`, `Cupón del ${RECOMPENSAS.descuentoCupon} % en tu plan`],
                      [`${RECOMPENSAS.umbralMesExtra} pts`, `Cupón del ${RECOMPENSAS.descuentoPerfecto} % y ${RECOMPENSAS.diasPremiumPerfecto} días Premium`],
                    ].map(([puntos, premio]) => (
                      <li key={puntos} className="flex items-center gap-4 rounded-2xl bg-white/10 px-4 py-3.5 ring-1 ring-white/15">
                        <span className="num shrink-0 rounded-full bg-white px-3 py-1 text-[14px] font-bold text-marca-700">{puntos}</span>
                        <span className="text-[16px] font-semibold">{premio}</span>
                      </li>
                    ))}
                  </ul>
                  {BETA && <p className="mt-5 text-[14px] text-white/65">Durante la beta los puntos ya cuentan; los cupones se activan con los planes de pago.</p>}
                </Aparece>

                {/* Tarjeta del puntaje con las monedas alrededor (la tarjeta va delante de la capa 3D). */}
                <div className="relative z-20 mx-auto w-full max-w-[420px]">
                  <div data-3d="monedas" data-formacion="marco" className="mx-auto grid aspect-square w-[84%] place-items-center">
                    <div className="w-[74%] rounded-[28px] bg-white p-6 text-center text-noche-900 shadow-[0_30px_60px_-24px_rgba(20,10,70,.6)]">
                      <p className="text-[13px] font-semibold text-slate-500">FinScore de {nombreMes(mesActual(), false)}</p>
                      <div className="mt-3 flex justify-center">
                        <AnilloScore valor={85} tam={132} grosor={12} color="#22c39a">
                          <div>
                            <p className="num text-4xl font-extrabold leading-none">85</p>
                            <p className="mt-1 text-xs text-slate-500">de 100</p>
                          </div>
                        </AnilloScore>
                      </div>
                      <p className="mt-4 flex items-center justify-center gap-1.5 text-[14px] font-semibold"><Flame size={16} className="fill-amber-400 text-amber-500" /> 12 días seguidos</p>
                      <p className="mt-1 text-[13px] text-slate-500">15 pts para el mes perfecto</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Cierre ---------------- */}
          <section className="mt-20 bg-noche-900 text-white lg:mt-28">
            <div className="mx-auto flex max-w-[1180px] flex-col items-center px-5 pb-16 pt-20 text-center sm:px-8">
              <div data-3d="logo" className="grid h-36 w-36 place-items-center sm:h-44 sm:w-44">
                <img src={`${BASE}logo.svg`} alt="" className={clsx('h-[88%] w-[88%] transition-opacity duration-500', con3d && 'opacity-0')} />
              </div>
              <Aparece>
                <h2 className="mt-8 max-w-[19ch] text-[clamp(2rem,4vw,3.2rem)] font-extrabold leading-[1.04] tracking-[-0.04em]">
                  Empieza hoy y cierra el mes con tu primer FinScore.
                </h2>
                <p className="mt-5 text-[17px] text-white/70">
                  {BETA ? 'Gratis durante la beta, con todo desbloqueado.' : `Gratis para empezar. Plus ${pesos(PRECIOS.plus)} y Pro ${pesos(PRECIOS.pro)} al mes.`}
                </p>
                <Link to="/entrar?modo=registro" className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-noche-900 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[.97]">
                  Crear mi cuenta <ArrowRight size={18} />
                </Link>
              </Aparece>
            </div>
            <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-t border-white/10 px-5 py-6 text-[14px] text-white/60 sm:px-8">
              <span className="flex items-center gap-2.5"><Logo tam={22} tile /> FinTrack · Hecha en Colombia</span>
              <nav className="flex gap-5" aria-label="Pie de página">
                <a href="#como-funciona" className="hover:text-white">Cómo funciona</a>
                <a href="#finscore" className="hover:text-white">FinScore</a>
                <Link to="/entrar" className="hover:text-white">Entrar</Link>
              </nav>
            </footer>
          </section>
        </main>
      </div>
    </MotionConfig>
  )
}
