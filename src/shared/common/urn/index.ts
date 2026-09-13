import { randomUUID } from 'crypto';

/**
 * Identidad publica de las entidades: `urn:<entity>:<uuid>`.
 * Se exponen URNs en la API (nunca ObjectIds) para no filtrar informacion del storage
 * y para que los ids no sean enumerables.
 */
export class Urn {
  private static readonly MAX_LENGTH = 255;

  static createUUID(entity: string): string {
    return Urn.compose({ entity, id: randomUUID() });
  }

  static compose(parts: { entity: string; id: string }): string {
    const { entity, id } = parts;
    if (!entity || !id) {
      throw new Error("Cannot compose URN: 'entity' and 'id' are required");
    }

    const urn = `urn:${encodeURIComponent(entity)}:${encodeURIComponent(id)}`;
    if (urn.length > Urn.MAX_LENGTH) {
      throw new Error(`Composed URN is too long (${urn.length} chars, max ${Urn.MAX_LENGTH})`);
    }

    return urn;
  }

  static parse(urn: string): { entity: string; id: string } {
    if (!urn.toLowerCase().startsWith('urn:')) {
      throw new Error("Invalid URN: must start with the 'urn:' scheme");
    }

    const [entity, id, ...rest] = urn.substring(4).split(':');
    if (!entity || !id || rest.length > 0) {
      throw new Error('Invalid URN: expected format urn:<entity>:<id>');
    }

    return { entity: decodeURIComponent(entity), id: decodeURIComponent(id) };
  }

  static entity(urn: string): string {
    return Urn.parse(urn).entity;
  }

  static id(urn: string): string {
    return Urn.parse(urn).id;
  }

  static isValid(urn: string, entity?: string): boolean {
    if (!urn || urn.length > Urn.MAX_LENGTH) {
      return false;
    }

    try {
      const parsed = Urn.parse(urn);
      return entity === undefined ? true : parsed.entity === entity;
    } catch {
      return false;
    }
  }
}
