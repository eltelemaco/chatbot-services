import {
  getRestaurantCatalog,
  getMenu,
  getTablesInfo,
  getCurrentTime,
  checkAvailability,
  createReservation,
  listReservations,
  cancelReservation,
} from "../reservations.js";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_restaurant_info",
      description:
        "Info del restaurante: horario, dirección, mesas y menú completo.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_menu",
      description: "Lista platos del menú, opcionalmente filtrados por categoría.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "entradas | platos | postres | bebidas (opcional)",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "Lista mesas y capacidad de asientos.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Devuelve la fecha/hora actual del restaurante en su zona horaria local.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Horarios libres para un número de personas en una fecha (YYYY-MM-DD) en zona del restaurante.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Fecha YYYY-MM-DD",
          },
          party_size: {
            type: "integer",
            description: "Número de comensales (1–12)",
          },
        },
        required: ["date", "party_size"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reservation",
      description: "Crea una reservación de mesa.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone: { type: "string" },
          party_size: { type: "integer" },
          starts_at: {
            type: "string",
            description: "ISO-8601 UTC o YYYY-MM-DDTHH:MM local",
          },
          notes: { type: "string", description: "Notas opcionales" },
        },
        required: ["customer_name", "phone", "party_size", "starts_at"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reservations",
      description: "Lista reservaciones por teléfono o nombre.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
          customer_name: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reservation",
      description: "Cancela una reservación por id, teléfono + hora, o última del teléfono.",
      parameters: {
        type: "object",
        properties: {
          reservation_id: { type: "string" },
          phone: { type: "string" },
          starts_at: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
];

export function executeTool(name, args = {}) {
  try {
    return dispatchTool(name, args);
  } catch (err) {
    console.error("[tools]", name, err);
    return { ok: false, error: "La herramienta falló con datos inválidos." };
  }
}

function dispatchTool(name, args = {}) {
  switch (name) {
    case "list_restaurant_info":
      return getRestaurantCatalog();
    case "get_current_time":
      return getCurrentTime();
    case "list_menu":
      return getMenu(args.category);
    case "list_tables":
      return getTablesInfo();
    case "check_availability":
      return checkAvailability(args.date, args.party_size);
    case "create_reservation":
      return createReservation(args);
    case "list_reservations":
      return listReservations(args);
    case "cancel_reservation":
      return cancelReservation(args);
    default:
      return { ok: false, error: `Herramienta desconocida: ${name}` };
  }
}

export function tryParseJsonToolCall(content) {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  if (!candidate.startsWith("{")) return null;
  try {
    const obj = JSON.parse(candidate);
    if (obj && typeof obj.tool === "string" && obj.args && typeof obj.args === "object") {
      return { name: obj.tool, args: obj.args };
    }
    if (obj && typeof obj.name === "string" && obj.arguments) {
      const args =
        typeof obj.arguments === "string"
          ? JSON.parse(obj.arguments)
          : obj.arguments;
      return { name: obj.name, args };
    }
  } catch {
    return null;
  }
  return null;
}
