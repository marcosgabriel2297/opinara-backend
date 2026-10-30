# Opinara Backend

Backend de un SaaS B2B de reputación: un negocio conecta su **Google Business Profile**, genera un QR por sucursal que lleva a sus clientes directo a dejar la reseña en Google, y gestiona sus reseñas de Google desde un único lugar.

> **Qué NO hace, a propósito**: no crea reseñas. No existe endpoint de Google para eso y la política de Google lo prohíbe. La reseña la escribe el cliente en Google; nosotros la sincronizamos y permitimos responderla con las APIs oficiales. Tampoco hay scraping, bots ni cuentas automatizadas.

## Cómo funciona

```
El negocio                                  El cliente
──────────                                  ──────────
1. recibe su cuenta (la da de alta un admin)
2. conecta su Google Business Profile
3. elige qué sucursales importar
4. crea una campaña y genera su QR    ───►  5. escanea el QR
                                            6. cae directo en el formulario de reseña de Google
                                            7. deja su reseña
8. ve las reseñas sincronizadas
9. las responde desde el dashboard
```

**El QR lleva directo a Google, sin formulario propio en el medio.** Al principio la landing pedía una calificación interna y después ofrecía el link a Google, pero pedirle al cliente que opine dos veces es perderlo en el segundo paso. Ahora `GET /api/public/r/:businessSlug/:campaignSlug` cuenta el escaneo y responde `302` al formulario de reseña de la sucursal. Como no hay filtro de ningún tipo, tampoco hay riesgo de *review gating* ([política de contenido](https://support.google.com/business/answer/7400114)). Las opiniones internas se eliminaron del producto: el endpoint, la entidad y el contador.

---

## Requisitos

| | |
|---|---|
| Node.js | 20 o superior (desarrollado con 24) |
| Yarn | 4.x |
| MongoDB | 6 o superior (local, Docker o Atlas) |
| Cuenta de Google | Un Google Business Profile verificado, para la parte de Google |

## Instalación

```bash
yarn install
cp .env.example .env.dev
```

Generá la clave de cifrado de tokens y pegala en `.env.dev`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

La app **no arranca** si falta `DATABASE_URI`, `JWT_SECRET_KEY` o `TOKEN_ENCRYPTION_KEY`, o si esa clave no mide exactamente 32 bytes. Es deliberado: es mejor fallar al arrancar que descubrirlo cuando un negocio intenta conectar Google.

## MongoDB

El backend usa una sola base con una sola conexión. Hay tres formas de tenerla:

```bash
# 1. Docker (recomendado)
yarn db:up          # levanta mongo:7 con volumen persistente
yarn db:down        # frena (los datos quedan)

# 2. Sin Docker: reutiliza el binario de mongod que ya descargan los tests
yarn mongo:local    # datos persistentes en .mongo-data/

# 3. Atlas
DATABASE_URI=mongodb+srv://usuario:password@cluster.mongodb.net
```

Las dos primeras quedan en `mongodb://127.0.0.1:27017`.

> Si `docker` responde `permission denied ... /var/run/docker.sock` recién después de instalarlo, tu sesión todavía tiene la lista de grupos vieja: abrí una terminal nueva o usá `newgrp docker`. Para una sola orden alcanza con `sg docker -c "yarn db:up"`.

Los índices (únicos y TTL) los crea Mongoose al arrancar. **Los tests no necesitan Mongo**: levantan uno en memoria.

### Datos de prueba

```bash
yarn seed
```

Carga datos ficticios: dos negocios (uno para probar el aislamiento entre tenants), tres sucursales, 24 reseñas con respuestas y reseñas anónimas, tres campañas con sus contadores. **Borra todo lo que haya en la base antes de cargar.**

Los cuatro usuarios comparten la contraseña `claveSuperSegura1` y cubren los tres roles:

| Email | Rol |
|---|---|
| `dueno@opinara.test` | OWNER de Café de la Esquina |
| `gerente@opinara.test` | ADMIN de Café de la Esquina |
| `empleada@opinara.test` | MEMBER de Café de la Esquina |
| `peluqueria@opinara.test` | OWNER de Peluquería Estilo |

Las conexiones de Google del seed tienen **tokens inventados**: sirven para recorrer la app localmente, no para hablar con Google.

## Cómo ejecutar

```bash
yarn start:dev      # desarrollo con recarga
yarn start:prod     # producción (requiere yarn build)
yarn build
yarn lint
yarn format
```

La API queda bajo el prefijo `/api`. Verificá con `GET /api/health`.

## Tests

```bash
yarn test           # toda la suite
yarn test:cov       # con cobertura
npx jest src/packages/reviews    # un paquete puntual
```

**Ningún test toca la red ni una cuenta real de Google.** Las integraciones se reemplazan por dobles (`test/google.fakes.ts`) y Mongo corre en memoria (`mongodb-memory-server`), así que la suite es reproducible en cualquier máquina y en CI.

---

## Arrancar sin acceso a las APIs de Google

El acceso a las APIs se aprueba por proyecto de Google Cloud y tarda. Mientras tanto, el circuito del QR **no necesita la API**: el escaneo y el salto a Google funcionan solo con el link de reseña, que se arma con el Place ID de la sucursal.

Por eso existe el alta manual:

```bash
curl -X POST http://localhost:3000/api/businesses/$BIZ/locations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Sucursal Centro","placeId":"ChIJ...","address":"Corrientes 1234"}'
```

El Place ID se saca de la ficha del local en Google Maps, sin API. Con él, el backend arma el link de reseña (`https://search.google.com/local/writereview?placeid=...`) y la ficha de Maps.

Una sucursal manual queda marcada con `source: "MANUAL"` y se comporta distinto en un solo punto: **no se sincroniza**. Queda fuera del cron y del `POST /google/sync`, y pedirle una sincronización responde `400 LOCATION_NOT_SYNCABLE`. Traer y responder reseñas sigue esperando la aprobación de Google.

**Cuando el acceso llega**, el negocio conecta su cuenta e importa sus sucursales como siempre: la importación **adopta la sucursal manual por `placeId`** en vez de duplicarla. Conserva su `urn`, así que las campañas siguen apuntando a ella y **los QR ya impresos siguen funcionando**; a partir de ahí pasa a `source: "GOOGLE"` y entra en la sincronización.

---

## Google Business Profile: qué configurar

Esta es la parte que más fricción tiene, y casi toda es trámite fuera del código.

### 1. Pedir acceso a las APIs (hacelo primero: tarda)

Google no da acceso a estas APIs por defecto. Hay que pedirlo con el [formulario de acceso](https://developers.google.com/my-business/content/prereqs) eligiendo *"Application for Basic API Access"*. Requisitos: gestionar un Google Business Profile **verificado y activo hace 60 días o más**, y tener un sitio web del negocio.

**Hasta que aprueben, la cuota del proyecto es 0 QPM y ninguna llamada funciona.** Aprobado, pasa a 300 QPM, y eso se verifica en *Cuotas* de la consola de Google Cloud. Es el único bloqueante del proyecto que no depende de vos.

### 2. Habilitar las APIs en Google Cloud

En el proyecto de Google Cloud, habilitá estas cuatro:

| API | Para qué la usamos |
|---|---|
| **Google My Business API** (v4.9) | Reseñas: listar, responder y borrar respuestas |
| **My Business Account Management API** (v1) | Listar las cuentas del usuario |
| **My Business Business Information API** (v1) | Listar e importar sucursales |
| **My Business Notifications API** (v1) | Reservada para las notificaciones de Pub/Sub (post-MVP) |

Las reseñas siguen viviendo en la API **v4.9**: no hay reemplazo en las v1 al día de hoy. Por eso el cliente está aislado en un solo archivo.

### 3. Credenciales OAuth

Creá un **OAuth client ID** de tipo *Web application* y anotá el client ID y el secret en `.env.dev`.

**Callback URL** (tiene que coincidir carácter por carácter con `GOOGLE_REDIRECT_URI`):

```
http://localhost:3000/api/auth/google/callback      # desarrollo
https://api.tu-dominio.com/api/auth/google/callback # producción
```

### 4. Scope

Uno solo:

```
https://www.googleapis.com/auth/business.manage
```

Es un scope sensible, así que para usarlo con usuarios externos en producción hace falta pasar la verificación de la pantalla de consentimiento de Google.

### Límites que conviene tener presentes

- **300 QPM por proyecto**, compartidos entre *todos* los negocios que uses la plataforma. Por eso la sincronización es secuencial y con backoff.
- `reviews.list` devuelve **máximo 50 por página**; `locations.list`, 100 y exige `readMask`.
- Los pedidos de ampliación de cuota se rechazan si no estás usando más del 50% de la actual.

---

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las que importan:

| Variable | Qué es |
|---|---|
| `DATABASE_URI`, `DATABASE_NAME` | Conexión a Mongo |
| `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY` | Firma de los tokens de la plataforma. **Distintos entre sí** |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM (32 bytes en base64) para cifrar los tokens de Google en reposo |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Credenciales OAuth |
| `PUBLIC_APP_BASE_URL` | Base del **frontend**: la URL del QR es `{base}/r/{businessSlug}/{campaignSlug}` |
| `CORS_ORIGINS` | Lista separada por comas. Vacío: abierto en desarrollo, **cerrado en producción** |
| `REVIEW_SYNC_ENABLED`, `REVIEW_SYNC_CRON` | Sincronización automática de reseñas |
| `LLM_PROVIDER` | Proveedor del modelo de las respuestas sugeridas: `groq` (por defecto) o `anthropic` |
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`, `GROQ_REASONING_EFFORT` | Groq (modelo por defecto `openai/gpt-oss-120b`, razonamiento `medium`). **Opcional**: sin la clave del proveedor elegido, el endpoint responde `503 REPLY_SUGGESTIONS_UNAVAILABLE` y el resumen avisa `replySuggestions: false`. Con `GROQ_BASE_URL` sirve cualquier API compatible con OpenAI (Ollama, OpenRouter) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude, con `LLM_PROVIDER=anthropic` (modelo por defecto `claude-opus-5-5`) |
| `REPLY_SUGGESTIONS_THROTTLE_LIMIT` | Tope de sugerencias por minuto e IP (30) |

`NODE_ENV` sólo habilita comportamiento de desarrollo con los valores `dev`, `development` o `test`. Cualquier otra cosa —incluido no setearlo— se trata como producción: los errores no muestran detalle interno y el CORS no se abre solo.

**Nunca pongas credenciales reales en `.env.example`.** Los archivos `.env.dev` y `.env.prod` están en `.gitignore`.

---

## API

Todo cuelga de `/api`. Los endpoints privados necesitan `Authorization: Bearer <accessToken>`.

### Autenticación
```
POST   /auth/login               POST /auth/refresh
POST   /auth/logout              { refreshToken }, sin access token   204
POST   /auth/logout/all          cierra todas las sesiones del usuario  204
POST   /auth/password/forgot     { email }   siempre 202
POST   /auth/password/reset      { token, password }                   204
POST   /auth/password/change     { currentPassword, newPassword }      204
GET    /auth/me
GET    /auth/google/callback     (público: acá redirige Google)
```

Cada login abre una **sesión** (`sessions`), y los dos tokens llevan su URN en `sid`. El `AuthGuard` y `/auth/refresh` la consultan, así que cerrar sesión corta el acceso en el acto, aunque los tokens no hayan vencido. Los tokens sin `sid`, emitidos antes de que existieran las sesiones, ya no se aceptan: quien tuviera una sesión abierta entra de nuevo una vez.

No hay registro público: a los usuarios los da de alta un **administrador** de la plataforma (colección `admins`, identidad aparte de `users`):

```
POST   /admin/auth/login         { email, password }  → { admin, accessToken, expiresIn }
POST   /admin/users              { email, name }      → 201 { user, temporaryPassword }
GET    /admin/businesses         negocios con sus sucursales (para los filtros del panel)
GET    /admin/reviews            reseñas de TODOS los negocios, con negocio y sucursal
GET    /admin/reviews/summary    total, sin responder, promedio y distribución de lo filtrado
```

Los dos de reseñas aceptan `businessUrn`, `locationUrn`, `rating`, `hasReply`, `from` / `to` (fecha de la reseña en Google; `to` exclusive) y `search` (texto literal en el comentario o el autor); el listado además `page`, `limit` (hasta 100) y `order` (`newest` | `oldest`). Son la única excepción a la regla de que cada consulta parte de un `businessUrn`: viven en `AdminReviewsRepository`, dentro del paquete del admin. Los consume el panel `opinara-admin`; en producción, su dominio va en `CORS_ORIGINS`.

El token del admin (`type: admin`, dura `ADMIN_TOKEN_EXPIRES_IN_SECONDS`, 8 h por defecto, sin refresh) solo sirve contra `/admin`, y el de un usuario no sirve ahí. El primer admin se crea con `yarn admin:create <email> "<nombre>"`, que imprime su contraseña una sola vez. El alta devuelve una **contraseña provisoria** (también una sola vez) que el admin le pasa al usuario: mientras no la cambie (`mustChangePassword`), el `AuthGuard` responde `403 PASSWORD_CHANGE_REQUIRED` a todo menos `/auth/me`, `/auth/password/change` y `/auth/logout/all`. Cambiarla cierra las demás sesiones; elegir una nueva desde el mail de recuperación también la reemplaza. Las invitaciones al equipo son solo para emails con cuenta (`INVITEE_NOT_REGISTERED`).

Recuperar contraseña manda un link de un solo uso que dura una hora (`PASSWORD_RESET_EXPIRES_IN_SECONDS`). El token va después de `#` (`/reset-password#token=…`): el navegador no lo manda a ningún servidor ni en el `Referer`. En la base queda su SHA-256. Usarlo cambia la contraseña y cierra todas las sesiones del usuario. `forgot` responde 202 exista o no la cuenta, y no espera el envío del mail, para no delatarla por el tiempo de respuesta.

### Negocios
```
POST   /businesses               GET  /businesses          GET /businesses/:businessUrn
PUT    /businesses/:businessUrn/logo      (OWNER, ADMIN)   cuerpo: la imagen cruda
DELETE /businesses/:businessUrn/logo      (OWNER, ADMIN)
```

El logo se sube como el cuerpo del request, sin multipart: `Content-Type: image/png`, `image/jpeg` o `image/webp`, hasta 300 KB (`413 LOGO_TOO_LARGE`). El tipo se verifica contra los primeros bytes de la imagen (`400 LOGO_INVALID_IMAGE` si no coinciden). SVG no se acepta: servido desde la API podría ejecutar scripts; el frontend lo convierte a imagen antes de subirlo. Las dos operaciones responden el negocio, con `logoUpdatedAt` actualizado (`null` sin logo).

### Equipo e invitaciones
```
GET    /businesses/:businessUrn/members                       miembros (+ invitaciones pendientes para OWNER/ADMIN)
POST   /businesses/:businessUrn/invitations     (OWNER, ADMIN) { email, role: ADMIN|MEMBER } → { invitation, inviteUrl }
DELETE /businesses/:businessUrn/invitations/:invitationUrn (OWNER, ADMIN)
PATCH  /businesses/:businessUrn/members/:memberUrn  (OWNER) { role }
DELETE /businesses/:businessUrn/members/:memberUrn          sacar a alguien, o irse
POST   /invitations/lookup       { token }   (público) lo que muestra la pantalla de la invitación
POST   /invitations/accept       { token }   suma al usuario con sesión
```

Reglas:
- **OWNER:** hay uno solo, quien creó el negocio. No se invita, no se le cambia el rol y no se lo saca.
- **Invitar:** el OWNER invita ADMIN o MEMBER y cambia roles; un ADMIN invita y saca solo MEMBER.
- **Irse:** cualquiera que no sea OWNER puede irse por su cuenta.
- **Aceptar:** la invitación es para un email, y la acepta solo quien entró con ese email (`403 INVITATION_EMAIL_MISMATCH`). Vence a los 7 días, e invitar de nuevo al mismo email anula la anterior.
- **Link para quien invita:** `inviteUrl` vuelve en la respuesta para pasarlo a mano, por WhatsApp, si el mail no llega. Es seguro mostrárselo porque solo sirve para ese email.
- **Tokens:** van en el cuerpo de los `POST`, no en la URL, así no quedan en logs.

### Mails

`MailerModule` (global) elige el proveedor:
- **Con `MAIL_RESEND_API_KEY`:** manda por la API HTTP de Resend, sin dependencias.
- **Sin la clave, en desarrollo:** escribe el mail con su link en el log. Alcanza para probar la recuperación y las invitaciones.
- **Sin la clave, en producción:** solo registra un error, sin escribir el contenido porque lleva tokens.

Cambiar de proveedor es escribir otra implementación de `Mailer`.

### Conexión con Google
```
POST   /businesses/:businessUrn/google/connect            (OWNER)
GET    /businesses/:businessUrn/google/connection
DELETE /businesses/:businessUrn/google/connection         (OWNER)
GET    /businesses/:businessUrn/google/accounts
GET    /businesses/:businessUrn/google/locations?accountName=accounts/{id}
POST   /businesses/:businessUrn/google/locations/import   (OWNER, ADMIN)
POST   /businesses/:businessUrn/google/sync               (OWNER, ADMIN)
```

### Sucursales y reseñas
```
POST   /businesses/:businessUrn/locations                              (OWNER, ADMIN)
GET    /businesses/:businessUrn/locations
GET    /businesses/:businessUrn/locations/:locationUrn
GET    /businesses/:businessUrn/locations/:locationUrn/reviews          ?page&limit&rating&hasReply
GET    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn
PUT    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply
DELETE /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply
POST   /businesses/:businessUrn/locations/:locationUrn/reviews/sync     (OWNER, ADMIN)
```

Todo el negocio (todas las sucursales):
```
GET    /businesses/:businessUrn/reviews            ?page&limit&rating&hasReply&locationUrn&order=newest|oldest
GET    /businesses/:businessUrn/reviews/summary    totales, sin responder, promedio, distribución y últimos 30 días vs. los 30 anteriores
POST   /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply-suggestion   borrador escrito por el modelo; no publica
```

`order=oldest` es la fila de respuesta del frontend: la que más espera primero. El promedio del resumen no cuenta las reseñas sin calificación (`starRating` 0). La sugerencia **no publica ni guarda nada**: devuelve un texto que la persona revisa y manda con el `PUT` de siempre. Las instrucciones al modelo son fijas y la reseña va marcada como dato de un tercero, para que un texto en la reseña no pueda dar órdenes.

El modelo está detrás de un **adaptador** (`@shared/integrations/text-generation`), igual que Google:
- **El dominio** (`ReplySuggesterService`) arma las reglas y el pedido, y depende solo del puerto `TEXT_GENERATION_ADAPTER` (`generate({ system, prompt, maxTokens })`).
- **Cada proveedor** tiene un adaptador que traduce ese pedido a su API: `GroqTextGenerationService` (`chat/completions`, compatible con OpenAI) y `AnthropicTextGenerationService` (Messages).
- **Cuál se usa** lo elige `LLM_PROVIDER`.

Sumar un proveedor es escribir su adaptador y agregarlo en `text-generation-integration.module.ts`; el dominio no cambia.

`PUT` y no `POST` para responder: en Google `updateReply` crea la respuesta si no existe y la edita si ya está.

El `POST` es el **alta manual**, explicada abajo: la vía normal para dar de alta sucursales es importarlas desde Google.

### Campañas y QR
```
POST   /businesses/:businessUrn/campaigns                  (OWNER, ADMIN)
GET    /businesses/:businessUrn/campaigns
GET    /businesses/:businessUrn/campaigns/:campaignUrn
POST   /businesses/:businessUrn/campaigns/:campaignUrn/qr  (OWNER, ADMIN)
GET    /businesses/:businessUrn/campaigns/:campaignUrn/scans   ?weeks (1-52, por defecto 12)
GET    /businesses/:businessUrn/scans                          ?weeks — todas las campañas
```

Los escaneos por semana salen de `scan_events` (un documento por escaneo contado, sin IP ni user agent), agrupados de lunes a domingo **en la zona horaria del negocio**. Las semanas sin escaneos vienen en 0. Solo hay datos desde que se empezó a registrar (`trackedSince`): los escaneos anteriores siguen en `stats.scans` pero no tienen fecha.

### Público (sin autenticación)
```
GET    /public/r/:businessSlug/:campaignSlug               302 a Google; cuenta el escaneo
                                                           límite por IP y campaña → 302 a /r/{b}/{c}/espera
GET    /public/businesses/:businessSlug/logo               ?v — el logo del negocio
```

El logo lo muestran la pantalla del QR, la hoja impresa y el dashboard. Con `?v=` igual a la versión vigente (el `getTime()` de `logoUpdatedAt`) se cachea un año (`immutable`): al cambiar el logo cambia la URL. Sin versión, o con una vieja, cinco minutos. Va con `Cross-Origin-Resource-Policy: cross-origin` (helmet pone `same-origin`) para que el frontend, en otro origen, lo pueda mostrar. Negocio inexistente, suspendido o sin logo responden el mismo `404 LOGO_NOT_FOUND`.

El límite es de `PUBLIC_THROTTLE_LIMIT` escaneos por minuto (60 por defecto) por **IP y campaña**, no solo por IP. Todos los teléfonos del wifi de un local salen por la misma IP, y con un cupo por IP un local lleno se quedaba sin escaneos. Pasado el límite, en lugar de un `429` con JSON, que era lo que veía el cliente en el teléfono, redirige a una página del frontend que espera unos segundos y reintenta sola (`ThrottledScanFilter`). Detrás de un proxy inverso hay que configurar `TRUST_PROXY`; si no, el límite ve la IP del proxy.

Cada `GET` suma `scans` y `googleClicks` en la misma operación atómica (`$inc`), sobre lo que ya había. Un `HEAD` (previsualizadores de links, bots) redirige igual pero no cuenta. La respuesta va con `Cache-Control: no-store`: si el navegador guardara el 302, el segundo escaneo desde el mismo teléfono iría directo a Google y no se contaría.

Si la campaña no sirve (negocio inexistente o suspendido, campaña pausada, sucursal sin link) redirige a `{PUBLIC_APP_BASE_URL}/r/no-disponible`, la misma página para todos los casos. Nunca se responde un JSON de error a quien escaneó, salvo un slug con formato inválido (400) o el rate limit (429).

### Errores

Todas las respuestas de error tienen la misma forma, con un código estable:

```json
{
  "statusCode": 404,
  "message": "Business not found",
  "errorCode": "BUSINESS_NOT_FOUND",
  "timestamp": "2026-09-13T22:00:00.000Z",
  "path": "/api/businesses/urn:business:..."
}
```

El catálogo completo está en [`src/shared/common/errors/index.ts`](src/shared/common/errors/index.ts). Los errores de Google nunca se devuelven crudos: se traducen a estos códigos y el detalle queda en el log del servidor.

---

## Arquitectura

Monolito modular. Sin microservicios.

```
src/
├── main.ts
├── app/                     # wiring y rutas
├── packages/                # un paquete por dominio
│   ├── authentication/      #   identidad propia
│   ├── businesses/          #   negocios y membresías
│   ├── google/              #   conexión OAuth, cuentas, sucursales
│   ├── locations/           #   sucursales importadas
│   ├── reviews/             #   reseñas, respuestas y sincronización
│   ├── campaigns/           #   campañas y QR
│   ├── public/              #   superficie anónima del QR
│   └── health/
└── shared/
    ├── common/              # guards, decoradores, errores, crypto, cliente HTTP
    ├── models/              # modelos que consultan los guards globales
    ├── repositories/        # DatabaseRepository base
    └── integrations/google/ # TODO lo que sabe de Google
        ├── adapters/        #   interfaces (puertos)
        ├── services/        #   implementaciones HTTP
        ├── endpoints/       #   las URLs, en un solo lugar
        └── mappers/         #   crudo -> dominio
```

Cada paquete sigue la misma forma: `controllers/`, `services/`, `models/`, `dtos/`, `config/`.

### Modelo de datos

```
User ──< BusinessMember >── Business ──< Location ──< Review
                               │            │
                               │            └──< Campaign ──< QRCode
                               │                    └──< ScanEvent
                               ├── GoogleConnection
                               ├── BusinessLogo
                               └──< BusinessInvitation
```

- **`BusinessMember`** es la fuente de verdad de la autorización: un usuario puede pertenecer a varios negocios con distinto rol (`OWNER`, `ADMIN`, `MEMBER`).
- **`Review` es un espejo de Google**, cuya fuente de verdad es Google.
- **`Session`** (`sessions`): un login en un dispositivo. Se revoca al cerrar sesión o al cambiar la contraseña, y Mongo borra las vencidas solo (índice TTL). `PasswordReset` (`password_resets`) guarda el hash del token de un solo uso.
- **`BusinessLogo`** (`business_logos`) guarda la imagen aparte: el negocio se carga en cada request (lo usa el guard de membresía) y no arrastra los bytes. En `Business` queda solo `logoUpdatedAt`, que versiona la URL pública.
- **`Location` guarda dos identificadores de Google** porque las APIs no coinciden: la v1 identifica la sucursal como `locations/{id}`, pero la v4 de reseñas necesita `accounts/{a}/locations/{l}`.

---

## Decisiones importantes

**El dominio no conoce a Google.** Los paquetes de negocio dependen de tres interfaces (`GOOGLE_OAUTH_ADAPTER`, `GOOGLE_ACCOUNTS_ADAPTER`, `GOOGLE_REVIEWS_ADAPTER`, `GOOGLE_LOCATIONS_ADAPTER`), nunca de axios ni de URLs. Las URLs viven en un archivo y hay un test que las fija literalmente. Cuando Google migre las reseñas fuera de la API v4.9, es un archivo.

**Aislamiento multi-tenant en dos capas.** El guard de membresía autoriza, y además *todo* repositorio de una entidad de negocio filtra por `businessUrn`: cambiar un id en la URL no sirve aunque el guard fallara. Cuando no hay membresía la respuesta es **404 y no 403**, porque un 403 confirmaría que ese negocio existe.

**Secretos cifrados y nunca logueados.** Los tokens de Google se guardan con AES-256-GCM y versión de clave para poder rotarla. El cliente HTTP redacta los campos sensibles, no loguea headers ni cuerpos de respuesta, y hay un test que lo verifica contra un servidor real.

**OAuth con `state` hasheado, de un solo uso y con TTL.** Se guarda el SHA-256, se consume con una operación atómica —dos callbacks concurrentes no pueden ganar los dos— y expira solo por índice TTL.

**El dashboard no depende de Google.** El listado de reseñas sale de nuestra copia local: una conexión rota o una caída de Google no dejan al negocio sin su panel. Solo responder y sincronizar necesitan a Google en vivo.

**Sincronización incremental que no pierde datos.** Corta por `updateTime` con 5 minutos de solapamiento, avanza el marcador al *inicio* de la corrida y solo si terminó bien, y detecta reseñas borradas únicamente en corridas completas. Si se corta por el tope de páginas, no avanza el marcador ni saca conclusiones sobre borrados.

**Preparado para workers sin estar sobre-diseñado.** El servicio de sincronización es idempotente, sin estado en memoria y no depende del request: mover el disparador a BullMQ es cambiar quién lo llama. No hay cola todavía porque el MVP no la necesita.

**TypeScript strict y cero `any`.** `no-explicit-any` está en `error`, no en warning.

---

## Estado y qué falta

El MVP está completo de punta a punta. Las propuestas de producto y los pendientes técnicos están en [`FUTURAS-FUNCIONALIDADES.md`](FUTURAS-FUNCIONALIDADES.md). Además, deliberadamente fuera de alcance:

- **Notificaciones de Google por Pub/Sub** (la API ya está habilitada y el diseño previsto). Ojo: Google admite **un solo topic por cuenta**, así que hay que avisarle al negocio si ya usa otra herramienta.
- **BullMQ** para mover la sincronización a workers, con lock distribuido: el candado actual del cron es en memoria y alcanza para una sola instancia.
- Instagram/Facebook, generación de contenido con IA, analytics avanzados y billing.

[`ESTADO.md`](ESTADO.md) tiene el detalle por fases, las reglas invariantes del proyecto y los bugs encontrados durante el desarrollo con su corrección.
