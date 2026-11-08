export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function parisDate(date = new Date()) {
  const p = parisDateParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isParisSixPm(date = new Date()) {
  return parisDateParts(date).hour === "18";
}


/**
 * Hobby Cron schedules have hour-level timing precision. Our two UTC schedules
 * cover the Paris 18:00 hour in winter/summer; the 19:00 hour is a fallback
 * for the second daily invocation if the first run could not create a proposal.
 */
export function isParisCronWindow(date = new Date()) {
  const hour = Number(parisDateParts(date).hour);
  return hour === 18 || hour === 19;
}
