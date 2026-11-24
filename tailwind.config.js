// Configuración de Tailwind CSS: tokens de diseño de FinTrack (colores, tipografía, radios y sombras).
/** @type {import('tailwindcss').Config} */
export default {
  // :hover solo en dispositivos que realmente pueden hacer hover (en el celular no queda "pegado" al tocar).
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        // Violeta de la marca: botones, íconos, gráficas y progreso.
        marca: {
          50: '#f3f2ff', 100: '#e9e7ff', 200: '#d5d1ff', 300: '#b6aeff', 400: '#9282fc',
          500: '#7457f7', 600: '#6338ee', 700: '#5428d9', 800: '#4622b5', 900: '#3b1f93',
        },
        // Azul noche (textos fuertes, tema oscuro), verde menta (dinero que entra, logros) y coral (alertas).
        noche: { 800: '#242a4d', 900: '#1b2040', 950: '#12152c' },
        menta: { 100: '#dcfae5', 400: '#4fd8b4', 500: '#22c39a', 600: '#247b50' },
        coral: { 100: '#ffedea', 500: '#e5566f', 600: '#c4242a' },
        // Superficies de la app: cambian con el tema (variables RGB definidas en index.css).
        suelo: 'rgb(var(--suelo) / <alpha-value>)',
        superficie: 'rgb(var(--superficie) / <alpha-value>)',
        elevada: 'rgb(var(--elevada) / <alpha-value>)',
        linea: 'rgb(var(--linea) / <alpha-value>)',
        tinta: 'rgb(var(--tinta) / <alpha-value>)',
        tenue: 'rgb(var(--tenue) / <alpha-value>)',
      },
      borderRadius: { tarjeta: '24px' },
      boxShadow: {
        // Sombras suaves: la tarjeta se separa del fondo lavanda sin bordes duros.
        suave: '0 1px 2px rgba(30,27,75,.04), 0 10px 28px -14px rgba(30,27,75,.16)',
        flotante: '0 12px 32px -10px rgba(30,27,75,.28)',
        boton: '0 6px 16px -6px rgba(99,56,238,.45)',
      },
    },
  },
  plugins: [],
}
