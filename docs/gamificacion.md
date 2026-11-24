# Gamificación · FinTrack

> Cada peso anotado se siente como un paso visible hacia algo tuyo: el cupón del mes, tu meta o tu racha.
> La gamificación no es una sección de la app: es la forma en que la app *responde* a lo que haces.

## 1. Principios

| Principio | Qué significa en FinTrack |
|---|---|
| **Un solo marcador** | Todos los puntos, de cualquier pantalla, *vuelan* al marcador del FinScore en la barra superior. El usuario siempre ve de dónde vienen y adónde llegan. |
| **Intensidad ∝ rareza** | Registrar (varias veces al día) → chispa corta. Reto o extracto (semanal/mensual) → logro. Cupón, mes perfecto o meta cumplida → celebración. |
| **Premiar el hábito, nunca el gasto** | Ninguna mecánica premia gastar más. Las promociones de aliados premian *registrar* compras que el usuario ya hace. |
| **Sin castigo ni culpa** | Nada de rojo ni de «¡perderás tu racha!». La plata ya genera ansiedad: la app acompaña. |
| **Reglas a la vista** | Cada punto tiene una regla legible en la pantalla de FinScore. No hay puntos misteriosos. |
| **Control del usuario** | El sonido se puede silenciar. Con `prefers-reduced-motion` se quitan los desplazamientos y quedan la opacidad y el conteo. |
| **Rápido primero** | Ningún estímulo retrasa la acción: el dato se guarda antes de que empiece la animación. |

## 2. Piezas

| Pieza | Horizonte | Para qué |
|---|---|---|
| **FinScore** (0–100) | Mensual | La moneda de las recompensas: 85 = cupón, 100 = cupón + 30 días Premium |
| **Racha** | Diaria | Constancia visible: días seguidos con registro |
| **Retos semanales** | Semanal | 3 retos rotativos que suman al FinScore |

El FinScore es la única moneda que vale plata.

## 3. Catálogo de estímulos (`src/lib/estimulos.ts`)

| Nivel | Cuándo | Partículas | Sonido | Vibración (Android) | Puntos |
|---|---|---|---|---|---|
| **Chispa** | Registro, aporte, primer registro del día | 14, desde el gesto | «moneda» (2 notas, 0,3 s) | 12 ms | Vuelan al marcador |
| **Logro** | Reto, extracto conciliado, factura aprobada, 25/50/75 % de una meta | 36 en abanico | Arpegio mayor | 14·40·22 ms | Vuelan + el marcador late |
| **Celebración** | Cruzar 85 o 100, meta cumplida, pago aprobado, cierre de mes con premio | Lluvia de confeti a pantalla completa | Fanfarria | Patrón largo | Aviso destacado |

Detalles técnicos:
- Sonido sintetizado con WebAudio: sin archivos ni dependencias, y deduplicado (si dos partes reaccionan al mismo gesto, suena solo el más importante).
- Física por tiempo transcurrido: igual a 60 y a 120 Hz, y las partículas vencen aunque la pestaña se pause.
- Curvas: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` y `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`. Pulsación de botones: `scale(0.97)` en 150 ms.
- El marcador cuenta hasta el nuevo valor (≈650 ms) en lugar de saltar.

## 4. Dónde aparece

| Pantalla | Momento | Mecánica | Estímulo |
|---|---|---|---|
| **Barra superior** | Siempre | Marcador: anillo hacia el próximo umbral, puntos que faltan y racha | Recibe los puntos que vuelan y late |
| **Registro rápido** | Al guardar | +2 el primer registro del día | Chispa |
| **Asistente** | Al abrirlo | Cuenta como revisión semanal (+2,5) | Chispa |
| **Metas** | Aportes | Hitos de 25/50/75/100 % | Logro / celebración |
| **Extractos** | Conciliar | +15 al mes del extracto | Logro |
| **FinScore** | Siempre | Desglose, retos, cupones e historial | — |
| **Promociones** | Factura aprobada | El beneficio queda en «Mis participaciones» | Logro |
| **Planes** | Pago aprobado | Se activa el plan | Celebración |
