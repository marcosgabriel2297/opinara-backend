# Prompt para construir el frontend de Opinara

> Este archivo es el punto de partida para una sesión de trabajo en el repo del frontend.
> El contrato de la API que describe está verificado contra el backend real, no inventado.

---

## Stack recomendado y por qué

| Decisión | Elección | Razón |
|---|---|---|
| Base | **Vite + React 19 + TypeScript** (SPA) | El dashboard es una app autenticada: no necesita SEO ni SSR. Sale un build estático que va a un CDN, sin servidor Node que operar. |
| Routing | **React Router 7** | Alcanza y sobra para dos superficies. |
| Estado de servidor | **TanStack Query** | La app es 90% estado del servidor (reseñas, campañas, feedback). Resuelve caché, paginación, refetch y mutaciones sin escribir un reducer. **Es la pieza que más trabajo ahorra.** |
| Estado de cliente | **Zustand**, solo si aparece la necesidad | Casi todo es estado de servidor o estado de URL. Redux sería overkill. |
| Formularios | **React Hook Form + Zod** | Zod además valida las respuestas de la API en el borde: si el backend cambia, falla fuerte y claro en vez de romper en un `.map()`. |
| UI | **Tailwind + shadcn/ui** | Componentes accesibles (Radix) que se copian al repo: nada de lock-in y el bundle queda chico. Alternativa si preferís baterías incluidas: Mantine. |
| Gráficos | **Recharts**, cuando haya métricas | Para `scans / feedbacks / googleClicks`. No hace falta en la primera versión. |
| Tests | **Vitest + Testing Library + MSW** | MSW moquea la API igual que en el backend moqueamos Google: los tests no tocan la red. |
| E2E | **Playwright**, dos flujos nada más | Login → responder una reseña, y escanear → dejar feedback. |

**Por qué no Next.js**: su ventaja fuerte sería SSR para la landing del QR, pero esa página **no se busca en Google, se escanea**; no necesita SEO ni indexación (de hecho conviene `noindex`). Lo único que aportaría es un primer pintado más rápido, y eso se consigue con un bundle chico en CDN. A cambio te obliga a operar un servidor. Si más adelante querés SSR, migrar es acotado.

## Dos superficies muy distintas

1. **Dashboard del negocio** — autenticado, de escritorio, denso en datos.
2. **Landing pública del QR** — anónima, **mobile-first**, la abre un cliente parado en el local con 3G. Acá el peso importa de verdad: ruta con lazy loading, sin librerías pesadas, sin fuentes externas, first paint inmediato.

Van en el mismo repo y la misma app, pero **la landing no debe arrastrar el bundle del dashboard**.

---

# EL PROMPT

Copiá desde acá.

---

Vas a construir el frontend de **Opinara**, un SaaS B2B de reputación. El backend ya está terminado, probado y corriendo; tu trabajo es solamente el frontend.

## El producto

Un negocio conecta su Google Business Profile, importa sus sucursales, genera un QR por campaña y lo pone en el mostrador. El cliente escanea, deja una calificación interna y pasa a Google a dejar su reseña. El negocio ve y responde sus reseñas de Google desde nuestro dashboard.

**Regla de producto innegociable**: el link a Google se le muestra a **todos** los clientes, sin importar la calificación que hayan dejado. Filtrarlo por rating es *review gating*, viola la política de contenido de Google y puede hacer que le restrinjan el perfil al negocio. No agregues esa lógica ni siquiera como opción configurable.

## Stack

- Vite + React + TypeScript en **strict mode**, sin `any` (regla de ESLint en `error`).
- React Router 7, TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui.
- Vitest + Testing Library + MSW para tests; Playwright para dos flujos e2e.
- Mobile-first en la landing pública; escritorio en el dashboard.

## Cómo levantar el backend para desarrollar

```bash
cd ../opinara-backend
yarn db:up      # MongoDB en Docker
yarn seed       # datos ficticios
yarn start:dev  # API en http://localhost:3000/api
```

Usuarios sembrados, todos con contraseña `claveSuperSegura1`:

| Email | Rol |
|---|---|
| `dueno@opinara.test` | OWNER de Café de la Esquina (2 sucursales, 20 reseñas, 2 campañas) |
| `gerente@opinara.test` | ADMIN del mismo negocio |
| `empleada@opinara.test` | MEMBER del mismo negocio |
| `peluqueria@opinara.test` | OWNER de otro negocio, para probar que no se filtra nada entre tenants |

Landing pública sembrada: `GET /api/public/r/cafe-de-la-esquina/mostrador`.

## Contrato de la API

Base: `http://localhost:3000/api`. Todo JSON. Los endpoints privados requieren `Authorization: Bearer <accessToken>`.

### Autenticación

```
POST /auth/register   { email, password (min 8), name }
POST /auth/login      { email, password }
POST /auth/refresh    { refreshToken }
GET  /auth/me
```

`register` y `login` devuelven:

```jsonc
{
  "user": { "urn": "urn:user:…", "email": "…", "name": "…", "status": "ACTIVE", "createdAt": "…" },
  "accessToken": "…",     // vida: expiresIn segundos (86400 por defecto)
  "refreshToken": "…",    // 30 días
  "expiresIn": 86400
}
```

El access token y el refresh token son **distintos y no intercambiables**: usar uno donde va el otro da 401.

### Negocios

```
POST /businesses                  { name, slug?, timezone? }
GET  /businesses                  -> array
GET  /businesses/:businessUrn
```

Cada negocio viene con el **rol del usuario que pregunta**:

```jsonc
{ "urn": "urn:business:…", "name": "Café de la Esquina", "slug": "cafe-de-la-esquina",
  "status": "ACTIVE", "timezone": "America/Argentina/Buenos_Aires", "createdAt": "…", "role": "OWNER" }
```

### Conexión con Google

```
POST   /businesses/:businessUrn/google/connect            (OWNER)  -> { authorizationUrl, expiresAt }
GET    /businesses/:businessUrn/google/connection         -> { urn, status, scopes, connectedAt?, lastSyncAt?, connectedByUserUrn }
DELETE /businesses/:businessUrn/google/connection         (OWNER)  -> 204
GET    /businesses/:businessUrn/google/accounts           -> [{ name, displayName, type?, verificationState? }]
GET    /businesses/:businessUrn/google/locations?accountName=accounts/{id}
POST   /businesses/:businessUrn/google/locations/import   (OWNER, ADMIN)  { accountName, locationNames: [] }
POST   /businesses/:businessUrn/google/sync               (OWNER, ADMIN)
```

El flujo de conexión: pedís `connect`, **redirigís el browser a `authorizationUrl`**, el usuario consiente en Google y Google vuelve al backend; el backend redirige a `GOOGLE_OAUTH_SUCCESS_URL`. Configurá esa variable apuntando a una ruta tuya (por ejemplo `/settings/google/conectado`) y desde ahí volvés a consultar el estado de la conexión.

`google/locations` devuelve las sucursales de Google con `imported: boolean`, para que la pantalla de importación marque cuáles ya están.

`sync` devuelve `{ locations, succeeded, failed, results: [...], failures: [{ locationUrn, errorCode }] }`. **Puede venir `failed > 0` con status 200**: algunas sucursales sincronizaron y otras no. Mostrá las dos cosas.

### Sucursales y reseñas

```
GET    /businesses/:businessUrn/locations
GET    /businesses/:businessUrn/locations/:locationUrn
GET    /businesses/:businessUrn/locations/:locationUrn/reviews?page=&limit=&rating=&hasReply=
GET    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn
PUT    /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply   { comment }
DELETE /businesses/:businessUrn/locations/:locationUrn/reviews/:reviewUrn/reply   -> 204
```

Sucursal:

```jsonc
{ "urn": "urn:location:…", "title": "Café de la Esquina — Centro", "storeCode": "CENTRO",
  "address": "Av. Corrientes 1234, CABA", "placeId": "…", "mapsUri": "…",
  "googleReviewUrl": "https://search.google.com/local/writereview?placeid=…",
  "hasVoiceOfMerchant": true, "isActive": true, "lastReviewSyncAt": "…", "createdAt": "…" }
```

Reseña:

```jsonc
{ "urn": "urn:review:…", "locationUrn": "urn:location:…", "rating": 4,
  "comment": "Muy rico todo…",
  "reviewer": { "displayName": "Ana Pérez", "profilePhotoUrl": "…", "isAnonymous": false },
  "createdAt": "…", "updatedAt": "…",          // fechas de Google, no nuestras
  "reply": { "comment": "Gracias!", "updatedAt": "…" },   // ausente si no fue respondida
  "syncedAt": "…" }
```

Detalles que afectan la UI:

- **Responder es `PUT`, y crea o edita indistintamente** (así funciona `updateReply` de Google). Una sola pantalla sirve para los dos casos.
- `reviewer.isAnonymous: true` viene **sin nombre ni foto**. Mostrá "Anónimo" y un avatar por defecto; no asumas que `displayName` existe.
- `comment` puede faltar: hay reseñas que son solo estrellas.
- `rating` puede ser `0` si Google no informó calificación.
- Respuestas paginadas: `{ items, page, limit, total }`. `page` arranca en 0 y `limit` tiene tope 100.

### Campañas, QR y feedback

```
POST /businesses/:businessUrn/campaigns                  (OWNER, ADMIN)  { name, locationUrn, slug? }
GET  /businesses/:businessUrn/campaigns
GET  /businesses/:businessUrn/campaigns/:campaignUrn
POST /businesses/:businessUrn/campaigns/:campaignUrn/qr  (OWNER, ADMIN)  -> { targetUrl, pngDataUrl }
GET  /businesses/:businessUrn/feedback?page=&limit=&rating=&locationUrn=&campaignUrn=
```

Campaña:

```jsonc
{ "urn": "urn:campaign:…", "name": "Mostrador", "slug": "mostrador", "locationUrn": "urn:location:…",
  "status": "ACTIVE", "stats": { "scans": 184, "feedbacks": 62, "googleClicks": 41 },
  "targetUrl": "https://app.opinara.test/r/cafe-de-la-esquina/mostrador", "createdAt": "…" }
```

`pngDataUrl` es un `data:image/png;base64,…` listo para `<img>` y para descargar. `targetUrl` es lo que el QR codifica, y apunta **a tu frontend**.

Una sucursal sin `googleReviewUrl` no puede usarse en una campaña: el backend responde `LOCATION_NOT_REVIEWABLE`. Deshabilitá esas sucursales en el selector y explicá por qué.

### Superficie pública (sin token)

```
GET  /public/r/:businessSlug/:campaignSlug              -> landing, y cuenta el escaneo
POST /public/r/:businessSlug/:campaignSlug/feedback     { rating: 1..5, comment? } -> { googleReviewUrl }
POST /public/r/:businessSlug/:campaignSlug/google-click -> 204, métrica
```

La landing devuelve **solo esto**, a propósito:

```jsonc
{ "business": { "name": "Café de la Esquina" },
  "location": { "title": "Café de la Esquina — Centro" },
  "campaign": { "name": "Mostrador", "slug": "mostrador" },
  "googleReviewUrl": "https://search.google.com/local/writereview?placeid=…" }
```

No hay identificadores internos y no los va a haber. Si el negocio no existe, la campaña está pausada o la sucursal perdió su link, la respuesta es **404 en todos los casos, con el mismo mensaje**: no intentes distinguirlos en la UI.

### Errores

Todos los errores tienen la misma forma, con un código estable:

```jsonc
{ "statusCode": 404, "message": "Business not found", "errorCode": "BUSINESS_NOT_FOUND",
  "timestamp": "…", "path": "…" }
```

**Mostrá mensajes en base a `errorCode`, nunca parseando `message`** (que está en inglés y puede cambiar). Los que vas a ver seguido:

| errorCode | Qué mostrar |
|---|---|
| `WRONG_CREDENTIALS` | Email o contraseña incorrectos |
| `EMAIL_ALREADY_EXISTS` | Ese email ya está registrado |
| `USER_INACTIVE` | Cuenta desactivada |
| `BUSINESS_SLUG_ALREADY_EXISTS` / `CAMPAIGN_SLUG_ALREADY_EXISTS` | Ese identificador ya está en uso |
| `SLUG_NOT_DERIVABLE` | Pedí un slug explícito (pasa con nombres de solo emoji) |
| `BUSINESS_SUSPENDED` | Negocio suspendido |
| `GOOGLE_CONNECTION_NOT_FOUND` | Todavía no conectó Google → llevalo al onboarding |
| `GOOGLE_CONNECTION_REVOKED` | **Hay que reconectar**: mostralo de forma prominente y persistente |
| `GOOGLE_RATE_LIMITED` / `GOOGLE_UNAVAILABLE` | Google no responde, reintentá en un rato |
| `LOCATION_NOT_REVIEWABLE` | Esa sucursal no tiene link de reseñas en Google |
| `TOO_MANY_REQUESTS` | Demasiados intentos, esperá un minuto |

### Autenticación: cómo manejarla

Escribí **un solo cliente HTTP** que centralice:

1. Adjuntar el access token.
2. Ante `401`, intentar `POST /auth/refresh` **una vez**, con *single-flight* (si hay diez requests en vuelo, un solo refresh, no diez), y reintentar el original.
3. Si el refresh falla, limpiar la sesión y mandar al login.

**Punto que quiero que consideres, no que resuelvas en silencio**: el backend devuelve los tokens en el body, así que el refresh token queda en algún lugar legible por JS (`localStorage`), lo que lo expone a XSS. Es un tradeoff conocido y aceptado para esta etapa. Guardá el **access token en memoria** y el refresh en `localStorage`. Si te parece que conviene cambiarlo por cookies `httpOnly`, decilo: es un cambio de backend, y prefiero discutirlo antes que asumirlo.

## Lo que la API todavía NO tiene

No inventes endpoints. Si una pantalla los necesita, **avisá y lo agregamos al backend**:

- invitar o administrar miembros de un negocio (el modelo de roles existe, el endpoint no);
- editar o pausar una campaña;
- activar/desactivar una sucursal;
- editar los datos del negocio;
- recuperar contraseña y verificación de email;
- logout con revocación real del refresh token;
- paginación en negocios, sucursales y campañas (esos listados devuelven arrays completos).

## Pantallas, por fases

Trabajá **de a una fase**, y al terminar cada una pará, mostrame qué hiciste y esperá mi OK. Al cierre de cada fase: lint, tests y build en verde.

1. **Scaffold**: Vite + TS strict, Tailwind, router, cliente HTTP con refresh, layout base, MSW configurado.
2. **Auth**: registro, login, sesión persistida, rutas protegidas, logout.
3. **Onboarding**: crear negocio, y si no tiene Google conectado guiarlo hasta hacerlo (connect → volver del callback → elegir cuenta → importar sucursales).
4. **Reseñas**: listado por sucursal con filtros de rating y respondidas, detalle, responder y borrar respuesta, estados vacíos, y un botón de sincronizar que muestre el resultado parcial.
5. **Campañas y QR**: crear campaña, ver contadores, generar el QR y **poder descargarlo e imprimirlo** (es el entregable físico del producto).
6. **Feedback**: listado con filtros, y la relación entre feedback interno y reseñas de Google.
7. **Landing pública** `/r/:businessSlug/:campaignSlug`: mobile-first, selector de estrellas grande y con buen target táctil, comentario opcional, y **el CTA a Google visible para todos**. Al enviar, llamá a `google-click` cuando el cliente siga el link. Ruta lazy, bundle mínimo, `noindex`.

## Calidad

- TypeScript strict, cero `any`. Tipá las respuestas de la API y validalas con Zod en el borde.
- Tests de lo que importa: el cliente HTTP con su refresh, los guards de rutas, el formulario público y el flujo de responder una reseña. Con MSW, sin tocar la red.
- Accesibilidad real en la landing: es un formulario que va a usar gente mayor con una mano ocupada. Targets grandes, contraste alto, funciona sin JS de terceros.
- Nada de PII del cliente en la landing: no pidas email ni teléfono. El backend no los guarda y no queremos empezar a hacerlo.
- Español rioplatense en la UI. Mantené los textos en un módulo aparte por si después hay que traducir.

## Cómo quiero que trabajes

- Antes de escribir código, decime tu plan de la fase y qué decisiones tomaste.
- Si algo del contrato de la API no cierra con lo que necesita la pantalla, decímelo en vez de inventar un workaround.
- Probá a mano contra el backend sembrado, no solo con tests: levantá la app y recorré el flujo.
- Explicá brevemente las decisiones técnicas que no sean obvias, en el código y al reportar.
