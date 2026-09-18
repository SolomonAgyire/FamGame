import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb() {
  if (!env.DB) {
    throw new Error(
      'Cloudflare D1 binding `DB` is unavailable. Check the `d1_databases` entry in wrangler.jsonc, and make sure `npx wrangler d1 create gatherword-db` has been run with the real database_id filled in before deploying.',
    );
  }

  return drizzle(env.DB, { schema });
}
