import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import chatRouter from "./routes/chat.js";

const PORT = Number(process.env.PORT || 3001);

async function main() {
  await initDb();

  const app = express();
  // Caddy is the only hop in front of this service; trust its
  // X-Forwarded-For so rate limiting keys on the real client IP.
  app.set("trust proxy", 1);
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", chatRouter);

  app.use((err, _req, res, _next) => {
    console.error("[express]", err);
    res.status(500).json({ error: "Error interno del servidor" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Chatbot backend (${process.env.SERVICE_NAME || "unknown"}) listening on :${PORT} model=${process.env.OPENROUTER_MODEL || "amazon/nova-lite-v1"}`
    );
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
