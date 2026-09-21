import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../src/db/schema.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://wowm:wowm@127.0.0.1:5432/wowm_test';

export const ADMIN_TOKEN_FOR_TESTS = 'test-admin-token-do-not-use-in-production';

// api/src/db/client.ts binds to DATABASE_URL exactly once, at import time.
// Point it at the test database — and set a known admin token — BEFORE the
// dynamic import below loads server.ts (and everything it pulls in).
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.ADMIN_API_TOKEN = ADMIN_TOKEN_FOR_TESTS;

async function ensureTestDatabaseExists() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';

  const maintenanceSql = postgres(maintenanceUrl.toString());
  try {
    const existing = await maintenanceSql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      await maintenanceSql.unsafe(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await maintenanceSql.end();
  }
}

await ensureTestDatabaseExists();

export const testSql = postgres(TEST_DATABASE_URL);
export const testDb = drizzle(testSql, { schema });

await migrate(testDb, { migrationsFolder: './drizzle' });

// Loaded dynamically, and only after DATABASE_URL/ADMIN_API_TOKEN above are
// set, so the app's db client (api/src/db/client.ts) binds to the test
// database rather than whatever DATABASE_URL a developer has in api/.env.
const { buildApp } = await import('../src/server.js');

export function buildTestApp() {
  return buildApp();
}

export async function resetDb() {
  await testSql`
    TRUNCATE TABLE
      pack_pois,
      pack_versions,
      pack_field_definitions,
      pack_filter_definitions,
      pois,
      packs,
      poi_types
    RESTART IDENTITY CASCADE
  `;
}
