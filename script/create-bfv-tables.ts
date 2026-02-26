/**
 * Creates BFV import tables and calendar_events columns if missing.
 * Run once: npx tsx script/create-bfv-tables.ts
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_runs (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        source varchar(20) NOT NULL DEFAULT 'bfv',
        created_count integer NOT NULL DEFAULT 0,
        updated_count integer NOT NULL DEFAULT 0,
        archived_count integer NOT NULL DEFAULT 0,
        errors jsonb,
        warnings jsonb
      );
    `);
    console.log("import_runs: ok");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_warnings (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        import_run_id varchar(36) NOT NULL,
        type varchar(50) NOT NULL,
        message text NOT NULL,
        event_refs jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("import_warnings: ok");

    const alterCalendar = [
      `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS stable_key varchar(64);`,
      `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;`,
      `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS archived_at timestamptz;`,
    ];
    for (const sql of alterCalendar) {
      await pool.query(sql);
    }
    console.log("calendar_events columns: ok");

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bfv_stable_key ON calendar_events (source, stable_key);
    `);
    console.log("index idx_bfv_stable_key: ok");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
  console.log("Done.");
}

main();
