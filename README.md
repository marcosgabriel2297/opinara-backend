# Opinara Backend

Backend de un SaaS B2B de reputación: un negocio conecta su **Google Business Profile**, genera un QR por sucursal, recibe feedback de sus clientes y gestiona sus reseñas de Google desde un único lugar.

> **Qué NO hace, a propósito**: no crea reseñas. No existe endpoint de Google para eso y la política de Google lo prohíbe. La reseña la escribe el cliente en Google; nosotros la sincronizamos y permitimos responderla con las APIs oficiales. Tampoco hay scraping, bots ni cuentas automatizadas.

## Cómo funciona

```
El negocio                                  El cliente
──────────                                  ──────────
1. se registra
2. conecta su Google Business Profile
3. elige qué sucursales importar
4. crea una campaña y genera su QR    ───►  5. escanea el QR
                                            6. deja una calificación y un comentario
                                            7. pasa a Google a dejar su reseña
8. ve las reseñas sincronizadas
9. las responde desde el dashboard
```

**El link a Google se le muestra a todos los clientes, sin importar la calificación.** Mostrarlo solo a los contentos es *review gating*: Google prohíbe desalentar reseñas negativas o solicitar selectivamente las positivas, y puede restringir el perfil del negocio ([política de contenido](https://support.google.com/business/answer/7400114)). El rating interno se guarda igual, pero no condiciona el link.

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

El backend usa una sola base con una sola conexión. Alcanza con apuntar `DATABASE_URI`:

```bash
# Local con Docker
docker run -d -p 27017:27017 --name opinara-mongo mongo:7
DATABASE_URI=mongodb://localhost:27017

# Atlas
DATABASE_URI=mongodb+srv://usuario:password@cluster.mongodb.net
```

Los índices (únicos y TTL) los crea Mongoose al arrancar. **Los tests no necesitan Mongo**: levantan uno en memoria.

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

`NODE_ENV` sólo habilita comportamiento de desarrollo con los valores `dev`, `development` o `test`. Cualquier otra cosa —incluido no setearlo— se trata como producción: los errores no muestran detalle interno y el CORS no se abre solo.

**Nunca pongas credenciales reales en `.env.example`.** Los archivos `.env.dev` y `.env.prod` están en `.gitignore`.

---

## API

Todo cuelga de `/api`. Los endpoints privados necesitan `Authorization: Bearer <accessToken>`.

### Autenticación
```
POST   /auth/register            POST /auth/login          POST /auth/refresh
GET    /auth/me
GET    /auth/google/callback     (público: acá redirige Google)
```

### Negocios
```
POST   /businesses               GET  /businesses          GET /businesses/:businessUrn
```

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
GET    /businesses/:businessUrn/locations
GET    /businesses/:businessUrn/locations/:locationUrn
GET    /businesses/:businessUrn/locations/:locationUrn/reviews          ?page&limit&rating&hasReply
GET    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn
PUT    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply
DELETE /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply
POST   /businesses/:businessUrn/locations/:locationUrn/reviews/sync     (OWNER, ADMIN)
```

`PUT` y no `POST` para responder: en Google `updateReply` crea la respuesta si no existe y la edita si ya está.

### Campañas, QR y feedback
```
POST   /businesses/:businessUrn/campaigns                  (OWNER, ADMIN)
GET    /businesses/:businessUrn/campaigns
GET    /businesses/:businessUrn/campaigns/:campaignUrn
POST   /businesses/:businessUrn/campaigns/:campaignUrn/qr  (OWNER, ADMIN)
GET    /businesses/:businessUrn/feedback                   ?page&limit&rating&locationUrn&campaignUrn
```

### Público (sin autenticación)
```
GET    /public/r/:businessSlug/:campaignSlug               landing del QR
POST   /public/r/:businessSlug/:campaignSlug/feedback      { rating, comment? }
POST   /public/r/:businessSlug/:campaignSlug/google-click  métrica
```

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
│   ├── feedback/            #   feedback propio
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
                               │            └──< Campaign ──< Feedback
                               │                     └──< QRCode
                               └── GoogleConnection
```

- **`BusinessMember`** es la fuente de verdad de la autorización: un usuario puede pertenecer a varios negocios con distinto rol (`OWNER`, `ADMIN`, `MEMBER`).
- **`Review` y `Feedback` son entidades separadas y no se mezclan.** `Review` es un espejo de Google, cuya fuente de verdad es Google. `Feedback` es dato propio, nunca se publica y no guarda PII.
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

El MVP está completo de punta a punta. Lo que sigue, deliberadamente fuera de alcance:

- **Notificaciones de Google por Pub/Sub** (la API ya está habilitada y el diseño previsto). Ojo: Google admite **un solo topic por cuenta**, así que hay que avisarle al negocio si ya usa otra herramienta.
- **BullMQ** para mover la sincronización a workers, con lock distribuido: el candado actual del cron es en memoria y alcanza para una sola instancia.
- Instagram/Facebook, generación de contenido con IA, analytics avanzados y billing.

[`ESTADO.md`](ESTADO.md) tiene el detalle por fases, las reglas invariantes del proyecto y los bugs encontrados durante el desarrollo con su corrección.
