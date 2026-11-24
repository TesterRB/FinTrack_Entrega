/**
 * Panel de comercios aliados (solo administradores): revisa las facturas que la validación automática
 * dejó pendientes y administra aliados y promociones.
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react'
import { useDatos } from '../hooks/useAnalitica'
import { useApp } from '../store/app'
import { Boton, Campo, Insignia, Modal, Selector, Tarjeta, Titulo, Vacio, claseInput, ChipCategoria } from '../components/ui'
import { LISTA_CATEGORIAS } from '../lib/categorias'
import { ICONO_CATEGORIA } from '../components/iconos'
import { hoyISO, pesos, sumarDias, uid } from '../lib/formato'
import type { Aliado, Factura, IdCategoria, Promocion } from '../lib/tipos'
import { backend } from '../data'

/** Miniatura de la factura; la URL se pide al backend (en Supabase es una URL firmada temporal). */
function ImagenFactura({ f }: { f: Factura }) {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    backend.urlImagen(f.imagen).then(setUrl)
  }, [f.imagen])
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Factura" className="h-44 w-32 rounded-[10px] object-cover object-top border border-linea" /></a> : <div className="h-44 w-32 animate-pulse rounded-[10px] bg-elevada" />
}

export default function Admin() {
  const d = useDatos()
  const { revisarFactura, guardarAliado, guardarPromocion, avisar } = useApp()
  const [tab, setTab] = useState<'facturas' | 'promociones' | 'aliados'>('facturas')
  const [aliado, setAliado] = useState<Aliado | null>(null)
  const [promo, setPromo] = useState<(Promocion & { reglasTexto: string }) | null>(null)
  const [motivo, setMotivo] = useState<Record<string, string>>({})

  const pendientes = d.facturas.filter((f) => f.estado === 'pendiente')
  const nombreAliado = (id: string) => d.aliados.find((a) => a.id === id)?.nombre ?? '—'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Panel de comercios aliados</h1>
        <p className="text-sm text-tenue">Gestiona aliados, promociones y las facturas que la lectura automática no pudo aprobar sola.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          ['Facturas por revisar', pendientes.length],
          ['Aprobadas', d.facturas.filter((f) => f.estado === 'aprobada').length],
          ['Aprobación automática', d.facturas.length ? `${Math.round((d.facturas.filter((f) => f.estado === 'aprobada' && !f.alertas.length).length / d.facturas.length) * 100)} %` : '—'],
          ['Promociones activas', d.promociones.filter((p) => p.activa && p.hasta >= hoyISO()).length],
        ].map(([t, v]) => (
          <Tarjeta key={t} className="!p-4"><p className="text-xs text-tenue">{t}</p><p className="text-2xl font-extrabold">{v}</p></Tarjeta>
        ))}
      </div>

      <div className="flex gap-1 rounded-[10px] bg-superficie p-1">
        {(['facturas', 'promociones', 'aliados'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx('flex-1 rounded-[10px] py-2 text-sm font-semibold capitalize', tab === t ? 'bg-marca-600 text-white' : 'text-tenue')}>{t}</button>
        ))}
      </div>

      {tab === 'facturas' && (
        <div className="space-y-3">
          {d.facturas.length === 0 && <Vacio titulo="Sin facturas" texto="Cuando los usuarios participen en promociones verás aquí sus facturas." />}
          {[...d.facturas].sort((a, b) => (a.estado === 'pendiente' ? -1 : 1) - (b.estado === 'pendiente' ? -1 : 1) || b.creadoEn.localeCompare(a.creadoEn)).map((f) => {
            const p = d.promociones.find((x) => x.id === f.promocionId)
            return (
              <Tarjeta key={f.id} className="flex flex-col gap-4 sm:flex-row">
                <ImagenFactura f={f} />
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{p?.titulo ?? 'Sin promoción'}</p>
                    <Insignia tono={f.estado === 'aprobada' ? 'ok' : f.estado === 'pendiente' ? 'aviso' : 'alerta'}>{f.estado}</Insignia>
                  </div>
                  <p className="text-xs text-tenue">{f.usuarioNombre} · {new Date(f.creadoEn).toLocaleString('es-CO')} · Aliado: {p ? nombreAliado(p.aliadoId) : '—'}</p>
                  <p className="text-xs">Leído → NIT: <b>{f.ocr.nit ?? '—'}</b> · Fecha: <b>{f.ocr.fecha ?? '—'}</b> · Total: <b>{f.ocr.total ? pesos(f.ocr.total) : '—'}</b> · Nitidez {Math.round(f.ocr.confianza)} %</p>
                  {f.alertas.length > 0 && <ul className="list-inside list-disc text-xs text-amber-700">{f.alertas.map((x) => <li key={x}>{x}</li>)}</ul>}
                  {f.estado === 'pendiente' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input className={claseInput + ' !w-64 !py-2'} placeholder="Motivo (si rechazas)" value={motivo[f.id] ?? ''} onChange={(e) => setMotivo({ ...motivo, [f.id]: e.target.value })} />
                      <Boton variante="peligro" className="!py-2" onClick={async () => { await revisarFactura(f.id, 'rechazada', motivo[f.id] || 'No cumple las reglas de la promoción'); avisar('Factura rechazada') }}><XCircle size={15} /> Rechazar</Boton>
                      <Boton className="!py-2" onClick={async () => { await revisarFactura(f.id, 'aprobada', null); avisar('Factura aprobada') }}><CheckCircle2 size={15} /> Aprobar</Boton>
                    </div>
                  )}
                  <details className="text-xs text-tenue"><summary className="cursor-pointer">Texto leído de la factura</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-[10px] bg-elevada p-2">{f.ocr.texto}</pre></details>
                </div>
              </Tarjeta>
            )
          })}
        </div>
      )}

      {tab === 'promociones' && (
        <Tarjeta>
          <Titulo accion={<Boton variante="secundario" disabled={!d.aliados.length} onClick={() => setPromo({ id: uid(), aliadoId: d.aliados[0]?.id ?? '', titulo: '', descripcion: '', beneficio: '', montoMinimo: 0, desde: hoyISO(), hasta: sumarDias(hoyISO(), 30), reglas: [], reglasTexto: 'Una participación por usuario.', activa: true, puntos: 0 })}><Plus size={15} /> Promoción</Boton>}>Promociones</Titulo>
          <ul className="divide-y divide-linea">
            {d.promociones.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.titulo}</p>
                  <p className="text-xs text-tenue">{nombreAliado(p.aliadoId)} · {p.desde} → {p.hasta} · mín. {pesos(p.montoMinimo)} · {d.facturas.filter((f) => f.promocionId === p.id).length} participaciones</p>
                </div>
                <Insignia tono={p.activa && p.hasta >= hoyISO() ? 'ok' : 'neutro'}>{p.activa && p.hasta >= hoyISO() ? 'Activa' : 'Inactiva'}</Insignia>
                <button className="p-1 text-tenue hover:text-marca-700 dark:text-marca-300" onClick={() => setPromo({ ...p, reglasTexto: p.reglas.join('\n') })} aria-label="Editar"><Pencil size={15} /></button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {tab === 'aliados' && (
        <Tarjeta>
          <Titulo accion={<Boton variante="secundario" onClick={() => setAliado({ id: uid(), nombre: '', nit: '', categoria: 'comida', ciudad: 'Cali', logo: '' })}><Plus size={15} /> Aliado</Boton>}>Comercios aliados</Titulo>
          <ul className="divide-y divide-linea">
            {d.aliados.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                <ChipCategoria id={a.categoria} texto={a.nombre} tam={40} />
                <div className="min-w-0 flex-1"><p className="font-semibold">{a.nombre}</p><p className="text-xs text-tenue">NIT {a.nit} · {a.ciudad}</p></div>
                <button className="p-1 text-tenue hover:text-marca-700 dark:text-marca-300" onClick={() => setAliado(a)} aria-label="Editar"><Pencil size={15} /></button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Modal abierto={!!aliado} onCerrar={() => setAliado(null)} titulo="Comercio aliado">
        {aliado && (
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await guardarAliado(aliado); setAliado(null); avisar('Aliado guardado') }}>
            <Campo etiqueta="Nombre"><input required className={claseInput} value={aliado.nombre} onChange={(e) => setAliado({ ...aliado, nombre: e.target.value })} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="NIT" ayuda="Se compara con el NIT leído en la factura."><input required className={claseInput} value={aliado.nit} onChange={(e) => setAliado({ ...aliado, nit: e.target.value })} placeholder="900123456-7" /></Campo>
              <Campo etiqueta="Ciudad"><input className={claseInput} value={aliado.ciudad} onChange={(e) => setAliado({ ...aliado, ciudad: e.target.value })} /></Campo>
            </div>
            <Campo etiqueta="Categoría de gasto">
              <Selector etiqueta="Categoría de gasto" valor={aliado.categoria} onCambio={(v: IdCategoria) => setAliado({ ...aliado, categoria: v })} opciones={LISTA_CATEGORIAS.map((c) => ({ valor: c.id, etiqueta: c.nombre, icono: ICONO_CATEGORIA[c.id] }))} />
            </Campo>
            <Boton type="submit" className="w-full">Guardar</Boton>
          </form>
        )}
      </Modal>

      <Modal abierto={!!promo} onCerrar={() => setPromo(null)} titulo="Promoción" ancho="max-w-xl">
        {promo && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const { reglasTexto, ...resto } = promo
              await guardarPromocion({ ...resto, reglas: reglasTexto.split('\n').map((x) => x.trim()).filter(Boolean) })
              setPromo(null)
              avisar('Promoción guardada')
            }}
          >
            <Campo etiqueta="Aliado">
              <Selector etiqueta="Aliado" valor={promo.aliadoId} onCambio={(v) => setPromo({ ...promo, aliadoId: v })} opciones={d.aliados.map((a) => ({ valor: a.id, etiqueta: a.nombre, detalle: a.ciudad, icono: ICONO_CATEGORIA[a.categoria] }))} />
            </Campo>
            <Campo etiqueta="Título"><input required className={claseInput} value={promo.titulo} onChange={(e) => setPromo({ ...promo, titulo: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción"><textarea rows={2} className={claseInput} value={promo.descripcion} onChange={(e) => setPromo({ ...promo, descripcion: e.target.value })} /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Beneficio"><input required className={claseInput} value={promo.beneficio} onChange={(e) => setPromo({ ...promo, beneficio: e.target.value })} /></Campo>
              <Campo etiqueta="Compra mínima"><input inputMode="numeric" className={claseInput} value={promo.montoMinimo ? promo.montoMinimo.toLocaleString('es-CO') : ''} onChange={(e) => setPromo({ ...promo, montoMinimo: Number(e.target.value.replace(/\D/g, '')) })} /></Campo>
              <Campo etiqueta="Desde"><input type="date" className={claseInput} value={promo.desde} onChange={(e) => setPromo({ ...promo, desde: e.target.value })} /></Campo>
              <Campo etiqueta="Hasta"><input type="date" className={claseInput} value={promo.hasta} onChange={(e) => setPromo({ ...promo, hasta: e.target.value })} /></Campo>
            </div>
            <Campo etiqueta="Reglas (una por línea)"><textarea rows={4} className={claseInput} value={promo.reglasTexto} onChange={(e) => setPromo({ ...promo, reglasTexto: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={promo.activa} onChange={(e) => setPromo({ ...promo, activa: e.target.checked })} /> Activa</label>
            <Boton type="submit" className="w-full">Guardar</Boton>
          </form>
        )}
      </Modal>
    </div>
  )
}
