import { initDb as initSharedDb } from "@chatbot/shared/db";

const dbPath = process.env.DATABASE_PATH || "./data/reservations.db";

export async function initDb() {
  return initSharedDb({
    dbPath,
    createSchema(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reservations (
          id TEXT PRIMARY KEY,
          customer_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          party_size INTEGER NOT NULL,
          table_id TEXT,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'booked',
          notes TEXT,
          created_at TEXT NOT NULL
        );
      `);
      try {
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_res_phone ON reservations(phone);`
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_res_starts ON reservations(starts_at);`
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);`
        );
      } catch {
        /* ignore */
      }
    },
  });
}

export { getDb } from "@chatbot/shared/db";
