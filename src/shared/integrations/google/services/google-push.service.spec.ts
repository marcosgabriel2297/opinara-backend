import { LoginTicket, OAuth2Client, TokenPayload } from 'google-auth-library';

import config from '../config';
import { GooglePushService } from './google-push.service';

const push = (notification: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(notification)).toString('base64'), messageId: '1' },
  subscription: 'projects/opinara/subscriptions/gbp',
});

describe('GooglePushService', () => {
  const service = new GooglePushService();

  describe('parse', () => {
    it('lee la sucursal del aviso de reseña nueva (camelCase)', () => {
      expect(
        service.parse(
          push({
            type: 'NEW_REVIEW',
            locationName: 'accounts/111/locations/555',
            reviewName: 'accounts/111/locations/555/reviews/abc',
          }),
        ),
      ).toEqual({ accountName: 'accounts/111', locationId: '555' });
    });

    it('acepta los nombres de campo como los escribe la referencia (snake_case)', () => {
      expect(service.parse(push({ location_name: 'accounts/111/locations/555' }))).toEqual({
        accountName: 'accounts/111',
        locationId: '555',
      });
    });

    it('acepta la sucursal sin cuenta (formato de la API v1)', () => {
      expect(service.parse(push({ locationName: 'locations/555' }))).toEqual({
        accountName: undefined,
        locationId: '555',
      });
    });

    it('si solo viene la reseña, saca la sucursal de su nombre', () => {
      expect(service.parse(push({ review: 'accounts/111/locations/555/reviews/abc' }))).toEqual({
        accountName: 'accounts/111',
        locationId: '555',
      });
    });

    it('prefiere el campo de la sucursal a cualquier otro', () => {
      expect(
        service.parse(push({ reviewName: 'accounts/9/locations/9/reviews/x', locationName: 'accounts/1/locations/2' })),
      ).toEqual({ accountName: 'accounts/1', locationId: '2' });
    });

    it.each([
      ['sin cuerpo', undefined],
      ['sin mensaje', {}],
      ['data que no es base64 de un JSON', { message: { data: '%%%no-es-json' } }],
      ['JSON que no es un objeto', push('texto')],
      ['sin ninguna sucursal', push({ type: 'NEW_REVIEW', reviewName: 'otra-cosa' })],
    ])('devuelve null %s', (_case, body) => {
      expect(service.parse(body)).toBeNull();
    });
  });

  describe('verify', () => {
    const original = { ...config.Notifications };

    afterEach(() => {
      Object.assign(config.Notifications, original);
    });

    it('rechaza un pedido sin token', async () => {
      Object.assign(config.Notifications, { Audience: 'https://api/notifications', PushServiceAccount: 'push@x' });

      await expect(service.verify(undefined)).resolves.toBe(false);
      await expect(service.verify('Basic abc')).resolves.toBe(false);
    });

    it('rechaza todo si no esta configurada la audiencia o la cuenta de servicio', async () => {
      Object.assign(config.Notifications, { Audience: '', PushServiceAccount: '' });

      await expect(service.verify('Bearer algo')).resolves.toBe(false);
    });

    describe('con el token verificado por la libreria de Google', () => {
      const ticket = (payload: Partial<TokenPayload>) =>
        ({ getPayload: () => payload as TokenPayload }) as unknown as LoginTicket;

      beforeEach(() => {
        Object.assign(config.Notifications, { Audience: 'https://api/notifications', PushServiceAccount: 'push@x' });
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('acepta el token de la cuenta de servicio de la suscripcion, con nuestra audiencia', async () => {
        const verifySpy = jest
          .spyOn(OAuth2Client.prototype, 'verifyIdToken')
          .mockImplementation(async () => ticket({ email: 'push@x', email_verified: true }));

        await expect(service.verify('Bearer jwt')).resolves.toBe(true);
        expect(verifySpy).toHaveBeenCalledWith({ idToken: 'jwt', audience: 'https://api/notifications' });
      });

      it.each([
        ['de otra cuenta de servicio', { email: 'otra@x', email_verified: true }],
        ['con el mail sin verificar', { email: 'push@x', email_verified: false }],
      ])('rechaza un token valido pero %s', async (_case, payload) => {
        jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async () => ticket(payload));

        await expect(service.verify('Bearer jwt')).resolves.toBe(false);
      });

      it('rechaza un token con firma o audiencia invalida', async () => {
        jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async () => {
          throw new Error('Wrong recipient');
        });

        await expect(service.verify('Bearer jwt')).resolves.toBe(false);
      });
    });
  });
});
