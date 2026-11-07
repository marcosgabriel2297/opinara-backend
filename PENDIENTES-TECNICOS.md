# Pendientes técnicos

Arreglos que salieron de las pruebas y quedaron para después. Para funcionalidades nuevas, ver
[`FUTURAS-FUNCIONALIDADES.md`](FUTURAS-FUNCIONALIDADES.md); para el rollout, [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md).

## La API sin aprobar se informa como "Google está limitando los pedidos"

*Detectado el 2026-11-01: conexión OK, y `GET /businesses/:urn/google/accounts` respondió
`503 GOOGLE_RATE_LIMITED` a los pocos segundos.*

**Qué pasa.** Mientras Google no apruebe el Basic API Access, la cuota del proyecto es **0 QPM** y
Google responde **429 `RESOURCE_EXHAUSTED`** (`Quota exceeded … value 0`), no 403. `throwAsDomainError`
(`src/shared/integrations/google/errors/google-api.error.ts`) traduce todo 429 a `GOOGLE_RATE_LIMITED`,
y el front muestra "Reintentá en un rato". Para el dueño parece algo pasajero, y no lo es: no se
arregla hasta que aprueben. Además el 429 se reintenta con backoff, así que el error tarda varios
segundos en aparecer.

**Arreglo propuesto.**
- Distinguir la cuota en cero de un 429 real: mirar el cuerpo del error de Google (`error.status` =
  `RESOURCE_EXHAUSTED` y `error.details[].metadata.quota_limit_value` = `"0"`, o el texto `value 0`
  en `message`) y mapearlo a un código nuevo, por ejemplo `GOOGLE_API_ACCESS_NOT_APPROVED`. Hoy
  `GoogleApiError` guarda solo `reason`: habría que extraer ese dato en `google-http.service.ts` al
  normalizar, sin guardar el cuerpo crudo.
- Ese caso **no se reintenta** (`isRetryable` = false): no se va a resolver en segundos.
- Front: mensaje propio, del estilo *"La integración con Google todavía no está habilitada. Ya está
  conectada tu cuenta; las sucursales van a aparecer cuando se habilite."*, sin botón "Reintentar".
- Test con un doble que devuelva el 429 con `quota_limit_value: "0"`.

## El callback de Google responde JSON en vez de volver al frontend

*Detectado el 2026-11-01, al conectar Google por primera vez en local.*

**Qué pasa.** `GET /api/auth/google/callback` solo redirige al frontend en dos casos: cuando la
conexión sale bien (`GOOGLE_OAUTH_SUCCESS_URL`) y cuando el usuario cancela en la pantalla de
Google (`GOOGLE_OAUTH_ERROR_URL?error=GOOGLE_PERMISSION_DENIED`). Cualquier otro error se lanza como
excepción, y el `AllExceptionsFilter` responde un JSON **en el navegador del dueño**, sobre el
dominio de la API. El dueño queda en una pantalla técnica, sin botón para volver ni explicación.

Errores que hoy terminan en JSON:

| Código | Cuándo |
|---|---|
| `GOOGLE_INVALID_OAUTH_STATE` | state vencido (más de `GOOGLE_OAUTH_STATE_TTL_SECONDS`), ya usado, inexistente o code inválido |
| `GOOGLE_MISSING_REFRESH_TOKEN` | la cuenta ya había autorizado antes y Google no mandó refresh token |
| `GOOGLE_OAUTH_EXCHANGE_FAILED` | client ID o secret mal configurados (`invalid_client`) |
| `GOOGLE_UNAVAILABLE` / `GOOGLE_RATE_LIMITED` | Google caído o con 429 durante el intercambio |
| `BAD_REQUEST` | la query no pasa la validación (ver el antecedente, más abajo) |

**Arreglo propuesto.** En `GoogleOAuthController.callback`
(`src/packages/google/controllers/google-oauth.controller.ts`), envolver `completeAuthorization` en
un `try/catch` y, ante una excepción con `errorCode` del enum `Errors`, redirigir con
`this.finish(response, false, errorCode)`. Lo que no sea un error de dominio se loguea y redirige
con un código genérico (por ejemplo `GOOGLE_OAUTH_EXCHANGE_FAILED`), sin filtrar el detalle.

- El caso de validación de la query no pasa por el controller: lo corta el `ValidationPipe` global
  antes. Para cubrirlo, o se aplica al callback un pipe propio sin `forbidNonWhitelisted`, o un
  filtro de excepciones específico para esta ruta que redirija en vez de responder JSON.
- Mantener la respuesta JSON cuando no hay `GOOGLE_OAUTH_*_URL` configuradas: es lo que permite
  probar el flujo con curl.
- **Actualizar los tests** de `src/packages/google/google.spec.ts` (bloque `callback`): hoy esperan
  `400` / `503` con `errorCode` en el body. Con URLs configuradas tendrían que esperar `302` a
  `GOOGLE_OAUTH_ERROR_URL?error=<CODIGO>`.
- **Frontend:** la ruta `/configuracion/google/conectado` tiene que mostrar un mensaje entendible
  por cada código (y un botón para reintentar), no solo para `GOOGLE_PERMISSION_DENIED`.

**Antecedente.** El 2026-11-01 Google empezó a mandar `iss` en la redirección (RFC 9207) y el
`ValidationPipe` lo rechazaba con `property iss should not exist`: el dueño autorizaba y se quedaba
con un 400 en JSON. Se arregló declarando `iss`, `hd`, `error_description` y `error_uri` en
`OAuthCallbackDto`, con tests de regresión. El problema de fondo es el de esta sección: cualquier
otro parámetro nuevo que agregue Google volvería a dejar al dueño en un JSON.
