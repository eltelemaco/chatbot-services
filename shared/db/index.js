import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sqlJsMain = require.resolve("sql.js");
const wasmPath = path.join(path.dirname(sqlJsMain), "sql-wasm.wasm");

let rawDb = null;
let db = null;
let saveTimer = null;
let activeDbPath = null;

function persist() {
  if (!rawDb || !activeDbPath) return;
  const data = rawDb.export();
  const tmpPath = `${activeDbPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, activeDbPath);
}

function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persist();
}

function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      persist();
    } catch (err) {
      console.error("[db] persist failed:", err);
    }
  }, 50);
}

/** Minimal better-sqlite3-like wrapper around sql.js */
function wrapDatabase(raw) {
  return {
    exec(sql) {
      raw.run(sql);
      schedulePersist();
    },
    prepare(sql) {
      return {
        run(...params) {
          raw.run(sql, params);
          schedulePersist();
          return { changes: raw.getRowsModified() };
        },
        get(...params) {
          const stmt = raw.prepare(sql);
          try {
            stmt.bind(params);
            if (stmt.step()) {
              return stmt.getAsObject();
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = raw.prepare(sql);
          const rows = [];
          try {
            stmt.bind(params);
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
      };
    },
    close() {
      flushPersist();
      raw.close();
    },
  };
}

export async function initDb({ dbPath, createSchema }) {
  if (db) return db;

  activeDbPath = dbPath;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }
  db = wrapDatabase(rawDb);

  if (createSchema) {
    createSchema(db);
  }

  persist();
  console.log(`[db] ready at ${dbPath}`);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized — call await initDb() first");
  }
  return db;
}

function persistOnExit(code) {
  try {
    if (rawDb) flushPersist();
  } catch (err) {
    console.error("[db] persist on exit failed:", err);
  }
  if (code !== undefined) process.exit(code);
}

process.on("beforeExit", () => persistOnExit());
process.on("SIGTERM", () => persistOnExit(0));
process.on("SIGINT", () => persistOnExit(0));
