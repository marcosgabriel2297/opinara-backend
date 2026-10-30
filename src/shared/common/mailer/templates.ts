import { MailMessage } from './mailer';

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

interface ActionMail {
  to: string;
  subject: string;
  /** Parrafos antes del boton. Texto plano: se escapa para el HTML. */
  paragraphs: string[];
  action: { label: string; url: string };
  /** Debajo del boton, en chico (por ejemplo, cuanto dura el link). */
  footnote: string;
}

/** Un mail con un boton, en texto y en HTML simple (sin imagenes ni estilos externos). */
export function actionMail({ to, subject, paragraphs, action, footnote }: ActionMail): MailMessage {
  const text = [...paragraphs, '', `${action.label}: ${action.url}`, '', footnote, '', '— Opinara'].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f6f3ec;font-family:Arial,sans-serif;color:#17201e">
<div style="max-width:480px;margin:0 auto;background:#fffdf8;border:1px solid #e3ded2;border-radius:12px;padding:28px">
${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escape(paragraph)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#0b6b60;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escape(action.label)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#5f5a50">${escape(footnote)}</p>
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#8a8478">Opinara</p>
</body></html>`;
  return { to, subject, text, html };
}
