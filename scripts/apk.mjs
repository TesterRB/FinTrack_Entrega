// Compila el APK firmado de la beta en un solo paso:
//   build web → cap sync → gradle assembleRelease → release/FinTrack-<versión>.apk
// Uso: npm run android:apk
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const { version, androidVersionCode } = JSON.parse(readFileSync('package.json', 'utf8'))
const env = { ...process.env }
const correr = (cmd, opciones = {}) => execSync(cmd, { stdio: 'inherit', env, ...opciones })

if (!existsSync('.env.local') && !env.VITE_SUPABASE_URL) {
  console.error('Falta .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example). Sin ellas el APK saldría en modo demo.')
  process.exit(1)
}
if (!existsSync('android/keystore.properties')) {
  console.error('Falta android/keystore.properties (firma del APK). Ver docs/BETA.md → "Firma del APK".')
  process.exit(1)
}

// Java: el que trae Android Studio, si no hay JAVA_HOME.
if (!env.JAVA_HOME) {
  const jbr = [
    'C:/Program Files/Android/Android Studio/jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ].find((r) => existsSync(r))
  if (jbr) env.JAVA_HOME = jbr
}

// SDK de Android: Android Studio crea local.properties al abrir el proyecto; si no existe, se crea aquí.
if (!existsSync('android/local.properties')) {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? (process.platform === 'win32' ? join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk'))
  // Barras normales: en .properties la barra invertida es un escape (\u… rompe la lectura).
  writeFileSync('android/local.properties', `sdk.dir=${sdk.split('\\').join('/')}\n`)
}

correr('npm run build')
correr('npx cap sync android')
// Ruta explícita: cmd.exe puede no buscar ejecutables en la carpeta actual.
correr(process.platform === 'win32' ? '.\\gradlew.bat assembleRelease' : './gradlew assembleRelease', { cwd: 'android' })

mkdirSync('release', { recursive: true })
const destino = join('release', `FinTrack-${version}.apk`)
copyFileSync('android/app/build/outputs/apk/release/app-release.apk', destino)
console.log(`\nListo: ${destino} (versionCode ${androidVersionCode})`)
