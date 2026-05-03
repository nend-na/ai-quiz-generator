import { config } from "dotenv";
config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const FRONTEND = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND, {
  etag: false, maxAge: 0,
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store")
}));
app.get("/", (_, res) => res.sendFile(path.join(FRONTEND, "index.html")));

const GROQ_MODEL = "llama-3.3-70b-versatile";

/* ── Groq API ──────────────────────────────────────────── */

async function callGroq(systemMsg, userMsg, maxTokens = 4096) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.8,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user",   content: userMsg   }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq.");
  return text;
}

/* ── JSON Parser ───────────────────────────────────────── */

function parseQuizJSON(raw) {
  const clean = raw.replace(/```(?:json)?/gi, "").trim();
  const start = clean.indexOf("[");
  const end   = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in response.");
  return JSON.parse(clean.slice(start, end + 1));
}

/* ── Prompt Builder ────────────────────────────────────── */

function difficultyNote(level) {
  if (level === "easy") return "Simple questions for beginners. Basic vocabulary, fundamental concepts only.";
  if (level === "hard") return "Very challenging. Deep knowledge required. Tricky options, edge cases, advanced concepts.";
  return "Moderately challenging. Suitable for someone with general knowledge of the topic.";
}

function buildQuizPrompt(mode, input, difficulty) {
  const level  = difficulty || "medium";
  const shared = `Generate exactly 10 quiz questions. Return ONLY a JSON array, no markdown, no explanation.
Each item: { "question": "...", "options": ["A","B","C","D"], "correctAnswer": "exact match from options" }
Difficulty: ${level.toUpperCase()} — ${difficultyNote(level)}
Rules: factual, specific, all 4 options plausible, shuffle positions, correctAnswer must exactly match one option.`;
  if (mode === "text") return shared + `\n\nText:\n"""\n${input}\n"""\n\nGenerate 10 ${level} questions strictly from this text.`;
  return shared + `\n\nTopic: "${input}"\n\nGenerate 10 ${level} questions covering: definition, key facts, history, real-world usage, and examples.`;
}

/* ── Validator ─────────────────────────────────────────── */

function validateQuiz(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error("Empty or invalid quiz.");
  return data.map((q, i) => {
    if (!q.question || typeof q.question !== "string") throw new Error(`Q${i+1} missing question.`);
    if (!Array.isArray(q.options) || q.options.length < 2) throw new Error(`Q${i+1} invalid options.`);
    if (!q.correctAnswer || !q.options.includes(q.correctAnswer)) throw new Error(`Q${i+1} correctAnswer not found in options.`);
    return q;
  });
}

/* ── Daily Challenge Cache ─────────────────────────────── */
// Rotates every 24 hours server-side. Same quiz for all users that day.

const DAILY_TOPICS = [
  "Photosynthesis", "World War II", "The Solar System", "Human Anatomy",
  "Climate Change", "Artificial Intelligence", "The Renaissance",
  "Economics Basics", "Quantum Physics", "Ancient Rome",
  "The Water Cycle", "Democracy and Government", "Newton's Laws",
  "The French Revolution", "DNA and Genetics", "The Internet and Networking",
  "Black Holes", "The Human Brain", "Plate Tectonics", "The Cold War",
  "Vaccines and Immunology", "Machine Learning", "Shakespeare",
  "The Industrial Revolution", "Space Exploration"
];

let dailyCache = {
  date:       null,   // "YYYY-MM-DD"
  topic:      null,
  difficulty: "medium",
  quiz:       null,
  generating: false
};

function getTodayString() {
  return new Date().toISOString().slice(0, 10); // "2026-04-30"
}

function getTodayTopic() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return DAILY_TOPICS[dayIndex % DAILY_TOPICS.length];
}

function getTimeUntilMidnight() {
  const now       = new Date();
  const midnight  = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight - now; // ms
}

async function generateDailyQuiz() {
  const today = getTodayString();
  const topic = getTodayTopic();

  // Already generated for today
  if (dailyCache.date === today && dailyCache.quiz) {
    return dailyCache;
  }

  // Prevent parallel generation
  if (dailyCache.generating) {
    // Wait for the ongoing generation
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (!dailyCache.generating) { clearInterval(check); resolve(); }
      }, 200);
    });
    if (dailyCache.date === today && dailyCache.quiz) return dailyCache;
  }

  dailyCache.generating = true;
  console.log(`[daily] Generating daily quiz for: "${topic}" (${today})`);

  try {
    const raw  = await callGroq(
      "You are a quiz generation engine. Output ONLY raw JSON arrays. No markdown, no explanation.",
      buildQuizPrompt("topic", topic, "medium")
    );
    const quiz = validateQuiz(parseQuizJSON(raw));

    dailyCache = {
      date:       today,
      topic,
      difficulty: "medium",
      quiz,
      generating: false
    };
    console.log(`[daily] Quiz generated: ${quiz.length} questions for "${topic}"`);

    // Schedule automatic cache reset at midnight
    setTimeout(() => {
      console.log("[daily] Midnight reset — clearing daily cache.");
      dailyCache = { date: null, topic: null, difficulty: "medium", quiz: null, generating: false };
    }, getTimeUntilMidnight());

  } catch (err) {
    dailyCache.generating = false;
    throw err;
  }

  return dailyCache;
}

/* ── Routes ────────────────────────────────────────────── */

// Daily challenge meta (topic, difficulty, time remaining)
app.get("/api/daily", async (req, res) => {
  try {
    const today = getTodayString();
    const topic = getTodayTopic();
    const msLeft = getTimeUntilMidnight();

    res.json({
      topic,
      difficulty: "medium",
      date:       today,
      msUntilReset: msLeft,
      ready: dailyCache.date === today && !!dailyCache.quiz
    });
  } catch (err) {
    console.error("[/api/daily]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Daily challenge quiz (generates and caches server-side)
app.get("/api/daily/quiz", async (req, res) => {
  try {
    const cached = await generateDailyQuiz();
    res.json({
      topic:      cached.topic,
      difficulty: cached.difficulty,
      date:       cached.date,
      quiz:       cached.quiz,
      msUntilReset: getTimeUntilMidnight()
    });
  } catch (err) {
    console.error("[/api/daily/quiz]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/text-quiz", async (req, res) => {
  try {
    const text       = req.body?.text?.trim();
    const difficulty = req.body?.difficulty || "medium";
    if (!text || text.length < 20) return res.status(400).json({ error: "Please provide more text." });
    console.log(`[text-quiz] Calling Groq (${difficulty})...`);
    const raw  = await callGroq(
      "You are a quiz generation engine. Output ONLY raw JSON arrays. No markdown, no explanation.",
      buildQuizPrompt("text", text, difficulty)
    );
    const quiz = validateQuiz(parseQuizJSON(raw));
    console.log(`[text-quiz] ${quiz.length} questions generated.`);
    res.json(quiz);
  } catch (err) {
    console.error("[text-quiz]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/topic-quiz", async (req, res) => {
  try {
    const topic      = req.body?.topic?.trim();
    const difficulty = req.body?.difficulty || "medium";
    if (!topic) return res.status(400).json({ error: "Please provide a topic." });
    console.log(`[topic-quiz] Calling Groq for: "${topic}" (${difficulty})`);
    const raw  = await callGroq(
      "You are a quiz generation engine. Output ONLY raw JSON arrays. No markdown, no explanation.",
      buildQuizPrompt("topic", topic, difficulty)
    );
    const quiz = validateQuiz(parseQuizJSON(raw));
    console.log(`[topic-quiz] ${quiz.length} questions generated.`);
    res.json(quiz);
  } catch (err) {
    console.error("[topic-quiz]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/explain", async (req, res) => {
  try {
    const { question, correctAnswer } = req.body;
    if (!question || !correctAnswer) return res.status(400).json({ error: "Missing fields." });
    const prompt = `Question: "${question}"\nCorrect answer: "${correctAnswer}"\n\nWrite one clear sentence (max 30 words) explaining why this is correct. Be specific and factual. No preamble.`;
    const explanation = await callGroq(
      "You are a concise educational explainer. One sentence only. No bullet points.",
      prompt, 256
    );
    res.json({ explanation: explanation.trim() });
  } catch (err) {
    console.error("[explain]", err.message);
    res.status(500).json({ explanation: req.body?.correctAnswer ?? "" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", model: GROQ_MODEL, dailyCached: dailyCache.date === getTodayString() }));

/* ── Start ─────────────────────────────────────────────── */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY not set!");

  // Pre-warm the daily quiz on startup
  generateDailyQuiz().catch(err => console.warn("[daily] Pre-warm failed:", err.message));
});