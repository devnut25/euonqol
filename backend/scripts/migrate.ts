import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { pgSslConfig, stripSslParams } from '../src/config/dbSsl';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const SCHEMA = 'euonqol';

const args = process.argv.slice(2);
const MODE = args.includes('--baseline') ? 'baseline' : args.includes('--status') ? 'status' : 'migrate';

async function main() {
  const dbUrl = process.env.APP_DATABASE_URL;
  if (!dbUrl) {
    console.error('APP_DATABASE_URL not set');
    process.exit(1);
  }

  // The URL carries Prisma's SSL parameters: `pg` gets its own, see dbSsl.ts.
  const client = new Client({ connectionString: stripSslParams(dbUrl), ssl: pgSslConfig() });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    const allFiles = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql') && !f.startsWith('rollback_'))
      .sort();

    const { rows } = await client.query<{ filename: string }>(
      `SELECT filename FROM ${SCHEMA}.schema_migrations`
    );
    const applied = new Set(rows.map((r) => r.filename));

    const pending = allFiles.filter((f) => !applied.has(f));

    if (MODE === 'status') {
      console.log('\n=== Migration Status ===\n');
      for (const f of allFiles) {
        const status = applied.has(f) ? '✓ applied' : '⏳ pending';
        console.log(`  ${status}  ${f}`);
      }
      console.log(`\nTotal: ${allFiles.length} | Applied: ${applied.size} | Pending: ${pending.length}\n`);
      return;
    }

    if (MODE === 'baseline') {
      console.log('\n=== Baseline: marking all existing migrations as applied ===\n');
      for (const f of allFiles) {
        await client.query(
          `INSERT INTO ${SCHEMA}.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
          [f]
        );
        const wasNew = !applied.has(f);
        console.log(`  ${wasNew ? '✓ marked' : '— already'}: ${f}`);
      }
      console.log('\nBaseline complete. Run "npm run migrate" to apply future migrations.\n');
      return;
    }

    // migrate mode
    if (pending.length === 0) {
      console.log('\nNo pending migrations.\n');
      return;
    }

    console.log(`\n=== Applying ${pending.length} migration(s) ===\n`);
    for (const f of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, f), 'utf8');
      console.log(`  Running: ${f}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO ${SCHEMA}.schema_migrations (filename) VALUES ($1)`,
        [f]
      );
      console.log(`  ✓ Done: ${f}`);
    }
    console.log(`\n${pending.length} migration(s) applied, ${applied.size} skipped.\n`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
