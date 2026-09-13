export enum BusinessStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/** Rol dentro de un business. OWNER es quien lo creo; hoy solo OWNER puede tocar la conexion con Google. */
export enum BusinessMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum BusinessMemberStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}
