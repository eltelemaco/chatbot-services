/** Shop configuration and helpers (America/Mexico_City by default). */

export const SHOP = {
  name: "Corner Cutters",
  barber: "Alex",
  address: "Belisario Domínguez 3500, Guadalajara, Jalisco",
  phone: "(33) 5550 1928",
  email: "hola@cornercutters.example.com",
  tz: process.env.SHOP_TZ || "America/Mexico_City",
  openHour: 9,
  closeHour: 18,
  closedWeekdays: [0], // Sunday
  slotMinutes: 30,
  services: {
    haircut: { id: "haircut", name: "Corte de cabello", durationMinutes: 30 },
    beard: { id: "beard", name: "Arreglo de barba", durationMinutes: 20 },
    cut_beard: { id: "cut_beard", name: "Corte + barba", durationMinutes: 45 },
  },
};

export function listServices() {
  return Object.values(SHOP.services);
}

export function getService(serviceId) {
  return SHOP.services[serviceId] || null;
}

/** Format a Date in shop TZ as parts. */
export function shopParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  // hour12:false can still yield "24" for midnight in some engines — normalize
  let hour = Number(parts.hour === "24" ? "0" : parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday, // e.g. Mon
  };
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function weekdayIndexFromParts(parts) {
  return WEEKDAY_INDEX[parts.weekday];
}

/**
 * Convert a wall-clock datetime in shop TZ to a UTC Date.
 * dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
 */
export function shopLocalToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // Binary search UTC millis that land on this wall time in SHOP.tz
  // Rough guess: treat as UTC then adjust
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 4; i++) {
    const p = shopParts(new Date(guess));
    const targetMin = hh * 60 + mm;
    const actualMin = p.hour * 60 + p.minute;
    // Also fix day drift
    const targetDay = Date.UTC(y, m - 1, d);
    const actualDay = Date.UTC(p.year, p.month - 1, p.day);
    const dayDeltaMin = (targetDay - actualDay) / 60000;
    const minDelta = targetMin - actualMin + dayDeltaMin;
    guess += minDelta * 60 * 1000;
  }
  return new Date(guess);
}

export function formatShopDateTime(utcDate) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: SHOP.tz,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcDate);
}

export function formatShopDate(utcDate) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utcDate); // YYYY-MM-DD
}

export function formatShopTime(utcDate) {
  const p = shopParts(utcDate);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function getCurrentTimeInfo() {
  const now = new Date();
  const p = shopParts(now);
  const localDate = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const localTime = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return {
    timezone: SHOP.tz,
    local_date: localDate,
    local_time: localTime,
    local_datetime: `${localDate}T${localTime}`,
    local_display: formatShopDateTime(now),
    utc_now: now.toISOString(),
  };
}

/** Generate candidate start times (UTC Dates) for a calendar day in shop TZ. */
export function generateDaySlots(dateStr, durationMinutes) {
  const slots = [];
  // Check closed day via noon that day
  const noon = shopLocalToUtc(dateStr, "12:00");
  const noonParts = shopParts(noon);
  if (SHOP.closedWeekdays.includes(weekdayIndexFromParts(noonParts))) {
    return slots;
  }

  const openMin = SHOP.openHour * 60;
  const closeMin = SHOP.closeHour * 60;
  for (let m = openMin; m + durationMinutes <= closeMin; m += SHOP.slotMinutes) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    slots.push(shopLocalToUtc(dateStr, timeStr));
  }
  return slots;
}

export function isWithinShopHours(startUtc, endUtc) {
  const startP = shopParts(startUtc);
  const endP = shopParts(endUtc);
  if (SHOP.closedWeekdays.includes(weekdayIndexFromParts(startP))) return false;
  // Must be same calendar day in shop TZ
  if (
    startP.year !== endP.year ||
    startP.month !== endP.month ||
    startP.day !== endP.day
  ) {
    return false;
  }
  const startMin = startP.hour * 60 + startP.minute;
  const endMin = endP.hour * 60 + endP.minute;
  if (startMin < SHOP.openHour * 60) return false;
  if (endMin > SHOP.closeHour * 60) return false;
  return true;
}
