const CATEGORIES = [
  "Théorie des nombres",
  "Logique et raisonnement",
  "Infini et ensembles",
  "Combinatoire",
  "Constructions et contre-exemples",
  "Curiosités mathématiques"
];

async function askGemini(prompt, schema, temperature = 0.7) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      })
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  }
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini n'a renvoyé aucun contenu.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini a renvoyé un JSON invalide.");
  }
}

const exerciseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    statement: { type: "STRING" },
    solution: { type: "STRING" },
    category: { type: "STRING", enum: CATEGORIES },
    difficulty: { type: "STRING" }
  },
  required: ["title", "statement", "solution", "category", "difficulty"]
};

const reviewSchema = {
  type: "OBJECT",
  properties: {
    valid: { type: "BOOLEAN" },
    issue: { type: "STRING" },
    improvement: { type: "STRING" }
  },
  required: ["valid", "issue", "improvement"]
};

async function generateOne(avoid, feedback) {
  const prompt = `Tu es un auteur de petites énigmes mathématiques élégantes, destinées à des élèves entre Terminale spécialité maths et début de prépa MPSI.

Crée UN exercice original qui se résout en 5 à 10 minutes. Il doit être surprenant, un peu méta, développer la culture du raisonnement, et ne pas ressembler à un exercice scolaire standard ou à un calcul mécanique. Cherche une idée nette : théorie des nombres, logique, combinatoire, infini, construction, contre-exemple ou curiosité mathématique.

Contraintes impératives :
- L'énoncé doit être autonome, précis, sans ambiguïté et court.
- Une personne ayant le niveau indiqué doit pouvoir le résoudre sans connaissances spécialisées.
- La solution doit être entièrement correcte, détaillée mais concise, et justifier chaque étape importante.
- Si une hypothèse est nécessaire, écris-la explicitement dans l'énoncé.
- Évite les questions ouvertes, les problèmes de recherche trop longs, les problèmes célèbres sans angle nouveau, et les exercices nécessitant une calculatrice.
- N'invente pas de théorème ou de fait historique.
- N'utilise pas LaTeX brut difficile à afficher sur Discord : privilégie les notations simples Unicode et le texte.
- Ne donne pas d'indice dans l'énoncé.

Catégories possibles : ${CATEGORIES.join(", ")}.

Exercices récents à ne pas reprendre ou paraphraser :
${avoid.length ? avoid.map((s, i) => `${i + 1}. ${s}`).join("\n") : "Aucun."}

Retourne uniquement les champs JSON demandés.
${feedback ? `\nLa tentative précédente a été refusée pour cette raison : ${feedback}. Fais une proposition différente et corrige le problème.` : ""}`;
  return askGemini(prompt, exerciseSchema, 0.9);
}

async function verifyOne(exercise) {
  const prompt = `Tu es un correcteur mathématique indépendant et exigeant. Vérifie cet exercice destiné à un élève de Terminale / début MPSI.

ÉNONCÉ :
${exercise.statement}

SOLUTION PROPOSÉE :
${exercise.solution}

Vérifie indépendamment :
1. L'énoncé est-il bien posé et sans ambiguïté ?
2. La solution est-elle mathématiquement correcte, sans saut logique important ?
3. L'existence et/ou l'unicité demandées sont-elles réellement établies ?
4. Le niveau et le temps estimé sont-ils raisonnables (5 à 10 minutes) ?
5. La réponse traite-t-elle exactement la question posée ?

Réponds valid=true uniquement si tout est satisfaisant. En cas de doute mathématique sérieux, réponds false et explique précisément le problème dans issue. improvement doit indiquer la correction à apporter. Réponds en JSON uniquement.`;
  return askGemini(prompt, reviewSchema, 0.1);
}

export async function generateVerifiedExercise(avoid = []) {
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const exercise = await generateOne(avoid, feedback);
    if (
      !exercise?.title?.trim() ||
      !exercise?.statement?.trim() ||
      !exercise?.solution?.trim() ||
      !CATEGORIES.includes(exercise.category)
    ) {
      feedback = "La réponse est incomplète ou mal structurée.";
      continue;
    }
    const review = await verifyOne(exercise);
    if (review.valid === true) return exercise;
    feedback = [review.issue, review.improvement].filter(Boolean).join(" ");
  }
  throw new Error(`Aucun exercice n'a passé la vérification après trois essais. Dernier retour : ${feedback}`);
}
