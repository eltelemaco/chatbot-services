import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import { notifyN8n } from "@chatbot/shared/notify/n8nWebhook";
import {
  RESTAURANT,
  listDishes,
  listTables,
  tablesForParty,
  getTable,
  generateDaySlots,
  isWithinHours,
  formatShopDateTime,
  formatShopTime,
  shopLocalToUtc,
  getCurrentTimeInfo,
} from "./restaurant.js";

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

/** Shop-local YYYY-MM-DDTHH:MM[:SS] → UTC. Offset/Z timestamps use Date. */
function parseStartsAt(starts_at) {
  const s = asText(starts_at);
  const local = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (local) return shopLocalToUtc(local[1], local[2]);
  return new Date(s);
}

function rowToReservation(row) {
  if (!row) return null;
  const table = row.table_id ? getTable(row.table_id) : null;
  return {
    id: row.id,
    customer_name: row.customer_name,
    phone: row.phone,
    party_size: row.party_size,
    table_id: row.table_id,
    table_label: table?.label || null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    notes: row.notes || null,
    created_at: row.created_at,
    starts_at_display: formatShopDateTime(new Date(row.starts_at)),
  };
}

export function getRestaurantCatalog() {
  return {
    restaurant: RESTAURANT.name,
    chef: RESTAURANT.chef,
    address: RESTAURANT.address,
    timezone: RESTAURANT.tz,
    hours: `Mar–dom ${String(RESTAURANT.openHour).padStart(2, "0")}:00–${String(RESTAURANT.closeHour).padStart(2, "0")}:00 (${RESTAURANT.tz}); cerrado lunes`,
    reservation_minutes: RESTAURANT.reservationMinutes,
    tables: listTables(),
    menu: listDishes(),
  };
}

export function getMenu(category) {
  let dishes = listDishes();
  if (category) {
    dishes = dishes.filter(
      (d) => d.category.toLowerCase() === String(category).toLowerCase()
    );
  }
  return { ok: true, menu: dishes };
}

export function getTablesInfo() {
  return { ok: true, tables: listTables() };
}

export function getCurrentTime() {
  return { ok: true, ...getCurrentTimeInfo() };
}

function findOverlaps(startIso, endIso, tableId = null) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM reservations
       WHERE status = 'booked'
         AND starts_at < ?
         AND ends_at > ?`
    )
    .all(endIso, startIso);
  if (!tableId) return rows;
  return rows.filter((r) => r.table_id === tableId);
}

function pickTable(partySize, startIso, endIso) {
  const candidates = tablesForParty(partySize).sort((a, b) => a.seats - b.seats);
  for (const t of candidates) {
    if (findOverlaps(startIso, endIso, t.id).length === 0) {
      return t;
    }
  }
  return null;
}

export function checkAvailability(dateStr, partySize) {
  const size = Number(partySize);
  if (!Number.isFinite(size) || size < 1 || size > 12) {
    return { ok: false, error: "party_size debe ser un número entre 1 y 12." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "La fecha debe ser YYYY-MM-DD" };
  }
  if (tablesForParty(size).length === 0) {
    return {
      ok: false,
      error: `No hay mesas para ${size} personas (máximo 8 en este POC).`,
    };
  }

  const candidates = generateDaySlots(dateStr);
  if (candidates.length === 0) {
    return {
      ok: true,
      date: dateStr,
      party_size: size,
      free_slots: [],
      note: "Ese día el restaurante está cerrado o no hay horarios.",
    };
  }

  const now = Date.now();
  const free = [];
  for (const start of candidates) {
    if (start.getTime() < now) continue;
    const end = new Date(
      start.getTime() + RESTAURANT.reservationMinutes * 60 * 1000
    );
    const table = pickTable(size, start.toISOString(), end.toISOString());
    if (table) {
      free.push({
        starts_at: start.toISOString(),
        time: formatShopTime(start),
        display: formatShopDateTime(start),
        example_table: table.label,
        seats: table.seats,
      });
    }
  }

  return {
    ok: true,
    date: dateStr,
    party_size: size,
    free_slots: free,
    free_count: free.length,
  };
}

export function createReservation({
  customer_name,
  phone,
  party_size,
  starts_at,
  notes,
}) {
  const size = Number(party_size);
  const nameText = asText(customer_name);
  const phoneText = asText(phone);
  if (!nameText) {
    return { ok: false, error: "Se requiere el nombre del cliente." };
  }
  if (!phoneText) {
    return { ok: false, error: "Se requiere el teléfono." };
  }
  if (!Number.isFinite(size) || size < 1 || size > 12) {
    return { ok: false, error: "party_size debe ser un número entre 1 y 12." };
  }

  const start = parseStartsAt(starts_at);
  if (Number.isNaN(start.getTime())) {
    return {
      ok: false,
      error:
        "starts_at inválido. Usa ISO-8601 o YYYY-MM-DDTHH:MM (hora local del restaurante).",
    };
  }
  if (start.getTime() < Date.now()) {
    return { ok: false, error: "No se puede reservar un horario en el pasado." };
  }

  const end = new Date(
    start.getTime() + RESTAURANT.reservationMinutes * 60 * 1000
  );
  if (!isWithinHours(start, end)) {
    return {
      ok: false,
      error: `Fuera del horario (mar–dom ${RESTAURANT.openHour}:00–${RESTAURANT.closeHour}:00 ${RESTAURANT.tz}) o cerrado (lunes).`,
    };
  }

  const table = pickTable(size, start.toISOString(), end.toISOString());
  if (!table) {
    return {
      ok: false,
      error:
        "No hay mesa disponible en ese horario. Usa check_availability para ver opciones.",
    };
  }

  const id = uuidv4();
  const created_at = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO reservations
     (id, customer_name, phone, party_size, table_id, starts_at, ends_at, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?)`
  ).run(
    id,
    nameText,
    phoneText,
    size,
    table.id,
    start.toISOString(),
    end.toISOString(),
    notes?.trim() || null,
    created_at
  );

  const reservation = rowToReservation(
    db.prepare("SELECT * FROM reservations WHERE id = ?").get(id)
  );
  notifyN8n(process.env.N8N_RESERVATION_WEBHOOK_URL, {
    type: "reservation_created",
    reservation,
  });

  return { ok: true, reservation };
}

export function listReservations({ phone, customer_name } = {}) {
  const db = getDb();
  const phoneText = asText(phone);
  const nameText = asText(customer_name);
  if (!phoneText && !nameText) {
    return {
      ok: false,
      error: "Indica teléfono (preferido) o nombre del cliente.",
    };
  }
  let rows;
  if (phoneText) {
    rows = db
      .prepare(
        `SELECT * FROM reservations
         WHERE phone = ? AND status = 'booked'
         ORDER BY starts_at ASC`
      )
      .all(phoneText);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM reservations
         WHERE lower(customer_name) = lower(?) AND status = 'booked'
         ORDER BY starts_at ASC`
      )
      .all(nameText);
  }
  return { ok: true, reservations: rows.map(rowToReservation) };
}

export function cancelReservation({ reservation_id, phone, starts_at } = {}) {
  const db = getDb();
  const phoneText = asText(phone);
  let row = null;
  if (reservation_id) {
    if (!phoneText) {
      return {
        ok: false,
        error: "Para cancelar por id se requiere el teléfono del cliente.",
      };
    }
    row = db
      .prepare("SELECT * FROM reservations WHERE id = ?")
      .get(reservation_id);
    if (row && row.phone !== phoneText) {
      row = null;
    }
  } else if (phoneText && starts_at) {
    const start = parseStartsAt(starts_at);
    if (Number.isNaN(start.getTime())) {
      return {
        ok: false,
        error:
          "starts_at inválido. Usa ISO-8601 o YYYY-MM-DDTHH:MM (hora local del restaurante).",
      };
    }
    row = db
      .prepare(
        `SELECT * FROM reservations
         WHERE phone = ? AND starts_at = ? AND status = 'booked'
         LIMIT 1`
      )
      .get(phoneText, start.toISOString());
  } else if (phoneText) {
    row = db
      .prepare(
        `SELECT * FROM reservations
         WHERE phone = ? AND status = 'booked'
         ORDER BY starts_at DESC LIMIT 1`
      )
      .get(phoneText);
  }

  if (!row) {
    return { ok: false, error: "No se encontró una reservación que coincida." };
  }
  if (row.status === "cancelled") {
    return { ok: false, error: "La reservación ya está cancelada." };
  }

  db.prepare(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`).run(
    row.id
  );
  const updated = db
    .prepare("SELECT * FROM reservations WHERE id = ?")
    .get(row.id);
  return { ok: true, reservation: rowToReservation(updated) };
}

export function listAllBooked() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM reservations WHERE status = 'booked' ORDER BY starts_at ASC`
    )
    .all();
  return rows.map(rowToReservation);
}
