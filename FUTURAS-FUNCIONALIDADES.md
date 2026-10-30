# Funcionalidades futuras

Lo que queda propuesto para Opinara, ordenado por impacto. Nada de esto está empezado. Cada punto dice qué resuelve, qué necesita del backend y cuánto esfuerzo lleva más o menos (bajo, medio o alto).

> **Condición para casi todo:** lo que depende de datos reales de Google (avisos, temas, tiempo de respuesta) recién anda en producción cuando Google apruebe el acceso a la API de Business Profile. Mientras tanto se puede construir y probar contra los mocks del frontend y los fakes de los tests.

Ya hecho (octubre 2026), fuera de esta lista: límite del QR por IP y campaña con página de espera, sesiones revocables (cerrar sesión de verdad y en todos los dispositivos), recuperar contraseña e invitar miembros con roles.

---

## Producto

### 1. Avisos de reseñas nuevas y resumen semanal — esfuerzo medio

**Por qué:** el dueño no abre un dashboard todos los días. Que Opinara le avise es lo que más cambia el uso.

- Un mail cuando entra una reseña, con prioridad a las de 1 a 3 estrellas y un botón que abre esa reseña en el modo foco. Más adelante, WhatsApp.
- Los lunes, "Tu semana": reseñas nuevas, el promedio contra la semana anterior, escaneos y cuántas esperan respuesta.

**Backend:**
- La sincronización (`review-sync.service.ts`) ya sabe qué reseñas son nuevas: emitir un evento interno y que un servicio de avisos lo consuma.
- Preferencias por miembro (`notification_preferences`: qué avisos, a qué email) y un cron semanal en la zona horaria del negocio.
- Usa el `MailerModule` que ya existe. Para producción hace falta dominio propio con SPF y DKIM, o los mails caen en spam.
- Agrupar: diez reseñas en una hora tienen que ser un solo mail, no diez.

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
