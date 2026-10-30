import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Connection } from 'mongoose';
import request from 'supertest';

import { MAILER } from '@shared/common/mailer';

import { createTestApp } from '../../../test/app.factory';
import { registerUser } from '../../../test/helpers';
import { FakeMailer } from '../../../test/mailer.fake';

describe('Sesiones y recuperacion de contraseña (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp({ PUBLIC_APP_BASE_URL: 'https://app.opinara.test' }, [
      { token: MAILER, value: mailer },
    ]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  afterEach(async () => {
    mailer.clear();
    await Promise.all(
      ['users', 'sessions', 'password_resets'].map((name) => connection.collection(name).deleteMany({})),
    );
  });

  const http = () => request(app.getHttpServer());
  const login = (email: string, password = 'claveSuperSegura1') =>
    http().post('/api/auth/login').send({ email, password });
  const me = (accessToken: string) => http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const refresh = (refreshToken: string) => http().post('/api/auth/refresh').send({ refreshToken });

  describe('cerrar sesion', () => {
    it('revoca los dos tokens en el acto, aunque no hayan vencido', async () => {
      const user = await registerUser(app);
      const session = (await login(user.email).expect(200)).body;

      await me(session.accessToken).expect(200);
      await http().post('/api/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);

      await me(session.accessToken).expect(401);
      const refused = await refresh(session.refreshToken).expect(401);
      expect(refused.body.errorCode).toBe('INVALID_REFRESH_TOKEN');
    });

    it('cierra solo esa sesion: la de otro dispositivo sigue andando', async () => {
      const user = await registerUser(app);
      const laptop = (await login(user.email).expect(200)).body;
      const phone = (await login(user.email).expect(200)).body;

      await http().post('/api/auth/logout').send({ refreshToken: laptop.refreshToken }).expect(204);

      await me(laptop.accessToken).expect(401);
      await me(phone.accessToken).expect(200);
      await refresh(phone.refreshToken).expect(200);
    });

    it('"en todos los dispositivos" las cierra todas', async () => {
      const user = await registerUser(app);
      const other = (await login(user.email).expect(200)).body;

      await http().post('/api/auth/logout/all').set('Authorization', user.auth).expect(204);

      await me(user.accessToken).expect(401);
      await me(other.accessToken).expect(401);
      await refresh(other.refreshToken).expect(401);
    });

    it('con un token invalido responde igual, sin confirmar nada', async () => {
      await http().post('/api/auth/logout').send({ refreshToken: 'no-es-un-token' }).expect(204);
    });

    it('el refresh mantiene la misma sesion: cerrarla despues corta tambien los tokens nuevos', async () => {
      const user = await registerUser(app);
      const first = (await login(user.email).expect(200)).body;
      const renewed = (await refresh(first.refreshToken).expect(200)).body;

      await http().post('/api/auth/logout').send({ refreshToken: first.refreshToken }).expect(204);

      await me(renewed.accessToken).expect(401);
      expect(await connection.collection('sessions').countDocuments({ revokedAt: { $exists: false } })).toBe(1);
    });

    it('rechaza los tokens sin sesion (emitidos antes de que existieran)', async () => {
      const user = await registerUser(app);
      const jwt = app.get(JwtService);
      const legacy = await jwt.signAsync(
        { sub: user.urn, email: user.email, type: 'access' },
        { secret: 'test-access-secret', expiresIn: 3600 },
      );
      const legacyRefresh = await jwt.signAsync(
        { sub: user.urn, email: user.email, type: 'refresh' },
        { secret: 'test-refresh-secret', expiresIn: 3600 },
      );

      await me(legacy).expect(401);
      await refresh(legacyRefresh).expect(401);
    });
  });

  describe('recuperar contraseña', () => {
    it('manda un link de un solo uso, cambia la contraseña y cierra todas las sesiones', async () => {
      const user = await registerUser(app);

      await http().post('/api/auth/password/forgot').send({ email: user.email.toUpperCase() }).expect(202);
      const mail = await mailer.lastTo(user.email);
      expect(mail?.text).toMatch(/\/reset-password#token=[A-Za-z0-9_-]{40,}/);
      const token = FakeMailer.tokenIn(mail);

      // En la base queda el hash, nunca el token.
      const stored = await connection.collection('password_resets').findOne({});
      expect(JSON.stringify(stored)).not.toContain(token);

      await http().post('/api/auth/password/reset').send({ token, password: 'otraClaveSegura2' }).expect(204);

      await me(user.accessToken).expect(401);
      await login(user.email).expect(401);
      await login(user.email, 'otraClaveSegura2').expect(200);

      const reused = await http()
        .post('/api/auth/password/reset')
        .send({ token, password: 'terceraClave3' })
        .expect(400);
      expect(reused.body.errorCode).toBe('INVALID_RESET_TOKEN');
    });

    it('responde lo mismo con un email que no existe, y no manda nada', async () => {
      await http().post('/api/auth/password/forgot').send({ email: 'nadie@opinara.test' }).expect(202);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mailer.sent).toHaveLength(0);
    });

    it('un pedido nuevo invalida el link anterior', async () => {
      const user = await registerUser(app);
      await http().post('/api/auth/password/forgot').send({ email: user.email }).expect(202);
      const first = FakeMailer.tokenIn(await mailer.lastTo(user.email));
      mailer.clear();
      await http().post('/api/auth/password/forgot').send({ email: user.email }).expect(202);
      const second = FakeMailer.tokenIn(await mailer.lastTo(user.email));

      await http().post('/api/auth/password/reset').send({ token: first, password: 'otraClaveSegura2' }).expect(400);
      await http().post('/api/auth/password/reset').send({ token: second, password: 'otraClaveSegura2' }).expect(204);
    });

    it('un link vencido no sirve', async () => {
      const user = await registerUser(app);
      await http().post('/api/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = FakeMailer.tokenIn(await mailer.lastTo(user.email));
      await connection
        .collection('password_resets')
        .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      await http().post('/api/auth/password/reset').send({ token, password: 'otraClaveSegura2' }).expect(400);
    });

    it('elegir la contraseña desde el mail tambien reemplaza la provisoria del alta', async () => {
      const user = await registerUser(app);
      await connection.collection('users').updateOne({ urn: user.urn }, { $set: { mustChangePassword: true } });
      await http().post('/api/auth/password/forgot').send({ email: user.email }).expect(202);
      const token = FakeMailer.tokenIn(await mailer.lastTo(user.email));

      await http().post('/api/auth/password/reset').send({ token, password: 'otraClaveSegura2' }).expect(204);

      const response = await login(user.email, 'otraClaveSegura2').expect(200);
      expect(response.body.user.mustChangePassword).toBe(false);
    });

    it('valida la contraseña nueva con las mismas reglas que el cambio de contraseña', async () => {
      await http()
        .post('/api/auth/password/reset')
        .send({ token: 'x'.repeat(43), password: 'corta' })
        .expect(400);
    });
  });
});
