import { MongoMemoryServer } from 'mongodb-memory-server';

let server: MongoMemoryServer | undefined;

/**
 * Mongo efimero para los tests: no hace falta un Mongo local ni el cluster real.
 */
export const startMemoryMongo = async (): Promise<string> => {
  server = await MongoMemoryServer.create();
  return server.getUri();
};

export const stopMemoryMongo = async (): Promise<void> => {
  await server?.stop();
  server = undefined;
};
