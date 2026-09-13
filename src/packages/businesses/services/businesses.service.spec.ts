import { Test } from '@nestjs/testing';

import { BusinessMembersRepository, BusinessesRepository } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { BusinessesService } from './businesses.service';

const USER = { urn: 'urn:user:44444444-4444-4444-4444-444444444444', email: 'due@no.test' };

const buildService = async (overrides: {
  business?: Partial<jest.Mocked<BusinessesRepository>>;
  members?: Partial<jest.Mocked<BusinessMembersRepository>>;
}) => {
  const businesses = {
    findBySlug: jest.fn().mockResolvedValue(null),
    createOrUpdate: jest.fn().mockImplementation((entity: Record<string, unknown>) => Promise.resolve(entity)),
    deleteOne: jest.fn().mockResolvedValue(undefined),
    findByUrns: jest.fn().mockResolvedValue([]),
    one: jest.fn().mockResolvedValue(null),
    ...overrides.business,
  };
  const members = {
    createOrUpdate: jest.fn().mockImplementation((entity: Record<string, unknown>) => Promise.resolve(entity)),
    findActiveByUser: jest.fn().mockResolvedValue([]),
    findActiveMembership: jest.fn().mockResolvedValue(null),
    ...overrides.members,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      BusinessesService,
      { provide: BusinessesRepository, useValue: businesses },
      { provide: BusinessMembersRepository, useValue: members },
    ],
  }).compile();

  return { service: moduleRef.get(BusinessesService), businesses, members };
};

describe('BusinessesService', () => {
  it('borra el business si falla la creacion de la membresia del owner', async () => {
    const { service, businesses } = await buildService({
      members: { createOrUpdate: jest.fn().mockRejectedValue(new Error('mongo caido')) },
    });

    await expect(service.create(USER, { name: 'Negocio Huerfano' })).rejects.toThrow('mongo caido');

    // Sin esta compensacion quedaria un business que nadie puede ver ni administrar.
    expect(businesses.deleteOne).toHaveBeenCalledWith({ urn: expect.stringMatching(/^urn:business:/) });
  });

  it('deriva el slug del nombre y crea la membresia OWNER', async () => {
    const { service, members } = await buildService({});

    const result = await service.create(USER, { name: '  Café  de la  Esquina  ' });

    expect(result.slug).toBe('cafe-de-la-esquina');
    expect(result.role).toBe(BusinessMemberRole.OWNER);
    expect(members.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userUrn: USER.urn, role: BusinessMemberRole.OWNER, businessUrn: result.urn }),
    );
  });

  it('rechaza nombres que no producen un slug utilizable', async () => {
    const { service } = await buildService({});

    await expect(service.create(USER, { name: '!!!' })).rejects.toMatchObject({ status: 400 });
  });
});
