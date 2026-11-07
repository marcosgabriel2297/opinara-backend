# Para retomar — sesión del 2026-11-01

> Resumen de lo que se hizo y se decidió el 2026-11-01, para seguir mañana sin perder el hilo.
> El detalle vive en los documentos de siempre: [`PUESTA-EN-MARCHA.md`](PUESTA-EN-MARCHA.md) (trámite
> con Google y deploy), [`FUTURAS-FUNCIONALIDADES.md`](FUTURAS-FUNCIONALIDADES.md) (puntos **0** y
> **1.1**) y [`PENDIENTES-TECNICOS.md`](PENDIENTES-TECNICOS.md). Cuando esto quede viejo, borrar este archivo.

## Dónde estamos, en una línea

La conexión con Google **funciona de punta a punta en local**. Lo único que bloquea ver y responder
reseñas desde Opinara es que **Google apruebe el Basic API Access**, y para pedirlo falta **un perfil de
negocio que cumpla los requisitos**.

## Lo que quedó hecho hoy

**Google Cloud (proyecto `opinara`)**
- [x] Pantalla de consentimiento creada: Externo, estado **Testing**, scope `business.manage`,
      usuarios de prueba cargados.
- [x] Cliente OAuth (Aplicación web) con la URI `http://localhost:3000/api/auth/google/callback`.
      Client ID y secret en `.env.dev`. **Falta** sumar la URI de producción cuando haya dominio.
- [x] Probado: conectar Google desde el dashboard guarda la conexión. Después, listar cuentas da
      `GOOGLE_RATE_LIMITED`: es lo **esperado** con la API sin aprobar (cuota 0 → Google responde 429).

**Backend** (sin commitear)
- Bug arreglado: Google manda `iss` en el callback de OAuth y el `ValidationPipe` lo rechazaba con
  `property iss should not exist`. Se declararon `iss`, `hd`, `error_description` y `error_uri` en
  `OAuthCallbackDto`, con dos tests de regresión en `google.spec.ts`.
- Docs actualizados: verificación del perfil de Mi piace gelato confirmada; corregido que Mi piace
  gelato **no** tiene sitio web; tabla de síntomas corregida (cuota 0 = `GOOGLE_RATE_LIMITED`).
- Nuevos: `PENDIENTES-TECNICOS.md` y este archivo.

**Frontend** (`opinara-frontend`, sin commitear)
- Botón **"Responder en Google"** en la pantalla de Reseñas: abre
  `https://search.google.com/local/reviews?placeid=<PLACE_ID>` de la sucursal elegida. Es la acción
  principal del estado vacío y queda al costado cuando hay reseñas.
- **Se sacó el botón "Sincronizar con Google"** (componente, tests, textos, API y mock). En su lugar,
  un aviso: *"Se actualizan solas con Google, cada 15 minutos. Última actualización: …"*. No se
  muestra en las sucursales cargadas a mano.
- 341 tests en verde, typecheck y lint limpios.

## Decisiones tomadas

1. **Responder sin la API aprobada:** el dueño responde desde Google con el botón "Responder en
   Google". Más adelante: ocultar el botón "Responder" de Opinara y sumar "Sugerir con IA → Copiar →
   Responder en Google" (punto 0 de `FUTURAS-FUNCIONALIDADES.md`).
2. **Sin botón de sincronizar:** las reseñas se actualizan solas con el cron. El día que aprueben,
   bajar el cron a cada 5 minutos; más adelante, notificaciones de Google por Pub/Sub para tenerlas
   en segundos (punto 1.1).
3. **No hay atajo pago** para la aprobación ni para la verificación de la app. Lo único pago y
   disponible ya es la Places API: calificación + hasta 5 reseñas, sin responder (costos en el punto 0).

## Lo que sigue, en orden

### 1. Conseguir el perfil para el formulario (lo urgente)
Google pide que quien manda el formulario **administre** un perfil que:
- esté **verificado y activo hace 60+ días**: se ve desde afuera si hay *"Respuesta del propietario"*
  con fecha de hace más de 2 meses, y también recientes (sigue verificado);
- tenga **sitio web propio** en la ficha (Instagram o Facebook no alcanzan);
- esté completo (horarios, categoría, teléfono, fotos).

Candidatos hasta ahora:

| Local | Verificado 60+ días | Sitio web | Estado |
|---|---|---|---|
| Mi piace gelato | ❓ confirmado verificado, falta saber desde cuándo | ❌ | no sirve sin web |
| Acción (ropa infantil, Tortuguitas) | ✅ responde reseñas hace un año | ❌ solo Instagram | sirve si se le hace una web |
| Otro local con web propia | — | — | **buscando**: es el camino más rápido |

Con el local elegido:
1. El dueño invita a nuestra cuenta como **Gerente** (*Configuración del perfil → Personas y acceso →
   Agregar*). Aceptar con la cuenta que va a mandar el formulario.
2. Copiar el **número de proyecto** de Cloud (*Panel → Información del proyecto*, solo dígitos).
3. Logueado con la cuenta gerente: https://support.google.com/business/contact/api_default →
   **Application for Basic API Access**. Datos del local (nombre, **su** sitio web, link de la ficha
   o Place ID), el número de proyecto y este texto de uso:
   > Opinara is a reputation-management tool for small local businesses. The business owner (or a
   > manager they invite) signs in and authorizes access to their own Business Profile through OAuth
   > with the `business.manage` scope. We use the API to: (1) list the accounts and locations the user
   > manages so they can choose which ones to link; (2) sync the reviews of those locations; and (3)
   > let the owner reply to reviews, and edit or delete those replies, from our dashboard. We do not
   > create reviews, filter or gate reviews, or offer incentives for reviews. Customers leave their
   > reviews directly on Google through the location's standard review link.
4. Anotar la fecha de envío en `PUESTA-EN-MARCHA.md`. Para saber si ya aprobaron: *IAM y
   administración → Cuotas*, filtrar *My Business*: **0** = pendiente, **300** = aprobado.

### 2. Mientras Google revisa
- **Probar el link de "Responder en Google"** con la cuenta gerente de Mi piace gelato:
  https://search.google.com/local/reviews?placeid=ChIJqdYnXOuYvJURvSXPqYwrpkQ → tiene que mostrar
  "Responder" en las reseñas. Si no, cambiarlo por el `mapsUri` de la sucursal.
- **Commitear** lo de hoy en los dos repos (todavía no se hizo).
- **Deploy** (Etapa 1 de `PUESTA-EN-MARCHA.md`): dominio, Mongo Atlas, una sola instancia, `.env.prod`.
  Falta elegir hosting (la política de privacidad ya menciona Render y Mongo Atlas).
- **Verificación de la app de OAuth** (Etapa 3): dominio verificado en Search Console, home pública,
  política de privacidad en el dominio y video del flujo. Tarda semanas: arrancarla en paralelo.
  Hasta entonces solo conectan los usuarios de prueba (máximo 100) y la conexión se corta cada 7 días.

### 3. Cuando aprueben (Etapa 2 de `PUESTA-EN-MARCHA.md`)
Habilitar la *Google My Business API* → conectar → importar sucursales → primera sincronización →
`REVIEW_SYNC_ENABLED=true` y `REVIEW_SYNC_CRON=0 */5 * * * *`.

## Pendientes técnicos anotados (no urgentes)
En `PENDIENTES-TECNICOS.md`:
- El callback de OAuth responde **JSON** ante errores en vez de volver al frontend con `?error=`.
- La API sin aprobar se muestra como "Google está limitando los pedidos. Reintentá en un rato":
  confunde; debería tener un mensaje propio y no reintentarse.

## Cambios sin commitear

```
opinara-backend   M FUTURAS-FUNCIONALIDADES.md, PUESTA-EN-MARCHA.md, package.json (seed:demo, de antes)
                  M src/packages/google/dtos/oauth-callback.dto.ts, src/packages/google/google.spec.ts
                  ?? PENDIENTES-TECNICOS.md, RETOMAR.md, scripts/seed-demo.ts (de antes)
opinara-frontend  M reviews-route.tsx, reviews.test.tsx, queries.ts, api/reviews-api.ts, api/schemas.ts,
                    i18n/es.ts, mocks/state.ts, mocks/handlers/{google,reviews}.ts
                  ?? components/reply-on-google-link.tsx, components/reviews-freshness.tsx
                  D  components/sync-button.tsx
```
