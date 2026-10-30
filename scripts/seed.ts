/**
 * Carga la base local con datos ficticios para probar a mano.
 *
 *   yarn db:up && yarn seed        (con Docker)
 *   yarn mongo:local && yarn seed  (sin Docker)
 *
 * Usa los schemas reales del proyecto, asi que los datos no pueden quedar desalineados
 * con el modelo: si un campo pasa a ser obligatorio, el seed falla en vez de escribir
 * documentos invalidos.
 *
 * Los datos son inventados. No hay ninguna credencial real de Google.
 */
import { createCipheriv, randomBytes } from 'crypto';

import mongoose from 'mongoose';

import '@shared/environment';
import { EncryptedValue } from '@shared/common/crypto';
import { hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { CampaignStatus } from '@shared/models/enums/campaign';
import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { UserStatus } from '@shared/models/enums/user';
import {
  BUSINESS_ENTITY,
  BUSINESS_MEMBER_ENTITY,
  BusinessMember,
  BusinessMemberSchema,
  BusinessSchema,
  Business as BusinessModel,
} from '@shared/models/business';
import { USER_ENTITY, User, UserSchema } from '@shared/models/user';
import { ADMIN_ENTITY, Admin, AdminSchema } from '@packages/admin';
import {
  CAMPAIGN_ENTITY,
  Campaign,
  CampaignSchema,
  QR_CODE_ENTITY,
  QRCode,
  QRCodeSchema,
} from '@packages/campaigns';
import { LOCATION_ENTITY, Location, LocationSchema } from '@packages/locations';
import {
  GOOGLE_CONNECTION_ENTITY,
  GoogleConnection,
  GoogleConnectionSchema,
} from '@packages/google';
import { REVIEW_ENTITY, Review, ReviewSchema } from '@packages/reviews';

const PASSWORD = 'claveSuperSegura1';
const DAY_MS = 24 * 60 * 60 * 1000;

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME ?? 'opinara';
const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

if (!uri || !encryptionKey) {
  console.error('Falta DATABASE_URI o TOKEN_ENCRYPTION_KEY en .env.dev');
  process.exit(1);
}

/** Mismo formato que `CryptoService`: AES-256-GCM con version de clave. */
const encrypt = (plaintext: string): EncryptedValue => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion: Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION ?? 1),
  };
};

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const REVIEWS = [
  { rating: 5, comment: 'Excelente atencion y el cafe de especialidad es el mejor del barrio.', author: 'Ana Pérez', days: 2 },
  { rating: 5, comment: 'Volvimos tres veces esta semana. Las medialunas salen calentitas a las 8.', author: 'Julián Ortiz', days: 4 },
  { rating: 4, comment: 'Muy rico todo, aunque a la hora pico cuesta conseguir mesa.', author: 'Sofía Martínez', days: 6 },
  { rating: 2, comment: 'Esperamos 40 minutos por dos cafes. El lugar lindo pero el servicio lento.', author: 'Rodrigo Blanco', days: 9, reply: 'Rodrigo, lamentamos la demora del sabado. Sumamos una persona mas en barra para los fines de semana. Gracias por avisarnos.' },
  { rating: 5, comment: 'El wifi anda bien y te dejan trabajar tranquilo. Mi oficina alternativa.', author: 'Camila Suárez', days: 12 },
  { rating: 3, comment: 'El cafe bien, las facturas del dia anterior.', author: null, days: 15 },
  { rating: 5, comment: 'Atencion de diez, sobre todo Carla que siempre se acuerda de mi pedido.', author: 'Nicolás Ferrari', days: 18, reply: 'Gracias Nicolás! Le pasamos el mensaje a Carla.' },
  { rating: 1, comment: 'Me cobraron dos veces el mismo pedido y tuve que reclamar por telefono.', author: 'Valeria Gómez', days: 22, reply: 'Valeria, ya devolvimos el importe duplicado. Disculpas por el mal momento.' },
  { rating: 4, comment: 'Buen lugar para desayunar. El precio subio un poco ultimamente.', author: 'Tomás Rivas', days: 27 },
  { rating: 5, comment: 'Probé el flat white y volvi al dia siguiente. Recomendadisimo.', author: 'Lucía Domínguez', days: 33 },
  { rating: 5, comment: 'Pet friendly de verdad, le trajeron agua a mi perro sin que lo pida.', author: 'Federico Luna', days: 41 },
  { rating: 4, comment: null, author: 'Marina Castro', days: 50 },
  { rating: 5, comment: 'Hicimos una reunion de trabajo y nos trataron barbaro.', author: 'Esteban Ríos', days: 58 },
  { rating: 3, comment: 'Correcto, sin mas. El tostado podria venir mas caliente.', author: null, days: 66 },
  { rating: 5, comment: 'La mejor medialuna de la zona, sin discusion.', author: 'Paula Ibáñez', days: 75 },
];

const REVIEWS_PALERMO = [
  { rating: 5, comment: 'La terraza de Palermo es un golazo para el after office.', author: 'Diego Sanz', days: 3 },
  { rating: 4, comment: 'Buena musica y buen cafe. A veces tarda un poco la cocina.', author: 'Belén Torres', days: 8 },
  { rating: 2, comment: 'Fui un martes y estaba cerrado pese a figurar abierto en Maps.', author: 'Hernán Vega', days: 14, reply: 'Hernán, ese martes cerramos por mantenimiento. Ya actualizamos los horarios en el perfil.' },
  { rating: 5, comment: 'Excelente para ir con la notebook, hay enchufes en casi todas las mesas.', author: null, days: 20 },
  { rating: 4, comment: 'Rico el brunch del domingo, conviene reservar.', author: 'Agustina Mele', days: 29 },
];

const REVIEWS_PELUQUERIA = [
  { rating: 5, comment: 'Diego me dejo el corte impecable, muy prolijo.', author: 'Matías Pereyra', days: 5 },
  { rating: 5, comment: 'Turnos puntuales, algo que no se consigue en ningun lado.', author: 'Sol Aguirre', days: 11 },
  { rating: 3, comment: 'El color quedo mas oscuro de lo que pedi.', author: 'Rocío Medina', days: 19, reply: 'Rocío, te esperamos para corregirlo sin cargo cuando quieras.' },
  { rating: 5, comment: 'Muy buena onda todo el equipo.', author: 'Ignacio Prieto', days: 26 },
];

async function seed(): Promise<void> {
  const connection = await mongoose.createConnection(uri as string, { dbName }).asPromise();

  const Admins = connection.model(Admin.name, AdminSchema);
  const Users = connection.model(User.name, UserSchema);
  const Businesses = connection.model(BusinessModel.name, BusinessSchema);
  const Members = connection.model(BusinessMember.name, BusinessMemberSchema);
  const Connections = connection.model(GoogleConnection.name, GoogleConnectionSchema);
  const Locations = connection.model(Location.name, LocationSchema);
  const Reviews = connection.model(Review.name, ReviewSchema);
  const Campaigns = connection.model(Campaign.name, CampaignSchema);
  const QRCodes = connection.model(QRCode.name, QRCodeSchema);

  console.log(`Limpiando la base "${dbName}"...`);
  // Uno por uno y no con un map: los modelos tienen tipos distintos y TypeScript no puede
  // unificar las firmas de `deleteMany` de un array heterogeneo.
  await Admins.deleteMany({});
  await Users.deleteMany({});
  await Businesses.deleteMany({});
  await Members.deleteMany({});
  await Connections.deleteMany({});
  await Locations.deleteMany({});
  await Reviews.deleteMany({});
  await Campaigns.deleteMany({});
  await QRCodes.deleteMany({});

  const password = await hashPassword(PASSWORD);
  const user = async (email: string, name: string) =>
    Users.create({ urn: Urn.createUUID(USER_ENTITY), email, name, password, status: UserStatus.ACTIVE });

  await Admins.create({
    urn: Urn.createUUID(ADMIN_ENTITY),
    email: 'admin@opinara.test',
    name: 'Admin Opinara',
    password,
    status: UserStatus.ACTIVE,
  });

  const lucia = await user('dueno@opinara.test', 'Lucía Fernández');
  const martin = await user('gerente@opinara.test', 'Martín Sosa');
  const carla = await user('empleada@opinara.test', 'Carla Ruiz');
  const diego = await user('peluqueria@opinara.test', 'Diego Paz');

  const business = async (name: string, slug: string, owner: { urn: string }) =>
    Businesses.create({
      urn: Urn.createUUID(BUSINESS_ENTITY),
      name,
      slug,
      ownerUserUrn: owner.urn,
      status: BusinessStatus.ACTIVE,
      timezone: 'America/Argentina/Buenos_Aires',
    });

  const cafe = await business('Café de la Esquina', 'cafe-de-la-esquina', lucia);
  const peluqueria = await business('Peluquería Estilo', 'peluqueria-estilo', diego);

  const member = async (businessUrn: string, userUrn: string, role: BusinessMemberRole) =>
    Members.create({
      urn: Urn.createUUID(BUSINESS_MEMBER_ENTITY),
      businessUrn,
      userUrn,
      role,
      status: BusinessMemberStatus.ACTIVE,
    });

  // El cafe tiene los tres roles, para probar autorizacion.
  await member(cafe.urn, lucia.urn, BusinessMemberRole.OWNER);
  await member(cafe.urn, martin.urn, BusinessMemberRole.ADMIN);
  await member(cafe.urn, carla.urn, BusinessMemberRole.MEMBER);
  await member(peluqueria.urn, diego.urn, BusinessMemberRole.OWNER);

  const googleConnection = async (businessUrn: string, connectedBy: string) =>
    Connections.create({
      urn: Urn.createUUID(GOOGLE_CONNECTION_ENTITY),
      businessUrn,
      // Tokens inventados: no sirven contra Google, solo para que el flujo local funcione.
      refreshToken: encrypt('1//0-refresh-token-ficticio'),
      accessToken: encrypt('ya29.access-token-ficticio'),
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: ['https://www.googleapis.com/auth/business.manage'],
      status: GoogleConnectionStatus.ACTIVE,
      connectedByUserUrn: connectedBy,
      connectedAt: daysAgo(90),
      lastSyncAt: daysAgo(0),
    });

  await googleConnection(cafe.urn, lucia.urn);
  await googleConnection(peluqueria.urn, diego.urn);

  const location = async (
    businessUrn: string,
    googleId: string,
    title: string,
    storeCode: string,
    address: string,
  ) =>
    Locations.create({
      urn: Urn.createUUID(LOCATION_ENTITY),
      businessUrn,
      googleAccountName: 'accounts/104829371625948301',
      googleLocationName: `locations/${googleId}`,
      googleLocationId: googleId,
      title,
      storeCode,
      placeId: `ChIJ${googleId}ficticio`,
      mapsUri: `https://maps.google.com/?cid=${googleId}`,
      newReviewUri: `https://search.google.com/local/writereview?placeid=ChIJ${googleId}ficticio`,
      address,
      hasVoiceOfMerchant: true,
      isActive: true,
      lastReviewSyncAt: daysAgo(0),
    });

  const centro = await location(cafe.urn, '18273645', 'Café de la Esquina — Centro', 'CENTRO', 'Av. Corrientes 1234, CABA');
  const palermo = await location(cafe.urn, '18273646', 'Café de la Esquina — Palermo', 'PALERMO', 'Gorriti 4567, CABA');
  const salon = await location(peluqueria.urn, '99881122', 'Peluquería Estilo', 'UNICA', 'Av. Rivadavia 8900, CABA');

  const review = async (
    loc: { urn: string; businessUrn: string; googleLocationId: string },
    index: number,
    data: { rating: number; comment: string | null; author: string | null; days: number; reply?: string },
  ) =>
    Reviews.create({
      urn: Urn.createUUID(REVIEW_ENTITY),
      businessUrn: loc.businessUrn,
      locationUrn: loc.urn,
      googleReviewId: `review-${loc.googleLocationId}-${index}`,
      googleReviewName: `accounts/104829371625948301/locations/${loc.googleLocationId}/reviews/review-${loc.googleLocationId}-${index}`,
      starRating: data.rating,
      starRatingRaw: ['STAR_RATING_UNSPECIFIED', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][data.rating],
      comment: data.comment ?? undefined,
      reviewer: data.author
        ? { displayName: data.author, profilePhotoUrl: 'https://lh3.googleusercontent.com/ficticio', isAnonymous: false }
        : { isAnonymous: true },
      googleCreateTime: daysAgo(data.days),
      googleUpdateTime: daysAgo(data.days),
      reply: data.reply ? { comment: data.reply, updateTime: daysAgo(Math.max(0, data.days - 1)) } : undefined,
      syncedAt: new Date(),
    });

  await Promise.all(REVIEWS.map((data, index) => review(centro, index, data)));
  await Promise.all(REVIEWS_PALERMO.map((data, index) => review(palermo, index, data)));
  await Promise.all(REVIEWS_PELUQUERIA.map((data, index) => review(salon, index, data)));

  const campaign = async (
    loc: { urn: string; businessUrn: string },
    name: string,
    slug: string,
    createdBy: string,
    stats: { scans: number; googleClicks: number },
  ) => {
    const created = await Campaigns.create({
      urn: Urn.createUUID(CAMPAIGN_ENTITY),
      businessUrn: loc.businessUrn,
      locationUrn: loc.urn,
      name,
      slug,
      status: CampaignStatus.ACTIVE,
      stats,
      createdByUserUrn: createdBy,
    });

    await QRCodes.create({
      urn: Urn.createUUID(QR_CODE_ENTITY),
      businessUrn: loc.businessUrn,
      campaignUrn: created.urn,
      targetUrl: `${process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000'}/r/${
        loc.businessUrn === cafe.urn ? cafe.slug : peluqueria.slug
      }/${slug}`,
      createdByUserUrn: createdBy,
    });

    return created;
  };

  await campaign(centro, 'Mostrador', 'mostrador', lucia.urn, { scans: 184, googleClicks: 184 });
  await campaign(palermo, 'Mesas Palermo', 'mesas-palermo', martin.urn, { scans: 97, googleClicks: 97 });
  await campaign(salon, 'Recepción', 'recepcion', diego.urn, { scans: 45, googleClicks: 45 });

  const counts = {
    usuarios: await Users.countDocuments(),
    negocios: await Businesses.countDocuments(),
    miembros: await Members.countDocuments(),
    conexiones: await Connections.countDocuments(),
    sucursales: await Locations.countDocuments(),
    reseñas: await Reviews.countDocuments(),
    campañas: await Campaigns.countDocuments(),
  };

  console.log('\nDatos cargados:');
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(12)} ${value}`);
  }

  console.log('\nUsuarios (password para todos: ' + PASSWORD + ')');
  console.log('  dueno@opinara.test        OWNER  de Café de la Esquina');
  console.log('  gerente@opinara.test      ADMIN  de Café de la Esquina');
  console.log('  empleada@opinara.test     MEMBER de Café de la Esquina');
  console.log('  peluqueria@opinara.test   OWNER  de Peluquería Estilo (para probar aislamiento)');
  console.log('\nAdministrador (POST /api/admin/auth/login, mismo password)');
  console.log('  admin@opinara.test');

  console.log('\nIdentificadores utiles');
  console.log(`  business  ${cafe.urn}`);
  console.log(`  location  ${centro.urn}  (${centro.title})`);
  console.log(`  campaign  ${mostrador.urn}`);

  console.log('\nQR publico (302 a Google)');
  console.log(`  GET /api/public/r/${cafe.slug}/mostrador`);
  console.log(`  GET /api/public/r/${peluqueria.slug}/recepcion`);
  console.log('');

  await connection.close();
}

seed().catch((error: unknown) => {
  console.error('El seed fallo:', error instanceof Error ? error.message : error);
  process.exit(1);
});
