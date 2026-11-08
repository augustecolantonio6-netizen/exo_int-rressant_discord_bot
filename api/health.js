import { sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  return sendJson(res, 200, {
    status: "ok",
    configured: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET),
      telegramAdmin: Boolean(process.env.TELEGRAM_ADMIN_ID),
      discord: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_PUBLIC_KEY && process.env.DISCORD_CHANNEL_ID),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      cron: Boolean(process.env.CRON_SECRET)
    }
  });
}
