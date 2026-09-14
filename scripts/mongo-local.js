/**
 * MongoDB local para desarrollo, con datos persistentes.
 *
 * Reutiliza el binario de mongod que `mongodb-memory-server` ya descarga para los tests,
 * asi que no hace falta instalar MongoDB ni Docker. A diferencia de los tests, los datos
 * se guardan en `.mongo-data/` y sobreviven al reinicio.
 *
 *   yarn mongo:local        (Ctrl+C para frenarlo)
 */
const { mkdirSync } = require('fs');
const { resolve } = require('path');

const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = Number(process.env.MONGO_LOCAL_PORT ?? 27017);
const DB_PATH = resolve(process.cwd(), process.env.MONGO_LOCAL_PATH ?? '.mongo-data');

(async () => {
  mkdirSync(DB_PATH, { recursive: true });

  const server = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath: DB_PATH, storageEngine: 'wiredTiger' },
  });

  console.log('');
  console.log('  MongoDB local escuchando');
  console.log(`  URI    ${server.getUri()}`);
  console.log(`  Datos  ${DB_PATH}`);
  console.log('');
  console.log('  En .env.dev:  DATABASE_URI=mongodb://127.0.0.1:' + PORT);
  console.log('  Ctrl+C para frenarlo. Los datos quedan guardados.');
  console.log('');

  const stop = async () => {
    // doCleanup en false: sin esto se borraria el directorio de datos al salir.
    await server.stop({ doCleanup: false, force: false });
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((error) => {
  console.error('No se pudo levantar MongoDB:', error.message);
  process.exit(1);
});
