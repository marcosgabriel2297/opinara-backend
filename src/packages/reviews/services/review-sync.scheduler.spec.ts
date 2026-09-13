import { Logger } from '@nestjs/common';

import config from '../config';
import { ReviewSyncScheduler } from './review-sync.scheduler';
import { ReviewSyncService } from './review-sync.service';

const summary = { locations: 1, imported: 2, updated: 0, unchanged: 0, deleted: 0, failed: 0 };

const buildScheduler = (syncAllLocations: jest.Mock) => ({
  scheduler: new ReviewSyncScheduler({ syncAllLocations } as unknown as ReviewSyncService),
  syncAllLocations,
});

describe('ReviewSyncScheduler', () => {
  const enabled = config.Sync.Enabled;

  beforeEach(() => {
    config.Sync.Enabled = true;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    config.Sync.Enabled = enabled;
    jest.restoreAllMocks();
  });

  it('dispara la sincronizacion incremental y la completa', async () => {
    const { scheduler, syncAllLocations } = buildScheduler(jest.fn().mockResolvedValue(summary));

    await scheduler.incremental();
    await scheduler.full();

    expect(syncAllLocations).toHaveBeenNthCalledWith(1, { full: false });
    expect(syncAllLocations).toHaveBeenNthCalledWith(2, { full: true });
  });

  it('no corre si esta deshabilitada por configuracion', async () => {
    config.Sync.Enabled = false;
    const { scheduler, syncAllLocations } = buildScheduler(jest.fn().mockResolvedValue(summary));

    await scheduler.incremental();

    expect(syncAllLocations).not.toHaveBeenCalled();
  });

  it('no arranca una corrida si la anterior sigue viva', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<typeof summary>((resolve) => {
      release = () => resolve(summary);
    });
    const { scheduler, syncAllLocations } = buildScheduler(jest.fn().mockReturnValue(pending));

    const first = scheduler.incremental();
    await scheduler.incremental();

    expect(syncAllLocations).toHaveBeenCalledTimes(1);

    release();
    await first;

    // Liberado el candado, el siguiente tick vuelve a correr.
    await scheduler.incremental();
    expect(syncAllLocations).toHaveBeenCalledTimes(2);
  });

  it('un fallo no propaga ni deja el candado tomado', async () => {
    const syncAllLocations = jest.fn().mockRejectedValueOnce(new Error('Google caido')).mockResolvedValue(summary);
    const { scheduler } = buildScheduler(syncAllLocations);

    await expect(scheduler.incremental()).resolves.toBeUndefined();

    await scheduler.incremental();
    expect(syncAllLocations).toHaveBeenCalledTimes(2);
  });
});
