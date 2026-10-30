import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { createTestApp } from '../../../test/app.factory';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';

/** PNG de 1×1 transparente: alcanza para probar el contrato, la imagen real la achica el frontend. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64',
);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8L'),
  Buffer.alloc(14),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('Logo del business (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  let owner: TestUser;
  let business: { urn: string; slug: string };

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp());
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
    business = await createBusiness(app, owner, { name: 'Café de la Esquina' });
  });

  afterEach(async () => {
    await Promise.all(
      ['users', 'businesses', 'business_members', 'business_logos'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  const upload = (user: TestUser, body: Buffer, type: string) =>
    request(app.getHttpServer())
      .put(`/api/businesses/${business.urn}/logo`)
      .set('Authorization', user.auth)
      .set('Content-Type', type)
      .send(body);

  const publicLogo = (slug: string, version?: string) =>
    request(app.getHttpServer())
      .get(`/api/public/businesses/${slug}/logo`)
      .query(version === undefined ? {} : { v: version })
      // supertest no junta los bytes de una imagen por su cuenta.
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('sin logo, el business lo dice y la URL publica responde 404', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/businesses/${business.urn}`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(response.body.logoUpdatedAt).toBeNull();

    const missing = await publicLogo(business.slug).expect(404);
    expect(JSON.parse(String(missing.body))).toMatchObject({ errorCode: 'LOGO_NOT_FOUND' });
  });

  it('sube el logo, lo sirve publico y cachea para siempre con la version vigente', async () => {
    const saved = await upload(owner, PNG, 'image/png').expect(200);
    expect(saved.body).toMatchObject({ urn: business.urn, role: 'OWNER' });
    const version = String(new Date(saved.body.logoUpdatedAt).getTime());

    const stored = await connection.collection('businesses').findOne({ urn: business.urn });
    expect(stored?.logoUpdatedAt).toBeInstanceOf(Date);

    const served = await publicLogo(business.slug, version).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect((served.body as Buffer).toString('hex')).toBe(PNG.toString('hex'));

    // Una version vieja (o ninguna) no se cachea para siempre: podria ser un logo reemplazado.
    const stale = await publicLogo(business.slug, '123').expect(200);
    expect(stale.headers['cache-control']).toBe('public, max-age=300');
  });

  it('reemplazar el logo cambia la version', async () => {
    const first = await upload(owner, PNG, 'image/png').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await upload(owner, WEBP, 'image/webp').expect(200);

    expect(second.body.logoUpdatedAt).not.toBe(first.body.logoUpdatedAt);
    const served = await publicLogo(business.slug).expect(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(await connection.collection('business_logos').countDocuments({ businessUrn: business.urn })).toBe(1);
  });

  it('rechaza SVG, otros formatos y contenido que no coincide con el tipo declarado', async () => {
    for (const [body, type] of [
      [SVG, 'image/svg+xml'],
      [Buffer.from('GIF89a'), 'image/gif'],
      [Buffer.from('no soy una imagen'), 'image/png'],
      [PNG, 'image/jpeg'],
      [Buffer.alloc(0), 'image/png'],
    ] as const) {
      const response = await upload(owner, body, type).expect(400);
      expect(response.body.errorCode).toBe('LOGO_INVALID_IMAGE');
    }

    const json = await request(app.getHttpServer())
      .put(`/api/businesses/${business.urn}/logo`)
      .set('Authorization', owner.auth)
      .send({ logo: PNG.toString('base64') })
      .expect(400);
    expect(json.body.errorCode).toBe('LOGO_INVALID_IMAGE');
    expect(await connection.collection('business_logos').countDocuments()).toBe(0);
  });

  it('corta los logos demasiado grandes con 413', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(301 * 1024)]);
    const response = await upload(owner, huge, 'image/png').expect(413);
    expect(response.body.errorCode).toBe('LOGO_TOO_LARGE');
  });

  it('lo borra y la URL publica deja de servirlo', async () => {
    await upload(owner, PNG, 'image/png').expect(200);

    const removed = await request(app.getHttpServer())
      .delete(`/api/businesses/${business.urn}/logo`)
      .set('Authorization', owner.auth)
      .expect(200);
    expect(removed.body.logoUpdatedAt).toBeNull();

    await publicLogo(business.slug).expect(404);
    expect(await connection.collection('business_logos').countDocuments()).toBe(0);
  });

  it('un MEMBER no puede cambiarlo y un usuario ajeno recibe 404', async () => {
    const member = await registerUser(app);
    await connection.collection('business_members').insertOne({
      urn: 'urn:business-member:logo-member',
      businessUrn: business.urn,
      userUrn: member.urn,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const forbidden = await upload(member, PNG, 'image/png').expect(403);
    expect(forbidden.body.errorCode).toBe('BUSINESS_FORBIDDEN');

    const stranger = await registerUser(app);
    await upload(stranger, PNG, 'image/png').expect(404);

    await request(app.getHttpServer()).put(`/api/businesses/${business.urn}/logo`).send(PNG).expect(401);
  });

  it('el publico no distingue negocio inexistente, suspendido o sin logo', async () => {
    await upload(owner, PNG, 'image/png').expect(200);
    await connection.collection('businesses').updateOne({ urn: business.urn }, { $set: { status: 'SUSPENDED' } });

    const suspended = await publicLogo(business.slug).expect(404);
    const unknown = await publicLogo('no-existe').expect(404);
    expect(String(suspended.body)).toContain('LOGO_NOT_FOUND');
    expect(String(unknown.body)).toContain('LOGO_NOT_FOUND');

    await publicLogo('Slug Invalido').expect(400);
  });
});
