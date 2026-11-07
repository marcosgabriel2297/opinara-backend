import { MailMessage, actionMail } from '@shared/common/mailer';

import config from '../config';

export interface CardMailContext {
  to: string;
  name: string;
  businessName: string;
  locationTitle: string;
  rewardDescription: string;
  stampsRequired: number;
  cardToken: string;
}

const place = (context: CardMailContext) => `${context.businessName} (${context.locationTitle})`;

/** Ninguno de estos mails habla de reseñas: la fidelizacion no se cruza con ellas (ver `FIDELIZACION.md`). */
export const welcomeMail = (context: CardMailContext): MailMessage =>
  actionMail({
    to: context.to,
    subject: `Tu tarjeta de ${context.businessName}`,
    paragraphs: [
      `¡Hola, ${context.name}! Ya tenés tu tarjeta de sellos de ${place(context)}.`,
      `Con ${String(context.stampsRequired)} sellos: ${context.rewardDescription}. En cada compra, mostrá el QR de la tarjeta en la caja.`,
    ],
    action: { label: 'Abrir mi tarjeta', url: config.CardUrl(context.cardToken) },
    footnote: 'Guardá este mail: el link es tu tarjeta. Desde la tarjeta también podés borrar tus datos.',
  });

export const cardLinkMail = (context: CardMailContext): MailMessage =>
  actionMail({
    to: context.to,
    subject: `El link de tu tarjeta de ${context.businessName}`,
    paragraphs: [`Hola, ${context.name}. Acá está el link de tu tarjeta de sellos de ${place(context)}.`],
    action: { label: 'Abrir mi tarjeta', url: config.CardUrl(context.cardToken) },
    footnote: 'Si no lo pediste, podés ignorar este mail.',
  });

export const rewardMail = (context: CardMailContext): MailMessage =>
  actionMail({
    to: context.to,
    subject: `¡Ya tenés tu premio en ${context.businessName}!`,
    paragraphs: [
      `¡${context.name}, completaste los ${String(context.stampsRequired)} sellos de ${place(context)}!`,
      `Tu premio: ${context.rewardDescription}. Pedilo en la caja la próxima vez que vayas.`,
    ],
    action: { label: 'Ver mi tarjeta', url: config.CardUrl(context.cardToken) },
    footnote: 'El premio se canjea en la misma sucursal de la tarjeta.',
  });
