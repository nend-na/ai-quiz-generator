/* ================================================================
   script.js — QuizAI
   One-question-per-screen quiz engine
   Handles: text-quiz.html, chat-quiz.html (including daily mode)
================================================================ */

import {
  getPoints, addPoints, updateStreak, updateStats,
  addHistory, addScore, isNewHighScore, updateWeakAreas,
  getDark, setDark, completeDailyChallenge, isDailyDone
} from './storage.js';

const API = window.location.origin === "null" ? "http://localhost:5000" : window.location.origin;

/* ── State ──────────────────────────────────────────────────────── */
let quizData           = [];
let userAnswers        = [];
let currentIndex       = 0;
let submitted          = false;
let selectedDifficulty = "medium";
let timerMode          = "none";
let timerInterval      = null;
let timeLeft           = 0;
let quizStartTime      = null;
let currentTopic       = "";
let isDaily            = false;
let dailyDate          = null;
let transitioning      = false;

const QUESTION_TIME = 20;
const TOTAL_TIME    = 180;
const MAX_RETRIES   = 2;

const isTextPage = !!document.getElementById("textInput");
const isChatPage = !!document.getElementById("messages");

/* ── Dark mode ──────────────────────────────────────────────────── */
if (getDark()) document.body.classList.add("dark");

document.getElementById("btn-dark")?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  setDark(document.body.classList.contains("dark"));
});

/* ── Difficulty & Timer selectors ───────────────────────────────── */
document.getElementById("diff-group")?.querySelectorAll(".sel-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("diff-group").querySelectorAll(".sel-btn")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedDifficulty = btn.dataset.level;
    console.log("[settings] Difficulty:", selectedDifficulty);
  });
});

document.getElementById("timer-group")?.querySelectorAll(".sel-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("timer-group").querySelectorAll(".sel-btn")
      .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    timerMode = btn.dataset.mode;
    console.log("[settings] Timer mode:", timerMode);
  });
});

/* ── Text quiz generate button ──────────────────────────────────── */
if (isTextPage) {
  document.getElementById("btn-generate")?.addEventListener("click", generateFromText);
  document.getElementById("btn-clear")?.addEventListener("click", clearAll);
}

/* ── Topic quiz generate button ─────────────────────────────────── */
if (isChatPage) {
  document.getElementById("btn-generate")?.addEventListener("click", generateFromTopic);
  document.getElementById("topicInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") generateFromTopic();
  });
}

/* ══════════════════════════════════════════════════════════════════
   DAILY CHALLENGE — Auto-detect and launch with NO user input
══════════════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", async () => {
  const params  = new URLSearchParams(window.location.search);
  const isDaily_ = params.get("daily") === "1";
  const suggest  = sessionStorage.getItem("quizai-suggest");

  if (isDaily_ && isChatPage) {
    /* ── Daily challenge mode ──
       Hide the normal topic input UI entirely.
       Show a loading card instead.
       Fetch the quiz directly from the backend — NO user input required.
    ── */
    isDaily = true;
    const topicUi    = document.getElementById("topic-ui");
    const autoLoader = document.getElementById("auto-loading");
    const pageTag    = document.getElementById("page-tag");
    const pageTitle  = document.getElementById("page-title");
    const pageSub    = document.getElementById("page-subtitle");

    if (topicUi)    topicUi.style.display    = "none";
    if (autoLoader) autoLoader.style.display = "block";
    if (pageTag)    pageTag.textContent       = "Daily Challenge";
    if (pageTitle)  pageTitle.textContent     = "Today's Challenge";
    if (pageSub)    pageSub.textContent       = "A new quiz every day. Automatically generated — no input needed.";

    console.log("[daily] Auto-fetching daily quiz from /api/daily/quiz...");
    await loadAndStartDailyQuiz();

  } else if (suggest && isChatPage) {
    /* ── Pre-fill from weak area suggestion ── */
    const input = document.getElementById("topicInput");
    if (input) {
      input.value = suggest;
      console.log("[suggest] Pre-filled topic:", suggest);
    }
    sessionStorage.removeItem("quizai-suggest");
  }
});

/* ── Fetch daily quiz from backend and start immediately ─────────── */
async function loadAndStartDailyQuiz() {
  const loadingTitle = document.getElementById("auto-loading-title");
  const loadingSub   = document.getElementById("auto-loading-sub");

  try {
    const dTopic = sessionStorage.getItem("quizai-daily-topic");
    const dDate  = sessionStorage.getItem("quizai-daily-date");

    // Check if already completed today
    if (dDate && isDailyDone(dDate)) {
      showAutoLoadError(
        "Already Completed",
        "You have already completed today's daily challenge. Come back tomorrow!"
      );
      console.log("[daily] Already done today:", dDate);
      return;
    }

    if (loadingTitle) loadingTitle.textContent = "Fetching today's quiz...";
    if (loadingSub)   loadingSub.textContent   = "This may take a few seconds.";

    const res = await fetchWithRetry("/api/daily/quiz", { method: "GET" });

    console.log("[daily] Quiz received:", res.topic, res.quiz?.length, "questions");

    if (!res.quiz || !Array.isArray(res.quiz) || res.quiz.length === 0) {
      throw new Error("Server returned an empty quiz. Please try again.");
    }

    // Store date for completion tracking
    dailyDate    = res.date;
    currentTopic = res.topic;
    selectedDifficulty = res.difficulty || "medium";

    // Clean up sessionStorage keys
    sessionStorage.removeItem("quizai-daily-topic");
    sessionStorage.removeItem("quizai-daily-date");

    // Hide loader, start quiz
    const autoLoader = document.getElementById("auto-loading");
    if (autoLoader) autoLoader.style.display = "none";

    quizData = res.quiz;
    console.log("[daily] Starting quiz screen for:", currentTopic);
    startQuizScreen();

  } catch (err) {
    console.error("[daily] Failed to load daily quiz:", err.message);
    showAutoLoadError(
      "Could Not Load Daily Challenge",
      `${err.message}. Make sure the server is running and try again.`
    );
  }
}

/* ── Show error inside the auto-loading card ─────────────────────── */
function showAutoLoadError(title, message) {
  const autoLoader = document.getElementById("auto-loading");
  if (!autoLoader) return;
  autoLoader.innerHTML = `
    <div class="card" style="text-align:center;padding:2.5rem 2rem;">
      <div style="font-size:1.5rem;margin-bottom:0.75rem;">&#9888;</div>
      <div style="font-weight:700;font-size:1rem;margin-bottom:0.4rem;">${title}</div>
      <div style="font-size:0.86rem;color:var(--muted);line-height:1.6;margin-bottom:1.25rem;">${message}</div>
      <div style="display:flex;gap:0.65rem;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-retry-daily">Try Again</button>
        <a href="index.html" class="btn btn-secondary">Go Home</a>
      </div>
    </div>`;
  document.getElementById("btn-retry-daily")?.addEventListener("click", () => {
    window.location.reload();
  });
}

/* ── Fetch with retry ────────────────────────────────────────────── */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `Server error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn(`[fetch] Attempt ${i+1} failed:`, err.message);
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
}

/* ── Generate from Text ──────────────────────────────────────────── */
async function generateFromText() {
  const input = document.getElementById("textInput");
  if (!input) return;
  const text = input.value.trim();
  hideError();

  if (text.length < 30) {
    showError("Please enter at least a sentence or two of text (minimum 30 characters).");
    return;
  }

  currentTopic = text.slice(0, 40) + (text.length > 40 ? "..." : "");
  setLoading(true);
  console.log("[text-quiz] Generating from text, difficulty:", selectedDifficulty);

  try {
    const data = await fetchWithRetry(`${API}/api/text-quiz`, {
      method: "POST",
      body: JSON.stringify({ text, difficulty: selectedDifficulty })
    });
    if (!Array.isArray(data) || !data.length) throw new Error("No questions returned.");
    quizData = data;
    console.log("[text-quiz] Got", quizData.length, "questions. Starting quiz.");
    startQuizScreen();
  } catch (err) {
    console.error("[text-quiz] Error:", err.message);
    showError(`Could not generate quiz: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

/* ── Generate from Topic ─────────────────────────────────────────── */
async function generateFromTopic() {
  const input = document.getElementById("topicInput");
  if (!input) return;
  const topic = input.value.trim();
  if (!topic) {
    appendMessage("Please enter a topic first.", "error");
    return;
  }

  currentTopic = topic;
  appendMessage(topic, "user");
  input.value = "";
  setLoading(true);
  console.log("[topic-quiz] Generating for:", topic, "difficulty:", selectedDifficulty);

  try {
    const data = await fetchWithRetry(`${API}/api/topic-quiz`, {
      method: "POST",
      body: JSON.stringify({ topic, difficulty: selectedDifficulty })
    });
    if (!Array.isArray(data) || !data.length) throw new Error("No questions returned.");
    quizData = data;
    appendMessage(
      `Your <strong>${selectedDifficulty}</strong> quiz on <strong>${escapeHtml(topic)}</strong> is ready.`,
      "ai"
    );
    console.log("[topic-quiz] Got", quizData.length, "questions. Starting quiz.");
    startQuizScreen();
  } catch (err) {
    console.error("[topic-quiz] Error:", err.message);
    appendMessage(`Could not generate quiz: ${err.message}`, "error");
  } finally {
    setLoading(false);
  }
}

/* ══════════════════════════════════════════════════════════════════
   ONE-QUESTION-PER-SCREEN ENGINE
══════════════════════════════════════════════════════════════════ */

function startQuizScreen() {
  userAnswers   = new Array(quizData.length).fill(null);
  currentIndex  = 0;
  submitted     = false;
  transitioning = false;
  quizStartTime = Date.now();

  document.getElementById("quiz-screen")?.remove();
  document.getElementById("score-screen")?.remove();

  const screen = buildQuizScreen();
  document.body.appendChild(screen);
  renderQuestion(currentIndex);
  console.log("[quiz] Screen started. Total questions:", quizData.length);

  stopTimer();
  if (timerMode === "total") {
    startTimer(TOTAL_TIME, () => finishQuiz(true));
  } else if (timerMode === "question") {
    startTimer(QUESTION_TIME, handleQuestionTimerExpire);
  }
}

function buildQuizScreen() {
  const screen = document.createElement("div");
  screen.className = "quiz-screen";
  screen.id        = "quiz-screen";

  const timerHTML = timerMode !== "none" ? `
    <div class="qscreen-timer" id="qs-timer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span class="qs-timer-val">--</span>
    </div>` : "";

  screen.innerHTML = `
    <div class="qscreen-header">
      <button class="qscreen-close" id="btn-close-quiz" title="Exit quiz">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="qscreen-progress">
        <div class="qscreen-progress-label">
          <span id="qs-progress-label">Question 1 of ${quizData.length}</span>
          <span id="qs-progress-pct">0% answered</span>
        </div>
        <div class="qscreen-progress-track">
          <div class="qscreen-progress-fill" id="qs-progress-fill" style="width:0%"></div>
        </div>
      </div>
      ${timerHTML}
    </div>

    <div class="qscreen-body" id="qs-body"></div>

    <div class="qscreen-footer">
      <div class="qscreen-dots" id="qs-dots"></div>
      <div class="qscreen-nav">
        <button class="qscreen-btn" id="qs-back" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <button class="qscreen-btn" id="qs-skip">Skip</button>
        <button class="qscreen-btn qscreen-btn-submit" id="qs-submit" style="display:none;">
          Submit Quiz
        </button>
      </div>
    </div>`;

  // Wire up buttons inside quiz screen
  screen.querySelector("#btn-close-quiz").addEventListener("click", () => {
    if (confirm("Exit the quiz? Your progress will be lost.")) {
      stopTimer();
      screen.remove();
    }
  });
  screen.querySelector("#qs-back").addEventListener("click", goBack);
  screen.querySelector("#qs-skip").addEventListener("click", skipQuestion);
  screen.querySelector("#qs-submit").addEventListener("click", () => finishQuiz(false));

  renderDots(screen);
  return screen;
}

function renderQuestion(idx) {
  const body = document.getElementById("qs-body");
  if (!body) return;

  const q    = quizData[idx];
  const card = document.createElement("div");
  card.className = "qscreen-card";
  card.id        = "qs-card";

  card.innerHTML = `
    <div class="qcard-tag">Question ${idx + 1} of ${quizData.length}</div>
    <div class="qcard-question">${escapeHtml(q.question)}</div>
    <div class="qcard-options" id="qs-options">
      ${q.options.map((opt, j) => `
        <button
          class="qcard-option${userAnswers[idx] === opt ? " selected" : ""}"
          data-opt="${escapeHtml(opt)}"
          data-idx="${idx}"
          ${userAnswers[idx] !== null ? "disabled" : ""}
        >
          <span class="qcard-option-letter">${String.fromCharCode(65 + j)}</span>
          <span>${escapeHtml(opt)}</span>
        </button>`).join("")}
    </div>`;

  // Wire option clicks
  card.querySelectorAll(".qcard-option").forEach(btn => {
    btn.addEventListener("click", () => selectAnswer(btn.dataset.idx * 1, btn));
  });

  body.innerHTML = "";
  body.appendChild(card);

  updateProgress(idx);
  updateDots(idx);
  updateFooterButtons(idx);
}

function updateProgress(idx) {
  const answered = userAnswers.filter(a => a !== null).length;
  const pct      = Math.round((answered / quizData.length) * 100);
  const fill  = document.getElementById("qs-progress-fill");
  const label = document.getElementById("qs-progress-label");
  const pctEl = document.getElementById("qs-progress-pct");
  if (fill)  fill.style.width  = `${pct}%`;
  if (label) label.textContent = `Question ${idx + 1} of ${quizData.length}`;
  if (pctEl) pctEl.textContent = `${pct}% answered`;
}

function updateFooterButtons(idx) {
  const backBtn   = document.getElementById("qs-back");
  const skipBtn   = document.getElementById("qs-skip");
  const submitBtn = document.getElementById("qs-submit");
  if (backBtn) backBtn.disabled = idx === 0;
  const allAnswered = userAnswers.every(a => a !== null);
  const isLast      = idx === quizData.length - 1;
  if (submitBtn) submitBtn.style.display = (allAnswered || isLast) ? "flex" : "none";
  if (skipBtn)   skipBtn.style.display   = (allAnswered || isLast) ? "none"  : "inline-flex";
}

function renderDots(screen) {
  const dotsEl = screen.querySelector("#qs-dots");
  if (!dotsEl) return;
  dotsEl.innerHTML = quizData.map((_, i) => `
    <div class="qdot${i === 0 ? " current" : ""}" id="qdot-${i}" data-i="${i}" title="Question ${i+1}"></div>`
  ).join("");

  // Jump-to navigation via dots
  dotsEl.querySelectorAll(".qdot").forEach(dot => {
    dot.addEventListener("click", () => {
      const i = dot.dataset.i * 1;
      if (!transitioning && i !== currentIndex) slideToQuestion(currentIndex, i);
    });
  });
}

function updateDots(idx) {
  quizData.forEach((_, i) => {
    const dot = document.getElementById(`qdot-${i}`);
    if (!dot) return;
    dot.className = "qdot";
    if (i === idx) dot.classList.add("current");
    else if (userAnswers[i] !== null) dot.classList.add("answered");
  });
}

/* ── Answer selection ────────────────────────────────────────────── */
function selectAnswer(idx, btn) {
  if (transitioning || userAnswers[idx] !== null) return;

  userAnswers[idx] = btn.dataset.opt;
  transitioning    = true;

  btn.classList.add("selected");
  document.getElementById("qs-options")?.querySelectorAll(".qcard-option")
    .forEach(b => { b.disabled = true; });

  if (timerMode === "question") stopTimer();

  setTimeout(() => {
    transitioning = false;
    const allAnswered = userAnswers.every(a => a !== null);
    if (allAnswered) {
      finishQuiz(false);
      return;
    }
    // Find next unanswered
    let next = idx + 1;
    while (next < quizData.length && userAnswers[next] !== null) next++;
    if (next >= quizData.length) {
      // Wrap to first unanswered
      next = userAnswers.indexOf(null);
    }
    if (next !== -1) {
      slideToQuestion(idx, next);
    } else {
      finishQuiz(false);
    }
  }, 400);
}

function slideToQuestion(fromIdx, toIdx) {
  const card = document.getElementById("qs-card");
  if (card) {
    card.classList.add("slide-out");
    setTimeout(() => {
      currentIndex = toIdx;
      if (timerMode === "question") startTimer(QUESTION_TIME, handleQuestionTimerExpire);
      renderQuestion(toIdx);
    }, 150);
  } else {
    currentIndex = toIdx;
    renderQuestion(toIdx);
  }
}

function goBack() {
  if (currentIndex === 0 || transitioning) return;
  slideToQuestion(currentIndex, currentIndex - 1);
}

function skipQuestion() {
  if (transitioning) return;
  const next = currentIndex + 1;
  if (next < quizData.length) slideToQuestion(currentIndex, next);
}

function handleQuestionTimerExpire() {
  const next = currentIndex + 1;
  if (next < quizData.length) {
    slideToQuestion(currentIndex, next);
    setTimeout(() => startTimer(QUESTION_TIME, handleQuestionTimerExpire), 200);
  } else {
    finishQuiz(true);
  }
}

/* ── Timer ───────────────────────────────────────────────────────── */
function startTimer(seconds, onExpire) {
  clearInterval(timerInterval);
  timeLeft = seconds;
  updateTimerEl(timeLeft, seconds);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerEl(timeLeft, seconds);
    if (timeLeft <= 0) { clearInterval(timerInterval); onExpire(); }
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
function updateTimerEl(left, total) {
  const el = document.getElementById("qs-timer");
  if (!el) return;
  const m = Math.floor(left / 60), s = left % 60;
  el.querySelector(".qs-timer-val").textContent =
    m > 0 ? `${m}:${String(s).padStart(2,"0")}` : `${left}s`;
  el.classList.remove("warning","danger");
  const p = left / total;
  if (p <= 0.2) el.classList.add("danger");
  else if (p <= 0.4) el.classList.add("warning");
}
function getElapsed() {
  if (!quizStartTime) return "";
  const s = Math.round((Date.now() - quizStartTime) / 1000);
  return Math.floor(s/60) > 0 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
}

/* ── Finish & Score ──────────────────────────────────────────────── */
async function finishQuiz(auto = false) {
  if (submitted) return;
  submitted = true;
  stopTimer();
  console.log("[quiz] Finishing. Auto:", auto);

  const elapsed = getElapsed();
  let score = 0;
  const results = quizData.map((q, i) => {
    const userAns = userAnswers[i];
    const correct = userAns === q.correctAnswer;
    if (correct) score++;
    return { question: q.question, userAnswer: userAns, correctAnswer: q.correctAnswer, correct };
  });

  const pct    = Math.round((score / quizData.length) * 100);
  const streak = updateStreak();
  updateStats(score, quizData.length);
  updateWeakAreas(currentTopic, results);

  const earnedPoints =
    score * 10 +
    (pct >= 80 ? 20 : 0) +
    (streak.count > 1 ? 10 : 0) +
    (isDaily ? 50 : 0);
  const newTotal = addPoints(earnedPoints);

  const histEntry = {
    topic:      currentTopic,
    score,
    total:      quizData.length,
    difficulty: selectedDifficulty,
    time:       elapsed,
    date:       new Date().toLocaleDateString()
  };
  addHistory(histEntry);
  const isHS = isNewHighScore(currentTopic, selectedDifficulty, score, quizData.length);
  addScore(histEntry);

  if (isDaily && dailyDate) {
    completeDailyChallenge(dailyDate);
    console.log("[daily] Marked complete for:", dailyDate);
  }

  document.getElementById("quiz-screen")?.remove();
  showScoreScreen({ score, total: quizData.length, pct, streak, earned: earnedPoints, newTotal, isHS, elapsed, auto, results });
  showPointsPopup(earnedPoints);
}

function showScoreScreen({ score, total, pct, streak, earned, newTotal, isHS, elapsed, auto, results }) {
  const [gradeClass, gradeLabel, gradeMsg] =
    pct === 100 ? ["grade-perfect","Perfect Score","You answered every question correctly."]
    : pct >= 70  ? ["grade-good",   "Good Result",  "Solid understanding of this topic."]
    : pct >= 40  ? ["grade-fair",   "Keep Going",   "Review the highlighted answers and try again."]
    :              ["grade-low",    "Needs Review", "Go back and study the material again."];

  const diff = selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1);

  const screen = document.createElement("div");
  screen.className = "score-screen";
  screen.id        = "score-screen";

  screen.innerHTML = `
    <div class="score-screen-inner">
      <div class="score-hero">
        <div class="score-circle">
          <div class="score-circle-num">${score}</div>
          <div class="score-circle-den">/ ${total}</div>
        </div>
        <div class="score-pct-big" style="color:${pct>=70?"var(--accent)":pct>=40?"var(--gold)":"var(--red)"}">${pct}%</div>
        <div class="score-label">${gradeLabel}</div>
        <div class="score-sub">${gradeMsg}</div>
        <div class="score-sub" style="margin-top:0.3rem;color:var(--muted);font-size:0.8rem;">
          ${diff} difficulty${elapsed ? ` &middot; ${elapsed}` : ""}${auto ? " &middot; Time expired" : ""}
        </div>
        <div class="score-badges">
          ${isHS ? '<span class="badge badge-gold">New High Score</span>' : ""}
          ${streak.count > 1 ? `<span class="badge badge-streak">${streak.count} Day Streak</span>` : ""}
          ${isDaily ? '<span class="badge badge-gold">Daily +50 pts</span>' : ""}
          <span class="badge badge-points">+${earned} pts &middot; ${newTotal} total</span>
        </div>
      </div>

      <div class="score-actions">
        <button class="btn btn-primary" id="btn-retry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Try Again
        </button>
        <button class="btn btn-secondary" id="btn-go-home">Home</button>
        <a href="dashboard.html" class="btn btn-secondary">Dashboard</a>
      </div>

      <div class="review-section">
        <div class="review-title">Review Answers</div>
        <div id="review-cards"></div>
      </div>
    </div>`;

  document.body.appendChild(screen);

  screen.querySelector("#btn-retry").addEventListener("click", restartQuiz);
  screen.querySelector("#btn-go-home").addEventListener("click", () => {
    screen.remove();
  });

  // Render review cards
  const reviewEl = screen.querySelector("#review-cards");
  results.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = `review-card ${r.correct ? "correct-card" : "wrong-card"}`;
    card.style.animationDelay = `${i * 0.04}s`;

    const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const crossIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const userRow = r.userAnswer
      ? `<div class="review-ans ${r.correct ? "correct-ans" : "wrong-ans"}">
           <span class="review-ans-icon">${r.correct ? checkIcon : crossIcon}</span>
           Your answer: ${escapeHtml(r.userAnswer)}
         </div>`
      : `<div class="review-ans neutral-ans">No answer given</div>`;

    const correctRow = !r.correct
      ? `<div class="review-ans correct-ans">
           <span class="review-ans-icon">${checkIcon}</span>
           Correct: ${escapeHtml(r.correctAnswer)}
         </div>`
      : "";

    card.innerHTML = `
      <div class="review-q-num">Question ${i + 1}</div>
      <div class="review-q-text">${escapeHtml(r.question)}</div>
      <div class="review-answers">${userRow}${correctRow}</div>
      <div class="review-explanation loading" id="exp-${i}">Loading explanation...</div>`;

    reviewEl.appendChild(card);
  });

  loadExplanations(results);
}

function restartQuiz() {
  document.getElementById("score-screen")?.remove();
  submitted     = false;
  userAnswers   = new Array(quizData.length).fill(null);
  currentIndex  = 0;
  transitioning = false;
  isDaily       = false;
  startQuizScreen();
}

/* ── Explanations ────────────────────────────────────────────────── */
async function loadExplanations(results) {
  for (let i = 0; i < results.length; i++) {
    const el = document.getElementById(`exp-${i}`);
    if (!el) continue;
    try {
      const data = await fetchWithRetry(`${API}/api/explain`, {
        method: "POST",
        body: JSON.stringify({ question: results[i].question, correctAnswer: results[i].correctAnswer })
      });
      el.classList.remove("loading");
      el.innerHTML = `<strong>Explanation:</strong> ${escapeHtml(data.explanation || results[i].correctAnswer)}`;
    } catch {
      el.classList.remove("loading");
      el.innerHTML = `<strong>Correct answer:</strong> ${escapeHtml(results[i].correctAnswer)}`;
    }
  }
}

/* ── UI helpers ──────────────────────────────────────────────────── */
function setLoading(on) {
  const loader  = document.getElementById("loader");
  const genBtn  = document.getElementById("btn-generate");
  const skel    = document.getElementById("skeleton");
  if (loader) loader.classList.toggle("active", on);
  if (genBtn) genBtn.disabled = on;
  if (skel)   skel.style.display = on ? "block" : "none";
}
function showError(msg) {
  const el = document.getElementById("text-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}
function hideError() {
  const el = document.getElementById("text-error");
  if (el) el.style.display = "none";
}
function appendMessage(text, who) {
  const msgs = document.getElementById("messages");
  if (!msgs) return;
  const div = document.createElement("div");
  div.className = `msg msg-${who}`;
  div.innerHTML = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function showPointsPopup(n) {
  const el = document.createElement("div");
  el.className   = "points-popup";
  el.textContent = `+${n} pts`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function clearAll() {
  const input = document.getElementById("textInput");
  if (input) input.value = "";
  hideError();
}

/* ── Utils ───────────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}