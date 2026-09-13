/**
 * Slug url-safe a partir de un nombre libre. Se usa para `business.slug` y `campaign.slug`,
 * que forman parte de la URL publica del QR.
 */
export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const toBoolean = (value: string | undefined): boolean => value === 'true' || value === '1';
