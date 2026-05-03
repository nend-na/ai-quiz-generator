const KEYS = {
  SCORES:  "quizai-scores",
  HISTORY: "quizai-history",
  STATS:   "quizai-stats",
  STREAK:  "quizai-streak",
  POINTS:  "quizai-points",
  DAILY:   "quizai-daily",
  DARK:    "quizai-dark",
  WEAK:    "quizai-weak",
};

function get(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function set(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {}
}

export function getPoints()  { return get(KEYS.POINTS, 0); }
export function addPoints(n) { const p = getPoints() + n; set(KEYS.POINTS, p); return p; }

export function getStreak() { return get(KEYS.STREAK, { count: 0, lastDate: null }); }
export function updateStreak() {
  const today     = new Date().toDateString();
  const s         = getStreak();
  if (s.lastDate === today) return s;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const newCount  = s.lastDate === yesterday ? s.count + 1 : 1;
  const updated   = { count: newCount, lastDate: today };
  set(KEYS.STREAK, updated);
  return updated;
}

export function getStats() { return get(KEYS.STATS, { total: 0, totalCorrect: 0, totalQuestions: 0, bestScore: 0 }); }
export function updateStats(score, total) {
  const s = getStats();
  s.total++; s.totalCorrect += score; s.totalQuestions += total;
  s.bestScore = Math.max(s.bestScore, Math.round((score / total) * 100));
  set(KEYS.STATS, s); return s;
}

export function getHistory()       { return get(KEYS.HISTORY, []); }
export function addHistory(entry)  { const h = getHistory(); h.unshift(entry); set(KEYS.HISTORY, h.slice(0, 50)); }

export function getScores()        { return get(KEYS.SCORES, []); }
export function addScore(entry) {
  const scores = getScores();
  scores.unshift(entry);
  scores.sort((a, b) => (b.score / b.total) - (a.score / a.total));
  set(KEYS.SCORES, scores.slice(0, 20));
}
export function isNewHighScore(topic, difficulty, score, total) {
  const scores = getScores();
  const prev   = scores.find(s => s.topic === topic && s.difficulty === difficulty);
  return !prev || (score / total) > (prev.score / prev.total);
}

export function getWeakAreas() { return get(KEYS.WEAK, {}); }
export function updateWeakAreas(topic, results) {
  const weak = getWeakAreas();
  const key  = topic.toLowerCase().trim();
  if (!weak[key]) weak[key] = { topic, correct: 0, total: 0 };
  weak[key].correct += results.filter(r => r.correct).length;
  weak[key].total   += results.length;
  set(KEYS.WEAK, weak); return weak;
}
export function getSuggestedTopics() {
  return Object.values(getWeakAreas())
    .map(w => ({ ...w, pct: Math.round((w.correct / w.total) * 100) }))
    .filter(w => w.pct < 70).sort((a, b) => a.pct - b.pct).slice(0, 5);
}

// isDailyDone accepts server date string "YYYY-MM-DD"
export function isDailyDone(serverDate) {
  const d = get(KEYS.DAILY, null);
  return d?.completedDate === serverDate;
}
export function completeDailyChallenge(serverDate) {
  set(KEYS.DAILY, { completedDate: serverDate });
}

export function getDark()      { return get(KEYS.DARK, false); }
export function setDark(value) { set(KEYS.DARK, value); }

export function clearAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }