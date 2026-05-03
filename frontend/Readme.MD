# AI Quiz Generator — Setup & Run Guide

## Folder structure (final)

```
ai-quiz-generator/
├── package.json          ← root config & npm scripts
├── README.md             ← this file
├── node_modules/         ← created by `npm install` (don't edit)
├── backend/
│   └── server.js         ← Express API + static file serving
└── frontend/
    ├── index.html        ← landing page
    ├── text-quiz.html    ← paste-text quiz page
    ├── chat-quiz.html    ← AI chat quiz page
    ├── shared.css        ← design system (all pages share this)
    └── script.js         ← all frontend logic
```

> **Important:** `package.json` must sit at the project root — the same level as `backend/` and `frontend/`. Both the `start` script (`node backend/server.js`) and the static path in `server.js` (`../frontend`) depend on this exact layout.

---

## 1 — Prerequisites

| Tool    | Min version | Check with        |
|---------|-------------|-------------------|
| Node.js | 18+         | `node -v`         |
| npm     | 8+          | `npm -v`          |

---

## 2 — Install dependencies

Open a terminal in the **project root** (where `package.json` lives):

```bash
npm install
```

This installs `express` and `cors` into `node_modules/`.

---

## 3 — Start the server

```bash
npm start
```

You should see:

```
✅  Backend running on http://localhost:5000
```

> **Tip — auto-restart on file changes (dev mode):**
> ```bash
> npm run dev
> ```
> Requires Node 18+. No extra packages needed.

---

## 4 — Open the app

Go to **http://localhost:5000** in your browser.

That's it. Express serves the frontend **and** handles the API — no separate frontend server needed.

---

## Common errors & fixes

| Error | Fix |
|-------|-----|
| `Error: Cannot find module 'express'` | Run `npm install` first |
| `Error: address already in use :::5000` | Another process is on port 5000. Kill it: `npx kill-port 5000` or change `PORT` in server.js |
| Blank page / no styles | Make sure you opened `http://localhost:5000`, **not** `file://…/index.html` |
| `SyntaxError: Cannot use import statement` | You need Node 14+ **and** `"type":"module"` in package.json (already set) |
| CORS error in console | You opened the HTML file directly instead of via the server — always use `http://localhost:5000` |

---

## How it works

```
Browser → http://localhost:5000/
         ↓
         Express serves frontend/index.html (static)

Browser → POST /api/text-quiz   { text: "…" }
         ↓
         Express routes to generateTextQuiz()  →  returns JSON quiz array

Browser → POST /api/topic-quiz  { topic: "…" }
         ↓
         Express routes to generateTopicQuiz() →  returns JSON quiz array
```

No separate frontend server. No file:// URLs. No CORS issues.