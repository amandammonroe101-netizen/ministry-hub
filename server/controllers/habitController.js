const { getDb, persistDb } = require('../config/db');

const q = (sql, p = []) => {
  const db = getDb();
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(p);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
};
const q1 = (sql, p = []) => q(sql, p)[0] || null;

const STARTER_HABITS = [
  { name: 'Bible reading',           emoji: '📖', color: '#a78bfa', target_per_week: 7 },
  { name: 'Prayer time',             emoji: '🙏', color: '#f472b6', target_per_week: 7 },
  { name: 'Devotion / Quiet time',   emoji: '🕯',  color: '#fbbf24', target_per_week: 5 },
  { name: 'Scripture memory',        emoji: '📚', color: '#60a5fa', target_per_week: 3 },
  { name: 'Gratitude practice',      emoji: '❤',  color: '#fb7185', target_per_week: 7 },
  { name: 'Journal entry',           emoji: '✍',  color: '#2dd4bf', target_per_week: 5 },
];

const parseArr = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

/** Return habits hydrated with completion array for the last 60 days. */
const getAll = (req, res) => {
  try {
    const habits = q('SELECT * FROM habits WHERE is_archived = 0 ORDER BY sort_order ASC, id ASC');
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hydrated = habits.map(h => ({
      ...h,
      scheduled_days: parseArr(h.scheduled_days),
      completions: q(
        'SELECT date FROM habit_completions WHERE habit_id = ? AND date >= ? ORDER BY date DESC',
        [h.id, cutoff]
      ).map(c => c.date),
    }));
    res.json({ success: true, data: hydrated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const { name, emoji, color, description, target_per_week, scheduled_days, reminder_time } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const db = getDb();
    db.run(
      `INSERT INTO habits (name, emoji, color, description, target_per_week, scheduled_days, reminder_time)
       VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        emoji || '✓',
        color || '#60a5fa',
        description || '',
        Math.max(1, Math.min(7, target_per_week || 7)),
        JSON.stringify(scheduled_days || []),
        reminder_time || '',
      ]
    );
    persistDb();
    const row = q('SELECT * FROM habits ORDER BY id DESC LIMIT 1')[0];
    row.scheduled_days = parseArr(row.scheduled_days);
    row.completions = [];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM habits WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const { name, emoji, color, description, target_per_week, is_archived, scheduled_days, reminder_time } = req.body;
    const db = getDb();
    db.run(
      `UPDATE habits SET name=?, emoji=?, color=?, description=?, target_per_week=?, scheduled_days=?, reminder_time=?, is_archived=? WHERE id=?`,
      [
        name ?? existing.name,
        emoji ?? existing.emoji,
        color ?? existing.color,
        description ?? existing.description,
        target_per_week ?? existing.target_per_week,
        scheduled_days !== undefined ? JSON.stringify(scheduled_days) : existing.scheduled_days,
        reminder_time !== undefined ? reminder_time : existing.reminder_time,
        is_archived !== undefined ? (is_archived ? 1 : 0) : existing.is_archived,
        req.params.id,
      ]
    );
    persistDb();
    const row = q1('SELECT * FROM habits WHERE id=?', [req.params.id]);
    row.scheduled_days = parseArr(row.scheduled_days);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM habit_completions WHERE habit_id=?', [req.params.id]);
    db.run('DELETE FROM habits WHERE id=?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/** Toggle a single date completion. Body: { date: 'YYYY-MM-DD' } */
const toggleCompletion = (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'Date required' });
    const habit = q1('SELECT * FROM habits WHERE id=?', [req.params.id]);
    if (!habit) return res.status(404).json({ success: false, message: 'Habit not found' });
    const db = getDb();
    const existing = q1(
      'SELECT * FROM habit_completions WHERE habit_id=? AND date=?',
      [req.params.id, date]
    );
    if (existing) {
      db.run('DELETE FROM habit_completions WHERE id=?', [existing.id]);
    } else {
      db.run('INSERT INTO habit_completions (habit_id, date) VALUES (?,?)', [req.params.id, date]);
    }
    persistDb();
    res.json({ success: true, completed: !existing });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const seedStarterPack = (req, res) => {
  try {
    const db = getDb();
    let count = 0;
    for (const h of STARTER_HABITS) {
      const existing = q1('SELECT id FROM habits WHERE name=?', [h.name]);
      if (existing) continue;
      db.run(
        `INSERT INTO habits (name, emoji, color, target_per_week, sort_order) VALUES (?,?,?,?,?)`,
        [h.name, h.emoji, h.color, h.target_per_week, count]
      );
      count++;
    }
    persistDb();
    res.json({ success: true, added: count });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, create, update, remove, toggleCompletion, seedStarterPack };
