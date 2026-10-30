import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GOOGLE_REVIEWS_ADAPTER,
} from '@shared/integrations/google/exports';
import { lastMondays } from '@packages/campaigns/services/scan-weeks';
import { createTestApp } from '../../../test/app.factory';
import {
  FakeGoogleAccountsAdapter,
  FakeGoogleLocationsAdapter,
  FakeGoogleOAuthAdapter,
  FakeGoogleReviewsAdapter,
} from '../../../test/google.fakes';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';

const TIMEZONE = 'America/Argentina/Buenos_Aires';

describe('Escaneos por semana (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;
  let businessUrn: string;
  let businessSlug: string;
  let campaignUrn: string;
  let otherCampaignUrn: string;

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp({ PUBLIC_APP_BASE_URL: 'https://app.opinara.test' }, [
      { token: GOOGLE_OAUTH_ADAPTER, value: new FakeGoogleOAuthAdapter() },
      { token: GOOGLE_ACCOUNTS_ADAPTER, value: new FakeGoogleAccountsAdapter() },
      { token: GOOGLE_LOCATIONS_ADAPTER, value: new FakeGoogleLocationsAdapter() },
      { token: GOOGLE_REVIEWS_ADAPTER, value: new FakeGoogleReviewsAdapter() },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
    const business = await createBusiness(app, owner, { name: 'Cafe de la Esquina', timezone: TIMEZONE });
    businessUrn = business.urn;
    businessSlug = business.slug;

    const { body } = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/connect`)
      .set('Authorization', owner.auth)
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/google/callback')
      .query({ code: 'codigo-valido', state: new URL(body.authorizationUrl).searchParams.get('state') ?? '' })
      .expect(200);
    const imported = await request(app.getHttpServer())
      .post(`/api/businesses/${businessUrn}/google/locations/import`)
      .set('Authorization', owner.auth)
      .send({ accountName: 'accounts/111', locationNames: ['locations/555'] })
      .expect(201);
    const locationUrn = imported.body[0].urn;

    const create = (name: string) =>
      request(app.getHttpServer())
        .post(`/api/businesses/${businessUrn}/campaigns`)
        .set('Authorization', owner.auth)
        .send({ name, locationUrn })
        .expect(201);
    campaignUrn = (await create('Mostrador')).body.urn;
    otherCampaignUrn = (await create('Mesas')).body.urn;
  });

  afterEach(async () => {
    await Promise.all(
      [
        'users',
        'businesses',
        'business_members',
        'google_connections',
        'oauth_states',
        'locations',
        'campaigns',
        'qr_codes',
        'scan_events',
      ].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const scan = (campaign = 'mostrador') =>
    request(app.getHttpServer()).get(`/api/public/r/${businessSlug}/${campaign}`).redirects(0);

  it('cada escaneo contado queda registrado con su fecha, sin datos de quien escaneo', async () => {
    await scan().expect(302);
    await request(app.getHttpServer()).head(`/api/public/r/${businessSlug}/mostrador`).redirects(0).expect(302);

    const events = await connection.collection('scan_events').find({}).toArray();
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]!).sort()).toEqual(['_id', 'businessUrn', 'campaignUrn', 'scannedAt']);
    expect(events[0]).toMatchObject({ businessUrn, campaignUrn });
  });

  it('devuelve las semanas pedidas, con 0 en las que no hubo escaneos', async () => {
    await scan().expect(302);
    await scan().expect(302);
    await scan('mesas').expect(302);

    const response = await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/scans`)
      .query({ weeks: 4 })
      .set('Authorization', owner.auth)
      .expect(200);

    const mondays = lastMondays(TIMEZONE, 4);
    expect(response.body.weeks).toEqual([
      { week: mondays[0], scans: 0 },
      { week: mondays[1], scans: 0 },
      { week: mondays[2], scans: 0 },
      { week: mondays[3], scans: 3 },
    ]);
    expect(typeof response.body.trackedSince).toBe('string');
  });

  it('por campaña cuenta solo los de esa campaña', async () => {
    await scan().expect(302);
    await scan('mesas').expect(302);

    const response = await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/campaigns/${otherCampaignUrn}/scans`)
      .query({ weeks: 1 })
      .set('Authorization', owner.auth)
      .expect(200);

    expect(response.body.weeks).toEqual([{ week: lastMondays(TIMEZONE, 1)[0], scans: 1 }]);
  });

  it('agrupa por la semana del negocio: un escaneo del domingo a la noche no cae en el lunes', async () => {
    const [previous, current] = lastMondays(TIMEZONE, 2) as [string, string];
    // Domingo 23:30 en Buenos Aires (UTC-3) es lunes 02:30 UTC.
    const sundayNight = new Date(`${current}T02:30:00Z`);
    await connection.collection('scan_events').insertOne({ businessUrn, campaignUrn, scannedAt: sundayNight });

    const response = await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/scans`)
      .query({ weeks: 2 })
      .set('Authorization', owner.auth)
      .expect(200);

    expect(response.body.weeks).toEqual([
      { week: previous, scans: 1 },
      { week: current, scans: 0 },
    ]);
  });

  it('sin escaneos registrados no hay fecha de inicio', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/scans`)
      .set('Authorization', owner.auth)
      .expect(200);

    expect(response.body.weeks).toHaveLength(12);
    expect(response.body.trackedSince).toBeNull();
  });

  it('valida la cantidad de semanas', async () => {
    await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/scans`)
      .query({ weeks: 53 })
      .set('Authorization', owner.auth)
      .expect(400);
  });

  it('no deja ver escaneos de otro negocio', async () => {
    await scan().expect(302);
    const intruder = await registerUser(app);
    const own = await createBusiness(app, intruder, { name: 'Otro negocio' });

    await request(app.getHttpServer())
      .get(`/api/businesses/${businessUrn}/scans`)
      .set('Authorization', intruder.auth)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/businesses/${own.urn}/campaigns/${campaignUrn}/scans`)
      .set('Authorization', intruder.auth)
      .expect(404);

    const ownScans = await request(app.getHttpServer())
      .get(`/api/businesses/${own.urn}/scans`)
      .set('Authorization', intruder.auth)
      .expect(200);
    expect(ownScans.body.weeks.every((week: { scans: number }) => week.scans === 0)).toBe(true);
  });
});
