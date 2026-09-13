import { GoogleHttpService } from './google-http.service';
import { GoogleReviewsService } from './google-reviews.service';

const REF = { accountName: 'accounts/111', locationId: '555' };
const BASE = 'https://mybusiness.googleapis.com/v4/accounts/111/locations/555';

const buildService = () => {
  const http = { get: jest.fn(), put: jest.fn(), delete: jest.fn() };
  return { service: new GoogleReviewsService(http as unknown as GoogleHttpService), http };
};

describe('GoogleReviewsService', () => {
  it('lista reseñas contra la ruta documentada de la API v4.9', async () => {
    const { service, http } = buildService();
    http.get.mockResolvedValue({ reviews: [], totalReviewCount: 0 });

    await service.listReviews('ya29.token', REF, { orderBy: 'updateTime desc' });

    expect(http.get).toHaveBeenCalledWith('reviews.list', `${BASE}/reviews`, 'ya29.token', {
      pageSize: 50,
      pageToken: undefined,
      orderBy: 'updateTime desc',
    });
  });

  it('respeta el tope de 50 por pagina que impone Google', async () => {
    const { service, http } = buildService();
    http.get.mockResolvedValue({ reviews: [] });

    await service.listReviews('token', REF, { pageSize: 500 });

    expect(http.get.mock.calls[0][3]).toMatchObject({ pageSize: 50 });
  });

  it('mapea el enum de rating y la reseña anonima', async () => {
    const { service, http } = buildService();
    http.get.mockResolvedValue({
      reviews: [
        {
          reviewId: 'r1',
          name: `${BASE}/reviews/r1`,
          starRating: 'FOUR',
          comment: 'Muy bueno',
          createTime: '2026-09-01T10:00:00Z',
          updateTime: '2026-09-02T11:00:00Z',
          reviewer: { displayName: 'Ana', profilePhotoUrl: 'https://foto', isAnonymous: false },
          reviewReply: { comment: 'Gracias!', updateTime: '2026-09-03T09:00:00Z' },
        },
        {
          reviewId: 'r2',
          name: `${BASE}/reviews/r2`,
          starRating: 'ONE',
          createTime: '2026-09-01T10:00:00Z',
          updateTime: '2026-09-01T10:00:00Z',
          reviewer: { displayName: 'Deberia ocultarse', isAnonymous: true },
        },
        // Sin reviewId no hay forma de identificarla: se descarta.
        { name: `${BASE}/reviews/r3`, starRating: 'FIVE' },
      ],
    });

    const page = await service.listReviews('token', REF);

    expect(page.reviews).toHaveLength(2);
    expect(page.reviews[0]).toMatchObject({
      reviewId: 'r1',
      starRating: 4,
      starRatingRaw: 'FOUR',
      reply: { comment: 'Gracias!' },
    });
    expect(page.reviews[0].createTime.toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(page.reviews[1]).toMatchObject({
      starRating: 1,
      reviewer: { isAnonymous: true, displayName: undefined, profilePhotoUrl: undefined },
    });
  });

  it('responde con PUT sobre /reply, que en Google crea o actualiza', async () => {
    const { service, http } = buildService();
    http.put.mockResolvedValue({ comment: 'Gracias!', updateTime: '2026-09-13T12:00:00Z' });

    const reply = await service.updateReply('token', REF, 'r1', 'Gracias!');

    expect(http.put).toHaveBeenCalledWith('reviews.updateReply', `${BASE}/reviews/r1/reply`, 'token', {
      comment: 'Gracias!',
    });
    expect(reply.comment).toBe('Gracias!');
  });

  it('borra la respuesta con DELETE sobre /reply', async () => {
    const { service, http } = buildService();
    http.delete.mockResolvedValue(undefined);

    await service.deleteReply('token', REF, 'r1');

    expect(http.delete).toHaveBeenCalledWith('reviews.deleteReply', `${BASE}/reviews/r1/reply`, 'token');
  });

  it('escapa el id de la reseña en la ruta', async () => {
    const { service, http } = buildService();
    http.get.mockResolvedValue({ reviewId: 'a/b', name: 'x', starRating: 'FIVE' });

    await service.getReview('token', REF, 'a/b');

    expect(http.get.mock.calls[0][1]).toBe(`${BASE}/reviews/a%2Fb`);
  });
});
