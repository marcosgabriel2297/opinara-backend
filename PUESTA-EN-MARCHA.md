# Puesta en marcha — piloto con el primer local

> Última actualización: **2026-10-22**.
> Estado del código: ver [`ESTADO.md`](ESTADO.md). Este documento es el **rollout**: el trámite con
> Google, el deploy y el alta del primer negocio real.

## Dónde quedamos

**Esperando dos cosas que no dependen de nosotros**, en este orden de importancia:

1. **Que el dueño confirme la verificación del perfil** (bloqueante nuevo, 2026-10-22). La cuenta
   gerente ya administra el local, pero el panel muestra *"La verificación no se ha completado"*.
   El formulario de 0.5 exige un perfil verificado hace 60+ días y la API no expone reseñas de un
   perfil sin verificar, así que **0.5 no se manda hasta resolver esto**. Ver *Acceso al perfil del local*.
2. **La aprobación del Basic API Access de Google** (formulario todavía sin enviar, ver 0.5). Es lo
   que destraba la cuota: hasta entonces la cuota del proyecto es 0 QPM y cualquier llamada real
   responde `GOOGLE_PERMISSION_DENIED`.

Nada de eso bloquea el resto: el circuito del QR no usa la API de Google y se puede poner en la
calle antes (Etapa 1).

## Lo que ya está hecho

- [x] El local conseguido: sitio web, dueño dispuesto y Place ID de la sucursal a mano. Lo de
      "perfil verificado con más de 60 días" quedó en duda: ver *Acceso al perfil del local*.
- [x] Proyecto de Google Cloud creado: **`opinara`**.
- [x] Habilitadas tres de las cuatro APIs: *My Business Account Management*,
      *My Business Business Information* y *My Business Notifications*.
- [x] Backend con el **alta manual de sucursales** (`POST /businesses/:businessUrn/locations`), que
      es lo que permite operar el QR sin acceso a la API. Detalle en `ESTADO.md`.

## Lo que sigue

### Etapa 0 — Google Cloud (trámite, es lo que tarda)

- [ ] **0.3 Pantalla de consentimiento.** *Google Auth Platform* (la consola vieja de "Pantalla de
      consentimiento de OAuth" redirige ahí) → **Comenzar**, asistente de 4 pasos:
    1. *Información de la app*: nombre `Opinara` (es lo que lee el dueño al autorizar) + mail de asistencia.
    2. *Público*: **Externo** (Interno solo aplica a Workspace y dejaría al local afuera).
    3. *Información de contacto*: nuestro mail.
    4. Aceptar la política de datos y **Crear**.
- [ ] **0.3.b** Ya creada, cargar en las pestañas:
    - *Público → Usuarios de prueba*: el mail del **compañero** (la cuenta que va a ser gerente del
      perfil) y el nuestro como respaldo. Sin esto, al autorizar sale "Acceso bloqueado".
      Estado de publicación: **Prueba/Testing**, no publicar.
    - *Acceso a los datos → Agregar o quitar permisos*: **un solo scope**,
      `https://www.googleapis.com/auth/business.manage`. Si no aparece en la lista, pegarlo en
      "agregar permisos manualmente". Google lo marca como sensible: es lo esperado.
    - *Información de la marca*: **no tocar todavía** (sin logo, sin dominios ni links). Eso recién
      hace falta para publicar la app, Etapa 3; subir un logo antes mete verificación de marca sin necesidad.
- [ ] **0.4 Credenciales OAuth.** *Clientes → Crear cliente → Aplicación web*. URIs de
      redireccionamiento autorizadas, las dos desde ahora:
      ```
      http://localhost:3000/api/auth/google/callback
      https://api.TU-DOMINIO.com/api/auth/google/callback
      ```
      Tienen que coincidir carácter por carácter con `GOOGLE_REDIRECT_URI`. El client ID y el secret
      van a `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] **0.5 Formulario de Basic API Access** — developers.google.com/my-business/content/prereqs,
      opción *Application for Basic API Access*. Pide el **ID del proyecto** de Cloud, el nombre y
      sitio del negocio, y el uso que se le va a dar. Describir lo que la app hace de verdad:
      sincronizar las reseñas del perfil y responderlas desde un panel propio. **No mencionar generar
      reseñas** — no las generamos, y es lo que hace que rechacen solicitudes.
      *Es el camino crítico de todo el proyecto*, pero **no mandarlo hasta que el dueño confirme que
      el perfil está verificado**: con el perfil sin verificar lo más probable es el rechazo.
- [ ] **0.2.b** Cuando llegue la aprobación: habilitar la cuarta API, **Google My Business API**
      (la v4.9, la de las reseñas). **No aparece en la biblioteca hasta que aprueban**: que no figure
      hoy en la búsqueda es normal, no un error de configuración.
      Verificar en *IAM y administración → Cuotas* que pase de 0 a **300 QPM**.

### Acceso al perfil del local (en curso, fuera de Cloud)

- [x] El **dueño** invita: buscar el local en Google con su cuenta (o business.google.com) →
      *Configuración del perfil de empresa* → *Personas y cuentas* → **Agregar** → mail del compañero →
      rol **Gerente** (no Propietario: gerente alcanza para leer y responder reseñas) → *Invitar*.
- [x] El **compañero** acepta desde el mail, **verificando primero que está en la cuenta correcta**
      si tiene varias sesiones abiertas. Comprobación: buscar el local en Google con esa cuenta tiene
      que mostrar el panel de administración, no la ficha pública.
- [x] Comprobado el 2026-10-22: con la cuenta gerente, buscar el local muestra el panel de
      administración (*"Solo los administradores de este perfil pueden ver esto"*).
- [ ] **Verificación del perfil.** El panel de la cuenta gerente muestra *"La verificación no se ha
      completado. Es posible que los clientes no puedan ver algunos de tus cambios"*. No es un perfil
      duplicado: llegamos por invitación del dueño. Falta que **el dueño**, desde su cuenta en
      business.google.com, diga qué estado ve:
    - *Verificado* → el aviso es por cambios pendientes de revisión; se puede mandar 0.5.
    - *Se requiere volver a verificar* / *Verificación pendiente* → que verifique él (hoy suele ser un
      video del cartel, el interior y algo que pruebe que es el dueño). Preguntarle si cambió hace
      poco nombre, dirección, categoría o teléfono: es la causa típica.
    - *No verificado* desde siempre → verificarlo; los 60 días del requisito de 0.5 arrancan ahí.
    - **Mientras tanto, desde la cuenta gerente: no tocar "Verificar" ni editar el perfil.** La
      verificación le corresponde al propietario y editar datos clave puede pedir otra.

**Decisión tomada:** conectamos con una cuenta **gerente nuestra**, no con la cuenta del dueño. Así el
vencimiento del refresh token (7 días mientras la app esté en Testing) nos pega a nosotros y no a él.
**Es un atajo de piloto**: con varios clientes, cada negocio conecta su propia cuenta desde el
dashboard — el código soporta las dos formas, es el mismo flujo.
**Pendiente de decidir:** usar una cuenta dedicada (`opinara.ops@…`) en vez de la personal del
compañero. Con un local da igual; con cinco, es la diferencia entre un trámite y un problema el día
que esa persona no esté disponible.

### Prueba local del circuito del QR (2026-10-22)

Hecha con backend y frontend en la máquina de desarrollo, expuestos en la red local para escanear
desde el celular, contra una base aparte (`opinara_piloto`) para no mezclar con el seed:

```bash
# backend
DATABASE_NAME=opinara_piloto PUBLIC_APP_BASE_URL=http://<IP-LAN>:5173 yarn start:dev
# frontend
VITE_API_BASE_URL=http://<IP-LAN>:3000/api yarn dev --host 0.0.0.0
```

Se dio de alta el negocio real (*Mi piace gelato*) desde la UI, la sucursal manual por API con el
Place ID `ChIJqdYnXOuYvJURvSXPqYwrpkQ` y la campaña *Mostrador* desde la UI. **Funcionó de punta a
punta**: escaneo, opinión interna y salto al formulario de reseña del local correcto.

- [x] ~~Repetirla con 1 o 2 estrellas~~: ya no aplica, el QR no tiene formulario propio (2026-10-25).
- [ ] La reseña de Google que se dejó durante la prueba hay que **borrarla**: la dejó alguien
      vinculado al perfil, y Google lo trata como conflicto de intereses.

**Pendientes que salieron de la prueba.** El primero frena la impresión del QR; el resto, no:

1. ✅ *Resuelto el 2026-10-25 con el QR directo a Google (ver `ESTADO.md`): la página del QR hace
   `location.replace`, así que "atrás" desde Google ya no la recarga ni suma otro escaneo. Volver a
   escanear el QR sí cuenta, y está bien: es otro escaneo.* **Los escaneos se cuentan por carga de página, no por visita.** El `GET` público suma un escaneo
   cada vez (`public-campaigns.service.ts`), y al volver de Google el navegador del celular recarga la
   landing: dos visitas reales quedaron como `scans: 4`, y el embudo mostró "50% dejaron opinión"
   cuando fue el 100%. El frontend ya evita el doble conteo dentro de una misma carga (StrictMode,
   refetch, reintentos), no entre recargas. **Queremos el número exacto de escaneos**: hay que
   deduplicar la visita (recordar en el navegador que esa campaña ya se contó y pedir la landing sin
   contar) antes de imprimir el QR de verdad, o el primer número que vea el dueño ya sale inflado.
2. **El banner "Falta conectar Google" dice que sin conexión no se pueden generar campañas.** Con
   sucursales manuales ya no es cierto, y al dueño le hace pensar que algo está roto.
3. **El QR no se ve al volver a entrar a la campaña**: hay que tocar "Generar QR" de nuevo (devuelve el
   mismo, pero no es obvio).
4. **No hay pantalla de alta manual de sucursales**: hoy se carga por API. Junto con eso, mapear
   `LOCATION_NOT_SYNCABLE` en el frontend y no ofrecer "Sincronizar" en las sucursales manuales.

### Etapa 1 — QR en el mostrador (no espera a Google)

- [ ] Dominio con `api.` y `app.`, HTTPS. Mongo Atlas (M0 alcanza). **Una sola instancia** del
      backend: el candado del cron de sincronización es en memoria.
- [ ] Commitear el repo del **frontend**: hoy `master` no tiene ningún commit.
- [ ] `.env.prod` del backend:
      ```
      NODE_ENV=prod
      DATABASE_URI=mongodb+srv://…
      DATABASE_NAME=opinara
      JWT_SECRET_KEY=<nueva>          # las tres, generadas con:
      JWT_REFRESH_SECRET_KEY=<nueva>  # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
      TOKEN_ENCRYPTION_KEY=<nueva>
      CORS_ORIGINS=https://app.tu-dominio.com
      PUBLIC_APP_BASE_URL=https://app.tu-dominio.com
      GOOGLE_CLIENT_ID=… / GOOGLE_CLIENT_SECRET=…
      GOOGLE_REDIRECT_URI=https://api.tu-dominio.com/api/auth/google/callback
      GOOGLE_OAUTH_SUCCESS_URL=https://app.tu-dominio.com/configuracion/google/conectado
      GOOGLE_OAUTH_ERROR_URL=https://app.tu-dominio.com/configuracion/google/conectado   # misma ruta: el backend agrega ?error=CODE
      REVIEW_SYNC_ENABLED=false       # no hay nada que sincronizar hasta la Etapa 2
      ```
      Frontend: `VITE_API_BASE_URL=https://api.tu-dominio.com/api`, `VITE_ENABLE_MSW=false`.
      Verificar el deploy con `GET /api/health` → `{"status":"ok","database":"up"}`.
- [ ] Alta del negocio: crear el admin (`yarn admin:create`), dar de alta al dueño (`POST /api/admin/users`) → crear el business → **alta manual de la
      sucursal** con el Place ID → crear la campaña → generar el QR.
      **Antes de imprimir**: abrir el `googleReviewUrl` que devuelve el alta y confirmar que cae en el
      formulario de reseña del local correcto. Si el Place ID está mal, todo lo demás hereda el error.
- [ ] Probarlo con un celular propio, con datos móviles: el QR tiene que caer directo en el
      formulario de reseña del local (sin dejar la reseña). Confirmar que `stats` del endpoint de la
      campaña quedó en `scans: 1, feedbacks: 0, googleClicks: 1`, y que tocar "atrás" no suma otro.
- [ ] Dejar dicho con el local, antes de arrancar: el QR lleva **directo a Google**, sin filtro (filtrar
      por calificación es *review gating* y Google puede restringirle el perfil); lo que mide el panel
      son escaneos, no reseñas escritas; y **las reseñas todavía no se ven en el panel** hasta la Etapa 2.

### Etapa 2 — Cuando Google aprueba (~30 min, con el compañero disponible)

- [ ] Confirmar cuota en 300 QPM y habilitar la Google My Business API.
- [ ] **El compañero** (la cuenta gerente) conecta desde el dashboard: `POST /google/connect` → autoriza.
- [ ] Importar la sucursal: `GET /google/accounts` → `GET /google/locations?accountName=…` →
      `POST /google/locations/import`. La importación **adopta la sucursal manual por Place ID**:
      conserva su `urn`, así que **el QR ya impreso sigue funcionando**. Verificar que quede **una
      sola** sucursal en el listado y que pase a `source: "GOOGLE"`.
- [ ] Primera sincronización completa: `POST /businesses/:businessUrn/google/sync`.
- [ ] Responder una reseña desde el dashboard y confirmarlo en Google Maps.
- [ ] Activar el cron: `REVIEW_SYNC_ENABLED=true` y reiniciar.

### Etapa 3 — Dejar de ser piloto

- [ ] Publicar la app y pasar la verificación de la pantalla de consentimiento. Mientras siga en
      Testing, **el refresh token se vence cada 7 días** (se ve como `GOOGLE_CONNECTION_REVOKED`).
      Google pide: dominio verificado en Search Console, home page pública que explique la app,
      política de privacidad en el dominio y un video del flujo de OAuth completo. Tarda semanas:
      empezarlo apenas aprueben la API, no cuando haya un segundo cliente esperando.

## Síntomas y qué significan

| Síntoma | Causa |
|---|---|
| La *Google My Business API* no aparece en la biblioteca | normal: se hace visible recién con el Basic API Access aprobado |
| `redirect_uri_mismatch` al conectar | `GOOGLE_REDIRECT_URI` no es idéntico al de la consola |
| "Acceso bloqueado" en la pantalla de Google | la cuenta que autoriza no está en *Usuarios de prueba* |
| `GOOGLE_PERMISSION_DENIED` | todavía sin aprobación (cuota 0), o le sacaron el acceso al perfil a nuestra cuenta |
| `GOOGLE_MISSING_REFRESH_TOKEN` | esa cuenta ya había autorizado antes: revocar en su cuenta de Google y reconectar |
| `GOOGLE_CONNECTION_REVOKED` a los 7 días | la app sigue en Testing → Etapa 3 |
| `LOCATION_NOT_SYNCABLE` | la sucursal es manual y todavía no se importó de Google |
| `GOOGLE_RATE_LIMITED` | 300 QPM por proyecto, compartidos entre todos los negocios |
