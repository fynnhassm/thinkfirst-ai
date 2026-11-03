# ThinkFirst AI · Prototyp

Geführter Lernablauf statt Zusammenfassungs-App · AI 4 Education · UHH ITMC 2026

---

## Deploy auf Vercel

```bash
# Einmalig Vercel CLI installieren
npm i -g vercel

# Im Projektordner deployen
vercel
```

Oder direkt über [vercel.com](https://vercel.com): Repository verbinden → automatisch deployed.

---

## Lokaler Start (Entwicklung)

```bash
# Datei direkt im Browser öffnen
open index.html

# Oder per lokalem HTTP-Server
python3 -m http.server 8080
# Browser: http://localhost:8080
```

---

## Servicekonzept

ThinkFirst AI unterstützt Studierende, die bei konkreten Verständnisproblemen KI ergänzend einsetzen.
Statt sofort eine Lösung zu präsentieren, führt es durch fünf Lernphasen:

| Phase | Funktion |
|---|---|
| 1 Eingabe | Aufgabe und bisherigen Ansatz erfassen |
| 2 Rückfrage | Vorwissen klären, bevor erklärt wird |
| 3 Hilfe dosieren | Denkfrage → Hinweis → Erklärung |
| 4 Selbsttest | Ähnliche Aufgabe ohne Hilfe lösen |
| 5 Feedback | Richtige Schritte, Fehler und nächster Schritt |

---

## Dateien

```
Prototype/
├── index.html    – fünf Lernphasen-Screens + Dashboard
├── styles.css    – Design-Tokens, responsive Layout, Barrierefreiheit
├── app.js        – Zustandslogik, Groq-KI-Integration, Feedback-Engine
├── storage.js    – LocalStorage-Persistenz, Spaced Repetition
├── dashboard.js  – Lernverlauf, Heatmap, Übungsmodus
├── vercel.json   – Vercel-Deployment-Konfiguration
└── README.md     – diese Datei
```

---

## Technische Entscheidungen

- **Keine Build-Pipeline** – reines HTML + CSS + Vanilla JS, läuft direkt im Browser
- **Groq API** – echte KI-Antworten via `qwen/qwen3.8-27b`
- **LocalStorage** – Session-Persistenz und Spaced-Repetition direkt im Browser
- **Responsive** – Desktop und Smartphone (Breakpoint 600 px)
- **Barrierefreiheit** – ARIA-Labels, Fokuszustände, `prefers-reduced-motion`
