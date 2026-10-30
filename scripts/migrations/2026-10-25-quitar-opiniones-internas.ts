/**
 * Quita de la base lo que quedo de las opiniones internas, que dejaron de existir cuando el QR
 * paso a llevar directo a Google (2026-10-25):
 *
 * - la coleccion `feedback`, con sus indices;
 * - el contador `stats.feedbacks` de cada campaña.
 *
 * El codigo ya no lee ninguna de las dos cosas, asi que se puede correr en cualquier momento.
 * Es idempotente. Por defecto solo muestra lo que haria; con `--apply` borra.
 *
 *   DATABASE_NAME=opinara_piloto yarn db:quitar-opiniones            # ver
 *   DATABASE_NAME=opinara_piloto yarn db:quitar-opiniones --apply    # borrar
 */
import mongoose from 'mongoose';

import '@shared/environment';

const uri = process.env.DATABASE_URI;
const dbName = process.env.DATABASE_NAME ?? 'opinara';
const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  if (!uri) {
    console.error('Falta DATABASE_URI en .env.dev');
    process.exit(1);
  }

  const connection = await mongoose.createConnection(uri, { dbName }).asPromise();
  const db = connection.db;
  if (!db) throw new Error('Sin conexion a la base');

  console.log(`Base: ${dbName} (${apply ? 'APLICANDO' : 'solo mirando, usar --apply para borrar'})\n`);

  const hasFeedback = (await db.listCollections({ name: 'feedback' }).toArray()).length > 0;
  const feedbackCount = hasFeedback ? await db.collection('feedback').countDocuments() : 0;
  const withCounter = { 'stats.feedbacks': { $exists: true } };
  const campaignsWithCounter = await db.collection('campaigns').countDocuments(withCounter);

  console.log(`- coleccion feedback: ${hasFeedback ? `${feedbackCount} documentos` : 'no existe'}`);
  console.log(`- campañas con stats.feedbacks: ${campaignsWithCounter}`);

  if (apply) {
    if (hasFeedback) {
      await db.collection('feedback').drop();
    }
    const { modifiedCount } = await db.collection('campaigns').updateMany(withCounter, {
      $unset: { 'stats.feedbacks': '' },
    });
    console.log(`\nListo: ${hasFeedback ? 'coleccion feedback eliminada, ' : ''}${modifiedCount} campañas limpias.`);
  }

  await connection.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
