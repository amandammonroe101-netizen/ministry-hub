# Ministry Hub

A cross-platform desktop application for church and ministry teams — combining day-to-day ministry
operations (people, prayer, discipleship, scheduling, communications) with a full creative production
suite (multitrack audio recording, podcast studio, setlists, stage plots) and a website/blog
management back office.

Built with **Electron + React (Vite)** on a **Firebase** backend — Authentication, Cloud Firestore,
Cloud Storage, and Cloud Functions — with offline persistence and real-time sync across windows and
devices.

---

## Scope

| | |
|---|---|
| Feature modules | 78 |
| React components | ~250 |
| Shared domain libraries | 35 |
| Platforms | macOS (dmg/zip), Windows (nsis/portable), Linux (AppImage/deb) |

Roughly grouped:

- **People & care** — contacts, friends, pastoral care, visitors, outreach, missions, hospitality, discipleship
- **Prayer & journaling** — prayer lists with status tracking, journal, testimony, daily verse and briefing
- **Planning** — calendar, day planner, scheduling, rosters, subs, meetings, countdowns, budget
- **Worship & production** — songs, setlists, CCLI tracking, multitrack recorder, stems library, mix notes, drums, stage plots, lyrics display, soundscapes
- **Media** — podcast studio, recording, scenes, editor
- **Writing** — long-form documents organized into series and folders
- **Web presence** — blog (posts, series, authors, comments, newsletters, ideas, quotes, performance), site pages, forms, SEO health, tech stack, issue tracking
- **Administration** — roles and permissions, inventory, maintenance, update log, style guide, settings

---

## Project status

This is an active, in-progress build, not a finished product. Being specific about where the line
sits:

**Working**

- Worship & production — the Web Audio multitrack recorder, instruments, and the piano
- Journal, prayer, testimony, daily verse and briefing
- Writing — long-form documents, series, and folders
- Auth, role-gated routing, Firestore sync, offline persistence, multi-window sync
- Packaged builds and auto-update on all three platforms

**In progress**

- Page design is inconsistent across the ministry modules — each one was built as its own
  surface and they have not yet been unified behind a shared layout and component set
- Some personal-user features are broken and under repair
- No automated test suite yet

The 78 modules are at uneven depth by design — breadth came first to find out which parts a
ministry team actually reaches for, and the surfaces that got used are the ones that got finished.

---

## Architecture

```
ministry-hub/
├── electron/
│   ├── main.js            Main process — windows, auto-update, native menus
│   └── preload.js         Context bridge (contextIsolation enabled)
├── client/                React + Vite renderer
│   └── src/
│       ├── pages/         78 feature modules, one directory each
│       ├── components/    Shared UI — nav rail, onboarding, tour, profile, error boundary
│       ├── context/       AuthContext — session, role, founder/protected routing
│       ├── lib/           35 domain modules (Firestore access, audio, chat, sync, exports)
│       └── services/      Per-resource data services
├── functions/             Firebase Cloud Functions (privileged server-side operations)
├── docs/
│   ├── firestore.rules    Security rules
│   ├── storage.rules      Storage rules
│   ├── firebase-migration.md
│   └── *_HOW_TO_USE.md    Per-module user documentation
└── tools/analytics/       Local usage reporting scripts
```

### Notable engineering decisions

**Local-first → cloud sync.** The app began on an Express + SQLite backend. It was migrated to
Firestore to support multi-device sync and shared ministry teams, while keeping offline persistence
so the app stays usable without a connection. Migration notes are in
[`docs/firebase-migration.md`](docs/firebase-migration.md).

**One document per record.** Writing documents, studio projects, and similar collections are stored
one-per-Firestore-document rather than as arrays inside a parent. This keeps writes small, avoids
document size ceilings, and prevents concurrent edits in two windows from clobbering each other.

**Authorization lives in security rules, not the client.** Role gating (`ProtectedRoute`,
`FounderRoute`) is a UX affordance; actual enforcement is in
[`docs/firestore.rules`](docs/firestore.rules), so a modified client cannot read or write data it
shouldn't.

**Multi-window state sync.** `WindowSync` keeps detached windows consistent with the main window, so
a setlist open on a second display reflects edits made in the primary one.

**Web Audio multitrack engine.** The recorder handles per-track arming, monitoring, and mixdown in
the renderer using the Web Audio API, with takes persisted to Cloud Storage.

**Auto-update.** Packaged builds update via `electron-updater` against GitHub Releases, with
`electron-log` for diagnostics from installed copies.

---

## Getting started

Requires Node.js 18+ and npm 9+.

```bash
npm install
cd client && npm install && cd ..
```

Create `client/.env` from the template and fill in a Firebase web app config:

```bash
cp client/.env.example client/.env
```

| Variable | |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |

Run in development — starts Vite, then opens Electron once the dev server is ready:

```bash
npm run dev
```

Build installers:

```bash
npm run dist:mac      # .dmg + .zip
npm run dist:win      # NSIS installer + portable
npm run dist:linux    # AppImage + .deb
```

Output lands in `dist-electron/`.

---

## Data & privacy

- Each user's data is scoped to their Firebase Auth account and enforced server-side by Firestore
  security rules.
- No analytics or telemetry are sent anywhere; `tools/analytics/` runs locally against your own data.
- `client/.env` is gitignored — credentials never enter version control.

---

## License

[MIT](./LICENSE)
