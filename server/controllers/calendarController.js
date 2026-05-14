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

const getAll = (req, res) => {
  try {
    const events = q('SELECT * FROM calendar_events ORDER BY event_date ASC, event_time ASC');
    res.json({ success: true, data: events });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const { title, description, event_date, event_time, end_date, color, category } = req.body;
    if (!title || !event_date) {
      return res.status(400).json({ success: false, message: 'Title and date required' });
    }
    const db = getDb();
    db.run(
      `INSERT INTO calendar_events (title, description, event_date, event_time, end_date, color, category)
       VALUES (?,?,?,?,?,?,?)`,
      [title, description || '', event_date, event_time || '', end_date || '',
       color || '#a78bfa', category || 'general']
    );
    persistDb();
    const row = q('SELECT * FROM calendar_events ORDER BY id DESC LIMIT 1')[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM calendar_events WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const { title, description, event_date, event_time, end_date, color, category } = req.body;
    const db = getDb();
    db.run(
      `UPDATE calendar_events
          SET title=?, description=?, event_date=?, event_time=?, end_date=?, color=?, category=?
        WHERE id=?`,
      [
        title ?? existing.title,
        description ?? existing.description,
        event_date ?? existing.event_date,
        event_time ?? existing.event_time,
        end_date ?? existing.end_date,
        color ?? existing.color,
        category ?? existing.category,
        req.params.id,
      ]
    );
    persistDb();
    const row = q1('SELECT * FROM calendar_events WHERE id=?', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    getDb().run('DELETE FROM calendar_events WHERE id=?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, create, update, remove };
