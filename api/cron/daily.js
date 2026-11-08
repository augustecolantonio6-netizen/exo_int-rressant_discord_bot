import { getActiveExercise, getRecentStatements, insertExercise, updateExercise } from "../_lib/db.js";
import { generateVerifiedExercise } from "../_lib/gemini.js";
import { isParisSixPm, parisDate, sendJson } from "../_lib/http.js";
import { sendCandidate } from "../_lib/telegram.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  const force = req.query?.force === "1";
  if (!force && !isParisSixPm()) {
    return sendJson(res, 200, { ok: true, skipped: true, reason: "Ce déclenchement ne correspond pas à 18 h à Paris." });
  }

  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (!adminId) return sendJson(res, 500, { error: "TELEGRAM_ADMIN_ID n'est pas configuré." });

  const date = parisDate();
  try {
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
