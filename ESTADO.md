# Estado del proyecto — Opinara Backend

> Última actualización: **2026-09-13** (fases 0-6). Documento de traspaso entre sesiones de trabajo.
> El plan técnico completo está en `~/.claude/plans/en-el-root-del-smooth-turtle.md`.

## Dónde quedamos

**Fases 0 a 6 terminadas y probadas.** Siguiente: **Fase 7 (README y cierre del MVP)**.

| Fase | Qué incluye | Estado |
|---|---|---|
| 0 | Bootstrap: Nest 11, TS strict sin `any`, config + validación de env, Mongo, errores, crypto, HTTP client, health | ✅ |
| 1 | Auth: `User`, register/login/refresh/me, `AuthGuard` | ✅ |
| 2 | `Business` + `BusinessMember` + aislamiento multi-tenant | ✅ |
| 3 | OAuth de Google, `GoogleConnection`, accounts/locations, import de locations | ✅ |
| 4 | Reviews: modelo, listado, detalle, `PUT/DELETE reply` contra la API v4.9 | ✅ |
| 5 | Sincronización incremental + endpoint manual + cron + backoff | ✅ |
| 6 | Campaigns + QR + Feedback + endpoints públicos | ✅ |
| 7 | **README completo + `.env.example` + cierre de MVP** | ⬅️ siguiente |

Post-MVP (fuera de alcance por ahora): notificaciones Pub/Sub, BullMQ, `SocialConnection`, IA, analytics, billing.

**Estado del repo: todo el trabajo está SIN COMMITEAR** (14 entradas nuevas en `git status`). Hay un solo commit inicial en `master`.

## Cómo levantarlo

```bash
yarn install
cp .env.example .env.dev      # completar DATABASE_URI y TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # TOKEN_ENCRYPTION_KEY
yarn start:dev                # dev
yarn lint && yarn test && yarn build   # verificación completa: 177 tests en verde
```

No hay Mongo ni Docker instalados en esta máquina: los tests usan `mongodb-memory-server` (no necesitan nada), y para `start:dev` hace falta un `DATABASE_URI` (Atlas, como camelus).

## Convenciones adoptadas (heredadas de camelus/core-backend)

- `src/packages/<feature>/{controllers,services,repositories,models,dtos,config}` con barrels y alias (`Controllers.Businesses`).
- `src/shared/{common,config,environment,integrations,models,repositories,utils}`, alias `@shared/*` y `@packages/*`.
- Identidad pública por **URN** (`urn:business:<uuid>`), nunca ObjectIds en la API.
- `DatabaseRepository<T>` base, siempre `lean()`.
- `Errors` enum + `Exceptions.*` + `AllExceptionsFilter`.
- Integraciones en `src/shared/integrations/<vendor>/` detrás de adapters.
- Prettier 120/comillas simples/trailing commas; yarn 4.

**Divergencias deliberadas respecto de camelus**: TS `strict` de verdad y `no-explicit-any: error`; una sola conexión Mongo (no una DB por módulo); `HttpClientService` con redacción de logs; Nest 11; validación de env al bootstrap.

## Reglas del proyecto que hay que mantener

1. **Aislamiento multi-tenant**: todo repositorio de una entidad de negocio filtra por `businessUrn`. Nunca buscar solo por `urn`.
2. **404, no 403**, cuando el usuario no es miembro: un 403 confirmaría que el business existe.
3. **Nada de Google en el dominio**: se depende de `GOOGLE_*_ADAPTER`, no de axios ni de URLs.
4. **Ningún token en logs ni en respuestas.** Los de Google van cifrados (AES-256-GCM) en la base.
5. **No inventar endpoints de Google.** Todas las URLs están en `src/shared/integrations/google/endpoints/index.ts`.
6. **Errores de Google nunca se devuelven crudos**: se mapean a códigos del enum `Errors`.

## Endpoints implementados

```
POST   /api/auth/register | login | refresh          GET /api/auth/me
GET    /api/auth/google/callback                     (público, throttled)

POST   /api/businesses                               GET /api/businesses
GET    /api/businesses/:businessUrn

POST   /api/businesses/:businessUrn/google/connect            (OWNER)
GET    /api/businesses/:businessUrn/google/connection
DELETE /api/businesses/:businessUrn/google/connection         (OWNER)
GET    /api/businesses/:businessUrn/google/accounts
GET    /api/businesses/:businessUrn/google/locations?accountName=accounts/{id}
POST   /api/businesses/:businessUrn/google/locations/import   (OWNER | ADMIN)

GET    /api/businesses/:businessUrn/locations
GET    /api/businesses/:businessUrn/locations/:locationUrn

GET    /api/businesses/:businessUrn/locations/:locationUrn/reviews        (paginado + filtros)
GET    /api/businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn
PUT    /api/businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply
DELETE /api/businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply

POST   /api/businesses/:businessUrn/campaigns                            (OWNER | ADMIN)
GET    /api/businesses/:businessUrn/campaigns
GET    /api/businesses/:businessUrn/campaigns/:campaignUrn
POST   /api/businesses/:businessUrn/campaigns/:campaignUrn/qr            (OWNER | ADMIN)
GET    /api/businesses/:businessUrn/feedback

GET    /api/public/r/:businessSlug/:campaignSlug                         (público)
POST   /api/public/r/:businessSlug/:campaignSlug/feedback                (público)
POST   /api/public/r/:businessSlug/:campaignSlug/google-click            (público)

POST   /api/businesses/:businessUrn/google/sync                          (OWNER | ADMIN)
POST   /api/businesses/:businessUrn/locations/:locationUrn/reviews/sync  (OWNER | ADMIN)

GET    /api/health
```

## Bugs encontrados y corregidos durante las pruebas

| # | Problema | Arreglo |
|---|---|---|
| 1 | Errores del framework devolvían `errorCode` inútil: 404 → `"Not Found"`, **429 → `INTERNAL_SERVER_ERROR`** | Normalización por status en `all.exception.filter.ts` |
| 2 | **bcrypt truncaba los passwords a 72 bytes**: se entraba con los primeros 72 caracteres | Pre-hash SHA-256 antes de bcrypt |
| 3 | Registros concurrentes → **500 filtrando base, colección e índice de Mongo** | `isDuplicateKeyError` → 409 limpio |
| 4 | `isProduction()` fallaba abierto: sin `NODE_ENV` se filtraban errores internos y el CORS quedaba abierto | `isDevelopment()` explícito; todo lo demás se trata como producción |
| 5 | **Un usuario desactivado o borrado seguía operando** hasta 24 h con su access token | El `AuthGuard` valida el usuario en la base (~7 ms) |
| 6 | `BusinessStatus.SUSPENDED` era un **campo muerto** | El guard de membresía devuelve 403 `BUSINESS_SUSPENDED` |
| 7 | Fallo del intercambio OAuth se reportaba como "conexión revocada" (no existe conexión aún) | `GOOGLE_OAUTH_EXCHANGE_FAILED` + causa real al log |
| 8 | `pageToken` se redactaba en los logs por contener "token" | Allowlist de cursores de paginación |

| 9 | Una respuesta de **solo espacios** se publicaba en el perfil público de Google | `@Transform` que recorta antes de validar en `ReplyReviewDto` |
| 10 | Dos sincronizaciones simultáneas → **500** (leer-y-después-escribir contra el índice único) | Upsert atómico por `(locationUrn, googleReviewId)` + reintento ante clave duplicada |
| 11 | El sync manual **abortaba en la primera location con error**, descartando lo ya sincronizado | Reporte por location; si ninguna funciona, el error se propaga |
| 12 | Al cortar por el tope de páginas **avanzaba el marcador**: las reseñas no traídas quedaban invisibles para siempre, y una corrida completa truncada podía marcarlas como borradas | `truncated`: no avanza el marcador ni concluye borrados, y loguea qué subir |

Todos tienen test de regresión.

## Fase 7 — plan de arranque

Lo único que falta para cerrar el MVP: el README completo que pide el spec.

1. Qué hace el producto y qué **no** hace (no crea reseñas; el cliente las escribe en Google).
2. Requisitos, instalación, variables de entorno (ya están todas en `.env.example`), MongoDB.
3. **Google Cloud paso a paso**: las cuatro APIs a habilitar, el formulario de acceso, el OAuth client, la callback URL y el scope `business.manage`.
4. Cómo correr la app y los tests.
5. Arquitectura y decisiones importantes (se pueden levantar de este documento y de los mensajes de commit).
6. Revisar que `.env.example` no tenga credenciales reales.

## Bloqueante externo

Las GBP APIs necesitan **aprobación de Google** (formulario "Application for Basic API Access"; requiere un GBP verificado hace 60+ días y sitio web). Hasta que la aprueben la cuota es **0 QPM** y no se puede probar contra la cuenta real. Las fases 4 y 5 se pueden escribir y testear completas igual, con dobles. **Conviene mandar el formulario cuanto antes: es el único bloqueante que no depende de nosotros.**
