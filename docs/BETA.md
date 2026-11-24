# FinTrack · Beta cerrada en Android

Guía para preparar, compilar, repartir y monitorear el APK de la beta. Todo corre en planes gratuitos.

## Arquitectura

```
APK Android (React + Capacitor 8)
   │  correo/contraseña · Google (pestaña de Chrome + enlace co.fintrack.app://auth/callback)
   ▼
Supabase "FinTrack" (sa-east-1, plan gratuito)
   ├─ Auth ............ cuentas, sesiones, Google
   ├─ Postgres + RLS .. datos de cada usuario, aislados por políticas
   ├─ Storage ......... fotos de facturas (privado, carpeta por usuario)
   ├─ pg_cron ......... cierre mensual del FinScore y limpieza de eventos
   └─ Monitoreo ....... tablas eventos y comentarios + vistas monitor_*
GitHub
   ├─ código
   └─ Actions ......... verificación en cada push + ping cada 3 días para que Supabase no se pause
```

- **Proyecto Supabase:** `<ref-del-proyecto>` → `https://supabase.com/dashboard/project/<ref-del-proyecto>` (el *ref* está en **Project Settings → General**)
- **Beta:** `BETA = true` en `src/lib/planes.ts` desbloquea todas las funciones y pone el velo «Próximamente» sobre **Planes** y los **cupones** (FinScore y Promociones). Con `false` se activan los planes de pago y los cupones.

## 1. Configuración única en los paneles (≈15 min)

### 1.1 Correo de la app (Gmail dedicado) y confirmación de cuentas
El correo integrado de Supabase solo envía a los miembros del equipo del proyecto (unos 2 por hora), así que los probadores no recibirían nada. Los correos de FinTrack (confirmar cuenta y recuperar contraseña) salen de un **Gmail dedicado** por SMTP: gratis, hasta ~500 por día. **Hazlo en este orden** para no dejar a nadie sin poder registrarse:

**a. Contraseña de aplicación en el Gmail de FinTrack**
1. Entra a <https://myaccount.google.com/security> con el Gmail de FinTrack y activa la **Verificación en dos pasos**.
2. Abre <https://myaccount.google.com/apppasswords>, nombre: `Supabase FinTrack` → **Crear**.
3. Copia la contraseña de 16 letras (se muestra una sola vez). No la compartas: va directo a Supabase.

**b. SMTP en Supabase** — **Authentication → Emails → SMTP Settings** → activa **Enable custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | el Gmail de FinTrack |
| Sender name | `FinTrack` |
| Host | `smtp.gmail.com` |
| Port number | `465` (si falla, `587`) |
| Minimum interval per user | `60` |
| Username | el Gmail de FinTrack |
| Password | la contraseña de aplicación de 16 letras |

→ **Save changes**. Después, en **Authentication → Rate Limits**, sube **Rate limit for sending emails** a `100` por hora.

**c. Plantillas en español** — **Authentication → Emails → Templates**:

| Plantilla | Asunto | Cuerpo (pega el archivo completo en **Source**) |
|---|---|---|
| **Confirm sign up** | `Confirma tu correo en FinTrack` | `supabase/correos/confirmar-registro.html` |
| **Reset password** | `Crea una contraseña nueva para FinTrack` | `supabase/correos/restablecer-contrasena.html` |

**d. Activar la confirmación** — **Authentication → Sign In / Providers → User Signups** → activa **Confirm email** → **Save changes**.

**e. Probar:** crea una cuenta con un correo que no sea de Google y abre el enlace desde el celular. Prueba también **¿Olvidaste tu contraseña?**.

> Los enlaces de los correos abren la app (`co.fintrack.app://auth/callback`). La confirmación funciona aunque se abra en otro dispositivo (la cuenta queda confirmada y basta con iniciar sesión); la recuperación de contraseña solo funciona en el celular donde se pidió.

### 1.2 Supabase → URL de regreso de la app
**Authentication → URL Configuration → Redirect URLs** → *Add URL*:

```
co.fintrack.app://auth/callback
```

### 1.3 Google Cloud → cliente OAuth
1. Entra a <https://console.cloud.google.com/> con tu cuenta y crea un proyecto **FinTrack**.
2. **APIs y servicios → Pantalla de consentimiento de OAuth** (Google Auth Platform):
   - Nombre de la app: `FinTrack`, correo de asistencia: el tuyo.
   - Público: **Externo**.
   - Permisos: solo los básicos (`openid`, `email`, `profile`), que no requieren verificación de Google.
   - **Beta cerrada: deja la app en estado «Prueba».** En **Público → Usuarios de prueba → Add users** agrega el Gmail de cada probador (máx. 100). Solo ellos podrán usar «Continuar con Google»; quien se registre con correo y contraseña no necesita estar en la lista. Al entrar verán el aviso «Google no verificó esta app» → **Continuar**.
   - Para pasar a «En producción» (abierta a cualquiera), Google exige una URL de página principal y otra de política de privacidad en un dominio autorizado (pestaña **Desarrollo de la marca**).
3. **Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**, nombre `FinTrack Supabase`.
   - **URI de redireccionamiento autorizados**:
     ```
     https://<ref-del-proyecto>.supabase.co/auth/v1/callback
     ```
   - Crear → copia el **ID de cliente** y el **Secreto del cliente**.

### 1.4 Supabase → activar Google
**Authentication → Sign In / Providers → Google** → Enable → pega el *Client ID* y el *Client Secret* → Save.

### 1.5 Hazte administrador
Crea tu cuenta en la app y luego, en **SQL Editor**:

```sql
update perfiles set rol = 'admin' where email = 'tu-correo@gmail.com';
```

Como admin ves el **Panel de aliados** en la app y puedes leer eventos y comentarios desde la API.

## 2. Compilar el APK

Requisitos: Node 22+, Android Studio (trae Java y el SDK). La primera compilación descarga Gradle y un JDK 21 (≈5 min).

```bash
npm install
npm run android:apk        # → release/FinTrack-<versión>.apk, firmado
```

Usa `.env.local` (URL y llave publicable de Supabase) y la firma de `android/keystore.properties`. También puedes abrir el proyecto en Android Studio con `npm run android:sync && npm run android:abrir` y usar **Build → Generate Signed App Bundle / APK**.

### Firma del APK
`android/keystore/fintrack-beta.jks` y `android/keystore.properties` **no están en git**. Android solo instala una actualización encima de la versión anterior si ambas están firmadas con la misma llave; con otra firma, el probador tiene que desinstalar la app (sus datos siguen en la nube).

## 3. Repartir el APK a los probadores

1. Sube `release/FinTrack-<versión>.apk` a Google Drive y compártelo **solo con los correos de los probadores** (no «cualquiera con el enlace»).
2. Instrucciones para ellos:
   - Abrir el enlace desde el celular Android → descargar.
   - Al abrir el archivo, Android pedirá permitir **«Instalar apps desconocidas»** para Drive o Chrome → permitir → Instalar.
   - Play Protect puede advertir que es una app no publicada en la tienda: **Más detalles → Instalar de todas formas**.
   - Abrir FinTrack → **Continuar con Google** o crear cuenta con correo.

Requisito: Android 7.0 o superior.

## 4. Publicar una actualización

1. En `package.json` sube `version` (ej. `1.0.0-beta.2`) y `androidVersionCode` (siempre +1).
2. `npm run android:apk`.
3. Sube el APK nuevo a Drive (mismo nombre de carpeta, nuevo archivo) y copia el enlace.
4. En **SQL Editor** avisa a la app:
   ```sql
   update version_app
   set codigo = 2, nombre = '1.0.0-beta.2', url = 'https://drive.google.com/…',
       notas = 'Qué cambió en esta versión', obligatoria = false, publicada_en = now()
   where plataforma = 'android';
   ```
   Al abrir la app, los probadores ven «Nueva versión disponible» con el botón **Descargar**. Con `obligatoria = true` no pueden omitirla.

## 5. Monitoreo

Todo queda en Supabase. En **Table Editor** (o **SQL Editor**) consulta:

| Vista / tabla | Qué muestra |
|---|---|
| `monitor_resumen_diario` | Por día: usuarios activos, sesiones, pantallas vistas, acciones, errores y registros nuevos |
| `monitor_usuarios` | Cada probador: método de acceso, última actividad, días activos, versión, dispositivo y cuánto ha usado cada función |
| `monitor_errores` | Errores agrupados: cuántas veces, a cuántos usuarios, en qué versión y el último detalle (pila incluida) |
| `monitor_pantallas` | Pantallas más visitadas (últimos 30 días) |
| `comentarios` | Lo que escriben los probadores desde **Perfil → Cuéntanos cómo te va** (marca `atendido = true` al resolverlos) |
| `eventos` | El detalle crudo (se borra solo a los 120 días) |

Consultas útiles:

```sql
-- Embudo de la beta
select count(*) as registrados,
       count(*) filter (where movimientos > 0) as registraron_algo,
       count(*) filter (where dias_activos >= 3) as volvieron_3_dias
from monitor_usuarios;

-- Errores de las últimas 24 h
select * from monitor_errores where ultima_vez > now() - interval '1 day';
```

Además, **Logs & Analytics** del panel muestra los registros de Auth (inicios de sesión fallidos, Google) y de la API.

**Privacidad:** la telemetría solo guarda nombres de pantallas y acciones, conteos, versión y modelo del celular; nunca montos, descripciones ni documentos. La app lo informa en Perfil.

## 6. Límites del plan gratuito

| Recurso | Límite | Uso esperado en la beta |
|---|---|---|
| Base de datos | 500 MB | Muy por debajo (eventos con limpieza automática) |
| Storage (facturas) | 1 GB | Fotos JPEG comprimidas |
| Usuarios activos | 50 000 / mes | Beta cerrada |
| Pausa por inactividad | 7 días sin uso | El workflow `mantener-supabase` hace una consulta cada 3 días |

Para que el ping funcione, en GitHub → **Settings → Secrets and variables → Actions** crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos valores de `.env.local`; la llave publicable no es secreta, pero así no queda escrita en el repo).

## 7. Alcance de la beta

- **Pagos (Wompi) y cupones**: implementados y desactivados con `BETA`. Las Edge Functions `wompi-*` se publican aparte (ver el README).
- **Comercios aliados**: sin aliados cargados, la sección muestra «Pronto tendremos nuevos beneficios». `supabase/seed.sql` trae aliados de ejemplo (ficticios).
- **iOS**: no incluido (requiere Mac y cuenta de Apple Developer).
