// Configuración de ESLint (formato "flat config" de ESLint 9).
// Revisa solo el código TypeScript/React de la app; las carpetas generadas quedan fuera.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // `android/` contiene el JavaScript que Capacitor copia al compilar: no es código nuestro.
  { ignores: ['dist', 'android', 'release'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Reglas de los hooks de React (dependencias de useEffect, orden de llamadas…).
      ...reactHooks.configs.recommended.rules,
      // Avisa si un archivo de componentes exporta también funciones: rompe el recargado en caliente de Vite.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
