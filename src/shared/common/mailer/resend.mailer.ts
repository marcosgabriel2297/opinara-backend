import { Logger } from '@nestjs/common';

import { Mailer, MailMessage } from './mailer';

const RESEND_URL = 'https://api.resend.com/emails';

/** Envio por la API HTTP de Resend, con `fetch`: sin dependencias. */
export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // El cuerpo puede traer detalles del proveedor: al log, no al cliente.
      this.logger.error(`Resend respondio ${response.status}: ${await response.text()}`);
      throw new Error('No se pudo enviar el mail');
    }
  }
}
