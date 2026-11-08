import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";

import { parisDate, isParisSixPm, isParisCronWindow } from "../lib/http.js";
import { validateExerciseCandidate, generateVerifiedExercise } from "../lib/gemini.js";
import { candidateText, candidateKeyboard } from "../lib/telegram.js";
import {
  deferredEphemeralResponse,
  solutionInteractionPayload,
  verifyDiscordSignature
} from "../lib/discord.js";
import { updateExercise } from "../lib/db.js";
import healthHandler from "../api/health.js";
import cronHandler from "../api/cron/daily.js";
import telegramHandler from "../api/telegram/webhook.js";
import discordHandler from "../api/discord/interactions.js";

const exercise = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Deux puissances surprenantes",
  statement: "Trouver deux nombres réels x et y tels que x^y soit un entier.",
  solution: "Prendre x = 2 et y = 2 : on obtient 4, qui est entier.",
  category: "Théorie des nombres",
  difficulty: "Terminale → MPSI"
};

function withEnv(t, values) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = String(value); }
  };
}

function makeRequest(body, headers = {}, method = "POST") {
  const req = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  req.method = method;
  req.headers = headers;
  req.query = {};
  return req;
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function signDiscordBody(rawBody, privateKey, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = crypto.sign(
    null,
    Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]),
    privateKey
  ).toString("hex");
  return { timestamp, signature };
}

test("Paris date and UTC schedules handle winter and summer time", () => {
  const summer = new Date("2026-07-01T16:30:00.000Z");
  const summerBackup = new Date("2026-07-01T17:30:00.000Z");
  const winter = new Date("2026-01-15T17:30:00.000Z");
  const winterTooEarly = new Date("2026-01-15T16:30:00.000Z");
  const tooLate = new Date("2026-01-15T18:30:00.000Z");

  assert.equal(parisDate(summer), "2026-07-01");
  assert.equal(isParisSixPm(summer), true);
  assert.equal(isParisCronWindow(summer), true);
  assert.equal(isParisCronWindow(summerBackup), true);
  assert.equal(isParisCronWindow(winter), true);
  assert.equal(isParisCronWindow(winterTooEarly), false);
  assert.equal(isParisCronWindow(tooLate), false);
});

test("Gemini exercise validation requires all fields and caps message lengths", () => {
  assert.deepEqual(validateExerciseCandidate(exercise), exercise);
  assert.throws(
    () => validateExerciseCandidate({ ...exercise, title: " " }),
    /title/
  );
  assert.throws(
    () => validateExerciseCandidate({ ...exercise, statement: "x".repeat(2801) }),
    /2800/
  );
  assert.throws(
    () => validateExerciseCandidate({ ...exercise, category: "Catégorie inventée" }),
    /catégorie/
  );
});

test("Gemini generation returns a candidate only after an independent positive review", async (t) => {
  withEnv(t, { GEMINI_API_KEY: "unit-test-key", GEMINI_MODEL: "gemini-3.5-flash-lite" });
  const outputs = [exercise, { valid: true, issue: "", improvement: "" }];
  const prompts = [];
  mockFetch(t, async (url, options) => {
    assert.match(String(url), /models\/gemini-3\.5-flash-lite:generateContent/);
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    prompts.push(request.contents[0].parts[0].text);
    return responseJson({
      candidates: [{ content: { parts: [{ text: JSON.stringify(outputs.shift()) }] } }]
    });
  });

  const result = await generateVerifiedExercise(["An older statement"]);
  assert.equal(result.title, exercise.title);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /An older statement/);
  assert.match(prompts[1], /correcteur mathématique indépendant/i);
});

test("Gemini retries a candidate rejected by its verifier", async (t) => {
  withEnv(t, { GEMINI_API_KEY: "unit-test-key", GEMINI_MODEL: "gemini-3.5-flash-lite" });
  const alternative = { ...exercise, title: "Une seconde énigme" };
  const outputs = [
    exercise,
    { valid: false, issue: "La preuve est incomplète.", improvement: "Justifier la réciproque." },
    alternative,
    { valid: true, issue: "", improvement: "" }
  ];
  const prompts = [];
  mockFetch(t, async (_url, options) => {
    const request = JSON.parse(options.body);
    prompts.push(request.contents[0].parts[0].text);
    return responseJson({
      candidates: [{ content: { parts: [{ text: JSON.stringify(outputs.shift()) }] } }]
    });
  });

  const result = await generateVerifiedExercise([]);
  assert.equal(result.title, alternative.title);
  assert.equal(prompts.length, 4);
  assert.match(prompts[2], /La preuve est incomplète/);
});

test("Telegram candidate fits message limits and has the two expected actions", () => {
  const text = candidateText(exercise);
  const keyboard = candidateKeyboard(exercise.id);
  assert.ok(text.length < 4096);
  assert.match(text, /EXERCICE À VALIDER/);
  assert.equal(keyboard.inline_keyboard.length, 1);
  assert.equal(keyboard.inline_keyboard[0].length, 2);
  assert.match(keyboard.inline_keyboard[0][0].callback_data, /^publish:/);
  assert.match(keyboard.inline_keyboard[0][1].callback_data, /^regen:/);
  for (const button of keyboard.inline_keyboard[0]) {
    assert.ok(Buffer.byteLength(button.callback_data, "utf8") <= 64);
  }
});

test("Discord deferred response is ephemeral and solution payload contains no public message flags", () => {
  assert.deepEqual(deferredEphemeralResponse(), { type: 5, data: { flags: 64 } });
  const payload = solutionInteractionPayload(exercise);
  assert.match(payload.embeds[0].description, /obtenir 4/);
  assert.equal("flags" in payload, false);
});

test("Discord signature verification accepts authentic requests and rejects tampered or stale ones", (t) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  withEnv(t, { DISCORD_PUBLIC_KEY: spki.subarray(-32).toString("hex") });

  const raw = Buffer.from('{"type":1}');
  const { timestamp, signature } = signDiscordBody(raw, privateKey);
  assert.equal(verifyDiscordSignature(raw, signature, timestamp), true);
  assert.equal(verifyDiscordSignature(Buffer.from('{"type":2}'), signature, timestamp), false);
  assert.equal(verifyDiscordSignature(raw, signature, "1"), false);
  assert.equal(verifyDiscordSignature(raw, "bad", timestamp), false);
});

test("Supabase update includes an atomic expected-status filter", async (t) => {
  withEnv(t, {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
  });
  let captured;
  mockFetch(t, async (url, options) => {
    captured = { url: String(url), options };
    return responseJson([{ ...exercise, status: "publishing" }]);
  });

  const result = await updateExercise(exercise.id, "pending", { status: "publishing" });
  assert.equal(result.status, "publishing");
  assert.match(captured.url, /status=eq\.pending/);
  assert.equal(captured.options.method, "PATCH");
  assert.equal(captured.options.headers.Authorization, "Bearer test-service-role-key");
});

test("Health endpoint reports configuration booleans without leaking secret values", async (t) => {
  withEnv(t, {
    GEMINI_API_KEY: "secret-gemini",
    TELEGRAM_BOT_TOKEN: "secret-telegram",
    TELEGRAM_WEBHOOK_SECRET: "secret-webhook",
    TELEGRAM_ADMIN_ID: "123456",
    DISCORD_BOT_TOKEN: "secret-discord",
    DISCORD_PUBLIC_KEY: "secret-public-key",
    DISCORD_CHANNEL_ID: "987654",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "secret-supabase",
    CRON_SECRET: "secret-cron"
  });
  const res = makeResponse();
  await healthHandler({ method: "GET" }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.status, "ok");
  assert.ok(Object.values(body.configured).every((value) => value === true));
  assert.equal(JSON.stringify(body).includes("secret-"), false);
});

test("Cron endpoint refuses requests without the configured bearer secret", async (t) => {
  withEnv(t, { CRON_SECRET: "expected-secret" });
  let fetchCalled = false;
  mockFetch(t, async () => {
    fetchCalled = true;
    return responseJson([]);
  });
  const res = makeResponse();
  await cronHandler({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(fetchCalled, false);
});

test("Telegram webhook rejects an incorrect webhook secret", async (t) => {
  withEnv(t, { TELEGRAM_WEBHOOK_SECRET: "expected-secret" });
  let fetchCalled = false;
  mockFetch(t, async () => {
    fetchCalled = true;
    return responseJson({ ok: true, result: true });
  });
  const req = makeRequest({ message: { text: "/id" } }, {
    "x-telegram-bot-api-secret-token": "wrong-secret"
  });
  const res = makeResponse();
  await telegramHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(fetchCalled, false);
});

test("Telegram /id works during first setup before the admin ID is configured", async (t) => {
  withEnv(t, {
    TELEGRAM_BOT_TOKEN: "test-telegram-token",
    TELEGRAM_WEBHOOK_SECRET: "expected-secret",
    TELEGRAM_ADMIN_ID: undefined
  });
  let outgoing;
  mockFetch(t, async (url, options) => {
    outgoing = { url: String(url), body: JSON.parse(options.body) };
    return responseJson({ ok: true, result: { message_id: 1 } });
  });
  const req = makeRequest({
    message: {
      text: "/id",
      chat: { id: 7654321, type: "private" },
      from: { id: 7654321 }
    }
  }, { "x-telegram-bot-api-secret-token": "expected-secret" });
  const res = makeResponse();
  await telegramHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(outgoing.url, /sendMessage/);
  assert.match(outgoing.body.text, /7654321/);
});

test("Telegram callback from a non-admin cannot publish an exercise", async (t) => {
  withEnv(t, {
    TELEGRAM_BOT_TOKEN: "test-telegram-token",
    TELEGRAM_WEBHOOK_SECRET: "expected-secret",
    TELEGRAM_ADMIN_ID: "111111"
  });
  const calls = [];
  mockFetch(t, async (url, options) => {
    calls.push(String(url));
    assert.match(String(url), /answerCallbackQuery/);
    return responseJson({ ok: true, result: true });
  });
  const req = makeRequest({
    callback_query: {
      id: "callback-1",
      from: { id: 222222 },
      data: `publish:${exercise.id}`,
      message: { message_id: 10, chat: { id: 222222, type: "private" } }
    }
  }, { "x-telegram-bot-api-secret-token": "expected-secret" });
  const res = makeResponse();
  await telegramHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
});

test("Discord interaction endpoint acknowledges a private response before loading the solution", async (t) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  withEnv(t, { DISCORD_PUBLIC_KEY: spki.subarray(-32).toString("hex"), SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" });

  const calls = [];
  mockFetch(t, async (url, options) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.includes("/rest/v1/exercises")) {
      return responseJson([{
        ...exercise,
        status: "published",
        discord_message_id: "discord-message-1"
      }]);
    }
    if (target.includes("/webhooks/application-id/interaction-token/messages/@original")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  });

  const interaction = {
    type: 3,
    application_id: "application-id",
    token: "interaction-token",
    data: { custom_id: `solution:${exercise.id}` }
  };
  const rawBody = Buffer.from(JSON.stringify(interaction));
  const { timestamp, signature } = signDiscordBody(rawBody, privateKey);
  const req = Readable.from([rawBody]);
  req.method = "POST";
  req.headers = {
    "x-signature-ed25519": signature,
    "x-signature-timestamp": timestamp
  };
  const res = makeResponse();

  await discordHandler(req, res);

  const initialResponse = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(initialResponse.type, 5);
  assert.equal(initialResponse.data.flags, 64);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /rest\/v1\/exercises/);
  assert.match(calls[1].url, /messages\/@original/);
  const edited = JSON.parse(calls[1].options.body);
  assert.match(edited.embeds[0].description, /obtenir 4/);
  assert.equal("flags" in edited, false);
});

test("Discord endpoint rejects a request with an invalid signature", async (t) => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  withEnv(t, { DISCORD_PUBLIC_KEY: spki.subarray(-32).toString("hex") });
  mockFetch(t, async () => { throw new Error("Network must not be called"); });

  const req = makeRequest({ type: 1 }, {
    "x-signature-ed25519": "0".repeat(128),
    "x-signature-timestamp": String(Math.floor(Date.now() / 1000))
  });
  const res = makeResponse();
  await discordHandler(req, res);
  assert.equal(res.statusCode, 401);
});

test("Vercel config contains two daily UTC triggers and valid function durations", async () => {
  const { readFile } = await import("node:fs/promises");
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons.map((cron) => cron.schedule), ["0 16 * * *", "0 17 * * *"]);
  assert.equal(config.functions["api/cron/daily.js"].maxDuration, 300);
  assert.equal(config.functions["api/telegram/webhook.js"].maxDuration, 300);
  assert.equal(config.functions["api/discord/interactions.js"].maxDuration, 60);
});
