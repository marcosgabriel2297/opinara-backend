# Funcionalidades futuras

Lo que queda propuesto para Opinara, ordenado por impacto. Nada de esto está empezado. Cada punto dice qué resuelve, qué necesita del backend y cuánto esfuerzo lleva más o menos (bajo, medio o alto).

> **Primero, el punto 0:** es lo que permite vender la gestión de reseñas antes de que Google apruebe la API.
>
> **Condición para casi todo:** lo que depende de datos reales de Google (avisos, temas, tiempo de respuesta) recién anda en producción cuando Google apruebe el acceso a la API de Business Profile. Mientras tanto se puede construir y probar contra los mocks del frontend y los fakes de los tests.

Ya hecho (octubre 2026), fuera de esta lista: límite del QR por IP y campaña con página de espera, sesiones revocables (cerrar sesión de verdad y en todos los dispositivos), recuperar contraseña e invitar miembros con roles.

---

## Producto

### 0. Responder sin la API aprobada: "Copiar respuesta" en vez de "Responder" — esfuerzo medio

*Decidido el 2026-11-01.* **Por qué:** publicar una respuesta exige que Google apruebe el Basic API
Access del proyecto (ver `PUESTA-EN-MARCHA.md`, paso 0.5), y eso tarda semanas o depende de
conseguir un perfil que cumpla los requisitos. No hay atajo legítimo: automatizar el navegador o
usar bots pone en riesgo el perfil **del cliente**. Esto permite vender la gestión de reseñas desde
ya: Opinara redacta, el dueño publica desde Google.

**Cómo se ve:**
- Se **oculta el botón "Responder"** (el que publica con `PUT …/reviews/:reviewUrn/reply`).
- En su lugar: **"Sugerir respuesta con IA"** → el dueño la revisa/edita → **"Copiar"** (al
  portapapeles) → **"Responder en Google"**, que abre el perfil del negocio en Google para pegarla
  ahí. Un texto corto lo explica: *"La respuesta se publica desde tu cuenta de Google."*
- Cuando la API esté aprobada se vuelve al botón "Responder" que publica directo, y "Copiar" queda
  como opción secundaria.

**Interruptor:** un flag por negocio, o derivado de la conexión: si no hay conexión de Google activa
o la API responde cuota 0, el front muestra el modo "Copiar". Exponerlo en la respuesta de las
reseñas (o de `GET /google/connection`) como `canPublishReplies: boolean`, para que el front no
tenga que deducirlo de un error.

**Lo que ya existe y se reutiliza:** `POST …/reviews/:reviewUrn/reply-suggestion` y
`reply-suggester.ts`, con el proveedor de IA intercambiable (`LLM_PROVIDER`: groq o anthropic).

**Lo que falta resolver — de dónde salen las reseñas sin la API.** Hoy solo entran a la base por la
sincronización, que usa la API. Dos opciones, no excluyentes:
1. **Places API** (oficial, paga por uso, se habilita al instante): trae la calificación, el total
   y **como máximo 5 reseñas** ("las más relevantes") por sucursal, con el `placeId` que ya tienen
   las sucursales manuales. No trae todas ni el id de la API de Business Profile: guardarlas con
   `source: PLACES` y deduplicar cuando llegue la sincronización real (por autor + fecha + texto).
   - **Ojo con las condiciones de Google Maps Platform:** su contenido (salvo el Place ID) no se
     puede guardar de forma permanente. Mejor un endpoint que consulte a Google con caché corta
     (por ejemplo `GET …/locations/:locationUrn/google-snapshot`, caché en memoria de ~24 h) que
     persistirlas. Mostrar la atribución que pide Google (autor con su link y foto).
   - **Costos** (precios de Google consultados el 2026-11-01): pedir `reviews` es la SKU *Place
     Details Enterprise + Atmosphere*. **1.000 consultas gratis por mes**, después **USD 25 cada
     1.000** (USD 0,025 por consulta), con descuentos por volumen. Una consulta trae calificación,
     total y las 5 reseñas de una sucursal. Con una consulta por día por sucursal: ~30 por mes, o
     sea ~33 sucursales gratis y después ~USD 0,75 por sucursal por mes.
   - **Para que no haya sorpresas:** tope de consultas por día en la cuota de *Places API (New)*,
     alerta de presupuesto en Facturación, y clave de API restringida a esa API y a la IP del
     servidor. Hace falta una cuenta de facturación con tarjeta aunque no se gaste.
2. **Pegar la reseña**: el dueño pega el texto (y la calificación) de una reseña que vio en Google,
   y Opinara sugiere la respuesta. Un endpoint de sugerencia que no requiera `reviewUrn`. Cubre
   cualquier reseña, sin costo de Places.

**Cuidado:**
- El texto de la reseña es dato, no instrucciones (mismo criterio que hoy en `reply-suggester.ts`).
- **Link de "Responder en Google"** (2026-11-01): no existe un link oficial a *responder una
  reseña puntual*; se lleva al dueño a las reseñas de su local y ahí, logueado con una cuenta que
  administre el perfil, toca "Responder". Se arma con el `placeId` que ya tiene cada `Location`
  (no hace falta la API):
  `https://search.google.com/local/reviews?placeid=<PLACE_ID>`, mismo esquema que el
  `newReviewUri` de las manuales. Alternativa: el `mapsUri` de la sucursal. **Probar los dos con
  una cuenta gerente antes de elegir** (Google cambia estos links). Si se usa Places API, cada
  reseña trae su propio `googleMapsUri`, que sí apunta a esa reseña.
- Avisarle al cliente que en este modo el panel no muestra **todas** las reseñas.

### 1. Avisos de reseñas nuevas y resumen semanal — esfuerzo medio

**Por qué:** el dueño no abre un dashboard todos los días. Que Opinara le avise es lo que más cambia el uso.

- Un mail cuando entra una reseña, con prioridad a las de 1 a 3 estrellas y un botón que abre esa reseña en el modo foco. Más adelante, WhatsApp.
- Los lunes, "Tu semana": reseñas nuevas, el promedio contra la semana anterior, escaneos y cuántas esperan respuesta.

**Backend:**
- La sincronización (`review-sync.service.ts`) ya sabe qué reseñas son nuevas: emitir un evento interno y que un servicio de avisos lo consuma.
- Preferencias por miembro (`notification_preferences`: qué avisos, a qué email) y un cron semanal en la zona horaria del negocio.
- Usa el `MailerModule` que ya existe. Para producción hace falta dominio propio con SPF y DKIM, o los mails caen en spam.
- Agrupar: diez reseñas en una hora tienen que ser un solo mail, no diez.

### 1.1 Que las reseñas nuevas lleguen enseguida — esfuerzo bajo (paso A) y medio (paso B)

*Anotado el 2026-11-01.* **Por qué:** hoy una reseña nueva recién aparece en Opinara en el próximo
ciclo del cron (`REVIEW_SYNC_CRON`, cada 15 minutos), y solo con la API de Google aprobada. Desde
que se sacó el botón "Sincronizar" del frontend (2026-11-01), el dueño no tiene cómo forzarla:
depende del cron. Sin la API aprobada no aparece nunca: solo se ve en Google.

**Paso A — bajar el intervalo del cron (el día que aprueben la API).** No hay que programar nada:
`REVIEW_SYNC_CRON=0 */5 * * * *` (cada 5 minutos).
- La cuota alcanza de sobra: 300 pedidos por minuto para todo el proyecto, y una sucursal sin
  reseñas nuevas gasta ~1 pedido por ciclo. Cada 5 minutos entran cientos de sucursales.
- No bajar de 2-3 minutos: el candado del cron es en memoria y una corrida larga no debe pisarse
  con la siguiente.
- Junto con esto, `REVIEW_SYNC_ENABLED=true` en producción (Etapa 2 de `PUESTA-EN-MARCHA.md`): sin
  eso el aviso "Se actualizan solas con Google" del frontend promete algo que no pasa.

**Paso B — notificaciones de Google por Pub/Sub (casi tiempo real).** Es la solución de fondo; ya
estaba prevista como post-MVP en `ESTADO.md`.
- Google avisa a Opinara cuando entra una reseña (evento `NEW_REVIEW`, también `UPDATED_REVIEW`),
  y Opinara sincroniza **solo esa sucursal** en el momento: la reseña aparece en segundos.
- Necesita la API aprobada. La *My Business Notifications API* ya está habilitada en el proyecto.
- Piezas:
  - Un topic de Pub/Sub en el proyecto `opinara`, con permiso de publicación para la cuenta de
    servicio de Google Business Profile (`mybusiness-api-pubsub@system.gserviceaccount.com`).
  - Una suscripción *push* al endpoint público nuevo, por ejemplo `POST /api/google/notifications`,
    que **valida el JWT OIDC** del push (que lo manda Google y para nuestra audiencia) y dispara
    `syncLocation` de la sucursal afectada. Responder 2xx rápido y sincronizar en segundo plano.
  - Al conectar una cuenta de Google, registrar `notificationSetting` de esa cuenta apuntando al topic;
    al desconectar, borrarlo.
- El cron queda como respaldo, con un intervalo más largo, por si se pierde algún aviso.
- **Limitación de Google:** un solo destino de notificaciones por cuenta de Google. Si el negocio ya
  usa otra herramienta que las configuró, se pisan: avisarle antes de activarlo y mostrar en el
  panel si la configuración no es la nuestra.

**Recomendación:** el paso A el día que aprueben; el paso B junto con los avisos al dueño (punto 1),
que es donde la inmediatez importa de verdad: el dueño no mira el panel, pero sí el mail o el WhatsApp.

### 2. Pedir reseñas por WhatsApp, además del QR — esfuerzo bajo

**Por qué:** una peluquería o un consultorio atiende con turno. Un link enviado después de la visita rinde más que un cartel.

- Cada campaña tiene también un link corto y un mensaje listo para copiar o compartir por WhatsApp.
- Pasa por la misma redirección que el QR (`/public/r/...`), con `?canal=link`, así se mide aparte.

**Backend:** guardar `channel: 'qr' | 'link'` en `scan_events` y separar por canal en `/scans`. No hace falta un endpoint nuevo.

### 3. Medir si el QR funciona — esfuerzo bajo a medio

**Por qué:** es el argumento de venta más fuerte del producto.

- Escaneos contra reseñas nuevas por semana y por sucursal, en el gráfico de Hoy y en el detalle de la campaña.
- Google no dice de dónde vino cada reseña: esto es una correlación y se muestra como tal ("después de poner el QR, las reseñas pasaron de 2 a 7 por semana").

**Backend:** un endpoint que devuelva las dos series juntas (`scan_events` por semana y reseñas por `googleCreateTime` por semana), en la zona horaria del negocio, igual que `/scans`.

### 4. Temas de las reseñas, con IA — esfuerzo medio

**Por qué:** convierte las reseñas en algo accionable ("Este mes, 4 reseñas mencionan la demora; el mes pasado, 1").

- Clasificar cada reseña en temas (atención, demora, precio, limpieza, producto), cada uno con su tono (positivo o negativo).

**Backend:**
- Usa el mismo cliente de Claude que las respuestas sugeridas. Conviene la Batch API, que sale más barata, en un job en segundo plano después de cada sincronización.
- Guardar `topics: [{ topic, sentiment }]` en la reseña y una agregación mensual por negocio.
- El texto de la reseña es dato, no instrucciones: el mismo cuidado que en `reply-suggester.ts`.

### 5. El tono del negocio en las respuestas sugeridas — esfuerzo bajo

**Por qué:** hace que las sugerencias dejen de sonar genéricas, que es la queja típica de las respuestas hechas con IA.

- En Configuración: tuteo o voseo, formal o cercano, con qué firma ("— Lucía, Café de la Esquina") y qué no decir nunca.

**Backend:** guardar `replyVoice` en el `Business` (`PATCH /businesses/:urn`, que hoy no existe; ver más abajo) y sumarlo al prompt de `ClaudeReplySuggester`, separado del texto de la reseña.

### 6. Responder en lote las de 5 estrellas sin texto — esfuerzo bajo

**Por qué:** son las más numerosas y las más tediosas de contestar.

- Una pantalla con todas esas reseñas y un agradecimiento sugerido para cada una, distintos entre sí. Se revisan y se publican todas juntas.

**Backend:**
- Sugerir varias en un pedido: un endpoint de lote con un tope, por ejemplo 20.
- Publicar respetando el rate limit de Google: en cola, no en paralelo.

### 7. Tiempo de respuesta como meta — esfuerzo bajo

**Por qué:** Google valora que el negocio responda, y la meta le da al dueño un hábito para sostener.

- La mediana de horas hasta responder y el porcentaje de reseñas respondidas, con un objetivo como "respondé en menos de 48 horas" en Hoy.

**Backend:** sumar al `GET /businesses/:urn/reviews/summary` la mediana de `reply.updateTime - googleCreateTime` y el porcentaje respondido en los últimos 30 días.

### 8. Varias sucursales — esfuerzo medio a alto (cuando haya clientes con varias)

**Qué incluye:**
- Comparativa entre sucursales: promedio, volumen, tiempo de respuesta.
- Un encargado por sucursal que solo ve la suya.
- Reseñas asignadas a una persona.

**Backend:**
- Membresía con alcance por sucursal: `locationUrns` opcional en `BusinessMember`.
- El `BusinessMembershipGuard` tendría que filtrar por sucursal.
- `assignedToUserUrn` en la reseña.

### 9. Planes y cobro — esfuerzo alto, pero necesario para que sea un SaaS

**Qué incluye:**
- Por ejemplo: gratis con una sucursal y un QR; pago para más sucursales, avisos e IA.
- Mercado Pago para Argentina y Stripe para el exterior.

**Backend:**
- `subscriptions` por negocio y webhooks de cada proveedor, verificados por firma.
- Un guard que limite según el plan.

---

## Lo que no haría

**Filtrar a los clientes disconformes antes de Google** (*review gating*): "si pone de 1 a 3 estrellas, mandarlo a un formulario privado en lugar de a Google".
- Google lo prohíbe y puede costarle al negocio la baja de sus reseñas.
- Hoy el QR lleva a todos directo a Google, y tiene que seguir así.
- Si alguna vez se suma feedback privado, que sea una opción aparte que no condicione el paso a Google.

---

## Técnico (pendiente después de esta tanda)

- **Rotar el refresh token en cada uso y detectar si se reutiliza.** Hoy la sesión se puede revocar, pero el mismo refresh token sirve hasta que vence o se cierra la sesión. Ojo con varias pestañas que refrescan a la vez: hace falta una ventana de gracia para el token anterior.
- **Lista de sesiones abiertas** ("tus dispositivos") con la opción de cerrar cada una. Requiere guardar en `sessions` el dispositivo (user agent) y la última actividad.
- **Verificar el email** al registrarse. Hoy la invitación ya exige entrar con el email invitado, pero el registro no confirma que el email sea de quien lo escribe.
- **Proveedor de mail en producción.** `MailerModule` manda por Resend si está `MAIL_RESEND_API_KEY`; sin la clave, en producción solo registra un error en el log. Falta elegir el proveedor y configurar el dominio (SPF, DKIM, DMARC).
- **Transferir el negocio a otro dueño.** Hoy el OWNER es único y no se puede cambiar.
- **Editar el negocio** (`PATCH /businesses/:urn`: nombre, zona horaria), **pausar campañas** y **activar o desactivar sucursales** desde la API.
- **Paginación** en negocios, sucursales y campañas.
- **Notificaciones de Google por Pub/Sub** y **BullMQ** para la sincronización, que ya estaban en el README.
