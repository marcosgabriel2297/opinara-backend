Quiero que construyas el backend de un nuevo producto SaaS B2B.

## Contexto del producto

La plataforma permitirá que empresas/comercios reciban feedback de sus clientes y gestionen su reputación en Google.

El flujo principal será:

1. Un negocio se registra en nuestra plataforma.
2. El negocio conecta su Google Business Profile mediante OAuth 2.0.
3. Nuestro backend obtiene las cuentas y locations disponibles.
4. El negocio selecciona una o más locations.
5. Generamos un QR/link único para cada negocio/location/campaña.
6. Un cliente escanea el QR.
7. Nuestra plataforma muestra una página de feedback.
8. El cliente califica su experiencia.
9. Si corresponde, le damos la opción de continuar hacia Google para dejar una reseña.
10. La reseña debe ser creada por el usuario directamente en Google. Nuestra plataforma NO debe crear reseñas artificialmente ni utilizar scraping, bots o cuentas automatizadas.
11. Nuestro backend sincroniza las reseñas reales de Google.
12. El negocio puede visualizar las reseñas desde nuestro dashboard.
13. El negocio puede responderlas desde nuestra plataforma utilizando las APIs oficiales de Google.
14. Más adelante queremos convertir reviews reales en contenido para redes sociales.

Por ahora NO quiero frontend. El foco es exclusivamente backend y API.

---

# Stack obligatorio

- NestJS
- TypeScript
- MongoDB
- Mongoose
- REST API
- class-validator / class-transformer
- ConfigModule
- Jest
- ESLint
- Prettier

TypeScript debe utilizar strict mode.

NO utilizar `any`.

Quiero una arquitectura preparada para evolucionar a un SaaS multi-tenant.

---

# Arquitectura

Quiero una arquitectura modular y limpia, pero sin overengineering.

Proponer una estructura similar a:

src/
  modules/
    auth/
    users/
    businesses/
    locations/
    google/
    reviews/
    feedback/
    qr/
  common/
  config/

No quiero microservicios por ahora.

Debe ser un monolito modular en NestJS.

Quiero separar correctamente:

- controllers
- services/use cases
- repositories
- schemas/models
- DTOs
- integrations

Las integraciones externas no deben quedar acopladas al dominio.

Por ejemplo, quiero poder tener algo conceptualmente similar a:

GoogleBusinessProfileService
GoogleOAuthService
GoogleReviewsService

sin que `reviews` dependa directamente de detalles específicos de HTTP de Google.

---

# Multi-tenancy

Desde el principio debemos considerar que:

User
  ↓
Business
  ↓
Location

Un usuario puede pertenecer a uno o más businesses.

Un business puede tener múltiples locations.

Los datos deben estar correctamente aislados por business.

No quiero que un endpoint permita accidentalmente acceder a información de otro business modificando un ID en la URL.

Pensar explícitamente en autorización y ownership.

---

# Google Business Profile

Esta es una parte crítica del proyecto.

Antes de implementar, analizá la documentación oficial actual de Google Business Profile APIs.

Quiero que verifiques:

- OAuth 2.0
- scopes necesarios
- obtener accounts
- obtener locations
- obtener reviews
- responder reviews
- editar/eliminar respuestas
- notificaciones/webhooks de cambios
- límites/rate limits
- requisitos de acceso/aprobación de las APIs
- restricciones y políticas relevantes

NO inventes endpoints.

Si algo de la documentación actual no está disponible, es ambiguo o requiere aprobación de Google, indicarlo explícitamente.

Usar documentación oficial de Google como fuente de verdad.

---

# OAuth

Diseñar correctamente el flujo:

GET /auth/google
    ↓
Google OAuth
    ↓
callback
    ↓
guardar conexión
    ↓
obtener accounts
    ↓
obtener locations

Necesitamos soportar refresh tokens para poder utilizar Google posteriormente sin requerir que el usuario vuelva a autenticarse.

Los access tokens y refresh tokens deben manejarse de forma segura.

NO almacenar secrets/tokens sensibles en texto plano si podemos evitarlo.

Separar claramente:

- OAuth credentials de nuestra aplicación
- Google connection del usuario/business
- access token
- refresh token
- scopes
- expiration

---

# Modelo inicial

Proponer y luego implementar modelos Mongoose similares a:

User

Business

BusinessMember

Location

GoogleConnection

Review

Feedback

QRCode

Campaign

SocialConnection

No agregues entidades innecesarias todavía.

Explicar las relaciones y qué información pertenece a cada entidad.

---

# Reviews

Una review de Google debería conservar al menos:

- googleReviewId
- locationId
- rating
- comment
- reviewer information permitida por Google
- createdAt
- updatedAt
- reply
- googleReviewUrl si está disponible

Debemos poder distinguir claramente:

- review creada/gestionada externamente en Google
- feedback interno de nuestra plataforma

No mezclar ambas entidades.

---

# Feedback

El feedback de nuestra plataforma debe ser independiente de Google.

Ejemplo:

Feedback:
- businessId
- locationId
- campaignId
- rating
- comment
- customer information únicamente si realmente es necesaria
- source
- createdAt

No guardar PII innecesaria.

---

# QR / Campaigns

Necesitamos generar URLs únicas.

Ejemplo:

https://app.example.com/r/{businessSlug}/{campaignSlug}

La URL debe permitir identificar:

- business
- location
- campaign

Pero no exponer información sensible.

El QR inicialmente solamente necesita generar/representar la URL; la generación física de imágenes QR puede quedar desacoplada.

Pensar en métricas futuras:

- scans
- feedbacks
- conversiones
- Google review clicks

No necesitamos implementar analytics avanzados todavía.

---

# API inicial

Proponer endpoints REST para:

## Auth

GET /auth/google
GET /auth/google/callback

## Businesses

POST /businesses
GET /businesses
GET /businesses/:businessId

## Google

POST /businesses/:businessId/google/connect
GET /businesses/:businessId/google/accounts
GET /businesses/:businessId/google/locations
POST /businesses/:businessId/google/sync

## Locations

GET /businesses/:businessId/locations
GET /businesses/:businessId/locations/:locationId

## Reviews

GET /businesses/:businessId/locations/:locationId/reviews
GET /businesses/:businessId/locations/:locationId/reviews/:reviewId
POST /businesses/:businessId/locations/:locationId/reviews/:reviewId/reply
DELETE /businesses/:businessId/locations/:locationId/reviews/:reviewId/reply

Ajustá los endpoints si la API de Google o una mejor arquitectura lo requiere.

## Feedback

POST /public/feedback/:campaignSlug
GET /businesses/:businessId/feedback

## QR / Campaigns

POST /businesses/:businessId/campaigns
GET /businesses/:businessId/campaigns
POST /businesses/:businessId/campaigns/:campaignId/qr

---

# Seguridad

Implementar desde el inicio:

- authentication
- authorization
- business ownership/membership
- DTO validation
- rate limiting donde corresponda
- Helmet
- CORS configurable
- sanitización/validación de inputs
- manejo seguro de OAuth state
- protección contra CSRF en el flujo OAuth cuando corresponda
- no loggear access tokens ni refresh tokens
- manejo correcto de errores externos
- no exponer stack traces en producción

Pensar especialmente en endpoints públicos de feedback.

Un usuario anónimo debe poder enviar feedback mediante un campaign slug, pero NO debe poder acceder a información interna del negocio.

---

# Errores

Utilizar correctamente las excepciones de NestJS:

- BadRequestException
- UnauthorizedException
- ForbiddenException
- NotFoundException
- ConflictException
- etc.

Crear una estrategia consistente para errores de integraciones externas.

No devolver directamente errores crudos de Google al cliente.

---

# Sincronización

Diseñar inicialmente una estrategia de sincronización de reviews.

Quiero evaluar dos mecanismos:

1. polling periódico
2. notificaciones de Google

Si las notificaciones oficiales de Google son viables para este caso, dejar preparada la arquitectura para utilizarlas.

No necesitamos implementar BullMQ todavía si no es necesario para el MVP, pero la arquitectura debe permitir incorporar workers posteriormente.

---

# Testing

Quiero tests para los casos importantes.

Prioridad:

1. authorization / tenant isolation
2. OAuth state
3. Google integration
4. review synchronization
5. reply review
6. feedback público
7. campaign ownership

Mockear las APIs externas.

No hacer tests que dependan de una cuenta real de Google.

---

# Documentación

Crear un README completo que explique:

- qué hace el proyecto
- requisitos
- instalación
- variables de entorno
- MongoDB
- Google Cloud Project
- configuración OAuth
- APIs de Google necesarias
- scopes
- callback URL
- cómo ejecutar
- cómo ejecutar tests
- arquitectura
- decisiones importantes

También quiero un `.env.example`.

Nunca colocar credentials reales.

---

# IMPORTANTE: proceso de trabajo

NO empieces creando código inmediatamente.

Primero quiero que hagas un análisis técnico del proyecto.

Tu primera respuesta debe contener:

1. Arquitectura propuesta.
2. Estructura de carpetas.
3. Modelo de datos MongoDB.
4. Flujo OAuth de Google.
5. Flujo de sincronización de reviews.
6. Endpoints propuestos.
7. Riesgos técnicos.
8. Limitaciones de Google.
9. Qué necesitamos habilitar/configurar en Google Cloud.
10. Roadmap de implementación por fases.

Después de ese análisis, esperá mi aprobación antes de comenzar a implementar.

Cuando comencemos a implementar:

- implementar por fases pequeñas
- no crear código innecesario
- mantener TypeScript strict
- no utilizar `any`
- no inventar APIs de Google
- priorizar código simple y mantenible
- explicar brevemente las decisiones técnicas importantes
- ejecutar tests y lint después de cada fase importante

El objetivo no es hacer un demo descartable.

Quiero construir una base de backend SaaS real que posteriormente pueda soportar:

- múltiples negocios
- múltiples locations
- Google Business Profile
- reviews
- feedback
- QR/campaigns
- generación de contenido mediante IA
- Instagram/Facebook
- analytics
- billing/subscriptions

Pero el MVP debe mantenerse pequeño.