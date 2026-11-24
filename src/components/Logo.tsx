import clsx from 'clsx'

/** Ruta base de los archivos de `public/` ("/" en la web; Vite la ajusta si la app se publica en una subcarpeta). */
const base = import.meta.env.BASE_URL

/**
 * Marca de FinTrack: el gusanito con forma de «f» que sostiene una moneda con «$».
 * `tile` muestra el ícono de app completo (public/logo.svg, el logo aprobado sobre su baldosa violeta);
 * sin él se dibuja solo la silueta en la tinta del contexto (currentColor), usando public/logo-silueta.svg como máscara.
 * Ambos se cargan como archivo y no en línea: el logo trae degradados, filtros y un recorte con ids propios que
 * chocarían si aparece dos veces en la misma pantalla, y así sus ~30 KB tampoco pesan en el JS.
 * La silueta se regenera con `npm run android:iconos` si cambia el logo.
 */
export function Logo({ tam = 36, tile = false, className }: { tam?: number; tile?: boolean; className?: string }) {
  if (tile) {
    return (
      <img
        src={`${base}logo.svg`} width={tam} height={tam} alt="" aria-hidden="true" draggable={false}
        className={clsx('shrink-0 select-none', className)}
      />
    )
  }
  const mascara = `url(${base}logo-silueta.svg) center / contain no-repeat`
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-block shrink-0 bg-current', className)}
      style={{ width: tam, height: tam, WebkitMask: mascara, mask: mascara }}
    />
  )
}

/** Logotipo completo: símbolo + nombre. */
export function Marca({ tam = 32, className }: { tam?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5 text-noche-900 dark:text-white', className)}>
      <Logo tam={tam} tile />
      <span className="text-xl font-extrabold tracking-[-0.03em]">FinTrack</span>
    </span>
  )
}
