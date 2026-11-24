import Movimientos from '../pages/Movimientos'
import { PanelExpandible } from './Expandible'

/** Todos los movimientos a pantalla completa, abiertos desde la tarjeta de balance del Inicio. */
export function PanelMovimientos({ origen, onCerrar }: { origen: DOMRect; onCerrar: () => void }) {
  return (
    <PanelExpandible origen={origen} onCerrar={onCerrar} etiqueta="Movimientos" fondo="from-[#8f7cfb] via-[#6d4ff0] to-[#5b47e0]">
      <Movimientos alCerrar={onCerrar} />
    </PanelExpandible>
  )
}
