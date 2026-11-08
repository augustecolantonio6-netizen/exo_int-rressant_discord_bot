function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.");
  return { url, key };
}

export async function dbRequest(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      // Modern Supabase secret keys (sb_secret_...) are opaque API keys, not JWTs.
      // Legacy service_role values are JWTs and remain valid in the Bearer header.
      ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${body.slice(0, 500)}`);
  }
  return body ? JSON.parse(body) : null;
}

export async function getActiveExercise(date) {
  const rows = await dbRequest(
    `exercises?select=*&exercise_date=eq.${encodeURIComponent(date)}&status=in.(pending,publishing,published)&limit=1`
  );
  return rows[0] || null;
}

export async function getExercise(id) {
  const rows = await dbRequest(`exercises?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0] || null;
}

export async function getRecentStatements(limit = 25) {
  const rows = await dbRequest(`exercises?select=statement&order=created_at.desc&limit=${limit}`);
  return rows.map((row) => row.statement);
}

export async function insertExercise(exercise, date) {
  const rows = await dbRequest("exercises", {
    method: "POST",
    body: JSON.stringify({
      exercise_date: date,
      title: exercise.title,
      statement: exercise.statement,
      solution: exercise.solution,
      category: exercise.category,
      difficulty: exercise.difficulty || "Terminale → MPSI",
      status: "pending"
    })
  });
  return rows[0];
}

export async function updateExercise(id, expectedStatus, patch) {
  const rows = await dbRequest(
    `exercises?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(expectedStatus)}&select=*`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
  return rows[0] || null;
}
