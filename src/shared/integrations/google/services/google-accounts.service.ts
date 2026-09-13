import { Injectable } from '@nestjs/common';

import { GoogleAccount, GoogleAccountsAdapter } from '../adapters';
import { ListAccountsResponse } from '../dtos';
import { GoogleEndpoints, GoogleLimits } from '../endpoints';
import { toGoogleAccount } from '../mappers';
import { GoogleHttpService } from './google-http.service';

/**
 * My Business Account Management API v1.
 * GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 */
@Injectable()
export class GoogleAccountsService implements GoogleAccountsAdapter {
  constructor(private readonly http: GoogleHttpService) {}

  async listAccounts(accessToken: string): Promise<GoogleAccount[]> {
    const accounts: GoogleAccount[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.http.get<ListAccountsResponse>(
        'accounts.list',
        `${GoogleEndpoints.AccountManagement}/accounts`,
        accessToken,
        { pageSize: GoogleLimits.AccountsPageSize, pageToken },
      );

      for (const account of response.accounts ?? []) {
        const mapped = toGoogleAccount(account);
        if (mapped) {
          accounts.push(mapped);
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return accounts;
  }
}
