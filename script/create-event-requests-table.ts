/**
 * Creates event_requests table for training requests if missing.
 * Run once: npx tsx script/create-event-requests-table.ts
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
      CREATE TABLE IF NOT EXISTS event_requests (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by varchar(255),
        type varchar(50) NOT NULL DEFAULT 'training',
        title varchar(500) NOT NULL,
        pitch varchar(20) NOT NULL,
        team varchar(50),
        start_at timestamp NOT NULL,
        end_at timestamp NOT NULL,
        note text,
        status varchar(20) NOT NULL DEFAULT 'pending',
        admin_note text,
        approved_event_id varchar(36),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_event_requests_status_start
      ON event_requests (status, start_at);
    `);
    console.log("event_requests: ok");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
  console.log("Done.");
}

main();

