import { GoogleHttpService } from './google-http.service';
import { GoogleNotificationsService } from './google-notifications.service';

const URL = 'https://mybusinessnotifications.googleapis.com/v1/accounts/111/notificationSetting';

const buildService = () => {
  const http = { get: jest.fn(), patch: jest.fn() };
  return { service: new GoogleNotificationsService(http as unknown as GoogleHttpService), http };
};

describe('GoogleNotificationsService', () => {
  it('lee la configuracion de avisos de la cuenta en la ruta documentada', async () => {
    const { service, http } = buildService();
    http.get.mockResolvedValue({ name: 'accounts/111/notificationSetting' });

    const setting = await service.getNotificationSetting('ya29.token', 'accounts/111');

    expect(http.get).toHaveBeenCalledWith('notifications.getNotificationSetting', URL, 'ya29.token');
    expect(setting).toEqual({
      name: 'accounts/111/notificationSetting',
      pubsubTopic: undefined,
      notificationTypes: [],
    });
  });

  it('actualiza topic y tipos con su updateMask', async () => {
    const { service, http } = buildService();
    http.patch.mockResolvedValue({ pubsubTopic: 'projects/opinara/topics/gbp', notificationTypes: ['NEW_REVIEW'] });

    await service.updateNotificationSetting('ya29.token', 'accounts/111', {
      pubsubTopic: 'projects/opinara/topics/gbp',
      notificationTypes: ['NEW_REVIEW', 'UPDATED_REVIEW'],
    });

    expect(http.patch).toHaveBeenCalledWith(
      'notifications.updateNotificationSetting',
      URL,
      'ya29.token',
      {
        name: 'accounts/111/notificationSetting',
        pubsubTopic: 'projects/opinara/topics/gbp',
        notificationTypes: ['NEW_REVIEW', 'UPDATED_REVIEW'],
      },
      { updateMask: 'pubsubTopic,notificationTypes' },
    );
  });

  it('no arma una ruta con un nombre de cuenta invalido', async () => {
    const { service, http } = buildService();

    await expect(service.getNotificationSetting('token', 'accounts/1/../../otra')).rejects.toThrow();
    expect(http.get).not.toHaveBeenCalled();
  });
});
