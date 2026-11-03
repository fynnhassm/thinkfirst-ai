/* =============================================================
   ThinkFirst AI · dashboard.js  (1/3)
   Dashboard öffnen, Statistiken, Heatmap
============================================================= */
'use strict';

const $d = id => document.getElementById(id);

function openDashboard() {
  renderDashboard();
  $d('dashboardOverlay').classList.remove('hidden');
  $d('dashboardOverlay').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDashboard() {
  $d('dashboardOverlay').classList.add('hidden');
  $d('dashboardOverlay').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  $d('practicePanel').classList.add('hidden');
}

function renderDashboard() {
  const { total, correct, due, streak } = TF_Storage.getStats();
  const sessions = TF_Storage.loadSessions();

  $d('statTotal').textContent  = total;
  $d('statScore').textContent  = total ? Math.round((correct / total) * 100) + '%' : '\u2013';
  $d('statDue').textContent    = due;
  $d('statStreak').textContent = streak + (streak === 1 ? ' Tag' : ' Tage');

  renderHeatmap();

  const dueBanner = $d('dueBanner');
  if (due > 0) {
    dueBanner.textContent = '\uD83D\uDD14 ' + due + ' Thema' + (due > 1 ? 'en' : '') + ' zur Wiederholung f\u00e4llig';
    dueBanner.classList.remove('hidden');
  } else {
    dueBanner.classList.add('hidden');
  }

  renderHistory(sessions);
}

function renderHeatmap() {
  const container = $d('heatmap');
  if (!container) return;
  container.innerHTML = '';
  const data = TF_Storage.buildHeatmapData();
  const weeks = [];
  for (let i = 0; i < 12; i++) weeks.push(data.slice(i * 7, i * 7 + 7));
  weeks.forEach(week => {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    week.forEach(day => {
      const cell  = document.createElement('div');
      const level = day.count === 0 ? 0 : day.count < 2 ? 1 : day.count < 4 ? 2 : 3;
      cell.className = 'heatmap-cell heatmap-' + level;
      cell.title = TF_Storage.fmtDate(day.date + 'T00:00:00') + ': ' + day.count + ' Session' + (day.count !== 1 ? 's' : '');
      col.appendChild(cell);
    });
    container.appendChild(col);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* dashboard.js  (2/3) – History-Liste & filterHistory */

function renderHistory(sessions) {
  const list = $d('historyList');
  if (!list) return;
  if (!sessions.length) {
    list.innerHTML = '<p class="history-empty">Noch keine Lerneinheiten gespeichert. Starte deine erste Einheit!</p>';
    return;
  }
  list.innerHTML = '';
  sessions.forEach(s => {
    const item = document.createElement('div');
    item.className = 'history-item history-item--' + s.status;
    const due   = TF_Storage.daysUntilReview(s.nextReview);
    const isDue = (due === 'F\u00e4llig!');
    item.innerHTML =
      '<div class="history-item-top">' +
        '<span class="history-status history-status--' + s.status + '">' + TF_Storage.statusLabel(s.status) + '</span>' +
        '<span class="history-date">' + TF_Storage.fmtDate(s.date) + '</span>' +
      '</div>' +
      '<p class="history-task">' + escHtml(s.task) + '</p>' +
      '<div class="history-meta">' +
        '<span class="history-meta-item">\uD83D\uDCDA ' + TF_Storage.helpLabel(s.helpLevel) + '</span>' +
        '<span class="history-meta-item">' + (s.practiceCount > 0 ? '\uD83D\uDD01 ' + s.practiceCount + '\u00d7 ge\u00fcbt' : '\uD83C\uDD95 Erstmalig') + '</span>' +
        '<span class="history-review' + (isDue ? ' history-review--due' : '') + '">' + (isDue ? '\uD83D\uDD14' : '\uD83D\uDD50') + ' ' + due + '</span>' +
      '</div>' +
      '<div class="history-actions">' +
        '<button class="btn btn-sm btn-primary" data-id="' + s.id + '" data-action="practice">Neue Aufgabe \u00fcben \u2192</button>' +
        '<button class="btn btn-sm btn-secondary" data-id="' + s.id + '" data-action="delete">L\u00f6schen</button>' +
      '</div>';
    list.appendChild(item);
  });
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.id;
      const action = btn.dataset.action;
      const sess   = TF_Storage.loadSessions().find(s => s.id === id);
      if (!sess) return;
      if (action === 'practice') startPractice(sess);
      if (action === 'delete')   deleteSession(id);
    });
  });
}

function deleteSession(id) {
  if (!confirm('Diese Lerneinheit wirklich l\u00f6schen?')) return;
  const sessions = TF_Storage.loadSessions().filter(s => s.id !== id);
  TF_Storage.saveSessions(sessions);
  renderDashboard();
}

function filterHistory(filter) {
  ['All','Due','Correct','Wrong'].forEach(f => {
    $d('historyFilter' + f)?.classList.toggle('active', f.toLowerCase() === filter);
  });
  let sessions = TF_Storage.loadSessions();
  if (filter === 'due')     sessions = TF_Storage.getDueSessions();
  if (filter === 'correct') sessions = sessions.filter(s => s.status === 'correct');
  if (filter === 'wrong')   sessions = sessions.filter(s => s.status !== 'correct');
  renderHistory(sessions);
}


/* dashboard.js  (3a/3) – Practice-Mode Kernlogik */

let practiceState = { session: null, questions: [], current: 0, results: [] };

async function startPractice(session) {
  practiceState = { session, questions: [], current: 0, results: [] };
  const panel = $d('practicePanel');
  panel.classList.remove('hidden');
  $d('practiceTitle').textContent = 'Übung: ' + (session.task.length > 55 ? session.task.slice(0,52)+'…' : session.task);
  $d('practiceProgress').textContent = '';
  $d('practiceBody').innerHTML = '<div class="practice-loading"><span class="ai-loading"><span></span><span></span><span></span></span> KI generiert 3 Aufgaben\u2026</div>';
  $d('practiceFeedback').classList.add('hidden');
  $d('practiceAnswerWrap').classList.add('hidden');
  $d('practiceScoreWrap').classList.add('hidden');
  $d('btnPracticeNext').classList.add('hidden');
  try {
    const qs = await generatePracticeQuestions(session);
    practiceState.questions = qs;
    showPracticeQuestion(0);
  } catch (e) {
    $d('practiceBody').innerHTML = '<p class="error-msg">Fehler: ' + escHtml(e.message) + '</p>';
  }
}

async function generatePracticeQuestions(session) {
  const msgs = [
    {
      role: 'system',
      content:
        'Generiere genau 3 Uebungsaufgaben zu einem Lernthema (leicht, mittel, schwer). ' +
        'Antworte NUR als gueltiges JSON-Array ohne Markdown:\n' +
        '[{"question":"<Aufgabe>","answer":"<Loesung>","hint":"<Hinweis>"},' +
        '{"question":"...","answer":"...","hint":"..."},' +
        '{"question":"...","answer":"...","hint":"..."}]',
    },
    {
      role: 'user',
      content:
        'Lernthema: "' + session.task + '"\n' +
        (session.approach ? 'Vorwissen: "' + session.approach + '"\n' : '') +
        (session.transfer?.problem ? 'Letzte geübte Aufgabe: "' + session.transfer.problem + '"\n' : '') +
        'Erstelle 3 neue unterschiedliche Aufgaben:',
    },
  ];
  const raw = await window.TF_callGroq(msgs, 600);
  const m = raw.match(/\[[\s\S]*\]/);
  return JSON.parse(m ? m[0] : raw);
}

function showPracticeQuestion(idx) {
  const qs = practiceState.questions;
  if (idx >= qs.length) { showPracticeScore(); return; }
  practiceState.current = idx;
  const labels = ['Leicht', 'Mittel', 'Schwer'];
  $d('practiceProgress').textContent = 'Aufgabe ' + (idx+1) + ' / ' + qs.length + ' \u00b7 ' + (labels[idx] || '');
  $d('practiceBody').innerHTML = '<p class="practice-question">' + escHtml(qs[idx].question) + '</p>';
  $d('practiceFeedback').classList.add('hidden');
  $d('practiceAnswerWrap').classList.remove('hidden');
  $d('practiceScoreWrap').classList.add('hidden');
  $d('practiceAnswer').value = '';
  $d('practiceAnswer').focus();
  $d('btnPracticeSubmit').disabled = false;
  $d('btnPracticeNext').classList.add('hidden');
  $d('btnPracticeHint').classList.remove('hidden');
  $d('practiceHintText').classList.add('hidden');
  $d('practiceHintText').textContent = qs[idx].hint || '';
}

async function submitPracticeAnswer() {
  const answer = $d('practiceAnswer').value.trim();
  if (!answer) return;
  $d('btnPracticeSubmit').disabled = true;
  $d('practiceFeedback').classList.remove('hidden');
  $d('practiceFeedback').innerHTML =
    '<span class="ai-loading"><span></span><span></span><span></span></span> KI bewertet\u2026';
  const q = practiceState.questions[practiceState.current];
  const msgs = [
    { role: 'system', content: 'Bewerte die Antwort kurz. Antworte NUR als JSON ohne Markdown:\n{"status":"correct"|"partial"|"wrong","feedback":"<1-2 Saetze>"}' },
    { role: 'user', content: 'Aufgabe: "' + q.question + '"\nKorrekte Antwort: "' + q.answer + '"\nStudierenden-Antwort: "' + answer + '"' },
  ];
  let result;
  try {
    const raw = await window.TF_callGroq(msgs, 200);
    const m = raw.match(/\{[\s\S]*\}/);
    result = JSON.parse(m ? m[0] : raw);
  } catch (_) { result = { status: 'wrong', feedback: 'Konnte nicht bewertet werden.' }; }
  practiceState.results.push({ ...result, answer, question: q.question });
  TF_Storage.updateSessionAfterPractice(practiceState.session.id, result.status);
  const icons = { correct: '\u2713', partial: '~', wrong: '\u2717' };
  const cls   = { correct: 'fb-item--ok', partial: 'fb-item--info', wrong: 'fb-item--err' };
  $d('practiceFeedback').innerHTML =
    '<div class="fb-item ' + (cls[result.status]||'fb-item--info') + '" style="margin:0">' +
      '<span class="fb-icon">' + (icons[result.status]||'\u2139') + '</span>' +
      '<span>' + escHtml(result.feedback) + '</span>' +
    '</div><p class="practice-correct-answer"><strong>Korrekte Antwort:</strong> ' + escHtml(q.answer) + '</p>';
  $d('practiceAnswerWrap').classList.add('hidden');
  $d('btnPracticeNext').classList.remove('hidden');
}


/* dashboard.js  (3b/3) – Score-Anzeige & Events */

function showPracticeScore() {
  $d('practiceAnswerWrap').classList.add('hidden');
  $d('practiceFeedback').classList.add('hidden');
  $d('practiceBody').innerHTML = '';
  $d('practiceProgress').textContent = 'Fertig!';
  $d('btnPracticeNext').classList.add('hidden');
  const results = practiceState.results;
  const correct = results.filter(r => r.status === 'correct').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const pct     = Math.round(((correct + partial * 0.5) / results.length) * 100);
  const grade   = pct >= 80 ? '\uD83C\uDF89 Sehr gut!' : pct >= 50 ? '\uD83D\uDC4D Gut!' : '\uD83D\uDCAA Weiter \u00fcben!';
  const color   = pct >= 80 ? '#2ecc89' : pct >= 50 ? '#f0a500' : '#e74c3c';
  $d('practiceScoreWrap').classList.remove('hidden');
  $d('practiceScoreWrap').innerHTML =
    '<div class="practice-score">' +
      '<div class="score-circle" style="--score-color:' + color + '">' +
        '<span class="score-pct">' + pct + '%</span>' +
        '<span class="score-label">Score</span>' +
      '</div>' +
      '<p class="score-grade">' + grade + '</p>' +
      '<p class="score-detail">' + correct + ' korrekt \u00b7 ' + partial + ' teilweise \u00b7 ' + (results.length - correct - partial) + ' falsch</p>' +
    '</div>' +
    '<div class="practice-result-list">' +
      results.map((r, i) =>
        '<div class="practice-result-item practice-result--' + r.status + '">' +
          '<span class="practice-result-num">Aufgabe ' + (i+1) + '</span>' +
          '<span class="practice-result-q">' + escHtml(r.question.slice(0,60)) + (r.question.length>60?'\u2026':'') + '</span>' +
          '<span class="practice-result-icon">' + ({correct:'\u2713',partial:'~',wrong:'\u2717'}[r.status]||'?') + '</span>' +
        '</div>'
      ).join('') +
    '</div>';
  renderDashboard();
}

/* Events */
document.addEventListener('DOMContentLoaded', () => {
  $d('btnOpenDashboard')?.addEventListener('click', openDashboard);
  $d('btnCloseDashboard')?.addEventListener('click', closeDashboard);
  $d('dashboardOverlay')?.addEventListener('click', e => {
    if (e.target === $d('dashboardOverlay')) closeDashboard();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDashboard();
  });
  $d('btnClosePractice')?.addEventListener('click', () => {
    $d('practicePanel').classList.add('hidden');
    renderDashboard();
  });
  $d('btnPracticeSubmit')?.addEventListener('click', submitPracticeAnswer);
  $d('practiceAnswer')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPracticeAnswer(); }
  });
  $d('btnPracticeNext')?.addEventListener('click', () => showPracticeQuestion(practiceState.current + 1));
  $d('btnPracticeHint')?.addEventListener('click', () => $d('practiceHintText').classList.toggle('hidden'));
  $d('historyFilterAll')?.addEventListener('click',     () => filterHistory('all'));
  $d('historyFilterDue')?.addEventListener('click',     () => filterHistory('due'));
  $d('historyFilterCorrect')?.addEventListener('click', () => filterHistory('correct'));
  $d('historyFilterWrong')?.addEventListener('click',   () => filterHistory('wrong'));
});

window.TF_Dashboard = { openDashboard, closeDashboard, renderDashboard };

