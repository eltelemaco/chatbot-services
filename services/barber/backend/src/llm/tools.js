import {
  getServicesCatalog,
  getCurrentTime,
  checkAvailability,
  createAppointment,
  listAppointments,
  cancelAppointment,
} from "../appointments.js";

/** OpenAI-style tool definitions */
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_services",
      description:
        "Lista los servicios de la barbería, horario, dirección y datos del barbero.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Devuelve la fecha/hora actual del negocio en su zona horaria local.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Devuelve horarios libres para un servicio en un día (YYYY-MM-DD) en la zona horaria del negocio (Guadalajara).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Fecha del calendario YYYY-MM-DD en zona horaria del negocio",
          },
          service_id: {
            type: "string",
            enum: ["haircut", "beard", "cut_beard"],
          },
        },
        required: ["date", "service_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description:
        "Reserva una cita. Falla si hay conflicto de horario o está fuera del horario del local.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Nombre del cliente",
          },
          phone: {
            type: "string",
            description: "Teléfono del cliente",
          },
          service_id: {
            type: "string",
            enum: ["haircut", "beard", "cut_beard"],
          },
          starts_at: {
            type: "string",
            description:
              "ISO-8601 UTC o hora local del negocio YYYY-MM-DDTHH:MM de los resultados de disponibilidad",
          },
        },
        required: ["customer_name", "phone", "service_id", "starts_at"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_appointments",
      description:
        "Lista las citas reservadas de un teléfono (preferido) o de un nombre.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Teléfono del cliente" },
          customer_name: { type: "string", description: "Nombre del cliente" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancela una cita por id, o por teléfono (+ starts_at opcional), o la más reciente del teléfono.",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string", description: "ID de la cita" },
          phone: { type: "string", description: "Teléfono del cliente" },
          starts_at: {
            type: "string",
            description: "Inicio de la cita (ISO o YYYY-MM-DDTHH:MM local)",
          },
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
    case "list_services":
      return getServicesCatalog();
    case "get_current_time":
      return getCurrentTime();
    case "check_availability":
      return checkAvailability(args.date, args.service_id);
    case "create_appointment":
      return createAppointment(args);
    case "list_appointments":
      return listAppointments(args);
    case "cancel_appointment":
      return cancelAppointment(args);
    default:
      return { ok: false, error: `Herramienta desconocida: ${name}` };
  }
}

/** Parse free-form JSON tool call fallback from model content */
export function tryParseJsonToolCall(content) {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim();
  // fenced ```json ... ```
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
