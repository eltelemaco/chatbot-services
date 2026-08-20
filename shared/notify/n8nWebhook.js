const TIMEOUT_MS = 5000;

export function notifyN8n(webhookUrl, payload) {
  if (!webhookUrl) return;
  const headers = { "Content-Type": "application/json" };
  if (process.env.N8N_NOTIFY_WEBHOOK_TOKEN) {
    headers["X-Booking-Notify-Token"] = process.env.N8N_NOTIFY_WEBHOOK_TOKEN;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch((err) => {
      console.error(`[n8n-notify] failed to reach ${webhookUrl}:`, err.message);
    })
    .finally(() => clearTimeout(timeout));
}
