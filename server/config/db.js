const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/data.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db = null;

const saveDb = () => {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
};

const initDb = async () => {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, content TEXT NOT NULL,
    mood TEXT DEFAULT 'peaceful', scripture TEXT,
    verse_text TEXT,
    prompt_used INTEGER DEFAULT 0,
    prompt_text TEXT,
    image_data TEXT,
    is_answered INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);

  // Migrate existing DB — add new columns if they don't exist yet
  try { db.run('ALTER TABLE journal_entries ADD COLUMN verse_text TEXT'); } catch(e){}
  try { db.run('ALTER TABLE journal_entries ADD COLUMN prompt_used INTEGER DEFAULT 0'); } catch(e){}
  try { db.run('ALTER TABLE journal_entries ADD COLUMN prompt_text TEXT'); } catch(e){}
  try { db.run('ALTER TABLE journal_entries ADD COLUMN image_data TEXT'); } catch(e){}
  try { db.run("ALTER TABLE journal_entries ADD COLUMN verses TEXT DEFAULT '[]'"); } catch(e){}

  db.run(`CREATE TABLE IF NOT EXISTS prayer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, content TEXT NOT NULL,
    category TEXT DEFAULT 'General', status TEXT DEFAULT 'praying',
    is_urgent INTEGER DEFAULT 0, scripture TEXT,
    is_daily INTEGER DEFAULT 0,
    entry_type TEXT DEFAULT 'request',
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);

  // Additive migration — safe to re-run, errors ignored when columns exist
  try { db.run('ALTER TABLE prayer_requests ADD COLUMN is_daily INTEGER DEFAULT 0'); } catch(e){}
  try { db.run("ALTER TABLE prayer_requests ADD COLUMN entry_type TEXT DEFAULT 'request'"); } catch(e){}

  db.run(`CREATE TABLE IF NOT EXISTS prayer_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prayer_id INTEGER NOT NULL, content TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (prayer_id) REFERENCES prayer_requests(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS prayer_friend_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prayer_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (prayer_id) REFERENCES prayer_requests(id),
    FOREIGN KEY (friend_id) REFERENCES friends(id),
    UNIQUE(prayer_id, friend_id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, role TEXT, church TEXT,
    initials TEXT, color_from TEXT DEFAULT '#3730a3', color_to TEXT DEFAULT '#6c3fc9',
    tags TEXT DEFAULT '[]', is_online INTEGER DEFAULT 0,
    nickname TEXT, city TEXT, life_season TEXT, life_update TEXT,
    emotional_status TEXT DEFAULT 'peaceful', interests TEXT DEFAULT '[]',
    birthday TEXT, last_contacted TEXT,
    how_met TEXT, communication_frequency TEXT DEFAULT 'weekly',
    reach_out_days TEXT DEFAULT '[]',
    notes TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  // Additive migration — safe to re-run, errors ignored when column exists
  try { db.run("ALTER TABLE friends ADD COLUMN reach_out_days TEXT DEFAULT '[]'"); } catch(e){}
  try { db.run("ALTER TABLE friends ADD COLUMN friend_status TEXT DEFAULT ''"); } catch(e){}

  db.run(`CREATE TABLE IF NOT EXISTS friend_prayers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER NOT NULL, content TEXT NOT NULL,
    category TEXT DEFAULT 'General', status TEXT DEFAULT 'active',
    is_urgent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (friend_id) REFERENCES friends(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS friend_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER NOT NULL, title TEXT NOT NULL,
    event_date TEXT NOT NULL, event_type TEXT DEFAULT 'general',
    description TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (friend_id) REFERENCES friends(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS friend_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER NOT NULL, content TEXT NOT NULL,
    entry_type TEXT DEFAULT 'note', dot_color TEXT DEFAULT '#c4b5fd',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (friend_id) REFERENCES friends(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS community_prayers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER, content TEXT NOT NULL,
    category TEXT DEFAULT 'General', is_urgent INTEGER DEFAULT 0,
    praying_count INTEGER DEFAULT 1, user_is_praying INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (friend_id) REFERENCES friends(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS prayer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    friend_id INTEGER, title TEXT NOT NULL, description TEXT,
    location TEXT, event_date TEXT NOT NULL, event_time TEXT,
    user_is_joining INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  /* ── Calendar — user-created events ────────────────────── */
  db.run(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    event_date TEXT NOT NULL,
    event_time TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    color TEXT DEFAULT '#a78bfa',
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  /* ── Habits ────────────────────────────────────────────── */
  db.run(`CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '✓',
    color TEXT DEFAULT '#60a5fa',
    description TEXT DEFAULT '',
    target_per_week INTEGER DEFAULT 7,
    scheduled_days TEXT DEFAULT '[]',
    reminder_time TEXT DEFAULT '',
    is_archived INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  // Additive migration for habits.scheduled_days + reminder_time
  try { db.run("ALTER TABLE habits ADD COLUMN scheduled_days TEXT DEFAULT '[]'"); } catch(e){}
  try { db.run("ALTER TABLE habits ADD COLUMN reminder_time TEXT DEFAULT ''"); } catch(e){}

  /* ── Journal reminders (recurring weekday alarms) ─────── */
  db.run(`CREATE TABLE IF NOT EXISTS journal_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    label TEXT DEFAULT '',
    days TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS habit_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (habit_id) REFERENCES habits(id),
    UNIQUE(habit_id, date)
  );`);

  /* ── Songwriting ─────────────────────────────────────── */
  db.run(`CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT '',
    song_key TEXT DEFAULT '',
    tempo INTEGER,
    time_signature TEXT DEFAULT '4/4',
    status TEXT DEFAULT 'idea',
    tags TEXT DEFAULT '[]',
    theme TEXT DEFAULT '',
    scripture TEXT DEFAULT '',
    inspiration TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    prayer_id INTEGER,
    journal_id INTEGER,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS song_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    section_type TEXT NOT NULL,
    label TEXT DEFAULT '',
    content TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS song_recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    label TEXT DEFAULT '',
    audio_data TEXT NOT NULL,
    duration REAL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );`);

  // Additive: performance notes + per-section bars (for duration estimator)
  try { db.run("ALTER TABLE songs ADD COLUMN performance_notes TEXT DEFAULT ''"); } catch(e){}
  try { db.run("ALTER TABLE song_sections ADD COLUMN bars INTEGER DEFAULT 4"); } catch(e){}

  /* ── Setlists ─────────────────────────────────────────── */
  db.run(`CREATE TABLE IF NOT EXISTS setlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    occasion TEXT DEFAULT '',
    event_date TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS setlist_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setlist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    FOREIGN KEY (setlist_id) REFERENCES setlists(id),
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );`);

  /* ── Multitrack recording studio ──────────────────────── */
  db.run(`CREATE TABLE IF NOT EXISTS studio_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tempo INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS studio_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT DEFAULT 'Track',
    audio_data TEXT NOT NULL,
    volume REAL DEFAULT 1,
    pan REAL DEFAULT 0,
    is_muted INTEGER DEFAULT 0,
    is_solo INTEGER DEFAULT 0,
    clip_offset REAL DEFAULT 0,
    trim_start REAL DEFAULT 0,
    trim_end REAL DEFAULT 0,
    effects TEXT DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES studio_projects(id)
  );`);

  // Additive migration — channel-strip effects + master volume
  try { db.run("ALTER TABLE studio_tracks ADD COLUMN effects TEXT DEFAULT '{}'"); } catch(e){}
  try { db.run("ALTER TABLE studio_projects ADD COLUMN master_volume REAL DEFAULT 1"); } catch(e){}

  saveDb();
  console.log('✅ Database initialized');
  return db;
};

const getDb = () => db;
const persistDb = () => saveDb();
module.exports = { initDb, getDb, persistDb };
