/**
 * Importar extracto: lee un PDF, CSV o foto del extracto bancario, lo compara con lo registrado
 * (conciliación) y deja elegir qué movimientos faltantes agregar. Subir el extracto del mes suma 15 puntos.
 */
import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import Papa from 'papaparse'
import { AlertCircle, Camera, Check, CheckCircle2, ChevronDown, Download, FileText, FileUp, GitCompare, Plus, ScanSearch } from 'lucide-react'
import { useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { AnilloScore, Boton, ChipCategoria, EASE_OUT, SoloPremium, Tarjeta, Titulo, Vacio } from '../components/ui'
import { Monto } from '../components/finanzas'
import { motion } from 'motion/react'
import { CATEGORIAS } from '../lib/categorias'
import { mesActual, mesAnterior, nombreMes, pesos, uid } from '../lib/formato'
import { interpretarCsv, interpretarTextoExtracto, type ExtractoInterpretado } from '../ml/extractos'
import { conciliar } from '../ml/conciliacion'
import { leerPdf, ocrImagen } from '../ml/lectorDocumentos'
import { pdfExtracto } from '../lib/pdfSimple'
import { filasBancoDemo } from '../data/demo'
import { celebrar } from '../lib/estimulos'
import type { Movimiento } from '../lib/tipos'
import { guardarArchivo } from '../lib/archivos'

type Etapa = { tipo: 'inicio' } | { tipo: 'leyendo'; etapa: string; avance: number } | { tipo: 'revision'; extracto: ExtractoInterpretado; archivo: string; metodo: string }

export default function Extractos() {
  const d = useDatos()
  const { modelo, registrarExtracto, avisar } = useApp()
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'inicio' })
  const [error, setError] = useState<string | null>(null)
  const [agregar, setAgregar] = useState<Set<number>>(new Set())
  const [usarBanco, setUsarBanco] = useState<Set<number>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)

  const resultado = useMemo(() => (etapa.tipo === 'revision' ? conciliar(etapa.extracto.filas, d.movimientos) : null), [etapa, d.movimientos])
  const sugerencias = useMemo(
    () => (etapa.tipo === 'revision' ? etapa.extracto.filas.map((f) => modelo.categorizar(f.descripcion, f.monto)) : []),
    [etapa, modelo],
  )

  async function procesar(archivo: File) {
    setError(null)
    setEtapa({ tipo: 'leyendo', etapa: 'Abriendo archivo', avance: 0 })
    const progreso = (e: string, a: number) => setEtapa({ tipo: 'leyendo', etapa: e, avance: a })
    try {
      let extracto: ExtractoInterpretado
      let metodo = 'CSV'
      if (/\.csv$/i.test(archivo.name) || archivo.type === 'text/csv') {
        const texto = await archivo.text()
        const r = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true, delimiter: '' })
        extracto = interpretarCsv(r.data)
      } else if (/\.pdf$/i.test(archivo.name) || archivo.type === 'application/pdf') {
        const lectura = await leerPdf(archivo, progreso)
        metodo = lectura.metodo === 'ocr' ? `OCR (${Math.round(lectura.confianza)} %)` : 'Texto del PDF'
        extracto = interpretarTextoExtracto(lectura.texto)
      } else if (archivo.type.startsWith('image/')) {
        const lectura = await ocrImagen(archivo, progreso)
        metodo = `OCR (${Math.round(lectura.confianza)} %)`
        extracto = interpretarTextoExtracto(lectura.texto)
      } else {
        throw new Error('No podemos abrir ese tipo de archivo. Usa el PDF que te da tu banco, una foto del extracto o un archivo de Excel (.csv).')
      }
      if (!extracto.filas.length) throw new Error('No encontramos movimientos en el documento. Si es un extracto escaneado, intenta con una imagen más nítida.')
      const conc = conciliar(extracto.filas, d.movimientos)
      // Por defecto se agregan todos los movimientos que no estaban registrados.
      setAgregar(new Set(conc.filas.map((f, i) => (f.tipo === 'nuevo' ? i : -1)).filter((i) => i >= 0)))
      setUsarBanco(new Set(conc.filas.map((f, i) => (f.tipo === 'coincide' && f.diferencias.length ? i : -1)).filter((i) => i >= 0)))
      setEtapa({ tipo: 'revision', extracto, archivo: archivo.name, metodo })
    } catch (e) {
      // Los avisos propios se muestran tal cual; cualquier otro error, con un mensaje claro.
      const m = (e as Error).message
      setError(/^(No podemos abrir|No encontramos)/.test(m) ? m : 'No pudimos leer ese archivo. Prueba con el PDF original de tu banco o con una foto nítida del extracto.')
      setEtapa({ tipo: 'inicio' })
    }
  }

  async function confirmar() {
    if (etapa.tipo !== 'revision' || !resultado) return
    setGuardando(true)
    try {
      const extractoId = uid()
      const nuevos: Partial<Movimiento>[] = []
      const ajustes: { id: string; cambios: Partial<Movimiento> }[] = []
      resultado.filas.forEach((r, i) => {
        if (r.tipo === 'nuevo' && agregar.has(i)) {
          nuevos.push({ fecha: r.fila.fecha, descripcion: r.fila.descripcion, monto: r.fila.monto, categoria: sugerencias[i].categoria, confianza: sugerencias[i].confianza, origen: 'extracto', conciliado: true, extractoId, cuentaId: 'banco' })
        }
        if (r.tipo === 'coincide') {
          ajustes.push({ id: r.movimiento.id, cambios: { conciliado: true, extractoId, ...(usarBanco.has(i) ? { monto: r.fila.monto, fecha: r.fila.fecha } : {}) } })
        }
      })
      await registrarExtracto(
        { id: extractoId, banco: etapa.extracto.banco, periodo: etapa.extracto.periodo ?? mesActual(), archivo: etapa.archivo, filas: etapa.extracto.filas.length, conciliados: ajustes.length, agregados: nuevos.length, creadoEn: new Date().toISOString() },
        nuevos,
        ajustes,
      )
      // Los 15 puntos van al mes que cubre el extracto (a veces el anterior): se celebra aquí, no en el marcador.
      celebrar('logro')
      avisar(`Extracto revisado: ${ajustes.length} movimientos confirmados y ${nuevos.length} agregados. +15 pts en el FinScore de ${nombreMes(etapa.extracto.periodo ?? mesActual(), false)}`, 'premio')
      setEtapa({ tipo: 'inicio' })
    } finally {
      setGuardando(false)
    }
  }

  function descargarEjemplo() {
    const mes = mesAnterior(mesActual())
    // En modo demo coincide con los datos de ejemplo, así la conciliación muestra casos reales.
    const blob = pdfExtracto({ banco: 'Banco Andino', titular: d.perfil.nombre, cuenta: '***-4821', mes, filas: filasBancoDemo(mes) })
    guardarArchivo(`extracto-ejemplo-${mes}.pdf`, blob, 'Extracto de ejemplo').catch(() => avisar('No se pudo guardar el extracto de ejemplo. Inténtalo de nuevo.', 'error'))
  }

  const nuevos = resultado ? resultado.filas.map((r, i) => ({ r, i })).filter(({ r }) => r.tipo === 'nuevo') : []
  const diferentes = resultado ? resultado.filas.map((r, i) => ({ r, i })).filter(({ r }) => r.tipo === 'coincide' && r.diferencias.length > 0) : []
  const iguales = resultado ? resultado.filas.filter((r) => r.tipo === 'coincide' && r.diferencias.length === 0) : []
  const alternar = (conj: Set<number>, fijar: (s: Set<number>) => void, i: number) => { const s = new Set(conj); if (s.has(i)) s.delete(i); else s.add(i); fijar(s) }
  const fechaCorta = (f: string) => new Date(f + 'T12:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-6">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Importar extracto</h1>

      <SoloPremium funcion="extractos">
        {etapa.tipo === 'inicio' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) procesar(f) }}
              className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#8f7cfb] via-[#6d4ff0] to-[#5b47e0] p-6 text-white shadow-[0_18px_40px_-18px_rgba(99,56,238,.7)]"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20"><FileUp size={28} /></span>
                <span className="rounded-full bg-menta-100 px-3 py-1 text-[13px] font-bold text-menta-600">+15 pts</span>
              </div>
              <p className="mt-5 text-2xl font-extrabold leading-tight">Sube el extracto de tu banco</p>
              <p className="mt-2 text-[15px] text-white/85">Lo comparamos con lo que anotaste y te mostramos lo que se te pasó. Tu archivo nunca sale de tu celular.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => input.current?.click()} className="tocable flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-bold text-marca-700"><FileUp size={18} /> Elegir archivo</button>
                <button onClick={() => camara.current?.click()} className="tocable flex h-12 items-center justify-center gap-2 rounded-full bg-white/20 text-[15px] font-bold"><Camera size={18} /> Tomar foto</button>
              </div>
              <p className="mt-3 text-center text-[13px] text-white/75">PDF, foto o archivo de Excel (.csv) de cualquier banco</p>
              {error && <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-coral-600">{error}</p>}
              <input ref={input} type="file" hidden accept=".pdf,.csv,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = '' }} />
              <input ref={camara} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = '' }} />
            </motion.div>

            <Tarjeta>
              <Titulo>Así funciona</Titulo>
              <ol className="space-y-4">
                {[
                  { i: ScanSearch, t: 'Leemos tu extracto', d: 'Aunque sea una foto o un PDF escaneado.' },
                  { i: GitCompare, t: 'Lo comparamos con lo tuyo', d: 'Por monto, fecha y comercio.' },
                  { i: CheckCircle2, t: 'Tú decides', d: 'Agregas lo que faltaba con un toque.' },
                ].map(({ i: I, t, d: x }) => (
                  <li key={t} className="flex items-center gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200"><I size={20} /></span>
                    <span><span className="block text-[15px] font-bold">{t}</span><span className="block text-[13px] text-tenue">{x}</span></span>
                  </li>
                ))}
              </ol>
              <button onClick={descargarEjemplo} className="tocable mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-elevada py-3 text-sm font-semibold"><Download size={16} /> Probar con un extracto de ejemplo</button>
            </Tarjeta>
          </div>
        )}

        {etapa.tipo === 'leyendo' && (
          <Tarjeta className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
            <AnilloScore valor={Math.round(etapa.avance * 100)} tam={120} grosor={10}>
              <span className="num text-2xl font-extrabold">{Math.round(etapa.avance * 100)} %</span>
            </AnilloScore>
            <p className="mt-5 text-lg font-bold">{etapa.etapa}…</p>
            <p className="mt-1 text-[15px] text-tenue">Esto toma unos segundos (la primera vez, un poco más).</p>
          </Tarjeta>
        )}

        {etapa.tipo === 'revision' && resultado && (
          <div className="space-y-6 pb-24">
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: resultado.resumen.coincidencias, t: 'Coinciden', c: 'bg-menta-100 text-menta-600 dark:bg-menta-500/15 dark:text-menta-400', i: Check },
                { n: resultado.resumen.nuevos, t: 'Te faltaban', c: 'bg-marca-50 text-marca-600 dark:bg-marca-500/20 dark:text-marca-200', i: Plus },
                { n: resultado.resumen.conDiferencias, t: 'Diferentes', c: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', i: AlertCircle },
              ].map(({ n, t, c, i: I }, k) => (
                <motion.div key={t} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.3, delay: k * 0.07 }} className="rounded-[20px] bg-superficie p-4 text-center shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea">
                  <span className={clsx('mx-auto grid h-10 w-10 place-items-center rounded-full', c)}><I size={19} strokeWidth={2.5} /></span>
                  <p className="num mt-2 text-2xl font-extrabold">{n}</p>
                  <p className="text-[13px] text-tenue">{t}</p>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-[13px] text-tenue">{etapa.extracto.banco} · {etapa.extracto.periodo ? nombreMes(etapa.extracto.periodo) : ''}</p>

            {nuevos.length > 0 && (
              <section>
                <Titulo accion={<span className="text-[13px] text-tenue">{pesos(nuevos.reduce((s, { r }) => s + Math.abs(r.fila.monto), 0))}</span>}>Te faltaba registrar</Titulo>
                <Tarjeta className="!p-2">
                  {nuevos.map(({ r, i }) => (
                    <button key={i} onClick={() => alternar(agregar, setAgregar, i)} className="tocable flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-elevada">
                      <ChipCategoria id={sugerencias[i].categoria} texto={r.fila.descripcion} tam={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{r.fila.descripcion}</span>
                        <span className="block text-[13px] text-tenue">{fechaCorta(r.fila.fecha)} · {CATEGORIAS[sugerencias[i].categoria].nombre}</span>
                      </span>
                      <Monto valor={r.fila.monto} className="shrink-0 text-[15px]" />
                      <Interruptor activo={agregar.has(i)} etiqueta={`Agregar ${r.fila.descripcion}`} />
                    </button>
                  ))}
                </Tarjeta>
              </section>
            )}

            {diferentes.length > 0 && (
              <section>
                <Titulo>Cambió el monto o la fecha</Titulo>
                <Tarjeta className="!p-2">
                  {diferentes.map(({ r, i }) => r.tipo === 'coincide' && (
                    <button key={i} onClick={() => alternar(usarBanco, setUsarBanco, i)} className="tocable flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-elevada">
                      <ChipCategoria id={r.movimiento.categoria} texto={r.movimiento.descripcion} tam={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{r.movimiento.descripcion}</span>
                        <span className="block text-[13px] text-tenue">Anotaste {pesos(Math.abs(r.movimiento.monto))} · el banco dice <b className="text-tinta">{pesos(Math.abs(r.fila.monto))}</b></span>
                      </span>
                      <Interruptor activo={usarBanco.has(i)} etiqueta="Usar el dato del banco" />
                    </button>
                  ))}
                </Tarjeta>
                <p className="mt-2 px-1 text-[13px] text-tenue">Activado: corregimos tu registro con el dato del banco.</p>
              </section>
            )}

            {iguales.length > 0 && (
              <details className="group rounded-tarjeta bg-superficie p-4 shadow-suave dark:shadow-none dark:ring-1 dark:ring-linea">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-menta-100 text-menta-600 dark:bg-menta-500/15"><Check size={19} strokeWidth={2.5} /></span>
                  <span className="flex-1 text-[15px] font-semibold">{iguales.length} ya estaban bien registrados</span>
                  <ChevronDown size={18} className="text-tenue transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <ul className="mt-3 space-y-1">
                  {iguales.map((r, k) => r.tipo === 'coincide' && (
                    <li key={k} className="flex justify-between gap-3 py-1.5 text-sm"><span className="truncate">{r.movimiento.descripcion}</span><Monto valor={r.fila.monto} className="shrink-0" /></li>
                  ))}
                </ul>
              </details>
            )}

            {resultado.soloEnApp.length > 0 && (
              <p className="px-1 text-[13px] text-tenue">{resultado.soloEnApp.length} de tus registros no aparecen en el extracto (probablemente pagos en efectivo). Se quedan tal cual.</p>
            )}

            <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 px-5 lg:static lg:px-0">
              <div className="mx-auto flex max-w-md gap-2 rounded-full bg-superficie p-2 shadow-flotante lg:max-w-none lg:justify-end lg:bg-transparent lg:p-0 lg:shadow-none">
                <Boton variante="fantasma" className="!h-12" onClick={() => setEtapa({ tipo: 'inicio' })}>Cancelar</Boton>
                <Boton className="flex-1 lg:flex-none" onClick={confirmar} cargando={guardando}>
                  {agregar.size ? `Agregar ${agregar.size} y terminar` : 'Terminar'}
                </Boton>
              </div>
            </div>
          </div>
        )}
      </SoloPremium>

      {etapa.tipo !== 'revision' && (
        <section>
          <Titulo>Extractos que ya subiste</Titulo>
          {d.extractos.length ? (
            <Tarjeta className="!p-2">
              {[...d.extractos].sort((x, y) => y.creadoEn.localeCompare(x.creadoEn)).map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-2xl p-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marca-50 text-marca-600 dark:bg-marca-500/20"><FileText size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold capitalize">{nombreMes(e.periodo)}</p>
                    <p className="text-[13px] text-tenue">{e.banco} · {e.agregados} gastos recuperados</p>
                  </div>
                  <span className="rounded-full bg-menta-100 px-2.5 py-1 text-xs font-bold text-menta-600 dark:bg-menta-500/15 dark:text-menta-400">+15 pts</span>
                </div>
              ))}
            </Tarjeta>
          ) : (
            <Vacio icono={FileText} titulo="Aún no has subido extractos" texto="Súbelo cada mes y suma 15 puntos a tu FinScore." />
          )}
        </section>
      )}
    </div>
  )
}

/** Interruptor visual (el botón de la fila es el control; esto solo muestra el estado). */
function Interruptor({ activo, etiqueta }: { activo: boolean; etiqueta: string }) {
  return (
    <span role="switch" aria-checked={activo} aria-label={etiqueta} className={clsx('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200', activo ? 'bg-marca-600' : 'bg-linea')}>
      <motion.span layout transition={{ type: 'spring', duration: 0.35, bounce: 0.25 }} className={clsx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow', activo ? 'right-0.5' : 'left-0.5')} />
    </span>
  )
}
