/**
 * Crea un administrador de la plataforma: el que da de alta a los usuarios.
 *
 *   yarn admin:create <email> "<nombre>"
 *
 * Genera una contraseña aleatoria y la muestra una sola vez. Si ya existe un admin con ese
 * email, no hace nada.
 */
import mongoose from 'mongoose';

import '@shared/environment';
import { generatePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { UserStatus } from '@shared/models/enums/user';
import { ADMIN_ENTITY, Admin, AdminSchema } from '@packages/admin';

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME ?? 'opinara';
const [email, name] = process.argv.slice(2).map((value) => value.trim());

if (!uri) {
  console.error('Falta DATABASE_URI en .env.dev');
  process.exit(1);
}

if (!email?.includes('@') || !name) {
  console.error('Uso: yarn admin:create <email> "<nombre>"');
  process.exit(1);
}

async function createAdmin(): Promise<void> {
  const connection = await mongoose.createConnection(uri as string, { dbName }).asPromise();
  const Admins = connection.model(Admin.name, AdminSchema);

  try {
    if (await Admins.exists({ email: email.toLowerCase() })) {
      console.error(`Ya existe un administrador con el email ${email}.`);
      process.exitCode = 1;
      return;
    }

    const password = generatePassword();
    await Admins.create({
      urn: Urn.createUUID(ADMIN_ENTITY),
      email,
      name,
      password: await hashPassword(password),
      status: UserStatus.ACTIVE,
    });

    console.log(`Administrador creado: ${email}`);
    console.log(`Contraseña (no se vuelve a mostrar): ${password}`);
  } finally {
    await connection.close();
  }
}

createAdmin().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
