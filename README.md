# Elite Journal Hub

A local-first personal-growth desktop app for journaling, prayer tracking, relationship-keeping, and habit-building — all wired together with a unified calendar. Built with **Electron + React + Node/Express + SQLite**.

Everything is saved on your own machine; no account, no cloud, no telemetry.

---

## Features

### 📖 Journal
- Rich prayer-journal entries with title, body, scripture references, and mood tagging (Peaceful, Grateful, Wrestling, Joyful, etc.).
- Auto-loads verse text from a public Bible API when you type a reference (e.g. `John 3:16`).
- Optional cover photo per entry.
- Daily reflection prompt on the dashboard.
- Recurring **journal reminders** (time + days of the week) that show up on the Calendar.
- Insights: writing rhythm heatmap, spiritual season detection, scripture coverage, themes & words, weekly memory verse.

### 🙏 Prayers
- Smart sidebar sections — Urgent, Daily List, Active, Long-Standing (30+ days), Answered Testimonies, Praise & Thanksgiving, plus a By Category accordion.
- Tabbed detail view per prayer: **Updates** (running journal of how God is moving), **Request** (content + scripture + status changer), **Praying For** (link friends), **Insights** (per-prayer stats).
- Mark prayers as urgent, daily, or as a Praise entry.
- Friends can be linked to any prayer, with deep-linking back to that friend.

### 👥 Friends
- Per-friend tabbed profile: **Profile & Reach Out**, **Prayer Requests** (linked to Prayers tab), **Events & Birthdays**, **Notes**.
- Day-of-week reach-out schedule per friend, with real due dates ("Due Wed, May 20", "3 days overdue", "Due today").
- Friend status dropdown (Close friend, Family, Co-worker, Church friend, Prayer partner, Mentor, Mentee, Neighbor, Acquaintance, Other).
- Smart sections in the sidebar: Reach Out Soon, Upcoming Birthdays, Close Friends, Family, Co-workers, Church Community, Prayer Partners, Mentors & Mentees, All Friends.
- Inline notes/timeline, events, and a quick "Reached Out Today" action.

### 📅 Calendar
- Google-like month + week view.
- Aggregates events from **every other tab automatically** — friend birthdays, reach-out due dates, daily prayer reminders, journal entry days, friend events, journal reminders, scheduled habits.
- Add your own custom events with title, description, date, time, and color.
- Filter sidebar to toggle any event type on/off.
- Click any event's "Open" to jump to its source (Friends/Prayers/Journal/Habits) with the right item already selected.

### ✅ Habits
- Daily checklist sidebar with one-tap completion.
- Per-habit detail card with **weekly flow** view: current week pills + last 3 weeks compact strip.
- Streak tracker, target-per-week progress bar, lifetime check-ins.
- Day-of-week schedule per habit (e.g. Mon/Wed/Fri) + optional reminder time, both feed into the Calendar.
- One-click "Seed starter pack" — Bible reading, Prayer time, Devotion / Quiet time, Scripture memory, Gratitude practice, Journal entry.
- Add fully custom habits with emoji, color, weekly target, schedule, and reminder time.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop wrapper | Electron |
| Frontend | React 18 + Vite + react-router-dom + date-fns |
| Backend | Node.js + Express |
| Database | SQLite (via `sql.js`, file-backed) |

---

## Project Structure

```
elite-journal-hub/
├── electron/
│   ├── main.js              Electron main process (window + spawns server)
│   └── preload.js           Context bridge (renderer <-> main)
├── client/                  React + Vite frontend
│   └── src/
│       ├── components/layout/NavRail.jsx
│       ├── pages/
│       │   ├── journal/     Journal + dashboard
│       │   ├── prayers/     Prayers (smart sections + tabbed detail)
│       │   ├── friends/     Friends (smart sections + tabbed detail)
│       │   ├── calendar/    Calendar (month + week, custom events)
│       │   └── habits/      Habits (weekly flow, scheduling)
│       ├── services/        API clients (one per resource)
│       ├── App.jsx          Routes
│       ├── main.jsx         Vite entry
│       └── index.css        Global tokens + shared utility classes
├── server/                  Express API backend
│   ├── config/db.js         sql.js initialization + schema + migrations
│   ├── controllers/         One per resource
│   ├── routes/              One per resource
│   ├── database/data.db     Local SQLite file (gitignored)
│   └── index.js             Express entry
├── assets/                  Icon + brand assets
└── package.json             Root — Electron scripts & build config
```

### Resources / endpoints

| Resource | Endpoints |
|---|---|
| Journal entries | `GET/POST/PUT/DELETE /api/journal` |
| Journal reminders | `GET/POST/DELETE /api/journal-reminders` |
| Prayers | `GET/POST/PUT/DELETE /api/prayer`, `POST /:id/updates`, `PUT /:id/friends` |
| Friends | `GET/POST/PUT/DELETE /api/friends/list`, plus per-friend prayers/events/timeline |
| Calendar events | `GET/POST/PUT/DELETE /api/calendar` |
| Habits | `GET/POST/PUT/DELETE /api/habits`, `POST /:id/toggle`, `POST /starter-pack` |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install dependencies (all three projects)

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### Run in development

```bash
npm run dev
```

This concurrently starts:

1. The Express API on http://localhost:5000
2. The Vite dev server on http://localhost:5173
3. The Electron window (waits for both)

### Build for distribution

```bash
npm run build          # current platform
npm run dist:mac       # macOS .dmg
npm run dist:win       # Windows .exe installer
npm run dist:linux     # Linux .AppImage / .deb
```

Output goes to `dist-electron/`.

---

## Data & Privacy

- **All data is stored locally** in a single SQLite file at `server/database/data.db`.
- That file is **gitignored** — each install / each machine has its own.
- No accounts, no telemetry, no cloud sync.
- See the discussion in the repo's history for notes on moving the DB to Electron's user-data directory for packaged builds.

---

## License

[MIT](./LICENSE)
