/* =============================================================
   ThinkFirst AI - app.js
   Echte Groq KI-Integration (qwen/qwen3.8-27b)
   + Session-Persistenz via storage.js
============================================================= */
'use strict';

/* -- Groq API Config ----------------------------------------
   Auf Vercel: Anfragen gehen an /api/groq (Serverless Proxy).
   Der API-Key liegt ausschließlich als Vercel-Env-Variable.
   Lokal (kein /api/groq-Endpoint): direkter Groq-Aufruf mit
   Key aus dem Meta-Tag 'groq-api-key' in index.html.
------------------------------------------------------------ */
const GROQ_MODEL    = 'qwen/qwen3.8-27b';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_PROXY    = '/api/groq';

async function callGroq(messages, maxTokens = 800) {
  const body = JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.7 });

  /* Vercel-Proxy versuchen */
  try {
    const probe = await fetch(GROQ_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (probe.ok) {
      const data = await probe.json();
      const raw = data.choices[0].message.content.trim();
      return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }
  } catch (_) { /* Proxy nicht verfügbar → direkt */ }

  /* Direkter Groq-Aufruf (lokal) */
  const apiKey = document.querySelector('meta[name="groq-api-key"]')?.content || '';
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API Error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const raw = data.choices[0].message.content.trim();
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/* callGroq global verfügbar machen für dashboard.js */
window.TF_callGroq = callGroq;

/* -- Demo-Szenario ------------------------------------------ */
const DEMO = {
  task:    'Ich verstehe die Produktregel nicht und wei\u00df nicht, wie ich anfangen soll.',
  approach:'Ich kenne die Ableitungsregeln f\u00fcr einfache Funktionen, aber bei Produkten h\u00e4nge ich.',
  retroQuestion:
    'Du m\u00f6chtest die Produktregel verstehen. Bevor ich erkl\u00e4re: ' +
    'Welche zwei Faktoren siehst du in der Funktion <strong>f(x) = x\u00b3 \u00b7 e\u02e3</strong>? ' +
    'Was wei\u00dft du bereits \u00fcber das Ableiten einzelner Faktoren?',
  retroSuggestions: [
    'x\u00b3 und e\u02e3 \u2013 aber ich wei\u00df nicht, was ich damit anfange.',
    'Einen Faktor kenne ich, den anderen nicht.',
    'Ich erkenne keine Faktoren.',
  ],
  help: {
    think:
      'Was passiert, wenn du <em>nur einen der beiden Faktoren</em> ableitest ' +
      'und den anderen zun\u00e4chst unver\u00e4ndert l\u00e4sst? ' +
      'K\u00f6nntest du das f\u00fcr beide Faktoren getrennt ausprobieren?',
    hint:
      'Leite zun\u00e4chst <strong>x\u00b3</strong> ab (Ergebnis: 3x\u00b2) und dann ' +
      '<strong>e\u02e3</strong> (Ergebnis: e\u02e3). ' +
      'Die Produktregel kombiniert beide: (u\u00b7v)\' = u\'\u00b7v + u\u00b7v\'.',
    explain:
      '<strong>Produktregel:</strong> Wenn f(x) = u(x) \u00b7 v(x), dann gilt:<br>' +
      '<code>f\'(x) = u\'(x) \u00b7 v(x) + u(x) \u00b7 v\'(x)</code><br><br>' +
      'F\u00fcr <strong>f(x) = x\u00b3 \u00b7 e\u02e3</strong>:<br>' +
      '&bull; u = x\u00b3 &rarr; u\' = 3x\u00b2<br>' +
      '&bull; v = e\u02e3 &rarr; v\' = e\u02e3<br>' +
      'Damit: <code>f\'(x) = 3x\u00b2\u00b7e\u02e3 + x\u00b3\u00b7e\u02e3 = e\u02e3(3x\u00b2 + x\u00b3)</code>',
  },
  transfer: {
    problem: 'f(x) = x\u00b2 \u00b7 sin(x)',
    instruction: 'Leite die Funktion ab und gib dein Ergebnis ein.',
    correct: [
      '2x\u00b7sin(x)+x\u00b2\u00b7cos(x)', '2x*sin(x)+x^2*cos(x)',
      '2xsin(x)+x\u00b2cos(x)', 'x\u00b2cos(x)+2xsin(x)',
      'sin(x)\u00b72x+x\u00b2\u00b7cos(x)',
    ],
    partialRight: [
      '2x\u00b7sin(x)+x\u00b2\u00b7sin(x)', '2xsin(x)+x\u00b2sin(x)',
    ],
  },
};


/* -- State -------------------------------------------------- */

const state = {
  step: 0, task: '', approach: '', helpLevel: null,
  transferAnswer: '', confidence: '', selfChecked: false,
  improveAttempt: 0, aiMode: false, groqTransfer: null,
  retroAnswer: '', cachedHelp: {}, hintSeen: false,
};

/* -- DOM helpers -------------------------------------------- */
const $ = (id) => document.getElementById(id);
function show(id) { $(id)?.classList.remove('hidden'); }
function hide(id) { $(id)?.classList.add('hidden'); }

function setStep(n) {
  state.step = n;
  for (let i = 0; i < 5; i++) {
    document.getElementById(`step-${i}`)?.classList.toggle('hidden', i !== n);
  }
  document.querySelectorAll('.progress-steps .step').forEach((li) => {
    const s = parseInt(li.dataset.step, 10);
    li.classList.remove('active', 'done');
    if (s === n) li.classList.add('active');
    if (s <  n) li.classList.add('done');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setLoaderHtml(elId) {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = '<span class="ai-loading"><span></span><span></span><span></span></span>&nbsp;KI denkt nach\u2026';
  el.classList.remove('hidden');
}

function setBtnLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span> Laden\u2026';
  } else {
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
  }
}

/* -- Why-Box Toggles ---------------------------------------- */
document.querySelectorAll('.why-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const exp = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!exp));
    document.getElementById(btn.getAttribute('aria-controls'))?.classList.toggle('hidden', exp);
  });
});


function setTopicBadges(text) {
  const short = text.length > 60 ? text.slice(0, 57) + '…' : text;
  ['topicBadge1', 'topicBadge2', 'topicBadge3', 'topicBadge4'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = short;
  });
}


const taskInput     = $('taskInput');
const approachInput = $('approachInput');
const btnStep0Next  = $('btnStep0Next');
const fileNotice    = $('fileNotice');
const fileInput     = $('fileInput');
const fileDrop      = $('fileDrop');

function checkStep0() { btnStep0Next.disabled = taskInput.value.trim().length < 5; }
taskInput.addEventListener('input', checkStep0);

fileDrop.addEventListener('click', () => fileInput.click());
fileDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileDrop.addEventListener('dragover',  (e) => { e.preventDefault(); fileDrop.classList.add('dragover'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault(); fileDrop.classList.remove('dragover');
  if (e.dataTransfer.files[0]) showFileNotice(e.dataTransfer.files[0].name);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) showFileNotice(fileInput.files[0].name);
});
function showFileNotice(name) {
  fileNotice.textContent = '\u2713 \u201e' + name + '\u201c ausgew\u00e4hlt';
  fileNotice.hidden = false;
}

btnStep0Next.addEventListener('click', async () => {
  state.task     = taskInput.value.trim();
  state.approach = approachInput.value.trim();
  state.cachedHelp = {};
  setTopicBadges(state.task);

  const isDemo = (state.task === DEMO.task);
  state.aiMode = !isDemo;

  if (isDemo) {
    prepareStep1Demo();
    setStep(1);
    return;
  }

  setBtnLoading('btnStep0Next', true);
  try {
    await prepareStep1AI();
    setStep(1);
  } catch (e) {
    console.error(e);
    alert('KI-Fehler: ' + e.message);
  } finally {
    setBtnLoading('btnStep0Next', false);
  }
});


/* ============================================================
   SCHRITT 1: RUECKFRAGE
============================================================ */
function renderSuggestions(suggestions) {
  const container = $('quickAnswers');
  container.querySelectorAll('.chip-btn').forEach(b => b.remove());
  suggestions.forEach((txt) => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.type = 'button';
    btn.textContent = txt;
    btn.addEventListener('click', () => { $('retroAnswer').value = txt; });
    container.appendChild(btn);
  });
}

function prepareStep1Demo() {
  $('retroQuestion').innerHTML = DEMO.retroQuestion;
  $('retroAnswer').value = '';
  renderSuggestions(DEMO.retroSuggestions);
}

async function prepareStep1AI() {
  setLoaderHtml('retroQuestion');
  $('retroAnswer').value = '';
  $('quickAnswers').querySelectorAll('.chip-btn').forEach(b => b.remove());

  const qMsgs = [
    {
      role: 'system',
      content:
        'Du bist ThinkFirst AI, ein sokratischer Lernassistent. ' +
        'Stelle EINE gezielte Rueckfrage, die das Vorwissen des Lernenden aktiviert. ' +
        'Gib keine Antwort oder Erklaerung. Maximal 3 Saetze. Nur die Frage. Auf Deutsch.',
    },
    {
      role: 'user',
      content:
        'Lernfrage: "' + state.task + '"\n' +
        (state.approach ? 'Ansatz: "' + state.approach + '"\n' : '') +
        'Stelle jetzt die sokratische Rueckfrage:',
    },
  ];

  const question = await callGroq(qMsgs, 250);

  const sMsgs = [
    {
      role: 'system',
      content:
        'Generiere genau 3 kurze typische Studierenden-Antworten auf diese Rueckfrage. ' +
        'Jede Antwort auf einer Zeile, max 12 Woerter, kein Aufzaehlungszeichen. Auf Deutsch.',
    },
    {
      role: 'user',
      content: 'Rueckfrage: "' + question + '"\nThema: "' + state.task + '"',
    },
  ];

  const sugRaw = await callGroq(sMsgs, 150);
  const suggestions = sugRaw
    .split('\n')
    .map(s => s.replace(/^[-*\u2022\u2013\u2014\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  $('retroQuestion').innerHTML = question;
  renderSuggestions(suggestions);
}

$('btnStep1Back').addEventListener('click', () => setStep(0));
$('btnStep1Next').addEventListener('click', () => {
  state.retroAnswer = $('retroAnswer').value.trim();
  prepareStep2();
  setStep(2);
});


/* ============================================================
   SCHRITT 2: HILFE
============================================================ */
const HELP_ORDER = ['think', 'hint', 'explain'];

function prepareStep2() {
  document.querySelectorAll('.help-card').forEach(c => c.classList.remove('selected'));
  $('helpResponse').classList.add('hidden');
  $('btnStep2Next').classList.add('hidden');
  state.helpLevel = null;
  state.hintSeen  = false;
  lockExplain();
}

function lockExplain() {
  const btn   = $('helpExplain');
  const badge = $('lockBadge');
  const lock  = $('lockIcon');
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('help-card--locked');
  if (badge) badge.classList.remove('hidden');
  if (lock)  lock.textContent = '\uD83D\uDD12';
}

function unlockExplain() {
  const btn   = $('helpExplain');
  const badge = $('lockBadge');
  const lock  = $('lockIcon');
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('help-card--locked');
  if (badge) badge.classList.add('hidden');
  if (lock)  lock.textContent = '';
}

async function showHelpResponse(level) {
  const box        = $('helpResponse');
  const txt        = $('helpResponseText');
  const upgradeBtn = $('btnUpgradeHelp');

  box.classList.remove('hidden');
  txt.innerHTML =
    '<span class="ai-loading"><span></span><span></span><span></span></span>' +
    '&nbsp;KI generiert Hilfe\u2026';

  let content = '';
  if (!state.aiMode) {
    content = DEMO.help[level];
  } else if (state.cachedHelp[level]) {
    content = state.cachedHelp[level];
  } else {
    content = await generateHelpAI(level);
    state.cachedHelp[level] = content;
  }

  txt.innerHTML = content;

  /* Wenn Hint gesehen → Erklärung freischalten */
  if (level === 'hint' || level === 'think') {
    state.hintSeen = true;
    unlockExplain();
  }

  const idx = HELP_ORDER.indexOf(level);
  const canUpgrade = idx < HELP_ORDER.length - 1;
  upgradeBtn.classList.toggle('hidden', !canUpgrade);
  if (canUpgrade) {
    upgradeBtn.replaceWith(upgradeBtn.cloneNode(true));
    const newBtn = $('btnUpgradeHelp');
    newBtn.classList.remove('hidden');
    newBtn.addEventListener('click', () => selectHelp(HELP_ORDER[idx + 1]));
  }
  show('btnStep2Next');
}

async function generateHelpAI(level) {
  const instructions = {
    think:
      'Stelle dem Lernenden EINE Denkfrage ohne Antwort oder Loesung. ' +
      'Max 3 Saetze. Nur die Frage. Kein HTML.',
    hint:
      'Gib einen konkreten naechsten Schritt als Hinweis, ohne die Loesung zu zeigen. ' +
      'Max 4 Saetze. Kein HTML.',
    explain:
      'Erklaere das Konzept vollstaendig mit Formel und Beispiel. ' +
      'Nutze HTML: <strong> fuer Begriffe, <code> fuer Formeln, <br> fuer Zeilenumbrueche. ' +
      'Max 150 Woerter.',
  };

  const msgs = [
    {
      role: 'system',
      content:
        'Du bist ThinkFirst AI, sokratischer Lernassistent. Antworte auf Deutsch. ' +
        (level === 'explain'
          ? 'Nutze HTML-Tags: <strong>, <code>, <br>, <em>.'
          : 'Kein HTML, nur Klartext.'),
    },
    {
      role: 'user',
      content:
        'Lernthema: "' + state.task + '"\n' +
        (state.approach ? 'Vorwissen: "' + state.approach + '"\n' : '') +
        (state.retroAnswer ? 'Antwort auf Rueckfrage: "' + state.retroAnswer + '"\n' : '') +
        '\nAufgabe: ' + instructions[level],
    },
  ];

  return await callGroq(msgs, 400);
}

function selectHelp(level) {
  state.helpLevel = level;
  document.querySelectorAll('.help-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.level === level);
  });
  showHelpResponse(level);
}

['helpThink', 'helpHint', 'helpExplain'].forEach((id) => {
  $(id).addEventListener('click', () => selectHelp($(id).dataset.level));
});

$('btnStep2Back').addEventListener('click', () => setStep(1));
$('btnStep2Next').addEventListener('click', async () => {
  if (state.aiMode) {
    setBtnLoading('btnStep2Next', true);
    try {
      await prepareStep3AI();
    } catch (e) {
      console.error(e);
      alert('Fehler beim Generieren der Aufgabe: ' + e.message);
      setBtnLoading('btnStep2Next', false);
      return;
    }
    setBtnLoading('btnStep2Next', false);
  } else {
    prepareStep3Demo();
  }
  setStep(3);
});


/* ============================================================
   SCHRITT 3: SELBSTTEST
============================================================ */
function prepareStep3Demo() {
  $('transferProblem').textContent = DEMO.transfer.problem;
  $('transferInstruction').textContent = DEMO.transfer.instruction;
  $('transferAnswer').value = '';
  $('selfCheck').checked = false;
  document.querySelectorAll('[name="confidence"]').forEach(r => r.checked = false);
  $('btnStep3Next').disabled = true;
}

async function prepareStep3AI() {
  $('transferProblem').textContent = 'KI generiert Aufgabe\u2026';
  $('transferInstruction').textContent = '';

  const msgs = [
    {
      role: 'system',
      content:
        'Du bist ThinkFirst AI. Generiere eine Transferaufgabe zum Lernthema. ' +
        'Die Aufgabe soll aehnlich aber ANDERS als das urspruengliche Problem sein. ' +
        'Antworte NUR als gueltiges JSON ohne Markdown-Codeblock:\n' +
        '{"problem":"<Aufgabenstellung>","instruction":"<Was zu tun ist, 1 Satz>",' +
        '"correctAnswer":"<korrekte Loesung>","keyPoints":"<2-3 Schluesselpunkte kommagetrennt>"}',
    },
    {
      role: 'user',
      content:
        'Lernthema: "' + state.task + '"\n' +
        (state.approach ? 'Vorwissen: "' + state.approach + '"\n' : '') +
        'Erstelle jetzt eine Transferaufgabe:',
    },
  ];

  const raw = await callGroq(msgs, 350);
  let parsed;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch (_) {
    parsed = {
      problem: raw,
      instruction: 'Loesung eingeben.',
      correctAnswer: '',
      keyPoints: '',
    };
  }

  state.groqTransfer = parsed;
  $('transferProblem').textContent = parsed.problem;
  $('transferInstruction').textContent = parsed.instruction || 'Gib dein Ergebnis ein.';
  $('transferAnswer').value = '';
  $('selfCheck').checked = false;
  document.querySelectorAll('[name="confidence"]').forEach(r => r.checked = false);
  $('btnStep3Next').disabled = true;
}

function checkStep3() {
  const hasAnswer     = $('transferAnswer').value.trim().length > 1;
  const hasConfidence = !!document.querySelector('[name="confidence"]:checked');
  const hasSelf       = $('selfCheck').checked;
  $('btnStep3Next').disabled = !(hasAnswer && hasConfidence && hasSelf);
}

$('transferAnswer').addEventListener('input', checkStep3);
document.querySelectorAll('[name="confidence"]').forEach(r => r.addEventListener('change', checkStep3));
$('selfCheck').addEventListener('change', checkStep3);

$('btnStep3Back').addEventListener('click', () => setStep(2));
$('btnStep3Next').addEventListener('click', async () => {
  state.transferAnswer = $('transferAnswer').value.trim();
  state.confidence     = document.querySelector('[name="confidence"]:checked')?.value || '';
  state.selfChecked    = $('selfCheck').checked;
  state.improveAttempt = 0;
  setBtnLoading('btnStep3Next', true);
  try {
    await showFeedback(state.transferAnswer);
    setStep(4);
  } catch (e) {
    console.error(e);
    alert('Fehler beim Feedback: ' + e.message);
  } finally {
    setBtnLoading('btnStep3Next', false);
  }
});


/* ============================================================
   SCHRITT 4: FEEDBACK
============================================================ */
function normalise(s) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·*×\u00b7\u00d7]/g, '')
    .replace(/f'\(x\)\s*=\s*/g, '')
    .replace(/f'x=/, '')
    .trim();
}

function matchesAny(answer, list) {
  const n = normalise(answer);
  return list.some((c) => normalise(c) === n);
}

function createFbItem(type, icon, text) {
  const div = document.createElement('div');
  div.className = `fb-item fb-item--${type}`;
  div.innerHTML = `<span class="fb-icon">${icon}</span><span>${text}</span>`;
  return div;
}

function applyConfidenceBanner(grid, status) {
  if (!state.confidence) return;
  const labels  = { unsure: 'Unsicher', partial: 'Teilweise sicher', sure: 'Sicher' };
  const conf    = labels[state.confidence] || '';
  const correct = (status === 'correct');
  if (state.confidence === 'sure' && !correct) {
    grid.appendChild(createFbItem('info', '\ud83d\udcac',
      `Du hast dich als \u201e${conf}\u201c eingesch\u00e4tzt \u2013 deine L\u00f6sung enth\u00e4lt noch einen Fehler. Das passiert h\u00e4ufig und ist ein wertvoller Hinweis.`));
  } else if (state.confidence === 'unsure' && correct) {
    grid.appendChild(createFbItem('ok', '\ud83d\udcac',
      `Du hast dich als \u201e${conf}\u201c eingesch\u00e4tzt \u2013 aber deine L\u00f6sung ist richtig! Manchmal untersch\u00e4tzen wir uns selbst.`));
  }
}


function renderFeedback(fb) {
  const grid        = $('feedbackGrid');
  const nextStepBox = $('feedbackNextStep');
  const nextStepTxt = $('feedbackNextStepText');
  const improveBox  = $('feedbackImprove');

  grid.innerHTML = '';
  nextStepBox.hidden = true;
  improveBox.classList.add('hidden');

  const s = (fb.status || 'wrong').toLowerCase().trim();

  if (s === 'correct') {
    if (fb.ok)   grid.appendChild(createFbItem('ok',   '\u2713', fb.ok));
    if (fb.info) grid.appendChild(createFbItem('info', '\u2139', fb.info));
  } else if (s === 'partial') {
    if (fb.ok)   grid.appendChild(createFbItem('ok',   '\u2713', fb.ok));
    if (fb.err)  grid.appendChild(createFbItem('err',  '\u2717', fb.err));
    if (fb.info) grid.appendChild(createFbItem('info', '\u2139', fb.info));
    $('improvedAnswer').value = '';
    improveBox.classList.remove('hidden');
  } else {
    if (fb.err)  grid.appendChild(createFbItem('err',  '\u2717', fb.err));
    if (fb.info) grid.appendChild(createFbItem('info', '\u2139', fb.info));
    $('improvedAnswer').value = '';
    improveBox.classList.remove('hidden');
  }

  if (fb.next) {
    nextStepTxt.innerHTML = fb.next;
    nextStepBox.hidden = false;
  }

  applyConfidenceBanner(grid, s);

  /* Session in LocalStorage speichern (nur beim ersten Feedback, nicht bei Verbesserungen) */
  if (state.improveAttempt === 0 && typeof TF_Storage !== 'undefined') {
    TF_Storage.saveSession({
      task:       state.task,
      approach:   state.approach,
      helpLevel:  state.helpLevel,
      status:     s,
      confidence: state.confidence,
      transfer:   state.groqTransfer || {},
    });
  }
}

async function showFeedback(answer) {
  const grid = $('feedbackGrid');
  grid.innerHTML =
    '<div class="fb-item fb-item--info">' +
    '<span class="fb-icon"><span class="ai-loading"><span></span><span></span><span></span></span></span>' +
    '<span>KI analysiert deine Antwort\u2026</span></div>';
  $('feedbackYourAnswer').textContent = answer || '(keine Eingabe)';
  $('feedbackNextStep').hidden = true;
  $('feedbackImprove').classList.add('hidden');

  if (!state.aiMode) {
    await new Promise(r => setTimeout(r, 300));
    showFeedbackDemo(answer);
    return;
  }

  const t = state.groqTransfer || {};
  const msgs = [
    {
      role: 'system',
      content:
        'Du bist ThinkFirst AI. Bewerte die Antwort des Lernenden praezise. ' +
        'Antworte NUR als gueltiges JSON ohne Markdown-Codeblock:\n' +
        '{"status":"correct"|"partial"|"wrong",' +
        '"ok":"<was richtig ist oder leer>",' +
        '"err":"<was falsch ist oder leer>",' +
        '"info":"<kurze Erklaerung>",' +
        '"next":"<konkreter naechster Schritt>"}',
    },
    {
      role: 'user',
      content:
        'Lernthema: "' + state.task + '"\n' +
        'Aufgabe: "' + (t.problem || '') + '"\n' +
        'Korrekte Loesung: "' + (t.correctAnswer || '') + '"\n' +
        'Schluesselpunkte: "' + (t.keyPoints || '') + '"\n' +
        'Antwort des Lernenden: "' + answer + '"\n' +
        'Selbsteinschaetzung: "' + state.confidence + '"\n' +
        'Bewerte jetzt:',
    },
  ];

  let fb;
  try {
    const raw = await callGroq(msgs, 400);
    const m   = raw.match(/\{[\s\S]*\}/);
    fb = JSON.parse(m ? m[0] : raw);
  } catch (_) {
    fb = {
      status: 'wrong',
      ok: '',
      err: 'Die Antwort konnte nicht automatisch bewertet werden.',
      info: 'Bitte vergleiche deine L\u00f6sung manuell mit der korrekten Antwort.',
      next: 'Versuche die Aufgabe nochmal Schritt f\u00fcr Schritt.',
    };
  }

  renderFeedback(fb);
}

function showFeedbackDemo(answer) {
  let fb;
  if (matchesAny(answer, DEMO.transfer.correct)) {
    fb = {
      status: 'correct',
      ok:   'Perfekt! Deine L\u00f6sung <code>f\'(x) = 2x\u00b7sin(x) + x\u00b2\u00b7cos(x)</code> ist korrekt.',
      info: 'Du hast beide Faktoren richtig abgeleitet (x\u00b2 \u2192 2x und sin(x) \u2192 cos(x)) und korrekt kombiniert.',
      next: 'Du beherrschst die Produktregel. Als N\u00e4chstes k\u00f6nntest du die Kettenregel \u00fcben.',
      err: '',
    };
  } else if (matchesAny(answer, DEMO.transfer.partialRight)) {
    fb = {
      status: 'partial',
      ok:   'Der erste Term <code>2x\u00b7sin(x)</code> stimmt \u2013 x\u00b2 korrekt abgeleitet.',
      err:  'Im zweiten Term steht noch sin(x). Die Ableitung von sin(x) ist <strong>cos(x)</strong>.',
      info: 'Produktregel: (u\u00b7v)\' = u\'\u00b7v + u\u00b7v\'. Beide Terme kombinieren.',
      next: 'Ersetze sin(x) im zweiten Term durch cos(x).',
    };
  } else {
    fb = {
      status: 'wrong',
      ok:   '',
      err:  'Noch nicht korrekt. Richtig: <code>f\'(x) = 2x\u00b7sin(x) + x\u00b2\u00b7cos(x)</code>.',
      info: 'Tipp: u = x\u00b2, v = sin(x). Beide getrennt ableiten, dann (u\'\u00b7v + u\u00b7v\') anwenden.',
      next: 'Schreib u und v getrennt auf und kombiniere nach der Produktregel.',
    };
  }
  renderFeedback(fb);
}

$('btnCheckImproved').addEventListener('click', async () => {
  const improved = $('improvedAnswer').value.trim();
  if (!improved) return;
  state.improveAttempt++;
  $('feedbackYourAnswer').textContent = improved + ' (verbessert)';
  $('feedbackImprove').classList.add('hidden');
  setBtnLoading('btnCheckImproved', true);
  try {
    await showFeedback(improved);
  } finally {
    setBtnLoading('btnCheckImproved', false);
  }
});

$('btnStep4Back').addEventListener('click', () => setStep(3));

/* -- Neustart ----------------------------------------------- */
$('btnRestart').addEventListener('click', () => {
  Object.assign(state, {
    step: 0, task: '', approach: '', helpLevel: null,
    transferAnswer: '', confidence: '', selfChecked: false,
    improveAttempt: 0, aiMode: false, groqTransfer: null,
    retroAnswer: '', cachedHelp: {}, hintSeen: false,
  });
  setTopicBadges('');
  taskInput.value     = '';
  approachInput.value = '';
  fileNotice.hidden   = true;
  fileInput.value     = '';
  btnStep0Next.disabled = true;
  setStep(0);
});

/* -- Init --------------------------------------------------- */
setStep(0);

