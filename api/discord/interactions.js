import { getExercise } from "../../lib/db.js";
import { sendJson } from "../../lib/http.js";
import {
  editOriginalInteraction,
  privateErrorResponse,
  solutionInteractionPayload,
  verifyDiscordSignature
} from "../../lib/discord.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-signature-ed25519"];
    const timestamp = req.headers["x-signature-timestamp"];
    if (!verifyDiscordSignature(rawBody, signature, timestamp)) {
      return sendJson(res, 401, { error: "Invalid request signature" });
    }

    const interaction = JSON.parse(rawBody.toString("utf8"));
    if (interaction.type === 1) return sendJson(res, 200, { type: 1 });

    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id || "";
      if (!customId.startsWith("solution:")) {
        return sendJson(res, 200, privateErrorResponse("Ce bouton n'est pas reconnu."));
      }

      // Répondre tout de suite à Discord, puis remplir la réponse éphémère.
      sendJson(res, 200, { type: 5, data: { flags: 64 } });
      try {
        const exerciseId = customId.slice("solution:".length);
        const exercise = await getExercise(exerciseId);
        if (!exercise || exercise.status !== "published") {
          await editOriginalInteraction(interaction, { content: "La solution n'est pas disponible.", embeds: [] });
          return;
        }
        await editOriginalInteraction(interaction, solutionInteractionPayload(exercise));
      } catch (error) {
        console.error("Could not deliver private Discord solution:", error);
        await editOriginalInteraction(interaction, {
          content: "Impossible de récupérer la solution pour le moment.",
          embeds: []
        }).catch(() => null);
      }
      return;
    }

    return sendJson(res, 200, privateErrorResponse("Interaction non prise en charge."));
  } catch (error) {
    console.error("Discord interaction failed:", error);
    return sendJson(res, 200, privateErrorResponse("Impossible de récupérer la solution pour le moment."));
  }
}
