import { Injectable } from '@nestjs/common';

import { GoogleNotificationSetting, GoogleNotificationsAdapter } from '../adapters';
import { NotificationSettingResponse } from '../dtos';
import { GoogleEndpoints } from '../endpoints';
import { GoogleHttpService } from './google-http.service';

/** Los dos campos que se escriben siempre juntos: topic y tipos de aviso. */
const UPDATE_MASK = 'pubsubTopic,notificationTypes';

/**
 * My Business Notifications API v1. Una cuenta de Google tiene una sola configuracion de avisos:
 *
 *   GET   /v1/accounts/{a}/notificationSetting
 *   PATCH /v1/accounts/{a}/notificationSetting?updateMask=pubsubTopic,notificationTypes
 *
 * Para dejar de recibir avisos, Google pide el mismo PATCH con el topic vacio.
 */
@Injectable()
export class GoogleNotificationsService implements GoogleNotificationsAdapter {
  constructor(private readonly http: GoogleHttpService) {}

  async getNotificationSetting(accessToken: string, accountName: string): Promise<GoogleNotificationSetting> {
    const response = await this.http.get<NotificationSettingResponse>(
      'notifications.getNotificationSetting',
      this.settingUrl(accountName),
      accessToken,
    );

    return this.toSetting(response);
  }

  async updateNotificationSetting(
    accessToken: string,
    accountName: string,
    setting: { pubsubTopic: string; notificationTypes: string[] },
  ): Promise<GoogleNotificationSetting> {
    const response = await this.http.patch<NotificationSettingResponse>(
      'notifications.updateNotificationSetting',
      this.settingUrl(accountName),
      accessToken,
      { name: `${accountName}/notificationSetting`, ...setting },
      { updateMask: UPDATE_MASK },
    );

    return this.toSetting(response);
  }

  /** `accountName` llega como `accounts/{id}`: se valida para no armar una ruta arbitraria. */
  private settingUrl(accountName: string): string {
    const match = /^accounts\/([^/]+)$/.exec(accountName);
    if (!match) {
      throw new Error(`Invalid Google account name: ${accountName}`);
    }

    return `${GoogleEndpoints.Notifications}/accounts/${encodeURIComponent(match[1])}/notificationSetting`;
  }

  private toSetting(response: NotificationSettingResponse): GoogleNotificationSetting {
    return {
      name: response.name,
      pubsubTopic: response.pubsubTopic || undefined,
      notificationTypes: response.notificationTypes ?? [],
    };
  }
}
