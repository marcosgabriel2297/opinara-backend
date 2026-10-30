import { Mailer, MailMessage } from '../src/shared/common/mailer';

/** Guarda los mails en vez de mandarlos: los tests leen el link de ahi. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** El ultimo mail para esa direccion, esperando un poco: algunos se mandan sin bloquear la respuesta. */
  async lastTo(to: string): Promise<MailMessage | undefined> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const found = [...this.sent].reverse().find((message) => message.to === to);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return undefined;
  }

  /** El token del link (va despues de `#token=`). */
  static tokenIn(message: MailMessage | undefined): string {
    const match = /#token=([A-Za-z0-9_-]+)/.exec(message?.text ?? '');
    if (!match?.[1]) throw new Error('El mail no tiene link con token');
    return match[1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
