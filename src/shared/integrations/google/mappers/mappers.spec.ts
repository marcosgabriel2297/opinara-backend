import { toGoogleAccount, toGoogleLocation } from './index';

describe('mappers de Google', () => {
  it('mapea una location completa y extrae el id de `locations/{id}`', () => {
    const mapped = toGoogleLocation({
      name: 'locations/12345',
      title: 'Sucursal Centro',
      storeCode: 'CENTRO',
      storefrontAddress: {
        addressLines: ['Av. Siempreviva 742'],
        locality: 'Springfield',
        administrativeArea: 'BA',
        postalCode: 'B1900',
      },
      metadata: {
        placeId: 'ChIJ123',
        mapsUri: 'https://maps.google.com/?cid=1',
        newReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJ123',
        hasVoiceOfMerchant: true,
      },
    });

    expect(mapped).toEqual({
      name: 'locations/12345',
      locationId: '12345',
      title: 'Sucursal Centro',
      storeCode: 'CENTRO',
      placeId: 'ChIJ123',
      mapsUri: 'https://maps.google.com/?cid=1',
      newReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJ123',
      address: 'Av. Siempreviva 742, Springfield, BA, B1900',
      hasVoiceOfMerchant: true,
    });
  });

  it('tolera una location sin metadata ni direccion', () => {
    const mapped = toGoogleLocation({ name: 'locations/9', title: 'Sin datos' });

    // newReviewUri ausente es un caso real: pasa con locations sin verificar.
    expect(mapped).toMatchObject({ newReviewUri: undefined, address: undefined, hasVoiceOfMerchant: false });
  });

  it('descarta recursos sin `name`, que es el identificador de Google', () => {
    expect(toGoogleLocation({ title: 'Sin nombre' })).toBeNull();
    expect(toGoogleAccount({ accountName: 'Sin nombre' })).toBeNull();
  });

  it('usa el nombre del recurso cuando falta el display name de la cuenta', () => {
    expect(toGoogleAccount({ name: 'accounts/77' })).toMatchObject({ displayName: 'accounts/77' });
  });
});
