import crypto from "node:crypto";

function discordPublicKey() {
  const hex = process.env.DISCORD_PUBLIC_KEY;
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) throw new Error("DISCORD_PUBLIC_KEY invalide ou manquante.");
  const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return crypto.createPublicKey({
    key: Buffer.concat([derPrefix, Buffer.from(hex, "hex")]),
    format: "der",
    type: "spki"
  });
}

export function verifyDiscordSignature(rawBody, signature, timestamp) {
  if (!signature || !timestamp || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  try {
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]),
      discordPublicKey(),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

export async function publishExercise(exercise) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) throw new Error("DISCORD_BOT_TOKEN ou DISCORD_CHANNEL_ID manquant.");

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [{
        title: exercise.title.slice(0, 256),
        description: exercise.statement.slice(0, 4000),
        color: 0x5865f2,
        fields: [
          { name: "Catégorie", value: exercise.category.slice(0, 1024), inline: true },
          { name: "Niveau", value: (exercise.difficulty || "Terminale → MPSI").slice(0, 1024), inline: true },
          { name: "Temps estimé", value: "5 à 10 minutes", inline: true }
        ],
        footer: { text: "Exercice quotidien · Essaie avant de révéler la solution" }
      }],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 2,
          label: "Solution",
          custom_id: `solution:${exercise.id}`
        }]
      }],
      allowed_mentions: { parse: [] }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Discord ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  return data;
}

export function solutionInteractionResponse(exercise) {
  return {
    type: 4,
    data: {
      flags: 64,
      embeds: [{
        title: `Solution — ${exercise.title}`.slice(0, 256),
        description: exercise.solution.slice(0, 4000),
        color: 0x57f287,
        footer: { text: "Visible uniquement par toi" }
      }],
      allowed_mentions: { parse: [] }
    }
  };
}

export function privateErrorResponse(message) {
  return {
    type: 4,
    data: {
      flags: 64,
      content: message.slice(0, 1900),
      allowed_mentions: { parse: [] }
    }
  };
}
