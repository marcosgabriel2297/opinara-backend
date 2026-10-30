export interface MailMessage {
  to: string;
  subject: string;
  /** Siempre hay version de texto: algunos clientes (y los filtros de spam) la prefieren. */
  text: string;
  html: string;
}

export const MAILER = Symbol('MAILER');

/**
 * Lo unico que el resto del backend sabe de los mails. El proveedor se elige en `MailerModule`;
 * cambiarlo es escribir otra implementacion de esto.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
