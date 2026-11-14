# Fidelización: tarjeta de sellos web

*Diseño del 2026-11-06. Fases 0 a 3 (planes, backend y frontend) implementadas en las ramas
`fidelizacion` del backend y del frontend. Ver "Estado" al final.*

El cliente de un comercio escanea un QR, completa un formulario corto y recibe **una tarjeta web**
(un link propio) con sus sellos y un QR personal. Cada compra suma un sello, que **lo suma el
cajero** desde la app de Opinara. Al llegar a N sellos (5 por defecto) tiene un premio.

**El programa es por sucursal** (decidido el 2026-11-06): cada sucursal tiene su propio programa,
con su premio y su cantidad de sellos, y la tarjeta vale solo ahí. Si un cliente va a dos
sucursales, tiene dos tarjetas.

Sin wallets de Apple ni de Google: no depende de aprobaciones externas, anda en cualquier
celular y se arma con el stack que ya existe. La wallet puede sumarse después como otra forma de
mostrar la misma tarjeta (ver "Más adelante").

---

## Reglas invariantes (se suman a las de `ESTADO.md`)

1. **La fidelización no se cruza con las reseñas.** Ningún sello, premio ni beneficio por dejar una
   reseña, y ningún flujo que lleve de uno al otro. Las políticas de Google prohíben incentivar
   reseñas y Opinara se vende justamente por no hacerlo. Son QR, rutas y paquetes separados.
2. **El sello lo suma alguien del comercio, autenticado.** No existe un endpoint público que sume
   sellos.
3. **El link de la tarjeta es un secreto.** Se guarda solo su hash (como las invitaciones), viaja
   después de `#` y nunca aparece en logs ni en respuestas, salvo en la del alta.
4. Todo repositorio filtra por `businessUrn`, igual que el resto del dominio.

---

## Flujos

### 1. Alta del cliente

1. El comercio imprime el QR de fidelización de cada sucursal:
   `https://app.opinara.com.ar/f/{businessSlug}/{programSlug}`. Es **otra ruta** que `/r/...`, que
   queda intacta. Las sucursales no tienen slug, así que el programa tiene el suyo (derivado del
   nombre de la sucursal, editable, único dentro del negocio), igual que las campañas. Una vez
   impreso no se cambia.
2. El frontend pide `GET /api/public/loyalty/{businessSlug}/{programSlug}` y muestra el nombre del
   negocio y de la sucursal, el logo, el premio ("Con 5 sellos, un café gratis"), las condiciones y
   el formulario.
3. Formulario: **nombre**, **celular** (obligatorio, es lo que se busca en la caja), **email**
   (opcional, para recuperar la tarjeta), casilla de **aceptación de privacidad y condiciones**
   (obligatoria) y casilla de **promociones** (opcional; se guarda, pero no se usa en la primera
   versión).
4. `POST /api/public/loyalty/{businessSlug}/{programSlug}/members` crea el cliente y una tarjeta con un token
   aleatorio. Responde el token **una sola vez**, y el frontend redirige a `/card#token={token}`.
5. Si hay email, se manda la bienvenida con el link (Resend, `MAILER`).

**Si el celular ya está registrado** en ese programa, no se devuelve la tarjeta existente: quien
conoce un número podría quedarse con la tarjeta (y canjear el premio) de otra persona. Se responde
`LOYALTY_ALREADY_REGISTERED`. Si la tarjeta tiene email, se reenvía el link ahí. Si no, se le
indica al cliente que lo pida en la caja. Esto revela que el número está registrado; para una
tarjeta de café es aceptable, pero queda anotado.

### 2. La tarjeta

- Ruta `/card#token={token}` (como los links de invitación y de recuperar contraseña), pública y
  sin sesión. El frontend guarda el token en `localStorage` (para
  que `/card` sin hash siga funcionando) y pide `GET /api/public/loyalty/card` con el header
  `X-Loyalty-Card-Token`.
- En `localStorage` se guarda **una lista** de tokens: si el cliente tiene tarjetas de dos
  sucursales (o de dos comercios) en el mismo celular, `/card` sin hash le muestra todas para
  elegir.
- Muestra: comercio, sucursal y logo, sellos (●●●○○), premio, **el QR personal** y "Agregar a la
  pantalla de inicio" (instrucciones para iOS y Android; un `manifest` propio con
  `start_url: /card`).
- **El QR personal no es el token.** Codifica un `memberCode` corto (por ejemplo `OP-7K3F9Q`), que
  solo sirve a alguien autenticado del comercio. Una captura del QR no da acceso a la tarjeta y,
  como el cajero confirma la compra, tampoco suma sellos sola.
- Botón **"Borrar mis datos"** (ver Privacidad).
- `Cache-Control: no-store`, `noindex` y `Referrer-Policy: no-referrer`.

### 3. En la caja

Una pantalla del frontend pensada para usarse cien veces por día: `/loyalty/register`.

0. La primera vez, el cajero **elige la sucursal** en la que está. Queda guardada en
   `localStorage` del dispositivo y se ve siempre arriba ("Caja: Sucursal Centro"), con opción de
   cambiarla.
1. El cajero **escanea el QR** de la tarjeta (cámara del celular o la compu) o **busca por
   celular** dentro de esa sucursal (los últimos dígitos alcanzan).
2. Ve el nombre, los sellos y si tiene un premio disponible. Si la tarjeta es **de otra sucursal**,
   lo ve claro ("Esta tarjeta es de Sucursal Norte") y no puede sumar: `LOYALTY_WRONG_LOCATION`.
3. **"Sumar sello"** → `POST …/loyalty/programs/{programUrn}/members/{memberCode}/stamps`. Si llega
   a N, la pantalla lo muestra grande: "¡Tiene un premio!". Mientras corre el tiempo mínimo entre
   sellos, el botón queda bloqueado y la caja muestra "Próximo sello desde las 14:35 · Faltan 9:42"
   con el `nextStampAt` que devuelve el backend en cada tarjeta (`lastStampAt` +
   `stampCooldownMinutes`; `null` si no tiene sellos o se deshizo el último).
4. **"Canjear premio"** → `POST …/loyalty/programs/{programUrn}/members/{memberCode}/redemptions`.
   Descuenta N sellos (lo que sobre queda acumulado).
5. **"Deshacer"**, disponible unos minutos después de cada acción, para errores de dedo.
6. **"Quitar sellos"** (solo ADMIN: ni el OWNER ni el MEMBER), para corregir sellos mal puestos cuando ya no se puede
   deshacer → `POST …/members/{memberCode}/stamp-removals` `{ stamps }`. Baja `stamps` y
   `totalStamps` (es una corrección: esos sellos no existieron), queda en el historial como
   `STAMP_REMOVAL` y se puede deshacer, pero solo un ADMIN. Anda con el programa pausado.

### Recordatorios por WhatsApp

OWNER y ADMIN ven en **Tarjeta de sellos → Recordatorios** (`/loyalty/reminders`) a quién conviene
recordarle que vuelva, y se lo mandan **desde el WhatsApp del local** con un link `wa.me` (sin la
API de WhatsApp Business: no cuesta ni pide aprobación de Meta). Hay dos motivos (`reason`):

- **Cerca del premio** (`NEAR_REWARD`): le faltan 1 o 2 sellos (`config.Reminders.MaxMissingStamps`),
  tiene al menos uno y su último sello fue **antes de hoy** en la zona horaria del negocio (al que
  está en la caja no se le escribe: se le manda al día siguiente).
- **No viene hace un tiempo** (`INACTIVE`): le faltan más sellos, o tiene 0, y su última visita (el
  último sello o, si nunca estrenó la tarjeta, el alta) fue hace `inactiveDays` días o más. Cada
  sucursal lo elige (7 a 365; **20 por defecto**).

Si cumple los dos, gana "cerca del premio": nunca le llegan dos. En los dos casos, **uno por
vuelta**: no se le recomienda otro hasta que vuelva a sumar un sello. Solo de sucursales activas.
Cada motivo tiene su plantilla (`reminderMessage` e `inactiveReminderMessage`), con su recomendada.

No pide el permiso de promociones (`consent.marketing`): es un aviso sobre la tarjeta que el
cliente sacó, y lo manda el local desde su WhatsApp. Está en las condiciones del alta desde
`TermsVersion` `2026-11-13` ("{negocio} puede escribirte por WhatsApp para avisarte de tu
tarjeta…").

**No recibir más** (`remindersOptOut: { at, by, byUserUrn? }`): un cliente con baja no aparece en
la lista y no se le puede marcar uno enviado (`LOYALTY_REMINDERS_OPTED_OUT`).

- **El cliente** los apaga o prende desde su tarjeta ("Avisos por WhatsApp") →
  `PUT /public/loyalty/card/reminders` `{ enabled }`. Si los apaga él (`by: CLIENT`), el local
  **no** los puede volver a prender: solo él.
- **El local** (OWNER, ADMIN) lo saca cuando el cliente se lo pide, por ejemplo respondiendo el
  WhatsApp: "No quiere recibir más" en Recordatorios, o la campanita en la lista de clientes →
  `PUT /businesses/:b/loyalty/members/:memberCode/reminders` `{ enabled }` (`by: BUSINESS`; esa sí la
  puede revertir).

El mensaje sale de la plantilla de cada sucursal (`reminderMessage`, editable en el detalle de la
tarjeta) con `{nombre}`, `{faltan}`, `{sellos}` («2 de 5 sellos»), `{premio}`, `{negocio}` y `{sucursal}`. Sin plantilla propia se
usa la recomendada (`config.Reminders.DefaultMessage`), así les llegan las mejoras. El link de la
tarjeta **no es una variable**: el backend lo agrega siempre al final. Al tocar "Enviar por
WhatsApp" se anota `lastReminderAt`: con `wa.me` no se puede saber si de verdad se envió, solo que
se abrió WhatsApp.

| Endpoint | Quién |
| --- | --- |
| `GET /businesses/:b/loyalty/reminders?programUrn=&reason=&page=&limit=` | OWNER, ADMIN: `{ member, program, reason, missingStamps, daysSinceVisit, message }` |
| `POST /businesses/:b/loyalty/reminders/:memberCode/sent` | OWNER, ADMIN (204) |
| `PUT  /businesses/:b/loyalty/members/:memberCode/reminders` `{ enabled }` | OWNER, ADMIN |
| `PUT  /public/loyalty/card/reminders` `{ enabled }` | el cliente, con el token de su tarjeta |

Cualquier miembro del comercio (OWNER, ADMIN o MEMBER) puede sumar y canjear. Configurar el
programa y ver o exportar la lista de clientes queda para OWNER y ADMIN.

---

## Backend: paquete `src/packages/loyalty/`

Con la estructura de siempre (`controllers/ services/ models/ dtos/ config/`).

### Modelos

**`LoyaltyProgram`** (`loyalty_programs`), uno por sucursal:

| Campo                       | Notas                                                   |
| --------------------------- | ------------------------------------------------------- |
| `urn`, `businessUrn`, `locationUrn` | `{ businessUrn, locationUrn }` único: un programa por sucursal |
| `slug`                      | `{ businessUrn, slug }` único; va en la URL impresa y no se cambia una vez impreso |
| `status`                    | `ACTIVE` / `PAUSED` (si está pausado, el alta se cierra y la tarjeta se sigue viendo) |
| `stampsRequired`            | 2–20, 5 por defecto                                     |
| `rewardDescription`         | "Un café gratis"; máximo 80 caracteres                  |
| `terms`                     | Condiciones en texto libre, opcional                    |
| `stampCooldownMinutes`      | Tiempo mínimo entre sellos de un mismo cliente; 10 por defecto |
| `stats`                     | `members`, `stamps`, `redemptions` (con `$inc`, como `CampaignStats`) |

Si se cambia `stampsRequired`, rige para todos, incluidas las tarjetas que ya existen. El panel lo
advierte antes de guardar.

**`LoyaltyMember`** (`loyalty_members`), el cliente y su tarjeta:

| Campo                        | Notas                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `urn`, `businessUrn`, `programUrn` | El programa determina la sucursal            |
| `memberCode`                 | Corto, sin caracteres ambiguos (sin 0/O, 1/I); único por negocio, para que al escanear una tarjeta de otra sucursal se pueda decir de cuál es |
| `name`, `phone`, `email`     | `phone` obligatorio, normalizado a E.164 (`+549…`); único por programa. `email` opcional |
| `cardTokenHash`              | sha256 del token, como `invitations`; índice único     |
| `cardToken`                  | El mismo token cifrado (AES-256-GCM, `CryptoService`), para reenviar el mismo link por mail sin cambiarlo |
| `stamps`                     | Saldo actual                                           |
| `totalStamps`, `totalRedemptions` | Históricos, para métricas                         |
| `lastStampAt`                | Para el tiempo mínimo entre sellos                     |
| `consent`                    | `{ acceptedAt, termsVersion, marketing: boolean }`     |

Índices: `{ businessUrn, programUrn, phone }` único, `{ businessUrn, memberCode }` único y
`cardTokenHash` único.

**`LoyaltyEvent`** (`loyalty_events`), el historial (para auditar, deshacer y graficar):
`{ urn, businessUrn, programUrn, locationUrn, memberUrn, type: STAMP | REDEMPTION | STAMP_REMOVAL, amount,
byUserUrn, createdAt, undoneAt? }`. `locationUrn` se copia del programa para agregar por sucursal
sin hacer joins. Índices `{ businessUrn, programUrn, createdAt: -1 }` y
`{ businessUrn, memberUrn, createdAt: -1 }`.

**Si se borra o se desactiva la sucursal**, el programa pasa a `PAUSED`: no se dan de alta
clientes nuevos y las tarjetas se siguen viendo, pero no suman sellos.

### Concurrencia (lo delicado)

- **Sello:** un solo `findOneAndUpdate` con la condición del tiempo mínimo en el filtro:
  `{ businessUrn, programUrn, memberCode, $or: [{ lastStampAt: null }, { lastStampAt: { $lt: ahora - cooldown } }] }`
  → `$inc: { stamps: 1, totalStamps: 1 }, $set: { lastStampAt: ahora }`. Si no matchea, se
  distingue entre "no existe" (`LOYALTY_MEMBER_NOT_FOUND`), "es de otra sucursal"
  (`LOYALTY_WRONG_LOCATION`) y "muy seguido" (`LOYALTY_STAMP_COOLDOWN`; sin `retryAfterSeconds`, para no salir de la forma
  única de los errores: la caja ya sabe el tiempo mínimo del programa).
  Así, dos toques seguidos o dos cajas a la vez no suman dos sellos.
- **Canje:** filtro `{ …, programUrn, stamps: { $gte: N } }` →
  `$inc: { stamps: -N, totalRedemptions: 1 }`. Si no matchea, `LOYALTY_NOT_ENOUGH_STAMPS`.
- **Deshacer:** marca `undoneAt` en el evento (con `{ undoneAt: null }` en el filtro, para no
  deshacer dos veces) y revierte el `$inc`. Solo se puede durante `UNDO_WINDOW` (15 min) y solo el
  último evento del cliente.
- Las escrituras del miembro y del evento no van en transacción (Atlas lo permite, pero no se usa
  en el resto del proyecto). Primero se aplica el `$inc` y después se inserta el evento; si falla
  el insert se loguea. El saldo de verdad es el del miembro.

### Endpoints

**Públicos** (en el mismo paquete `loyalty`, que queda autocontenido; throttle por IP):

| Método y ruta                                         | Qué hace                                  |
| ----------------------------------------------------- | ----------------------------------------- |
| `GET  /public/loyalty/:businessSlug/:programSlug`     | Datos del programa para el formulario. 404 si no hay programa o está pausado |
| `POST /public/loyalty/:businessSlug/:programSlug/members` | Alta. Devuelve `{ cardToken }`. Throttle estricto (p. ej. 5 por hora por IP) y campo trampa contra bots |
| `GET  /public/loyalty/card`                           | La tarjeta (header `X-Loyalty-Card-Token`) |
| `POST /public/loyalty/card/resend`                    | `{ businessSlug, programSlug, phone }` → reenvía el link al email, si tiene. Siempre responde 204 |
| `DELETE /public/loyalty/card`                         | El cliente borra sus datos                |

**Del comercio** (`@BusinessAccess`):

| Método y ruta                                                         | Roles          |
| --------------------------------------------------------------------- | -------------- |
Con `P = /businesses/:b/loyalty/programs/:programUrn`:

| Método y ruta                                          | Roles          |
| ------------------------------------------------------ | -------------- |
| `GET  /businesses/:b/loyalty/programs`                 | todos (la caja los lista para elegir sucursal) |
| `POST /businesses/:b/loyalty/programs` `{ locationUrn, … }` | OWNER, ADMIN |
| `GET  P`, `PATCH P`                                    | todos / OWNER, ADMIN |
| `GET  P/members?search=&page=`                         | todos (la caja busca por celular) |
| `GET  /businesses/:b/loyalty/members/:memberCode`      | todos. A nivel negocio a propósito: al escanear se sabe de qué programa es la tarjeta |
| `POST P/members/:memberCode/stamps`                    | todos          |
| `POST P/members/:memberCode/redemptions`               | todos          |
| `POST P/members/:memberCode/stamp-removals` `{ stamps }` | solo ADMIN (si no alcanzan, `LOYALTY_REMOVE_EXCEEDS_STAMPS`) |
| `POST /businesses/:b/loyalty/events/:eventUrn/undo`    | todos; deshacer un `STAMP_REMOVAL`, solo ADMIN (`FORBIDDEN`) |
| `GET  /businesses/:b/loyalty/members/:memberCode/card-link` | todos: el link **actual**, sin cambiarlo (`{ cardUrl, pngDataUrl }`), para mandarlo por WhatsApp o mostrarlo como QR |
| `POST /businesses/:b/loyalty/members/:memberCode/card-link` | todos: genera un token nuevo (invalida el anterior) y devuelve `{ cardUrl, pngDataUrl }` para mostrarlo como QR en la caja. Es la recuperación cuando no hay email |
| `POST P/qr`                                            | OWNER, ADMIN: `{ targetUrl, pngDataUrl }` del QR de alta, para imprimir (como el de campañas) |
| `DELETE /businesses/:b/loyalty/members/:memberCode`    | OWNER, ADMIN   |
| `GET  P/stats?weeks=` y `GET /businesses/:b/loyalty/stats?weeks=` | todos (sellos y canjes por semana, por sucursal y del negocio; reutiliza `scan-weeks.ts`). **Pendiente** |
| `GET  P/members.csv`                                   | OWNER, ADMIN (con la columna de promociones). **Pendiente** |

Para un miembro de otro negocio, 404 como siempre. Todos estos endpoints exigen que el plan del
negocio incluya fidelización (ver "Planes").

### Errores nuevos (`Errors`)

`LOYALTY_PROGRAM_NOT_FOUND`, `LOYALTY_PROGRAM_PAUSED`, `LOYALTY_MEMBER_NOT_FOUND`,
`LOYALTY_CARD_NOT_FOUND` (token inválido o tarjeta borrada), `LOYALTY_ALREADY_REGISTERED`,
`LOYALTY_STAMP_COOLDOWN`, `LOYALTY_NOT_ENOUGH_STAMPS`, `LOYALTY_REMOVE_EXCEEDS_STAMPS`,
`LOYALTY_REMINDERS_OPTED_OUT`,
`LOYALTY_UNDO_NOT_ALLOWED`,
`LOYALTY_INVALID_PHONE`, `LOYALTY_WRONG_LOCATION`, `LOYALTY_PROGRAM_ALREADY_EXISTS` (la sucursal
ya tiene programa), `LOYALTY_PROGRAM_SLUG_ALREADY_EXISTS` y `PLAN_FEATURE_NOT_INCLUDED`.

### Emails (`templates.ts`)

- **Bienvenida**, con el link a la tarjeta (solo si dejó email).
- **"Ya tenés tu premio"**, al llegar a N.
- **No** se manda un mail por cada sello: es ruido y cuesta cuota de Resend. La pantalla de la caja
  ya le confirma el sello al cliente.

### Tests

En `loyalty.spec.ts`, con `mongodb-memory-server` y `app.factory.ts`:
- Alta: duplicado por celular, normalización del teléfono, sin consentimiento → 400, programa
  pausado → 404.
- El token solo aparece en la respuesta del alta y lo que se guarda es su hash.
- Sello: tiempo mínimo, **dos sellos concurrentes suman uno**, tarjeta de otra sucursal
  (`LOYALTY_WRONG_LOCATION`) y aislamiento entre negocios (404).
- El mismo celular puede tener tarjeta en dos sucursales; en la misma, no.
- Un negocio sin el plan que incluye fidelización recibe `PLAN_FEATURE_NOT_INCLUDED`, y el alta
  pública da 404.
- Canje: saldo insuficiente, sobrante de sellos y canje concurrente.
- Deshacer: dentro y fuera de la ventana, y deshacer dos veces.
- Roles: un MEMBER no puede configurar el programa.
- Borrado de datos desde la tarjeta y desde el panel.

---

## Frontend: `src/features/loyalty/`

**Rutas** (en `paths.ts`):

| Ruta                 | Qué es                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `/f/:businessSlug/:programSlug` | Pública: formulario de alta. Como `/r/`, es una URL que se imprime y no se cambia |
| `/card`              | Pública: la tarjeta o las tarjetas guardadas (token después de `#`)    |
| `/loyalty`           | Panel: los programas por sucursal, con métricas, y el total del negocio |
| `/loyalty/:programUrn` | Un programa: configuración, clientes, métricas y QR para imprimir    |
| `/loyalty/register`  | La caja: sucursal elegida, escanear o buscar, sumar, canjear y deshacer |

Si el plan no incluye fidelización, `/loyalty` muestra qué es y cómo pasarse de plan, en lugar de
esconder la sección.

- **Lector de QR:** `BarcodeDetector` nativo donde exista (Chrome en Android) y `@zxing/browser`
  como respaldo (Safari en iOS no tiene `BarcodeDetector`). Se carga con `lazy`, solo en la caja.
- **Impresión del QR de alta:** reutilizar `print-sheet.ts` y `qr-formats.ts` de campañas, con otro
  texto ("Sumá sellos y llevate un café gratis"). **Que no diga nada de reseñas.**
- **Schemas Zod y handlers MSW** para todos los endpoints, igual que el resto.
- Textos en `src/i18n/` y los errores nuevos en `errors.ts`.
- La caja tiene que ser rápida: botones grandes, el resultado de cada acción en grande y un sonido
  o vibración opcional al sumar.

---

## Privacidad (Ley 25.326)

Es la primera vez que Opinara guarda datos de **consumidores finales**, no solo de comercios.

- **Roles:** el comercio es el responsable de la base de sus clientes y Opinara es quien los
  procesa por cuenta del comercio. Hay que sumarlo a los términos que acepta el comercio y a la
  política de privacidad (`/privacy`).
- **Datos mínimos:** nombre, celular y email opcional. Ni DNI ni fecha de nacimiento.
- **Consentimiento** explícito y separado: uno para el programa (obligatorio) y otro para
  promociones (opcional). Se guarda cuándo y qué versión de los términos se aceptó.
- **Acceso y borrado:** el cliente ve sus datos en la tarjeta y puede borrarlos desde ahí. Borrar
  elimina al miembro y deja sus eventos sin datos personales (`memberUrn` como única referencia),
  para que las métricas del comercio no cambien.
- No se guardan IP ni user agent, igual que en `scan_events`.
- Pendiente legal: ver si la base tiene que inscribirse en el registro de la AAIP y quién la
  inscribe.

---

## Planes

*Decidido el 2026-11-06:* el comercio puede tener reseñas, fidelización o las dos cosas. Más
adelante, un plan más alto (por definir).

| Plan (`BusinessPlan`)        | Funcionalidades (`Feature`) | Incluye                                       |
| ---------------------------- | --------------------------- | --------------------------------------------- |
| **Reseñas** (`REVIEWS`)      | `REVIEWS`                   | QR a Google, gestión y respuestas de reseñas  |
| **Fidelización** (`LOYALTY`) | `LOYALTY`                   | Solo la tarjeta de sellos por sucursal        |
| **Reseñas + Fidelización** (`REVIEWS_LOYALTY`) | `REVIEWS`, `LOYALTY` | Las dos cosas                      |

**`REVIEWS`** corta las reseñas (lista, detalle, respuestas, sugerencias), su sincronización (el
endpoint y el cron, que no le pide nada a Google por un negocio sin reseñas) y las campañas de QR. El
QR de reseñas de un negocio sin `REVIEWS` lleva a "no disponible". Lo tienen todos los planes: el
equipo, las sucursales, la conexión con Google (sirve también para importar sucursales) y el logo.

**Lo mínimo que necesita esta funcionalidad**, antes de tener cobro (punto 9 de
`FUTURAS-FUNCIONALIDADES.md`):
- Un campo `plan` en `Business` (`REVIEWS` por defecto) que por ahora **cambia el admin** a mano:
  `POST /api/admin/businesses/:urn/plan { plan }`, que queda en la auditoría
  (`BUSINESS_PLAN_CHANGED`). Falta el selector en `opinara-admin`.
- Un mapa plan → funcionalidades en un solo lugar (`src/shared/models/enums/plan.ts`), para que
  agregar el tercer plan sea cambiar una tabla.
- Un decorador `@RequiresFeature(Feature.LOYALTY)` junto a `@BusinessAccess`, que responda
  `PLAN_FEATURE_NOT_INCLUDED`. Es una de las pocas respuestas 403: quien la recibe ya es miembro,
  así que no se le oculta nada.
- `GET /businesses/:urn` devuelve `features: string[]`, así el frontend no deduce nada del nombre
  del plan.
- **Si un negocio baja de plan** no se escribe nada: el guard corta la caja, el alta pública da 404 y
  la tarjeta se sigue viendo con `program.active: false`. Al volver a subir, todo sigue como estaba.
  Lo mismo si el negocio está suspendido o la sucursal inactiva.

## Fases

0. **Planes:** el campo `plan`, las funcionalidades por plan, el decorador y el selector en el
   admin. *Esfuerzo bajo.*
1. **Backend:** modelos, endpoints públicos y del comercio, concurrencia y tests. *Esfuerzo medio.*
2. **Frontend del comercio:** configuración del programa, la caja (búsqueda por celular primero y el
   lector de QR después) e impresión del QR de alta. *Esfuerzo medio.*
3. **Frontend público:** formulario, tarjeta, "agregar a la pantalla de inicio" y borrado.
   *Esfuerzo bajo a medio.*
4. **Legal y textos:** política de privacidad, términos y emails. *Esfuerzo bajo, pero sin esto no
   sale.*
5. **Admin:** cantidad de programas, clientes y sellos por negocio. *Esfuerzo bajo.*

## WhatsApp

*Decidido el 2026-11-06:* por ahora con links `wa.me`, gratis y sin aprobaciones. Abren WhatsApp con
el mensaje escrito y alguien toca "Enviar"; no es automático.

- **El cliente**, al darse de alta (y después desde "Tenela a mano"): "Mandarme el link por
  WhatsApp" abre su propio chat ("Mensaje para vos") con el link de la tarjeta.
- **La caja**: "Enviar su tarjeta por WhatsApp" abre el chat del cliente desde el WhatsApp del local
  (celular o WhatsApp Web) con el link actual. No lo cambia, así no se rompe el que ya tenga guardado.
- Los mensajes no hablan de reseñas.

**Después, automático:** la API de WhatsApp Cloud (Meta) detrás de un puerto, como `MAILER`. Necesita
una cuenta de WhatsApp Business verificada, un número para Opinara, una plantilla de mensaje
aprobada (categoría *utility*, con el link como botón) y se paga por mensaje.

## Más adelante

- **Apple Wallet / Google Wallet** como otra forma de mostrar la misma tarjeta: el mismo
  `memberCode` en el código de barras y un adaptador por wallet detrás de un puerto.
- **WhatsApp** para avisar sellos y premios (API de WhatsApp Business: pago y con aprobación de
  Meta).
- Varios premios por programa, vencimiento de sellos, premio de cumpleaños.
- Métricas de retorno: cada cuánto vuelve un cliente y cuántos dejan de venir.

## Decisiones

- [x] **Por sucursal.** Cada sucursal tiene su programa y su tarjeta.
- [x] **En el plan del medio** (de tres). El tercero está por definir.
- [x] **El celular es obligatorio.**
- [x] Tiempo mínimo entre sellos de 10 min y ventana para deshacer de 15 min, configurables.
- [ ] Qué incluye el tercer plan.

## Estado

**Hecho (2026-11-06), ramas `fidelizacion`:**
- Fase 0 (backend): `BusinessPlan`, `Feature` y `PLAN_FEATURES` en `src/shared/models/enums/plan/`;
  `plan` y `features` en la respuesta del negocio; `@RequiresFeature()` chequeado por
  `BusinessMembershipGuard`; endpoint del admin para cambiar el plan.
- Fase 1 (backend): paquete `src/packages/loyalty/` con programas, caja y superficie pública. La
  tarjeta pública trae `member.qrPngDataUrl`, el QR que lee la caja: codifica
  `opinara-card:{memberCode}`, no un link. La búsqueda de la caja también encuentra por código exacto.
- Fases 2 y 3 (frontend, `src/features/loyalty/`):
  - `/loyalty`: tarjetas por sucursal y alta. Si el plan no la incluye, se explica qué es.
  - `/loyalty/programs/:urn`: QR de alta con los formatos de impresión de campañas y sus propios
    textos, configuración, pausa y clientes.
  - `/loyalty/register`: la caja a pantalla completa. Elige la sucursal una vez por dispositivo (sola
    si hay una), escanea con `BarcodeDetector` o `jsqr` (en un chunk aparte) o busca por celular,
    nombre o código, y permite sumar, canjear, deshacer y mostrar un link nuevo.
  - `/f/:negocio/:programa` (alta) y `/card#token=…` (tarjeta, guardada en el teléfono, con
    refresco cada 10 s y borrado de datos).
  - Mocks de MSW y tests.

**Pendiente:**
- Estadísticas por semana y exportación CSV.
- Selector de plan y cifras en `opinara-admin` (fase 5).
- Textos legales (fase 4): la política de privacidad del frontend todavía no menciona la tarjeta de
  sellos ni los datos de consumidores finales. **Hay que resolverlo antes de habilitar la
  funcionalidad a un comercio.** Revisar también la inscripción en la AAIP.
