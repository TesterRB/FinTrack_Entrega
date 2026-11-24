/**
 * Pruebas del motor de la app: lectura de montos y fechas, clasificador, extractos, conciliación,
 * recurrentes, anomalías, pronóstico, OCR de facturas y FinScore. Se corren con `npm test`
 * y en GitHub Actions en cada push (`.github/workflows/ci.yml`).
 */
import { describe, expect, it } from 'vitest'
import type { Aliado, Movimiento, Promocion } from '../lib/tipos'
import { ClasificadorCategorias } from './clasificador'
import { interpretarCsv, interpretarTextoExtracto, parseFechaExtracto, parseMonto } from './extractos'
import { conciliar } from './conciliacion'
import { detectarRecurrentes } from './recurrentes'
import { detectarAnomalias } from './anomalias'
import { pronosticarMes } from './pronostico'
import { interpretarFactura, validarFactura } from './facturas'
import { calcularFinScore, crearRecompensa, rachaMaxima } from '../lib/finscore'
import { generarDemo, filasBancoDemo } from '../data/demo'

// Fábrica de movimientos de prueba: solo hay que pasar lo que importa en cada caso.
let n = 0
const mov = (fecha: string, descripcion: string, monto: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${n++}`, fecha, descripcion, monto, categoria: 'otros', confianza: null, cuentaId: null, origen: 'manual',
  conciliado: false, extractoId: null, creadoEn: `${fecha}T12:00:00`, ...extra,
})

describe('montos y fechas colombianas', () => {
  it('interpreta separadores de miles y decimales', () => {
    expect(parseMonto('1.234.567,89')).toBe(1234567.89)
    expect(parseMonto('-125.400')).toBe(-125400)
    expect(parseMonto('$ 45.000')).toBe(45000)
    expect(parseMonto('(21.500,00)')).toBe(-21500)
    expect(parseMonto('1,234,567.50')).toBe(1234567.5)
    expect(parseMonto('abc')).toBeNull()
  })
  it('interpreta fechas en varios formatos', () => {
    expect(parseFechaExtracto('05/10/2026', 2026)).toBe('2026-10-05')
    expect(parseFechaExtracto('2026-10-05', 2020)).toBe('2026-10-05')
    expect(parseFechaExtracto('5/10', 2026)).toBe('2026-10-05')
    expect(parseFechaExtracto('05 OCT 2026', 2020)).toBe('2026-10-05')
  })
})

describe('clasificador de categorías', () => {
  const m = new ClasificadorCategorias()
  it.each([
    ['COMPRA POS TIENDAS D1 CALI', 'mercado'],
    ['UBER *TRIP', 'transporte'],
    ['NETFLIX.COM', 'entretenimiento'],
    ['PAGO PSE EMCALI EICE', 'servicios'],
    ['Almuerzo ejecutivo', 'comida'],
    ['Drogueria La Rebaja', 'salud'],
  ])('%s → %s', (texto, cat) => {
    expect(m.categorizar(texto, -10000).categoria).toBe(cat)
  })
  it('los ingresos se reconocen por el signo', () => {
    expect(m.categorizar('ABONO NOMINA ACME SAS', 2_000_000).categoria).toBe('ingresos')
  })
  it('aprende de las correcciones del usuario', () => {
    const p = new ClasificadorCategorias()
    expect(p.categorizar('Donde Doña Rosa', -15000).confianza).toBeLessThan(0.5)
    p.aprender('Donde Doña Rosa', 'comida', 3)
    expect(p.categorizar('Donde Doña Rosa', -15000).categoria).toBe('comida')
  })
})

describe('extractos', () => {
  const texto = [
    'Banco Andino',
    'Extracto de cuenta de ahorros',
    'Titular: Valentina Gomez  Cuenta No. ***-4821',
    'Fecha  Descripcion  Valor  Saldo',
    '03/10/2026  CUOTA MANEJO TARJETA  -21.500,00  3.428.500,00',
    '05/10/2026  TRANSF CANON ARRENDAMIENTO  -1.150.000,00  2.278.500,00',
    '15/10/2026  ABONO NOMINA ACME SAS  2.150.000,00  4.428.500,00',
    '18/10/2026  PAGO PSE EMCALI EICE  -123.400,00  4.305.100,00',
    'Saldo final  4.305.100,00',
  ].join('\n')
  it('lee filas, banco y periodo de un PDF de texto', () => {
    const r = interpretarTextoExtracto(texto)
    expect(r.banco).toBe('Banco Andino')
    expect(r.periodo).toBe('2026-10')
    expect(r.filas).toHaveLength(4)
    expect(r.filas[1]).toMatchObject({ fecha: '2026-10-05', monto: -1150000, saldo: 2278500 })
    expect(r.filas[2].monto).toBe(2150000)
  })
  it('lee CSV con columnas débito/crédito', () => {
    const r = interpretarCsv([
      { Fecha: '2026-10-02', Descripción: 'Uber', Débito: '18.500', Crédito: '' },
      { Fecha: '2026-10-15', Descripción: 'Nómina', Débito: '', Crédito: '2.150.000' },
    ])
    expect(r.filas.map((f) => f.monto)).toEqual([-18500, 2150000])
  })
  it('lee el PDF de ejemplo generado con los datos demo', () => {
    const filas = filasBancoDemo('2026-10', '2026-11-02')
    const lineas = ['Banco Andino', 'Fecha  Descripcion  Valor  Saldo', ...filas.map((f) => `${f.fecha.slice(8)}/${f.fecha.slice(5, 7)}/${f.fecha.slice(0, 4)}  ${f.descripcion}  ${f.monto.toLocaleString('es-CO', { minimumFractionDigits: 2 })}  ${(f.saldo ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`)]
    const r = interpretarTextoExtracto(lineas.join('\n'))
    expect(r.filas.length).toBe(filas.length)
    expect(r.filas.reduce((s, f) => s + f.monto, 0)).toBeCloseTo(filas.reduce((s, f) => s + f.monto, 0), 0)
  })
})

describe('conciliación', () => {
  it('empareja por monto/fecha/descripción y detecta faltantes', () => {
    const app = [mov('2026-10-05', 'Arriendo', -1_150_000), mov('2026-10-18', 'Emcali', -123_000), mov('2026-10-10', 'Almuerzo', -15_000, { cuentaId: 'efectivo' })]
    const r = conciliar(interpretarTextoExtracto('03/10/2026 CUOTA MANEJO -21.500\n05/10/2026 TRANSF CANON ARRENDAMIENTO -1.150.000\n19/10/2026 PAGO PSE EMCALI -123.400').filas, app)
    expect(r.resumen).toMatchObject({ coincidencias: 2, nuevos: 1, soloEnApp: 1, conDiferencias: 1 })
  })
})

describe('modelos de patrones', () => {
  const movs = [
    ...['2026-07-12', '2026-08-12', '2026-09-12', '2026-10-12'].map((f) => mov(f, 'Netflix', -26_900, { categoria: 'entretenimiento' })),
    ...Array.from({ length: 12 }, (_, i) => mov(`2026-10-${String(i + 1).padStart(2, '0')}`, `Almuerzo ${i}`, -15_000 - i * 300, { categoria: 'comida' })),
    mov('2026-10-20', 'Cena aniversario', -380_000, { categoria: 'comida' }),
    mov('2026-10-21', 'Rappi restaurante', -48_500, { categoria: 'comida', id: 'a1' }),
    mov('2026-10-21', 'Rappi restaurante', -48_500, { categoria: 'comida', id: 'a2' }),
  ]
  it('detecta suscripciones mensuales', () => {
    const r = detectarRecurrentes(movs)
    expect(r[0]).toMatchObject({ clave: 'netflix', frecuencia: 'mensual', montoTipico: 26900, proximo: '2026-11-12' })
  })
  it('detecta montos atípicos y cobros duplicados', () => {
    const tipos = detectarAnomalias(movs).map((a) => a.tipo)
    expect(tipos).toContain('monto_atipico')
    expect(tipos).toContain('posible_duplicado')
  })
  it('pronostica el cierre de mes con los datos demo', () => {
    const { movimientos } = generarDemo('2026-11-02')
    const p = pronosticarMes(movimientos, '2026-10', 15)
    expect(p.proyeccionCierre).toBeGreaterThan(p.gastadoHastaHoy)
    expect(p.serie).toHaveLength(31)
  })
})

describe('facturas (OCR)', () => {
  const aliado: Aliado = { id: 'a', nombre: 'La Fogata Caleña', nit: '900321654-7', categoria: 'comida', ciudad: 'Cali', logo: '' }
  const promo: Promocion = { id: 'p', aliadoId: 'a', titulo: '', descripcion: '', beneficio: '', montoMinimo: 30_000, desde: '2026-10-15', hasta: '2026-12-10', reglas: [], activa: true, puntos: 0 }
  const texto = 'LA FOGATA CALEÑA\nNIT 900.321.654-7\nFECHA: 2026-11-02 12:41\nSUBTOTAL 39.300\nIMPOCONSUMO 8% 3.100\nTOTAL A PAGAR $42.400\n'
  it('extrae NIT, fecha y total', () => {
    expect(interpretarFactura(texto, 90)).toMatchObject({ nit: '900321654-7', fecha: '2026-11-02', total: 42400 })
  })
  it('aprueba automáticamente si cumple las reglas', () => {
    expect(validarFactura(interpretarFactura(texto, 90), promo, aliado, false).aprobada).toBe(true)
  })
  it('deja pendiente si el monto no alcanza y rechaza si ya participó', () => {
    const bajo = interpretarFactura(texto.replace('$42.400', '$12.400'), 90)
    expect(validarFactura(bajo, promo, aliado, false)).toMatchObject({ aprobada: false, rechazoAutomatico: false })
    expect(validarFactura(interpretarFactura(texto, 90), promo, aliado, true).rechazoAutomatico).toBe(true)
  })
})

describe('FinScore', () => {
  const vacio = { movimientos: [], presupuestos: [], aportes: [], extractos: [], actividades: [], facturas: [] }
  it('suma registro diario, racha y extracto', () => {
    const movimientos = Array.from({ length: 20 }, (_, i) => mov(`2026-10-${String(i + 1).padStart(2, '0')}`, 'x', -1000))
    const s = calcularFinScore({ ...vacio, movimientos, extractos: [{ id: 'e', banco: '', periodo: '2026-10', archivo: '', filas: 10, conciliados: 0, agregados: 0, creadoEn: '2026-11-02T10:00:00' }] }, '2026-10')
    expect(s.componentes.find((c) => c.id === 'registro')!.puntos).toBe(40)
    expect(s.componentes.find((c) => c.id === 'racha')!.puntos).toBe(10)
    expect(s.componentes.find((c) => c.id === 'extracto')!.puntos).toBe(15)
    expect(s.total).toBe(65)
  })
  it('el extracto suma solo en el mes que cubre', () => {
    const extractos = [{ id: 'e', banco: '', periodo: '2026-10', archivo: '', filas: 10, conciliados: 0, agregados: 0, creadoEn: '2026-11-02T10:00:00' }]
    expect(calcularFinScore({ ...vacio, extractos }, '2026-11').total).toBe(0)
  })
  it('los movimientos importados del extracto no cuentan como registro', () => {
    const s = calcularFinScore({ ...vacio, movimientos: [mov('2026-10-01', 'x', -1, { origen: 'extracto' })] }, '2026-10')
    expect(s.total).toBe(0)
  })
  it('calcula rachas', () => {
    expect(rachaMaxima(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']))).toBe(3)
  })
  it('emite recompensas según el umbral', () => {
    expect(crearRecompensa('2026-10', 84, '2026-11-06')).toBeNull()
    expect(crearRecompensa('2026-10', 90, '2026-11-06')).toMatchObject({ tipo: 'cupon', descuento: 20, diasPremium: 0 })
    expect(crearRecompensa('2026-10', 100, '2026-11-06')).toMatchObject({ tipo: 'cupon_y_mes', descuento: 30, diasPremium: 30 })
  })
})
