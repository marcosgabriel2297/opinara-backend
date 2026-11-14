# Plan Pro y funcionalidades nuevas

> Propuesta del **2026-11-13**. Nada de esto está empezado ni decidido del todo: las preguntas
> abiertas están al final. Las ideas que ya estaban anotadas siguen en
> [`FUTURAS-FUNCIONALIDADES.md`](FUTURAS-FUNCIONALIDADES.md) (reseñas) y
> [`FIDELIZACION.md`](FIDELIZACION.md) (tarjeta de sellos); acá se ordenan para armar el tercer plan.

## Dónde estamos

| Plan (`BusinessPlan`) | Incluye |
| --- | --- |
| Reseñas (`REVIEWS`) | QR a Google, gestión y respuestas de reseñas |
| Fidelización (`LOYALTY`) | Tarjeta de sellos por sucursal, caja y recordatorios por WhatsApp (`wa.me`) |
| Reseñas + Fidelización (`REVIEWS_LOYALTY`) | Las dos cosas |

Los planes se cambian a mano desde el admin; todavía no hay cobro (el precio se pasa por email).

## El tercer plan: Pro

**La idea:** no sumar un tercer módulo, sino un plan **Pro** = todo lo de Reseñas + Fidelización,
más **automatización e inteligencia**. El salto que vende es pasar de "lo tengo todo, pero lo hago a
mano" a "Opinara lo hace por mí".

**Por qué así:**

1. **Escalón claro de venta.** Los dos planes de abajo no cambian; Pro es lo que se ofrece cuando
   el comercio ya usa Opinara y quiere más.
2. **Lo que cuesta plata va arriba.** Los mensajes de la API de WhatsApp, la IA (temas, lote) y la
   Places API cobran por uso. Si van en el plan más caro, no se come el margen de los otros.
3. **Usa datos que ya tenemos.** Clientes, sellos, recordatorios, escaneos y el consentimiento de
   promociones (`consent.marketing`), que hoy se guarda y no se usa para nada.
4. **Es barato de habilitar.** Sumar el plan es una fila en `PLAN_FEATURES`
   (`src/shared/models/enums/plan/index.ts`), con funcionalidades nuevas como `AUTOMATION` e
   `INSIGHTS`. El guard (`@RequiresFeature`) y el selector de plan del admin ya funcionan así.

### Qué incluye

**Se puede hacer ya, sin esperar a Google:**

| Funcionalidad | Qué resuelve | Esfuerzo |
| --- | --- | --- |
| **Promociones a clientes** | Campañas a un segmento ("los que no vienen hace 30 días", "todos", "los de Belgrano") solo entre los que aceptaron promociones. Primero en lote por `wa.me`, después automáticas | Medio |
| **Resumen semanal por mail** | "Tu semana": escaneos, sellos, canjes, clientes nuevos, recordatorios y cuántos volvieron. Las reseñas se suman cuando haya API | Medio |
| **Fidelización avanzada** | Varios premios por tarjeta (5 sellos un café, 10 un desayuno), vencimiento de sellos, premio de cumpleaños (pide guardar la fecha de nacimiento: un dato personal más) | Medio |
| **Varias sucursales** | Comparativa entre sucursales y encargados que solo ven la suya (`locationUrns` en `BusinessMember`) | Medio a alto |
| **Exportar** | Clientes a CSV y un reporte mensual | Bajo |

**Depende de que Google apruebe la API** (caso 1-8095000042347, respuesta estimada 24-26/11/2026):

| Funcionalidad | Qué resuelve | Esfuerzo |
| --- | --- | --- |
| **Avisos de reseñas nuevas** | Mail (después WhatsApp) en el momento, sobre todo las de 1 a 3 estrellas | Medio |
| **Temas de las reseñas con IA** | "Este mes, 4 reseñas mencionan la demora; el mes pasado, 1" | Medio |
| **Tono propio en las respuestas** | La IA responde con la voz del local: voseo, firma, qué no decir nunca | Bajo |
| **Responder en lote** | Agradecer juntas todas las de 5 estrellas sin texto | Bajo |

**WhatsApp automático (Cloud API de Meta).** Recordatorios y promociones sin tocar un botón: es lo
más vendible de Pro y lo más caro. Necesita verificar el negocio en Meta, un número propio,
plantillas aprobadas y se paga por mensaje (confirmar la tarifa vigente para Argentina). Va en una
segunda etapa, cuando con `wa.me` se haya comprobado que los recordatorios traen gente de vuelta:
eso ya se mide (panel de admin → Tarjeta de sellos → "Volvieron después").

### Por dónde arrancar

1. **Pro, etapa 1 (sin Google):** promociones a clientes por `wa.me`, resumen semanal por mail,
   exportar a CSV y varios premios por tarjeta.
2. **Cuando Google apruebe:** avisos de reseñas, temas con IA, tono propio y lote.
3. **Después:** WhatsApp automático.

### Lo que no haría

- **Feedback privado que filtre a los disconformes antes de Google** (*review gating*): Google lo
  prohíbe y el comercio puede perder sus reseñas.
- **Planes que se diferencian solo por límites** (sucursales, clientes) antes de tener cobro:
  complican el producto y la venta. Si hace falta, que sean condiciones del presupuesto.

## Otras funcionalidades recomendadas

Ideas nuevas, que no estaban en ningún documento. Ordenadas por lo que creo que más mueve la aguja.

### 1. La tarjeta en Google Wallet y Apple Wallet — esfuerzo medio (Google) y medio a alto (Apple)

**Por qué:** hoy la tarjeta es un link que el cliente tiene que guardar, y se pierde. En la
billetera del teléfono está siempre a mano, se muestra en la caja sin abrir nada, y **cada cambio
puede mostrar un aviso** ("Te falta 1 sello para tu café"): son recordatorios sin pagar WhatsApp.

- **Google Wallet:** API de *Loyalty passes*, sin costo. El pase se actualiza desde el backend.
- **Apple Wallet:** pases `.pkpass` firmados; hace falta una cuenta de Apple Developer (USD 99 por
  año) y un servicio que reciba los registros de los dispositivos y mande los push.
- El QR del pase es el mismo de la tarjeta web (`opinara-card:{memberCode}`): la caja no cambia.
- Va bien en Pro, o como argumento de venta de Fidelización.

**Si el cliente no tiene la billetera** (revisado el 2026-11-13): la billetera es un extra, no un
reemplazo. La tarjeta web (`/card#token=…`) y el QR de la caja siguen igual, y quien no la agrega
sigue con los recordatorios por WhatsApp.

- **iPhone:** Apple Wallet viene instalada; desde iOS 16.1 se puede borrar y se vuelve a bajar del
  App Store. Mostrar "Agregar a Apple Wallet" solo en iPhone.
- **Android:** Google Wallet no está en todos los teléfonos. Si falta, Google le ofrece instalarla al
  tocar el botón; igual, mostrar "Agregar a Google Wallet" solo si el dispositivo la soporta (lo
  recomienda la documentación de Google).
- **Argentina:** figura entre los países donde Google Wallet guarda pases, también de fidelidad
  (support.google.com/wallet/answer/12060037). Volver a confirmarlo antes de arrancar: la lista
  cambia.
- Los avisos del pase ("te falta 1 sello") llegan solo a quienes lo agregaron.

**Saber en qué formato la tiene cada cliente** (confirmar los detalles al implementarlo):

- **Google Wallet:** la API puede avisar a un endpoint nuestro cuando el cliente guarda o borra el
  pase, y cada pase indica si alguien lo tiene guardado.
- **Apple Wallet:** para actualizar el pase, cada iPhone se registra en nuestro servicio al agregarlo
  y se da de baja al borrarlo. Ese registro dice quién lo tiene.
- **Web:** no se puede saber si guardó el link. Sí se puede registrar cuándo abrió la tarjeta por
  última vez (hoy no se guarda).
- **En la caja:** el QR del pase puede llevar una marca (mismo código de tarjeta, distinto origen)
  para saber desde dónde se mostró cada sello.
- **Dónde se ve:** formato de la tarjeta en la lista de clientes y la ficha (panel del local y
  admin), y en las estadísticas del admin: cuántos en cada billetera, cuántos solo web, cuántos la
  borraron. Sirve para no mandarle WhatsApp a quien ya recibe el aviso del pase.
- **Límites:** las altas y bajas dependen de que el teléfono tenga conexión; en iPhone, apagar las
  actualizaciones automáticas del pase puede verse como una baja.

### 2. Caja con PIN por empleado — esfuerzo medio

**Por qué:** en un local, los cajeros comparten una cuenta o usan el celular del dueño, y entonces
el historial no dice quién sumó cada sello. Con un PIN por empleado, en una tablet que queda logueada
en modo caja, cada uno entra con 4 dígitos y queda registrado (justo lo que el admin ya muestra en
el historial del cliente). Sirve también para detectar sellos regalados.

### 3. Referidos: "traé un amigo" — esfuerzo bajo a medio

**Por qué:** es la forma más barata de conseguir clientes nuevos. Desde su tarjeta, el cliente
comparte un link de alta con su código; cuando el amigo suma su primer sello, los dos ganan uno. Se
apoya en lo que ya existe (alta pública, eventos de sellos). Cuidar el abuso: un premio por amigo
real, solo después del primer sello hecho en la caja.

### 4. Cómo estás frente a tu competencia — esfuerzo medio (Pro)

**Por qué:** es una pregunta que todo dueño se hace. Con la Places API (paga por uso) se compara
la calificación y la cantidad de reseñas del local contra los de su rubro en la zona, mes a mes.
No necesita la API de Business Profile. Cuidar las condiciones de Google Maps Platform: no guardar
su contenido de forma permanente (ver el punto 0 de `FUTURAS-FUNCIONALIDADES.md`).

### 5. Sellar al pagar con Mercado Pago — esfuerzo alto

**Por qué:** elimina el paso de la caja. Si el comercio cobra con Mercado Pago, un webhook del pago
suma el sello solo al cliente identificado. Es ambicioso (identificar al cliente en el pago no es
trivial), pero sería un diferencial fuerte en Argentina. Explorarlo cuando haya comercios usando la
tarjeta a diario.

### 6. Plan para agencias — esfuerzo medio

**Por qué:** canal de venta. Las agencias de marketing que manejan las redes de varios comercios
podrían administrar a todos sus clientes desde una cuenta, con su marca. Opinara vende a la agencia
y la agencia a los comercios. Ya está la base: un usuario puede ser miembro de varios negocios.

## Preguntas abiertas

1. **¿Para quién es Pro?** ¿Cadenas con varias sucursales, o el local único que quiere que Opinara
   haga el trabajo? Cambia qué va primero ("varias sucursales" o "promociones y automatización").
2. **¿Pro incluye siempre reseñas y fidelización?** ¿O hay un "Fidelización Pro" sin reseñas?
3. **¿Cómo se llama?** Pro, Plus, Crecimiento… Va en el panel, el admin y la landing.
4. **Wallet:** ¿arrancamos por Google Wallet (sin costo) y Apple después?
