import { Logger } from '@nestjs/common';

import { isDevelopment } from '@shared/environment';

import { Mailer, MailMessage } from './mailer';

/**
 * Sin proveedor configurado. En desarrollo escribe el mail (con su link) en el log: alcanza para
 * probar la recuperacion de contraseña o una invitacion sin mandar nada. En produccion no escribe
 * el contenido, porque lleva tokens: solo avisa que no hay proveedor.
 */
export class LogMailer implements Mailer {
  private readonly logger = new Logger(LogMailer.name);

  send(message: MailMessage): Promise<void> {
    if (isDevelopment()) {
      this.logger.log(`Mail para ${message.to} — ${message.subject}\n${message.text}`);
    } else {
      this.logger.error(`Sin proveedor de mail configurado (MAIL_RESEND_API_KEY): no se envio "${message.subject}"`);
    }
    return Promise.resolve();
  }
}
