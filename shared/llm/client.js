import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;
const baseURL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

export const MODEL =
  process.env.OPENROUTER_MODEL || "amazon/nova-lite-v1";

if (!apiKey) {
  console.warn(
    "[llm] OPENROUTER_API_KEY is not set — chat will fail until it is provided."
  );
}

// OpenRouter attributes usage in its dashboard ("App" column) from these
// two optional headers, not from the API key alone — without them every
// call shows up as "Unknown". SERVICE_NAME ("barber"/"restaurant") is
// already set per-service in docker-compose.yml.
const serviceName = process.env.SERVICE_NAME || "unknown";

export const client = new OpenAI({
  apiKey: apiKey || "missing",
  baseURL,
  defaultHeaders: {
    "HTTP-Referer": `https://${
      process.env.PUBLIC_DOMAIN || `${serviceName}.example.com`
    }`,
    "X-Title": `Chatbot (${serviceName})`,
  },
});
