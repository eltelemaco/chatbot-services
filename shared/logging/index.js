import fs from "fs";
import path from "path";

const LOG_PATH = process.env.APP_LOG_PATH || "/app/logs/app.log";
const SERVICE_NAME = process.env.SERVICE_NAME || "unknown";

function write(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      JSON.stringify({ ts: Date.now() / 1000, service: SERVICE_NAME, ...entry }) + "\n"
    );
  } catch (err) {
    console.error("[logging] failed to write log:", err);
  }
}

export function logLlmCall(entry) {
  write({ type: "llm_call", ...entry });
}

export function logConversation(entry) {
  write({ type: "conversation", ...entry });
}
