/* =============================================================
   ThinkFirst AI · storage.js
   LocalStorage-Persistenz, Spaced Repetition, Session-Tracking
============================================================= */
'use strict';

const DB_KEY = 'thinkfirst_sessions_v1';

/* ── Session-Struktur ────────────────────────────────────────
  {
    id:          string (timestamp),
    date:        ISO-string,
    task:        string,
    approach:    string,
    helpLevel:   'think'|'hint'|'explain'|null,
    status:      'correct'|'partial'|'wrong',
    confidence:  'unsure'|'partial'|'sure',
    transfer:    { problem, correctAnswer, keyPoints },
    practiceCount: number,   // wie oft wurde zu diesem Thema nachgeübt
    nextReview:  ISO-string, // wann ist Wiederholung fällig (Spaced Repetition)
    interval:    number,     // aktuelles Intervall in Tagen
  }
─────────────────────────────────────────────────────────────*/

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || '[]');
  } catch (_) { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(DB_KEY, JSON.stringify(sessions));
}

/* Spaced-Repetition: Intervall berechnen (vereinfachtes SM-2) */
function calcNextInterval(currentInterval, status) {
  if (status === 'correct') {
    if (currentInterval < 1)  return 1;
    if (currentInterval < 3)  return 3;
    if (currentInterval < 7)  return 7;
    return Math.round(currentInterval * 2.1);
  } else if (status === 'partial') {
    return Math.max(1, Math.round(currentInterval * 0.6));
  } else {
    return 1; // bei falsch: morgen wiederholen
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/* Neue Session speichern */
function saveSession(data) {
  const sessions = loadSessions();
  const interval  = calcNextInterval(0, data.status);
  const now       = new Date().toISOString();
  const session = {
    id:            now,
    date:          now,
    task:          data.task,
    approach:      data.approach || '',
    helpLevel:     data.helpLevel || null,
    status:        data.status,
    confidence:    data.confidence || '',
    transfer:      data.transfer || {},
    practiceCount: 0,
    nextReview:    addDays(now, interval),
    interval:      interval,
  };
  sessions.unshift(session); // neueste zuerst
  saveSessions(sessions);
  return session;
}

/* Session nach Übung aktualisieren */
function updateSessionAfterPractice(id, status) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  const s = sessions[idx];
  s.status        = status;
  s.practiceCount = (s.practiceCount || 0) + 1;
  s.interval      = calcNextInterval(s.interval || 1, status);
  s.nextReview    = addDays(new Date().toISOString(), s.interval);
  sessions[idx]   = s;
  saveSessions(sessions);
}

/* Fällige Reviews (nextReview <= heute) */
function getDueSessions() {
  const now = new Date();
  return loadSessions().filter(s => new Date(s.nextReview) <= now);
}

/* Status-Label */
function statusLabel(status) {
  return { correct: 'Korrekt', partial: 'Teilweise', wrong: 'Falsch' }[status] || status;
}

/* Hilfslevel-Label */
function helpLabel(level) {
  if (!level || level === 'null') return '–';
  return { think: 'Denkfrage', hint: 'Hinweis', explain: 'Erklärung' }[level] || '–';
}

/* Datum formatieren */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* Tage bis/seit nextReview */
function daysUntilReview(iso) {
  if (!iso) return 'Fällig!';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Fällig!';
  const diff = Math.ceil((d - new Date()) / 86400000);
  if (diff < 0)   return 'Fällig!';
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return 'In ' + diff + ' Tagen';
}

/* Aktivitäts-Heatmap: letzte 12 Wochen */
function buildHeatmapData() {
  const sessions = loadSessions();
  const map = {};
  sessions.forEach(s => {
    const day = s.date.slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  });
  // 84 Tage = 12 Wochen
  const days = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: map[key] || 0 });
  }
  return days;
}

/* Statistiken */
function getStats() {
  const sessions = loadSessions();
  const total    = sessions.length;
  const correct  = sessions.filter(s => s.status === 'correct').length;
  const due      = getDueSessions().length;
  const streak   = calcStreak(sessions);
  return { total, correct, due, streak };
}

function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map(s => s.date.slice(0, 10)))].sort().reverse();
  let streak = 0;
  let cur = new Date();
  cur.setHours(0, 0, 0, 0);
  for (const day of days) {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((cur - d) / 86400000);
    if (diff > 1) break;
    streak++;
    cur = d;
  }
  return streak;
}

/* Export */
window.TF_Storage = {
  loadSessions, saveSessions, saveSession,
  updateSessionAfterPractice, getDueSessions,
  statusLabel, helpLabel, fmtDate, daysUntilReview,
  buildHeatmapData, getStats,
};
