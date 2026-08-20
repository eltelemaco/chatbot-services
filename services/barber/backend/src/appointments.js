import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import { notifyN8n } from "@chatbot/shared/notify/n8nWebhook";
import {
  SHOP,
  getService,
  listServices,
  getCurrentTimeInfo,
  generateDaySlots,
  isWithinShopHours,
  formatShopDateTime,
  formatShopTime,
  shopLocalToUtc,
} from "./shop.js";

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

function rowToAppointment(row) {
  if (!row) return null;
  const service = getService(row.service_id);
  return {
    id: row.id,
    customer_name: row.customer_name,
    phone: row.phone,
    service_id: row.service_id,
    service_name: service?.name || row.service_id,
    duration_minutes: service?.durationMinutes || null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    created_at: row.created_at,
    starts_at_display: formatShopDateTime(new Date(row.starts_at)),
  };
}

export function getServicesCatalog() {
  return {
    shop: SHOP.name,
    barber: SHOP.barber,
    address: SHOP.address,
    timezone: SHOP.tz,
    hours: `Lun–sáb ${String(SHOP.openHour).padStart(2, "0")}:00–${String(SHOP.closeHour).padStart(2, "0")}:00 (${SHOP.tz}); cerrado domingo`,
    services: listServices(),
  };
}

export function getCurrentTime() {
  return { ok: true, ...getCurrentTimeInfo() };
}

function findOverlaps(startIso, endIso, excludeId = null) {
  const db = getDb();
  if (excludeId) {
    return db
      .prepare(
        `SELECT * FROM appointments
         WHERE status = 'booked'
           AND starts_at < ?
           AND ends_at > ?
           AND id != ?`
      )
      .all(endIso, startIso, excludeId);
  }
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE status = 'booked'
         AND starts_at < ?
         AND ends_at > ?`
    )
    .all(endIso, startIso);
}

export function checkAvailability(dateStr, serviceId) {
  const service = getService(serviceId);
  if (!service) {
    return {
      ok: false,
      error: `service_id desconocido: ${serviceId}. Usa list_services.`,
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "La fecha debe ser YYYY-MM-DD" };
  }

  const candidates = generateDaySlots(dateStr, service.durationMinutes);
  if (candidates.length === 0) {
    return {
      ok: true,
      date: dateStr,
      service_id: serviceId,
      free_slots: [],
      note: "Ese día el local está cerrado o no hay horarios que quepan con la duración del servicio.",
    };
  }

  const now = Date.now();
  const free = [];
  for (const start of candidates) {
    if (start.getTime() < now) continue;
    const end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);
    const overlaps = findOverlaps(start.toISOString(), end.toISOString());
    if (overlaps.length === 0) {
      free.push({
        starts_at: start.toISOString(),
        time: formatShopTime(start),
        display: formatShopDateTime(start),
      });
    }
  }

  return {
    ok: true,
    date: dateStr,
    service_id: serviceId,
    service_name: service.name,
    duration_minutes: service.durationMinutes,
    free_slots: free,
    free_count: free.length,
  };
}

export function createAppointment({ customer_name, phone, service_id, starts_at }) {
  const service = getService(service_id);
  if (!service) {
    return { ok: false, error: `service_id desconocido: ${service_id}` };
  }
  const nameText = asText(customer_name);
  const phoneText = asText(phone);
  if (!nameText) {
    return { ok: false, error: "Se requiere el nombre del cliente (customer_name)." };
  }
  if (!phoneText) {
    return { ok: false, error: "Se requiere el teléfono (phone)." };
  }

  const start = parseStartsAt(starts_at);
  if (Number.isNaN(start.getTime())) {
    return {
      ok: false,
      error:
        "starts_at inválido. Usa ISO-8601 o YYYY-MM-DDTHH:MM (hora local del negocio).",
    };
  }
  if (start.getTime() < Date.now()) {
    return { ok: false, error: "No se puede reservar un horario en el pasado." };
  }

  const end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);
  if (!isWithinShopHours(start, end)) {
    return {
      ok: false,
      error: `Fuera del horario (lun–sáb ${SHOP.openHour}:00–${SHOP.closeHour}:00 ${SHOP.tz}) o cerrado.`,
    };
  }

  const overlaps = findOverlaps(start.toISOString(), end.toISOString());
  if (overlaps.length > 0) {
    return {
      ok: false,
      error:
        "Ese horario ya está ocupado. Usa check_availability para ver horarios libres.",
    };
  }

  const id = uuidv4();
  const created_at = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `INSERT INTO appointments
     (id, customer_name, phone, service_id, starts_at, ends_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)`
  ).run(
    id,
    nameText,
    phoneText,
    service_id,
    start.toISOString(),
    end.toISOString(),
    created_at
  );

  const appointment = rowToAppointment(
    db.prepare("SELECT * FROM appointments WHERE id = ?").get(id)
  );
  notifyN8n(process.env.N8N_APPOINTMENT_WEBHOOK_URL, {
    type: "appointment_created",
    appointment,
  });

  return { ok: true, appointment };
}

export function listAppointments({ phone, customer_name } = {}) {
  const db = getDb();
  const phoneText = asText(phone);
  const nameText = asText(customer_name);
  if (!phoneText && !nameText) {
    return {
      ok: false,
      error: "Indica teléfono (preferido) o nombre del cliente (customer_name).",
    };
  }
  let rows;
  if (phoneText) {
    rows = db
      .prepare(
        `SELECT * FROM appointments
         WHERE phone = ? AND status = 'booked'
         ORDER BY starts_at ASC`
      )
      .all(phoneText);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM appointments
         WHERE lower(customer_name) = lower(?) AND status = 'booked'
         ORDER BY starts_at ASC`
      )
      .all(nameText);
  }
  return { ok: true, appointments: rows.map(rowToAppointment) };
}

export function cancelAppointment({ appointment_id, phone, starts_at } = {}) {
  const db = getDb();
  const phoneText = asText(phone);
  let row = null;
  if (appointment_id) {
    if (!phoneText) {
      return {
        ok: false,
        error: "Para cancelar por id se requiere el teléfono del cliente.",
      };
    }
    row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(appointment_id);
    if (row && row.phone !== phoneText) {
      row = null;
    }
  } else if (phoneText && starts_at) {
    const start = parseStartsAt(starts_at);
    if (Number.isNaN(start.getTime())) {
      return {
        ok: false,
        error:
          "starts_at inválido. Usa ISO-8601 o YYYY-MM-DDTHH:MM (hora local del negocio).",
      };
    }
    row = db
      .prepare(
        `SELECT * FROM appointments
         WHERE phone = ? AND starts_at = ? AND status = 'booked'
         LIMIT 1`
      )
      .get(phoneText, start.toISOString());
  } else if (phoneText) {
    row = db
      .prepare(
        `SELECT * FROM appointments
         WHERE phone = ? AND status = 'booked'
         ORDER BY starts_at DESC LIMIT 1`
      )
      .get(phoneText);
  }

  if (!row) {
    return { ok: false, error: "No se encontró una cita agendada que coincida." };
  }
  if (row.status === "cancelled") {
    return { ok: false, error: "La cita ya está cancelada." };
  }

  db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(row.id);
  const updated = db.prepare("SELECT * FROM appointments WHERE id = ?").get(row.id);
  return { ok: true, appointment: rowToAppointment(updated) };
}

export function listAllBooked() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM appointments WHERE status = 'booked' ORDER BY starts_at ASC`
    )
    .all();
  return rows.map(rowToAppointment);
}
