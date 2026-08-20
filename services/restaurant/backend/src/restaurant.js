/** Restaurant configuration and timezone helpers (America/Mexico_City). */

export const RESTAURANT = {
  name: "Mesa Norte",
  chef: "María",
  address: "Av. México 1200, Guadalajara, Jalisco",
  phone: "(33) 5550 1930",
  email: "hola@mesanorte.example.com",
  tz: process.env.SHOP_TZ || "America/Mexico_City",
  openHour: 12,
  closeHour: 22,
  closedWeekdays: [1], // Monday closed (POC)
  slotMinutes: 30,
  /** Default seating duration for a reservation */
  reservationMinutes: 90,
  tables: [
    { id: "t2a", label: "Mesa 1", seats: 2 },
    { id: "t2b", label: "Mesa 2", seats: 2 },
    { id: "t4a", label: "Mesa 3", seats: 4 },
    { id: "t4b", label: "Mesa 4", seats: 4 },
    { id: "t6a", label: "Mesa 5", seats: 6 },
    { id: "t8a", label: "Mesa 6", seats: 8 },
  ],
  dishes: {
    tacos_pastor: {
      id: "tacos_pastor",
      name: "Tacos al pastor",
      description: "Trompo, piña y cilantro",
      price: 95,
      category: "platos",
      available: true,
    },
    enchiladas: {
      id: "enchiladas",
      name: "Enchiladas suizas",
      description: "Pollo, salsa verde y gratinado",
      price: 145,
      category: "platos",
      available: true,
    },
    ribeye: {
      id: "ribeye",
      name: "Ribeye a la parrilla",
      description: "300 g, guarnición del día",
      price: 420,
      category: "platos",
      available: true,
    },
    ceviche: {
      id: "ceviche",
      name: "Ceviche del día",
      description: "Pescado fresco, limón y aguacate",
      price: 180,
      category: "entradas",
      available: true,
    },
    guacamole: {
      id: "guacamole",
      name: "Guacamole de la casa",
      description: "Con totopos",
      price: 110,
      category: "entradas",
      available: true,
    },
    flan: {
      id: "flan",
      name: "Flan napolitano",
      description: "Casero",
      price: 85,
      category: "postres",
      available: true,
    },
    agua_horchata: {
      id: "agua_horchata",
      name: "Agua de horchata",
      description: "1 L",
      price: 55,
      category: "bebidas",
      available: true,
    },
    margarita: {
      id: "margarita",
      name: "Margarita clásica",
      description: "Tequila, limón, sal",
      price: 130,
      category: "bebidas",
      available: true,
    },
  },
};

export function listDishes() {
  return Object.values(RESTAURANT.dishes).filter((d) => d.available);
}

export function getDish(id) {
  return RESTAURANT.dishes[id] || null;
}

export function listTables() {
  return RESTAURANT.tables.map((t) => ({ ...t }));
}

export function getTable(id) {
  return RESTAURANT.tables.find((t) => t.id === id) || null;
}

export function tablesForParty(partySize) {
  const n = Number(partySize);
  return RESTAURANT.tables.filter((t) => t.seats >= n);
}

export function shopParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT.tz,
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
  let hour = Number(parts.hour === "24" ? "0" : parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function weekdayIndexFromParts(parts) {
  return WEEKDAY_INDEX[parts.weekday];
}

export function shopLocalToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 4; i++) {
    const p = shopParts(new Date(guess));
    const targetMin = hh * 60 + mm;
    const actualMin = p.hour * 60 + p.minute;
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
    timeZone: RESTAURANT.tz,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(utcDate);
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
    timezone: RESTAURANT.tz,
    local_date: localDate,
    local_time: localTime,
    local_datetime: `${localDate}T${localTime}`,
    local_display: formatShopDateTime(now),
    utc_now: now.toISOString(),
  };
}

export function generateDaySlots(dateStr) {
  const slots = [];
  const noon = shopLocalToUtc(dateStr, "12:00");
  const noonParts = shopParts(noon);
  if (RESTAURANT.closedWeekdays.includes(weekdayIndexFromParts(noonParts))) {
    return slots;
  }

  const openMin = RESTAURANT.openHour * 60;
  const closeMin = RESTAURANT.closeHour * 60;
  const duration = RESTAURANT.reservationMinutes;
  for (let m = openMin; m + duration <= closeMin; m += RESTAURANT.slotMinutes) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    slots.push(shopLocalToUtc(dateStr, timeStr));
  }
  return slots;
}

export function isWithinHours(startUtc, endUtc) {
  const startP = shopParts(startUtc);
  const endP = shopParts(endUtc);
  if (RESTAURANT.closedWeekdays.includes(weekdayIndexFromParts(startP))) {
    return false;
  }
  if (
    startP.year !== endP.year ||
    startP.month !== endP.month ||
    startP.day !== endP.day
  ) {
    return false;
  }
  const startMin = startP.hour * 60 + startP.minute;
  const endMin = endP.hour * 60 + endP.minute;
  if (startMin < RESTAURANT.openHour * 60) return false;
  if (endMin > RESTAURANT.closeHour * 60) return false;
  return true;
}
