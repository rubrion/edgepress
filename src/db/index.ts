import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getDbInstance = () => drizzle(env.DB, { schema });
export type DB = ReturnType<typeof getDbInstance>;

export * from './schema';
