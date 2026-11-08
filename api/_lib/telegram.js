function apiUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN manquant.");
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function telegram(method, payload) {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method}: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return result.result;
}

export function candidateText(exercise) {
  return [
    "🧠 EXERCICE À VALIDER",
    "",
    exercise.title,
    `Catégorie : ${exercise.category}`,
    `Niveau : ${exercise.difficulty || "Terminale → MPSI"}`,
    "",
    exercise.statement,
    "",
    "Temps visé : 5 à 10 minutes."
  ].join("\n");
}

export async function sendCandidate(exercise, chatId) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: candidateText(exercise),
    reply_markup: {
      inline_keyboard: [[
        { text: "Publier sur Discord", callback_data: `publish:${exercise.id}` },
        { text: "Un autre exercice", callback_data: `regen:${exercise.id}` }
      ]]
    }
  });
}

export async function editCandidate(exercise, chatId, messageId) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: candidateText(exercise),
    reply_markup: {
      inline_keyboard: [[
        { text: "Publier sur Discord", callback_data: `publish:${exercise.id}` },
        { text: "Un autre exercice", callback_data: `regen:${exercise.id}` }
      ]]
    }
  });
}

export async function answerCallback(callbackId, text = "Action prise en compte.") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
    show_alert: false
  });
}
