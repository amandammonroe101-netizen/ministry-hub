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
const parseArr = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

const getAll = (req, res) => {
  try {
    const rows = q('SELECT * FROM journal_reminders ORDER BY time ASC, id ASC');
    res.json({ success: true, data: rows.map(r => ({ ...r, days: parseArr(r.days) })) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const { time, label, days } = req.body;
    if (!time) return res.status(400).json({ success: false, message: 'Time required' });
    const db = getDb();
    db.run(
      'INSERT INTO journal_reminders (time, label, days) VALUES (?,?,?)',
      [time, label || '', JSON.stringify(days || [])]
    );
    persistDb();
    const row = q('SELECT * FROM journal_reminders ORDER BY id DESC LIMIT 1')[0];
    row.days = parseArr(row.days);
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    getDb().run('DELETE FROM journal_reminders WHERE id=?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, create, remove };
