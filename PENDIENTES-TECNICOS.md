# Pendientes técnicos

Arreglos que salieron de las pruebas y quedaron para después. Para funcionalidades nuevas, ver
[`FUTURAS-FUNCIONALIDADES.md`](FUTURAS-FUNCIONALIDADES.md); para el rollout, [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md).

## Resueltos

- **La API sin aprobar se informaba como "Google está limitando los pedidos"** (detectado el
  2026-11-01, resuelto el 2026-11-12). `GoogleHttpService` detecta la cuota en cero
  (`details[].metadata.quota_limit_value = "0"`, o `value 0` en el mensaje) y el 429 se traduce a
  `GOOGLE_API_ACCESS_NOT_APPROVED`, sin reintentos. El frontend lo muestra con un mensaje propio.
- **El callback de Google respondía JSON en vez de volver al frontend** (detectado el 2026-11-01,
  resuelto el 2026-11-12). `GoogleOAuthCallbackFilter` atrapa todo error del callback, incluida la
  validación de la query y el rate limit, y redirige a `GOOGLE_OAUTH_ERROR_URL?error=<CODIGO>` (solo
  códigos `GOOGLE_*`; una query inválida va como `GOOGLE_INVALID_OAUTH_STATE` y lo inesperado como
  `GOOGLE_OAUTH_EXCHANGE_FAILED`). Sin esa URL configurada se mantiene el JSON, para probar con curl.
