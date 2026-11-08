import { getExercise, getRecentStatements, insertExercise, updateExercise } from "../../lib/db.js";
import { generateVerifiedExercise } from "../../lib/gemini.js";
import { readJson, sendJson } from "../../lib/http.js";
import { answerCallback, editCandidate, sendCandidate, telegram } from "../../lib/telegram.js";
import { publishExercise } from "../../lib/discord.js";

function isAdmin(userId) {
  const allowed = process.env.TELEGRAM_ADMIN_ID;
  return Boolean(allowed && String(userId) === String(allowed));
}

async function handleCommand(message) {
  const text = String(message.text || "").trim();
  const chatId = message.chat?.id;
  const fromId = message.from?.id;
  if (!chatId || !fromId || message.chat?.type !== "private") return;

  // /id is intentionally available before the admin ID is configured.
  if (text === "/id" || text.startsWith("/id@")) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `Ton identifiant Telegram est : ${fromId}\nUtilise cette valeur pour TELEGRAM_ADMIN_ID dans Vercel.`
    });
    return;
  }

  if (text === "/start" || text.startsWith("/start@")) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Bot Exo quotidien prêt.\n\nEnvoie /id pour connaître ton identifiant Telegram. Seul l'administrateur configuré peut valider et publier les exercices."
    });
    return;
  }

  if (!isAdmin(fromId)) return;
  if (text === "/help" || text.startsWith("/help@")) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Commandes disponibles :\n/id — afficher ton identifiant\n/start — vérifier que le bot répond\n\nChaque jour, je t'envoie une proposition à valider."
    });
  }
}

async function publishPending(callback, exerciseId) {
  const exercise = await getExercise(exerciseId);
  if (!exercise || exercise.status !== "pending") {
    await answerCallback(callback.id, "Cette proposition a déjà été traitée.");
    return;
  }

  await answerCallback(callback.id, "Publication en cours…");
  const claimed = await updateExercise(exercise.id, "pending", {
    status: "publishing",
    telegram_chat_id: String(callback.message.chat.id),
    telegram_message_id: callback.message.message_id
  });
  if (!claimed) return;

  let discordMessage;
  try {
    discordMessage = await publishExercise(exercise);
  } catch (error) {
    await updateExercise(exercise.id, "publishing", { status: "pending" }).catch(() => null);
    console.error("Discord publication failed:", error);
    await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text: "La publication Discord a échoué. La proposition est restée disponible : réessaie le bouton."
    }).catch(() => null);
    return;
  }

  try {
    const published = await updateExercise(exercise.id, "publishing", {
      status: "published",
      discord_message_id: String(discordMessage.id),
      published_at: new Date().toISOString()
    });
    if (!published) throw new Error("Discord a reçu le message, mais le statut Supabase n'a pas été confirmé.");
  } catch (error) {
    // Garder le statut publishing pour empêcher une deuxième publication.
    // On enregistre au mieux l'ID Discord afin que le bouton Solution reste utilisable.
    await updateExercise(exercise.id, "publishing", {
      discord_message_id: String(discordMessage.id),
      published_at: new Date().toISOString()
    }).catch(() => null);
    console.error("Exercise published but Supabase status could not be finalized:", error);
    await telegram("editMessageText", {
      chat_id: callback.message.chat.id,
      message_id: callback.message.message_id,
      text: "✅ L'exercice a été publié sur Discord. Un problème de synchronisation est survenu ; ne relance pas la publication.",
      reply_markup: { inline_keyboard: [] }
    }).catch(() => null);
    return;
  }

  await telegram("editMessageText", {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    text: "✅ Exercice publié sur Discord.",
    reply_markup: { inline_keyboard: [] }
  }).catch((error) => console.error("Could not update Telegram approval message:", error));
}

async function regenerate(callback, exerciseId) {
  const previous = await getExercise(exerciseId);
  if (!previous || previous.status !== "pending") {
    await answerCallback(callback.id, "Cette proposition a déjà été traitée.");
    return;
  }

  await answerCallback(callback.id, "Je cherche un autre exercice…");
  let replacement;
  try {
    const recent = await getRecentStatements(30);
    replacement = await generateVerifiedExercise([previous.statement, ...recent]);
  } catch (error) {
    console.error("Exercise regeneration failed:", error);
    await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text: "Je n'ai pas réussi à produire une nouvelle proposition vérifiée. L'exercice actuel est conservé."
    });
    return;
  }

  const replaced = await updateExercise(previous.id, "pending", { status: "replaced" });
  if (!replaced) return;

  try {
    const saved = await insertExercise(replacement, previous.exercise_date);
    let messageId = callback.message.message_id;
    try {
      await editCandidate(saved, callback.message.chat.id, messageId);
    } catch (editError) {
      console.error("Could not edit Telegram candidate; sending a new message:", editError);
      const sent = await sendCandidate(saved, callback.message.chat.id);
      messageId = sent.message_id;
    }
    await updateExercise(saved.id, "pending", {
      telegram_chat_id: String(callback.message.chat.id),
      telegram_message_id: messageId
    });
  } catch (error) {
    await updateExercise(previous.id, "replaced", { status: "pending" }).catch(() => null);
    console.error("Could not save replacement exercise:", error);
    await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text: "La nouvelle proposition n'a pas pu être enregistrée. L'exercice précédent est restauré."
    }).catch(() => null);
  }
}

async function handleCallback(callback) {
  const userId = callback.from?.id;
  if (!isAdmin(userId)) {
    await answerCallback(callback.id, "Tu n'es pas autorisé à utiliser ce bot.");
    return;
  }

  if (callback.message?.chat?.type !== "private") {
    await answerCallback(callback.id, "Utilise les boutons dans ta conversation privée avec le bot.");
    return;
  }

  const [action, exerciseId] = String(callback.data || "").split(":");
  if (!exerciseId || !/^[0-9a-f-]{36}$/i.test(exerciseId)) {
    await answerCallback(callback.id, "Bouton invalide.");
    return;
  }

  if (action === "publish") return publishPending(callback, exerciseId);
  if (action === "regen") return regenerate(callback, exerciseId);
  await answerCallback(callback.id, "Action inconnue.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  try {
    const update = await readJson(req);
    if (update.message) await handleCommand(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    return sendJson(res, 500, { ok: false, error: "Update processing failed" });
  }
}
