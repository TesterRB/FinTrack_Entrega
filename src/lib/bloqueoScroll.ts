/**
 * Bloqueo del desplazamiento de la página mientras hay una hoja o un panel abierto encima.
 *
 * Es un único bloqueo compartido que cuenta cuántos lo piden: la página vuelve a desplazarse cuando se
 * libera el último, sin importar el orden en que se cierren. Si cada ventana guardara y restaurara el
 * valor "anterior" por su cuenta, al cerrarse en otro orden (p. ej. abrir el registro mientras el panel
 * de movimientos termina de cerrarse) una de ellas restauraría "bloqueado" y la página quedaría inmóvil.
 */

/** Cuántas ventanas tienen pedido el bloqueo en este momento. */
let pedidos = 0

/**
 * Bloquea el desplazamiento y devuelve la función que lo libera.
 * La función de liberar es idempotente: llamarla dos veces no descuenta dos pedidos.
 */
export function bloquearScroll(): () => void {
  pedidos++
  document.body.style.overflow = 'hidden'
  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    pedidos = Math.max(0, pedidos - 1)
    if (pedidos === 0) document.body.style.removeProperty('overflow')
  }
}
