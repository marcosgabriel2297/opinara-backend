/**
 * Agrega a la base local un negocio de demostración, con datos ficticios, para mostrar Opinara.
 *
 *   yarn seed:demo
 *
 * A diferencia de `yarn seed`, no borra nada más: solo reemplaza lo que haya creado una corrida
 * anterior de este mismo script (el negocio `bodegon-don-ernesto` y los usuarios `*.demo@`), así que
 * sirve también para dejar la demo como nueva después de mostrarla.
 *
 * La conexión con Google es inventada. Lo que se lee de la base (reseñas, escaneos, QR, equipo)
 * funciona igual que con un negocio real; lo que va contra Google (publicar una respuesta,
 * sincronizar) falla.
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
import { Session, SessionSchema } from '@shared/models/session';
import { USER_ENTITY, User, UserSchema } from '@shared/models/user';
import {
  CAMPAIGN_ENTITY,
  Campaign,
  CampaignSchema,
  QR_CODE_ENTITY,
  QRCode,
  QRCodeSchema,
  ScanEvent,
  ScanEventSchema,
} from '@packages/campaigns';
import { LOCATION_ENTITY, Location, LocationSchema } from '@packages/locations';
import { GOOGLE_CONNECTION_ENTITY, GoogleConnection, GoogleConnectionSchema } from '@packages/google';
import { REVIEW_ENTITY, Review, ReviewSchema } from '@packages/reviews';

const PASSWORD = 'claveSuperSegura1';
const BUSINESS_SLUG = 'bodegon-don-ernesto';
const DAY_MS = 24 * 60 * 60 * 1000;
const GOOGLE_ACCOUNT = 'accounts/550011223344556677';

const TEAM = {
  owner: { email: 'dueno.demo@opinara.test', name: 'Valentina Ríos' },
  manager: { email: 'gerente.demo@opinara.test', name: 'Martín Acosta' },
  waiter: { email: 'mozo.demo@opinara.test', name: 'Lucas Benítez' },
};

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME ?? 'opinara';
const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

if (!uri || !encryptionKey) {
  console.error('Falta DATABASE_URI o TOKEN_ENCRYPTION_KEY en .env.dev');
  process.exit(1);
}

if (/mongodb\+srv:|mongodb\.net/.test(uri)) {
  // Es una demo con datos inventados: nunca contra Atlas.
  console.error('DATABASE_URI apunta a Atlas. Este script es solo para la base local.');
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

type DemoReview = { rating: number; comment: string | null; author: string | null; days: number; reply?: string };

/** Las más recientes quedan sin responder: es lo que se ve primero en "Hoy" y en el modo foco. */
const REVIEWS_PALERMO: DemoReview[] = [
  { rating: 5, comment: 'La milanesa napolitana es enorme y está buenísima. Lucas nos atendió de diez.', author: 'Florencia Paz', days: 0 },
  { rating: 2, comment: 'Pedimos una mesa para seis con reserva y nos hicieron esperar casi una hora.', author: 'Gustavo Herrera', days: 1 },
  { rating: 5, comment: 'Bodegón de los de antes. El flan casero con dulce de leche, imperdible.', author: 'Carolina Méndez', days: 1 },
  { rating: 4, comment: 'Muy rico todo y abundante. El vino de la casa, correcto.', author: 'Pablo Giménez', days: 2 },
  { rating: 1, comment: 'La comida llegó fría y cuando lo dijimos nadie se hizo cargo.', author: null, days: 3 },
  { rating: 5, comment: 'Fuimos por el cumpleaños de mi viejo y nos trajeron una porción de torta sin pedirla. Un golazo.', author: 'Agustín Romero', days: 4 },
  { rating: 5, comment: 'Camila nos recomendó el bife de chorizo a punto y fue la mejor decisión.', author: 'Lorena Ruiz', days: 6, reply: 'Gracias Lorena, le pasamos el mensaje a Camila. ¡Los esperamos pronto!' },
  { rating: 4, comment: 'Excelente relación precio-calidad. Un poco ruidoso los viernes.', author: 'Javier Molina', days: 8, reply: 'Gracias Javier. Los viernes se llena, si buscás algo más tranquilo te recomendamos venir de lunes a jueves.' },
  { rating: 5, comment: null, author: 'Natalia Correa', days: 9, reply: '¡Gracias por las cinco estrellas, Natalia!' },
  { rating: 3, comment: 'Las papas fritas muy buenas, la carne un poco pasada para lo que pedí.', author: 'Sebastián Funes', days: 11, reply: 'Sebastián, gracias por avisarnos. Ya lo hablamos con la parrilla para respetar el punto que pide cada uno.' },
  { rating: 5, comment: 'Atención cálida y familiar. Te sentís como en casa.', author: 'María José Ortega', days: 13, reply: '¡Gracias María José! Esa es la idea, que se sientan en casa.' },
  { rating: 5, comment: 'La mejor tortilla de papas de Palermo, jugosa como tiene que ser.', author: 'Ezequiel Sosa', days: 15, reply: 'Gracias Ezequiel, la tortilla es la especialidad de Don Ernesto.' },
  { rating: 2, comment: 'Nos cobraron el cubierto sin avisar antes.', author: 'Daniela Paredes', days: 18, reply: 'Daniela, tenés razón: ya lo sumamos a la carta para que quede claro desde el principio. Disculpas.' },
  { rating: 4, comment: 'Muy buenas pastas caseras. Faltaría alguna opción vegetariana más.', author: 'Tomás Aguirre', days: 21, reply: 'Gracias Tomás. Estamos sumando dos platos vegetarianos a la carta de invierno.' },
  { rating: 5, comment: 'Vinimos de turistas y nos trataron como de toda la vida.', author: 'Lucía Fernández', days: 24, reply: '¡Gracias Lucía! Esperamos verlos en el próximo viaje.' },
  { rating: 5, comment: 'Los ravioles de verdura con salsa mixta, un viaje a la infancia.', author: 'Ramiro Quiroga', days: 27, reply: 'Gracias Ramiro, ¡qué lindo leer esto!' },
  { rating: 4, comment: null, author: 'Silvina Arce', days: 31, reply: 'Gracias Silvina, ¡te esperamos pronto!' },
  { rating: 5, comment: 'Excelente provoleta y la entraña en su punto justo.', author: 'Hernán Ledesma', days: 35, reply: 'Gracias Hernán, ¡los esperamos de nuevo!' },
  { rating: 5, comment: 'Lucas es un genio, se acordó de lo que pedimos la vez anterior.', author: 'Paula Benítez', days: 40, reply: 'Gracias Paula, Lucas se puso muy contento con tu reseña.' },
  { rating: 3, comment: 'Rico, pero el postre tardó muchísimo.', author: null, days: 46, reply: 'Gracias por avisarnos, ya reorganizamos la salida de postres en la cocina.' },
  { rating: 5, comment: 'Clásico porteño de verdad. Volveremos.', author: 'Andrés Villalba', days: 52, reply: '¡Gracias Andrés! Los esperamos.' },
  { rating: 5, comment: 'Las porciones son gigantes, con un plato comen dos.', author: 'Cecilia Navarro', days: 60, reply: 'Gracias Cecilia, ¡así nos gusta!' },
  { rating: 4, comment: 'Buena comida, buen precio. El baño podría estar más cuidado.', author: 'Leandro Castro', days: 68, reply: 'Gracias Leandro, ya reforzamos la limpieza del baño durante el servicio.' },
  { rating: 5, comment: 'Mi lugar fijo de los domingos.', author: 'Rosa Domínguez', days: 75, reply: '¡Gracias Rosa! Siempre es un gusto tenerte.' },
  { rating: 5, comment: 'El vermut con soda y la picada de la casa, perfectos para arrancar.', author: 'Iván Peralta', days: 83, reply: 'Gracias Iván, ¡salud!' },
  { rating: 4, comment: 'Muy buena atención de Camila.', author: 'Bruno Medina', days: 90, reply: 'Gracias Bruno, se lo contamos a Camila.' },
];

const REVIEWS_BELGRANO: DemoReview[] = [
  { rating: 5, comment: 'El local nuevo de Belgrano está hermoso y mantiene el mismo sabor.', author: 'Julieta Campos', days: 0 },
  { rating: 4, comment: 'Muy buenas empanadas de carne cortada a cuchillo.', author: 'Federico Ibarra', days: 2 },
  { rating: 3, comment: 'Lindo lugar, pero el delivery llegó con la salsa volcada.', author: 'Marcela Toledo', days: 5 },
  { rating: 5, comment: 'Pedimos por delivery y llegó todo calentito y bien presentado.', author: 'Diego Ferreyra', days: 7, reply: 'Gracias Diego, ¡qué bueno que llegó bien!' },
  { rating: 5, comment: 'Excelente para ir en familia, tienen menú para chicos.', author: 'Analía Gutiérrez', days: 10, reply: 'Gracias Analía, ¡los chicos siempre son bienvenidos!' },
  { rating: 2, comment: 'Tardaron mucho en tomarnos el pedido, había poco personal.', author: 'Oscar Benítez', days: 14, reply: 'Oscar, disculpas. Sumamos una persona más en el salón para el turno noche.' },
  { rating: 5, comment: null, author: 'Valeria Luna', days: 17, reply: '¡Gracias Valeria!' },
  { rating: 4, comment: 'Rico y abundante. Volvería por el matambre a la pizza.', author: 'Gonzalo Vera', days: 22, reply: 'Gracias Gonzalo, ¡el matambre te espera!' },
  { rating: 5, comment: 'Atención impecable y precios razonables para la zona.', author: 'Mónica Ríos', days: 28, reply: 'Gracias Mónica, ¡te esperamos pronto!' },
  { rating: 5, comment: 'El budín de pan es igual al de mi abuela.', author: 'Claudio Rey', days: 36, reply: 'Gracias Claudio, no hay mejor elogio.' },
  { rating: 4, comment: 'Buena carta de vinos para un bodegón.', author: 'Patricia Soria', days: 45, reply: 'Gracias Patricia, la vamos renovando cada temporada.' },
  { rating: 5, comment: 'Inauguraron hace poco y ya es mi favorito del barrio.', author: 'Emiliano Paz', days: 55, reply: '¡Gracias Emiliano! Bienvenido al bodegón.' },
];

/** Escaneos de las últimas 12 semanas: crecen a medida que se suman QR en las mesas. */
const CAMPAIGNS = [
  { location: 'palermo', name: 'Mozo Lucas', slug: 'mozo-lucas', perDay: 4.5, sinceDays: 84, historic: 38 },
  { location: 'palermo', name: 'Moza Camila', slug: 'moza-camila', perDay: 3.8, sinceDays: 84, historic: 29 },
  { location: 'palermo', name: 'Mostrador Palermo', slug: 'mostrador-palermo', perDay: 2.2, sinceDays: 70, historic: 0 },
  { location: 'belgrano', name: 'Mesas Belgrano', slug: 'mesas-belgrano', perDay: 3.1, sinceDays: 56, historic: 0 },
  { location: 'belgrano', name: 'Bolsas de delivery', slug: 'delivery', perDay: 1.4, sinceDays: 42, historic: 0, paused: true },
] as const;

async function seedDemo(): Promise<void> {
  const connection = await mongoose.createConnection(uri as string, { dbName }).asPromise();

  const Users = connection.model(User.name, UserSchema);
  const Sessions = connection.model(Session.name, SessionSchema);
  const Businesses = connection.model(BusinessModel.name, BusinessSchema);
  const Members = connection.model(BusinessMember.name, BusinessMemberSchema);
  const Connections = connection.model(GoogleConnection.name, GoogleConnectionSchema);
  const Locations = connection.model(Location.name, LocationSchema);
  const Reviews = connection.model(Review.name, ReviewSchema);
  const Campaigns = connection.model(Campaign.name, CampaignSchema);
  const QRCodes = connection.model(QRCode.name, QRCodeSchema);
  const ScanEvents = connection.model(ScanEvent.name, ScanEventSchema);

  // Solo lo de una corrida anterior de este script.
  const previous = await Businesses.findOne({ slug: BUSINESS_SLUG }).lean();
  if (previous) {
    const businessUrn = previous.urn;
    await Members.deleteMany({ businessUrn });
    await Connections.deleteMany({ businessUrn });
    await Locations.deleteMany({ businessUrn });
    await Reviews.deleteMany({ businessUrn });
    await Campaigns.deleteMany({ businessUrn });
    await QRCodes.deleteMany({ businessUrn });
    await ScanEvents.deleteMany({ businessUrn });
    await Businesses.deleteOne({ urn: businessUrn });
  }
  const emails = Object.values(TEAM).map((person) => person.email);
  const previousUsers = await Users.find({ email: { $in: emails } }).lean();
  await Sessions.deleteMany({ userUrn: { $in: previousUsers.map((user) => user.urn) } });
  await Users.deleteMany({ email: { $in: emails } });

  const password = await hashPassword(PASSWORD);
  const user = (person: { email: string; name: string }) =>
    Users.create({ urn: Urn.createUUID(USER_ENTITY), ...person, password, status: UserStatus.ACTIVE });

  const owner = await user(TEAM.owner);
  const manager = await user(TEAM.manager);
  const waiter = await user(TEAM.waiter);

  const business = await Businesses.create({
    urn: Urn.createUUID(BUSINESS_ENTITY),
    name: 'Bodegón Don Ernesto',
    slug: BUSINESS_SLUG,
    ownerUserUrn: owner.urn,
    status: BusinessStatus.ACTIVE,
    timezone: 'America/Argentina/Buenos_Aires',
  });

  const member = (userUrn: string, role: BusinessMemberRole) =>
    Members.create({
      urn: Urn.createUUID(BUSINESS_MEMBER_ENTITY),
      businessUrn: business.urn,
      userUrn,
      role,
      status: BusinessMemberStatus.ACTIVE,
    });

  await member(owner.urn, BusinessMemberRole.OWNER);
  await member(manager.urn, BusinessMemberRole.ADMIN);
  await member(waiter.urn, BusinessMemberRole.MEMBER);

  await Connections.create({
    urn: Urn.createUUID(GOOGLE_CONNECTION_ENTITY),
    businessUrn: business.urn,
    refreshToken: encrypt('1//0-refresh-token-ficticio-demo'),
    accessToken: encrypt('ya29.access-token-ficticio-demo'),
    // Vence lejos a propósito: si nunca hace falta renovarlo, un intento contra Google falla sin
    // marcar la conexión como revocada, y la demo sigue mostrándose conectada.
    accessTokenExpiresAt: new Date(Date.now() + 365 * DAY_MS),
    scopes: ['https://www.googleapis.com/auth/business.manage'],
    status: GoogleConnectionStatus.ACTIVE,
    connectedByUserUrn: owner.urn,
    connectedAt: daysAgo(95),
    lastSyncAt: daysAgo(0),
  });

  const location = (googleId: string, title: string, storeCode: string, address: string) =>
    Locations.create({
      urn: Urn.createUUID(LOCATION_ENTITY),
      businessUrn: business.urn,
      googleAccountName: GOOGLE_ACCOUNT,
      googleLocationName: `locations/${googleId}`,
      googleLocationId: googleId,
      title,
      storeCode,
      placeId: `ChIJdemo${googleId}`,
      mapsUri: `https://maps.google.com/?cid=${googleId}`,
      newReviewUri: `https://search.google.com/local/writereview?placeid=ChIJdemo${googleId}`,
      address,
      hasVoiceOfMerchant: true,
      isActive: true,
      lastReviewSyncAt: daysAgo(0),
    });

  const locations = {
    palermo: await location('61002001', 'Bodegón Don Ernesto — Palermo', 'PALERMO', 'Honduras 4850, CABA'),
    belgrano: await location('61002002', 'Bodegón Don Ernesto — Belgrano', 'BELGRANO', 'Juramento 2140, CABA'),
  };

  const review = (loc: (typeof locations)['palermo'], index: number, data: DemoReview) => {
    const reviewId = `demo-${loc.googleLocationId}-${index}`;
    // Hora del día variable, para que no salgan todas a la misma hora.
    const createdAt = new Date(daysAgo(data.days).getTime() - ((index * 37) % 600) * 60 * 1000);
    return Reviews.create({
      urn: Urn.createUUID(REVIEW_ENTITY),
      businessUrn: business.urn,
      locationUrn: loc.urn,
      googleReviewId: reviewId,
      googleReviewName: `${GOOGLE_ACCOUNT}/locations/${loc.googleLocationId}/reviews/${reviewId}`,
      starRating: data.rating,
      starRatingRaw: ['STAR_RATING_UNSPECIFIED', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][data.rating],
      comment: data.comment ?? undefined,
      reviewer: data.author ? { displayName: data.author, isAnonymous: false } : { isAnonymous: true },
      googleCreateTime: createdAt,
      googleUpdateTime: createdAt,
      reply: data.reply
        ? { comment: data.reply, updateTime: new Date(createdAt.getTime() + (6 + (index % 30)) * 60 * 60 * 1000) }
        : undefined,
      syncedAt: new Date(),
    });
  };

  await Promise.all(REVIEWS_PALERMO.map((data, index) => review(locations.palermo, index, data)));
  await Promise.all(REVIEWS_BELGRANO.map((data, index) => review(locations.belgrano, index, data)));

  let totalScans = 0;
  for (const [index, data] of CAMPAIGNS.entries()) {
    const loc = locations[data.location];
    const campaign = await Campaigns.create({
      urn: Urn.createUUID(CAMPAIGN_ENTITY),
      businessUrn: business.urn,
      locationUrn: loc.urn,
      name: data.name,
      slug: data.slug,
      status: 'paused' in data && data.paused ? CampaignStatus.PAUSED : CampaignStatus.ACTIVE,
      stats: { scans: 0, googleClicks: 0 },
      createdByUserUrn: index % 2 === 0 ? owner.urn : manager.urn,
    });

    // Escaneos por día con una tendencia en alza y más movimiento los fines de semana. Pseudoaleatorio
    // con semilla fija: cada corrida da los mismos números.
    const events: { businessUrn: string; campaignUrn: string; scannedAt: Date }[] = [];
    let seed = index + 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let day = data.sinceDays; day >= 0; day--) {
      const date = daysAgo(day);
      const weekend = [0, 5, 6].includes(date.getDay());
      const growth = 0.5 + (1 - day / data.sinceDays);
      const count = Math.round(data.perDay * growth * (weekend ? 1.6 : 0.8) * (0.6 + random() * 0.8));
      for (let i = 0; i < count; i++) {
        // Entre las 12 y las 24, la hora del servicio.
        const minutes = 12 * 60 + Math.floor(random() * 12 * 60);
        const scannedAt = new Date(date);
        scannedAt.setHours(0, minutes, 0, 0);
        if (scannedAt.getTime() <= Date.now()) {
          events.push({ businessUrn: business.urn, campaignUrn: campaign.urn, scannedAt });
        }
      }
    }
    if ('paused' in data && data.paused) {
      // Pausada hace dos semanas: sin escaneos desde entonces.
      const pausedAt = daysAgo(14).getTime();
      events.splice(0, events.length, ...events.filter((event) => event.scannedAt.getTime() < pausedAt));
    }
    await ScanEvents.insertMany(events);

    const scans = events.length + data.historic;
    totalScans += scans;
    await Campaigns.updateOne({ urn: campaign.urn }, { $set: { stats: { scans, googleClicks: scans } } });

    await QRCodes.create({
      urn: Urn.createUUID(QR_CODE_ENTITY),
      businessUrn: business.urn,
      campaignUrn: campaign.urn,
      targetUrl: `${process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000'}/r/${BUSINESS_SLUG}/${data.slug}`,
      createdByUserUrn: campaign.createdByUserUrn,
    });
  }

  const reviews = [...REVIEWS_PALERMO, ...REVIEWS_BELGRANO];
  const average = reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length;
  const unanswered = reviews.filter((item) => !item.reply).length;

  console.log(`\nDemo cargada en la base "${dbName}": Bodegón Don Ernesto`);
  console.log(`  2 sucursales, ${reviews.length} reseñas (promedio ${average.toFixed(1)}, ${unanswered} sin responder)`);
  console.log(`  ${CAMPAIGNS.length} campañas (una pausada), ${totalScans} escaneos`);
  console.log(`\nUsuarios (password: ${PASSWORD})`);
  console.log(`  ${TEAM.owner.email.padEnd(28)} OWNER   ${TEAM.owner.name}`);
  console.log(`  ${TEAM.manager.email.padEnd(28)} ADMIN   ${TEAM.manager.name}`);
  console.log(`  ${TEAM.waiter.email.padEnd(28)} MEMBER  ${TEAM.waiter.name}`);
  console.log('');

  await connection.close();
}

seedDemo().catch((error: unknown) => {
  console.error('La demo falló:', error instanceof Error ? error.message : error);
  process.exit(1);
});
