import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';

import { MAILER } from '@shared/common/mailer';

import { createTestApp } from '../../../test/app.factory';
import { TestUser, createBusiness, registerUser } from '../../../test/helpers';
import { FakeMailer } from '../../../test/mailer.fake';

describe('Equipo e invitaciones (integracion)', () => {
  let app: INestApplication;
  let connection: Connection;
  let close: () => Promise<void>;
  const mailer = new FakeMailer();
  let owner: TestUser;
  let business: { urn: string; slug: string };

  beforeAll(async () => {
    ({ app, connection, close } = await createTestApp({}, [{ token: MAILER, value: mailer }]));
  }, 120000);

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    owner = await registerUser(app);
    business = await createBusiness(app, owner, { name: 'Café de la Esquina' });
  });

  afterEach(async () => {
    mailer.clear();
    await Promise.all(
      ['users', 'sessions', 'businesses', 'business_members', 'business_invitations'].map((name) =>
        connection.collection(name).deleteMany({}),
      ),
    );
  });

  const http = () => request(app.getHttpServer());
  const invite = (by: TestUser, email: string, role = 'MEMBER') =>
    http().post(`/api/businesses/${business.urn}/invitations`).set('Authorization', by.auth).send({ email, role });
  const team = (by: TestUser) => http().get(`/api/businesses/${business.urn}/members`).set('Authorization', by.auth);
  const accept = (by: TestUser, token: string) =>
    http().post('/api/invitations/accept').set('Authorization', by.auth).send({ token });
  const tokenFrom = (inviteUrl: string) => inviteUrl.split('#token=')[1] ?? '';

  /** Invita y acepta: deja a `user` en el negocio con ese rol. */
  const join = async (user: TestUser, role = 'MEMBER') => {
    const { body } = await invite(owner, user.email, role).expect(201);
    await accept(user, tokenFrom(body.inviteUrl)).expect(200);
  };

  it('invita por mail, la invitacion se ve antes de aceptar, y al aceptarla suma al usuario', async () => {
    const invited = await registerUser(app, 'gerente@opinara.test');
    const response = await invite(owner, 'Gerente@Opinara.test', 'ADMIN').expect(201);
    expect(response.body.invitation).toMatchObject({ email: 'gerente@opinara.test', role: 'ADMIN' });
    expect(response.body.inviteUrl).toMatch(/\/invitations#token=[A-Za-z0-9_-]{40,}$/);
    const token = tokenFrom(response.body.inviteUrl);

    const mail = await mailer.lastTo('gerente@opinara.test');
    expect(mail?.subject).toContain('Café de la Esquina');
    expect(FakeMailer.tokenIn(mail)).toBe(token);
    const stored = await connection.collection('business_invitations').findOne({});
    expect(JSON.stringify(stored)).not.toContain(token);

    const lookup = await http().post('/api/invitations/lookup').send({ token }).expect(200);
    expect(lookup.body).toMatchObject({
      status: 'PENDING',
      email: 'gerente@opinara.test',
      role: 'ADMIN',
      businessName: 'Café de la Esquina',
      accountExists: true,
    });

    const accepted = await accept(invited, token).expect(200);
    expect(accepted.body).toMatchObject({ urn: business.urn, role: 'ADMIN' });

    await http().get(`/api/businesses/${business.urn}`).set('Authorization', invited.auth).expect(200);
    const after = await http().post('/api/invitations/lookup').send({ token }).expect(200);
    expect(after.body.status).toBe('ACCEPTED');
    await accept(invited, token).expect(400);
  });

  it('solo la acepta quien entro con el email invitado', async () => {
    await registerUser(app, 'empleada@opinara.test');
    const { body } = await invite(owner, 'empleada@opinara.test').expect(201);
    const other = await registerUser(app, 'otra@opinara.test');

    const response = await accept(other, tokenFrom(body.inviteUrl)).expect(403);
    expect(response.body.errorCode).toBe('INVITATION_EMAIL_MISMATCH');
  });

  it('una invitacion vencida o revocada no sirve; invitar de nuevo reemplaza la anterior', async () => {
    const invited = await registerUser(app, 'empleada@opinara.test');
    const first = (await invite(owner, 'empleada@opinara.test').expect(201)).body;
    const second = (await invite(owner, 'empleada@opinara.test').expect(201)).body;

    expect((await accept(invited, tokenFrom(first.inviteUrl)).expect(400)).body.errorCode).toBe('INVITATION_INVALID');

    await connection
      .collection('business_invitations')
      .updateOne({ urn: second.invitation.urn }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await http()
      .post('/api/invitations/lookup')
      .send({ token: tokenFrom(second.inviteUrl) })
      .expect(200);
    expect(expired.body.status).toBe('EXPIRED');
    await accept(invited, tokenFrom(second.inviteUrl)).expect(400);

    const third = (await invite(owner, 'empleada@opinara.test').expect(201)).body;
    await http()
      .delete(`/api/businesses/${business.urn}/invitations/${third.invitation.urn}`)
      .set('Authorization', owner.auth)
      .expect(204);
    await accept(invited, tokenFrom(third.inviteUrl)).expect(400);
  });

  it('solo invita a quien ya tiene cuenta: no hay registro publico', async () => {
    const response = await invite(owner, 'sin-cuenta@opinara.test').expect(400);
    expect(response.body.errorCode).toBe('INVITEE_NOT_REGISTERED');
    expect(await connection.collection('business_invitations').countDocuments()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('no invita a quien ya es miembro', async () => {
    const response = await invite(owner, owner.email).expect(409);
    expect(response.body.errorCode).toBe('MEMBER_ALREADY_EXISTS');
  });

  it('el equipo lista miembros; las invitaciones pendientes solo las ven OWNER y ADMIN', async () => {
    const member = await registerUser(app);
    await join(member);
    await registerUser(app, 'pendiente@opinara.test');
    await invite(owner, 'pendiente@opinara.test').expect(201);

    const asOwner = await team(owner).expect(200);
    expect(asOwner.body.members.map((m: { role: string }) => m.role)).toEqual(['OWNER', 'MEMBER']);
    expect(asOwner.body.members[1].user).toMatchObject({ email: member.email });
    expect(asOwner.body.invitations).toHaveLength(1);
    expect(JSON.stringify(asOwner.body)).not.toMatch(/token/i);

    const asMember = await team(member).expect(200);
    expect(asMember.body.members).toHaveLength(2);
    expect(asMember.body.invitations).toEqual([]);
  });

  describe('permisos', () => {
    it('un ADMIN invita solo MEMBER, y un MEMBER no invita', async () => {
      const admin = await registerUser(app);
      await join(admin, 'ADMIN');
      const member = await registerUser(app);
      await join(member);
      await registerUser(app, 'x@opinara.test');
      await registerUser(app, 'y@opinara.test');

      expect((await invite(admin, 'x@opinara.test', 'ADMIN').expect(403)).body.errorCode).toBe(
        'MEMBER_ROLE_NOT_ALLOWED',
      );
      await invite(admin, 'x@opinara.test', 'MEMBER').expect(201);
      await invite(member, 'y@opinara.test').expect(403);
      await invite(owner, 'z@opinara.test', 'OWNER').expect(400);
    });

    it('solo el OWNER cambia roles, y al OWNER nadie le cambia el rol', async () => {
      const admin = await registerUser(app);
      await join(admin, 'ADMIN');
      const member = await registerUser(app);
      await join(member);
      const { body } = await team(owner);
      const memberUrn = body.members.find((m: { user: { email: string } }) => m.user.email === member.email).urn;
      const ownerUrn = body.members.find((m: { role: string }) => m.role === 'OWNER').urn;

      const patch = (by: TestUser, urn: string, role: string) =>
        http().patch(`/api/businesses/${business.urn}/members/${urn}`).set('Authorization', by.auth).send({ role });

      await patch(admin, memberUrn, 'ADMIN').expect(403);
      const promoted = await patch(owner, memberUrn, 'ADMIN').expect(200);
      expect(promoted.body).toMatchObject({ role: 'ADMIN', user: { email: member.email } });
      await patch(owner, ownerUrn, 'MEMBER').expect(403);
    });

    it('sacar: el OWNER a cualquiera, un ADMIN solo a MEMBER, y cualquiera se puede ir', async () => {
      const admin = await registerUser(app);
      await join(admin, 'ADMIN');
      const member = await registerUser(app);
      await join(member);
      const leaver = await registerUser(app);
      await join(leaver);
      const { body } = await team(owner);
      const urnOf = (user: TestUser) =>
        body.members.find((m: { user: { email: string } }) => m.user.email === user.email).urn;
      const ownerUrn = body.members.find((m: { role: string }) => m.role === 'OWNER').urn;
      const remove = (by: TestUser, urn: string) =>
        http().delete(`/api/businesses/${business.urn}/members/${urn}`).set('Authorization', by.auth);

      await remove(member, urnOf(admin)).expect(403);
      await remove(admin, ownerUrn).expect(403);
      await remove(owner, ownerUrn).expect(403);

      await remove(leaver, urnOf(leaver)).expect(204);
      await http().get(`/api/businesses/${business.urn}`).set('Authorization', leaver.auth).expect(404);

      await remove(admin, urnOf(member)).expect(204);
      await remove(owner, urnOf(admin)).expect(204);
      expect((await team(owner)).body.members).toHaveLength(1);
    });

    it('quien se fue puede volver con una invitacion nueva', async () => {
      const member = await registerUser(app);
      await join(member);
      const { body } = await team(owner);
      const urn = body.members.find((m: { user: { email: string } }) => m.user.email === member.email).urn;
      await http()
        .delete(`/api/businesses/${business.urn}/members/${urn}`)
        .set('Authorization', member.auth)
        .expect(204);

      await join(member, 'ADMIN');
      const again = await team(owner);
      expect(again.body.members.find((m: { urn: string }) => m.urn === urn)).toMatchObject({ role: 'ADMIN' });
    });

    it('un usuario ajeno no ve ni toca el equipo', async () => {
      const stranger = await registerUser(app);
      await team(stranger).expect(404);
      await invite(stranger, 'x@opinara.test').expect(404);
    });
  });

  it('un token inventado no existe', async () => {
    const response = await http()
      .post('/api/invitations/lookup')
      .send({ token: 'x'.repeat(43) })
      .expect(404);
    expect(response.body.errorCode).toBe('INVITATION_NOT_FOUND');
  });
});
