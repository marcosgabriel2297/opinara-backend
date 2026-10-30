# Estado del proyecto — Opinara Backend

> Última actualización: **2026-09-17** (MVP completo, fases 0-7, + alta manual de sucursales). Documento de traspaso entre sesiones de trabajo.
> El plan técnico completo está en `~/.claude/plans/en-el-root-del-smooth-turtle.md`.
> La puesta en marcha con el primer local real (trámite con Google, deploy, alta del negocio) vive
> aparte, en [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md).

## Dónde quedamos

**MVP completo: fases 0 a 7 terminadas y probadas.** Lo que sigue es post-MVP (ver el final de este documento).

Después del MVP se agregó el **alta manual de sucursales** (`POST /businesses/:businessUrn/locations`), para poder operar el circuito del QR con un local real antes de que Google apruebe el acceso a las APIs. Ver *Alta manual de sucursales*, más abajo.

| Fase | Qué incluye | Estado |
|---|---|---|
| 0 | Bootstrap: Nest 11, TS strict sin `any`, config + validación de env, Mongo, errores, crypto, HTTP client, health | ✅ |
| 1 | Auth: `User`, register/login/refresh/me, `AuthGuard` | ✅ |
| 2 | `Business` + `BusinessMember` + aislamiento multi-tenant | ✅ |
| 3 | OAuth de Google, `GoogleConnection`, accounts/locations, import de locations | ✅ |
| 4 | Reviews: modelo, listado, detalle, `PUT/DELETE reply` contra la API v4.9 | ✅ |
| 5 | Sincronización incremental + endpoint manual + cron + backoff | ✅ |
| 6 | Campaigns + QR + Feedback + endpoints públicos | ✅ |
| 7 | README completo + `.env.example` + cierre de MVP | ✅ |

Post-MVP (fuera de alcance por ahora): notificaciones Pub/Sub, BullMQ, `SocialConnection`, IA, analytics, billing.

**Estado del repo:** `master` limpio, MVP commiteado. Docker y Mongo local funcionando (`yarn db:up`), base de desarrollo cargada con `yarn seed`.

## Cómo levantarlo

```bash
yarn install
cp .env.example .env.dev      # completar DATABASE_URI y TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # TOKEN_ENCRYPTION_KEY
yarn start:dev                # dev
yarn lint && yarn test && yarn build   # verificación completa: 180 tests en verde
```

Mongo corre en Docker (`yarn db:up`, `mongo:7` en `127.0.0.1:27017`). Los tests no lo necesitan: usan `mongodb-memory-server`.

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
POST   /api/auth/login | refresh | password/change   GET /api/auth/me
POST   /api/admin/auth/login | users                 (alta de usuarios por el admin)
GET    /api/auth/google/callback                     (público, throttled)

POST   /api/businesses                               GET /api/businesses
GET    /api/businesses/:businessUrn

POST   /api/businesses/:businessUrn/google/connect            (OWNER)
GET    /api/businesses/:businessUrn/google/connection
DELETE /api/businesses/:businessUrn/google/connection         (OWNER)
GET    /api/businesses/:businessUrn/google/accounts
GET    /api/businesses/:businessUrn/google/locations?accountName=accounts/{id}
POST   /api/businesses/:businessUrn/google/locations/import   (OWNER | ADMIN)

POST   /api/businesses/:businessUrn/locations                 (OWNER | ADMIN, alta manual)
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

GET    /api/public/r/:businessSlug/:campaignSlug                         (público, 302 a Google)

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
| 13 | Un nombre del que no sale slug (`🍕🍕🍕`) devolvía "slug ya tomado", mandando a buscar un conflicto inexistente | `SLUG_NOT_DERIVABLE` en businesses y campañas, más trim del nombre |

Todos tienen test de regresión.

## Post-MVP (fuera de alcance por ahora)

1. **Notificaciones de Google por Pub/Sub**: la API ya está habilitada y el diseño previsto (endpoint que valida el JWT OIDC del push y dispara `syncLocation`). Ojo: Google admite **un solo topic por cuenta de Google**, así que hay que avisarle al negocio si ya usa otra herramienta que las configure.
2. **BullMQ** para mover la sincronización a workers, con lock distribuido: el candado del cron es en memoria y alcanza para una sola instancia.
3. `SocialConnection` e Instagram/Facebook, generación de contenido con IA, analytics avanzados, billing.

## Bloqueante externo

Las GBP APIs necesitan **aprobación de Google** (formulario "Application for Basic API Access"; requiere un GBP verificado hace 60+ días y sitio web). Hasta que la aprueben la cuota es **0 QPM** y no se puede probar contra la cuenta real. Las fases 4 y 5 se pueden escribir y testear completas igual, con dobles. **Conviene mandar el formulario cuanto antes: es el único bloqueante que no depende de nosotros.**

## QR directo a Google

Cambiado el 2026-10-25. Antes el QR abría una landing con formulario propio (calificación + comentario)
y recién después ofrecía el link a Google: pedirle al cliente que opine dos veces es perderlo.

- `GET /api/public/r/:businessSlug/:campaignSlug` cuenta y responde **302** al `newReviewUri` de la
  sucursal.
- **Opiniones internas eliminadas por completo**: el paquete `feedback` (entidad, `GET
  /businesses/:urn/feedback`, `POST …/feedback`), `POST …/google-click`, `FeedbackSource` y el
  contador `stats.feedbacks`. Lo que quedaba en la base se borra con `yarn db:quitar-opiniones
  --apply` (por defecto solo muestra; es idempotente). **Ya aplicado en `opinara` y
  `opinara_piloto` el 2026-10-25; falta correrlo en producción** si se despliega con datos viejos.
  Igual `toPublic` arma `stats` campo por campo, así que no depende de que se haya corrido.
- **Métricas**: cada escaneo suma `scans` y `googleClicks` en un solo `$inc` atómico, sobre lo que
  ya había. `HEAD` no cuenta; `Cache-Control: no-store` para que el 302 no quede cacheado y se
  pierdan escaneos.
- **El QR impreso no cambia**: sigue apuntando al frontend (`/r/:b/:c`), que hace
  `location.replace` al endpoint del backend. Los QR ya impresos siguen andando, y el `replace`
  evita que "atrás" desde Google recargue la página y cuente otro escaneo (el pendiente 1 de
  `PUESTA-EN-MARCHA.md`).
- Si la campaña no sirve, redirige a `{PUBLIC_APP_BASE_URL}/r/no-disponible`, también ante un
  error interno (se loguea).
- Probado con curl: 15 escaneos concurrentes → +15 exactos; histórico `184/41` → `185/42`;
  Mongo detenido → redirección a "no disponible" a los ~30 s (timeout de selección del driver).

## Alta manual de sucursales

Agregado el 2026-09-17, fuera del plan de fases, para poder salir a probar con un local real
mientras Google aprueba el acceso a las APIs (la aprobación es por proyecto de Cloud y tarda).

**Por qué se puede:** el circuito del QR no usa la API de Google. Escaneo, feedback propio y
salto a Google necesitan un solo dato: el link de reseña, que se arma con el Place ID
(`https://search.google.com/local/writereview?placeid=...`), y el Place ID sale de Maps.

**Cómo está hecho:**

- `POST /businesses/:businessUrn/locations` (OWNER | ADMIN) con `title`, `placeId` y, opcionales,
  `storeCode` y `address`. El backend deriva `newReviewUri` y `mapsUri` del `placeId`.
- `Location.source` (`GOOGLE` | `MANUAL`) distingue las dos vías. Los identificadores de Google
  de una sucursal manual son de relleno (`locations/manual-<uuid>`): así el resto del sistema no
  tiene que chequear campos opcionales en todos lados.
- **Las manuales no se sincronizan.** Quedan fuera de `findAllActive` y `findActiveForBusiness`
  (el cron y `POST /google/sync`), y `syncLocation` corta con `400 LOCATION_NOT_SYNCABLE`. Pedirle
  reseñas a Google con ids de relleno sería un 404 seguro por sucursal y por corrida, gastando la
  cuota compartida del proyecto.
- **La importación adopta la manual por `placeId`** en vez de duplicarla: conserva el `urn`, así
  que las campañas y los QR ya impresos siguen funcionando, y pasa a `source: GOOGLE`.
- Índice único parcial `(businessUrn, placeId)`: es lo que evita el duplicado cuando dos altas del
  mismo local entran a la vez (probado con 5 pedidos concurrentes: 1 × 201, 4 × 409).

**Compatibilidad con la base existente:** las locations anteriores no tienen `source`. Los filtros
de sincronización excluyen por `$ne: MANUAL` (no por `source: GOOGLE`) y `toPublicLocation` completa
`GOOGLE` cuando el campo falta, así que no hace falta migrar nada.

**Lo que sigue esperando a Google:** traer las reseñas y responderlas. Eso no tiene atajo.
