import { Global, Module } from '@nestjs/common';

import SharedConfig from '@shared/config';

import { LogMailer } from './log.mailer';
import { MAILER } from './mailer';
import { ResendMailer } from './resend.mailer';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: () =>
        SharedConfig.Mail.ResendApiKey !== undefined
          ? new ResendMailer(SharedConfig.Mail.ResendApiKey, SharedConfig.Mail.From)
          : new LogMailer(),
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
