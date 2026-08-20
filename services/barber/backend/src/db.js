import { initDb as initSharedDb } from "@chatbot/shared/db";

const dbPath = process.env.DATABASE_PATH || "./data/appointments.db";

export async function initDb() {
  return initSharedDb({
    dbPath,
    createSchema(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          customer_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          service_id TEXT NOT NULL,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'booked',
          created_at TEXT NOT NULL
        );
      `);
      try {
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone);`
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_appointments_starts ON appointments(starts_at);`
        );
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);`
        );
      } catch {
        /* ignore */
      }
    },
  });
}

export { getDb } from "@chatbot/shared/db";
