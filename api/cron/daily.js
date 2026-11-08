import { getActiveExercise, getRecentStatements, insertExercise, updateExercise } from "../../lib/db.js";
import { generateVerifiedExercise } from "../../lib/gemini.js";
import { isParisCronWindow, parisDate, sendJson } from "../../lib/http.js";
import { sendCandidate } from "../../lib/telegram.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  const force = req.query?.force === "1";
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (!adminId) return sendJson(res, 500, { error: "TELEGRAM_ADMIN_ID n'est pas configuré." });

  const date = parisDate();
  try {
    // First check today's record. If the first scheduled run created the row
    // but failed to send its Telegram message, the second UTC cron retries it.
    const existing = await getActiveExercise(date);
    if (existing) {
      if (existing.status === "pending" && !existing.telegram_message_id) {
        const message = await sendCandidate(existing, adminId);
        await updateExercise(existing.id, "pending", {
          telegram_chat_id: String(adminId),
          telegram_message_id: message.message_id
        });
        return sendJson(res, 200, { ok: true, resent: true, exerciseId: existing.id });
      }
      return sendJson(res, 200, { ok: true, skipped: true, reason: "Une proposition existe déjà pour aujourd'hui." });
    }

    // Hobby cron is only accurate to the scheduled hour. The 16:00 and
    // 17:00 UTC schedules cover Paris 18:00 in summer/winter; 19:00 is
    // accepted as a fallback for the second scheduled invocation.
    if (!force && !isParisCronWindow()) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: "En dehors de la fenêtre Cron prévue pour Paris." });
    }

    const recent = await getRecentStatements(30);
    const exercise = await generateVerifiedExercise(recent);
    const saved = await insertExercise(exercise, date);
    const message = await sendCandidate(saved, adminId);
    await updateExercise(saved.id, "pending", {
      telegram_chat_id: String(adminId),
      telegram_message_id: message.message_id
    });
    return sendJson(res, 200, { ok: true, exerciseId: saved.id, telegramMessageId: message.message_id });
  } catch (error) {
    console.error("Daily exercise failed:", error);
    return sendJson(res, 500, { error: error.message || "Daily exercise failed" });
  }
}
