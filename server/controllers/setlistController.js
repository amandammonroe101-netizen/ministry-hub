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

const hydrate = (sl) => {
  if (!sl) return null;
  sl.songs = q(
    `SELECT ss.id AS link_id, ss.sort_order, ss.notes AS link_notes,
            s.id, s.title, s.artist, s.song_key, s.tempo, s.time_signature, s.status
       FROM setlist_songs ss
       JOIN songs s ON s.id = ss.song_id
      WHERE ss.setlist_id = ?
      ORDER BY ss.sort_order ASC, ss.id ASC`,
    [sl.id]
  );
  return sl;
};

const getAll = (req, res) => {
  try {
    const rows = q('SELECT * FROM setlists ORDER BY event_date DESC, updated_at DESC, id DESC');
    res.json({ success: true, data: rows.map(hydrate) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getOne = (req, res) => {
  try {
    const row = q1('SELECT * FROM setlists WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const { name, description, occasion, event_date } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const db = getDb();
    db.run(
      'INSERT INTO setlists (name, description, occasion, event_date) VALUES (?,?,?,?)',
      [name, description || '', occasion || '', event_date || '']
    );
    persistDb();
    const row = q('SELECT * FROM setlists ORDER BY id DESC LIMIT 1')[0];
    res.status(201).json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM setlists WHERE id=?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const { name, description, occasion, event_date } = req.body;
    const db = getDb();
    db.run(
      `UPDATE setlists SET name=?, description=?, occasion=?, event_date=?, updated_at=datetime('now') WHERE id=?`,
      [
        name ?? existing.name,
        description ?? existing.description,
        occasion ?? existing.occasion,
        event_date ?? existing.event_date,
        req.params.id,
      ]
    );
    persistDb();
    const row = q1('SELECT * FROM setlists WHERE id=?', [req.params.id]);
    res.json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM setlist_songs WHERE setlist_id=?', [req.params.id]);
    db.run('DELETE FROM setlists WHERE id=?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const addSong = (req, res) => {
  try {
    const { song_id, notes } = req.body;
    if (!song_id) return res.status(400).json({ success: false, message: 'song_id required' });
    const max = q1('SELECT COALESCE(MAX(sort_order), -1) AS m FROM setlist_songs WHERE setlist_id=?', [req.params.id]);
    const db = getDb();
    db.run(
      'INSERT INTO setlist_songs (setlist_id, song_id, sort_order, notes) VALUES (?,?,?,?)',
      [req.params.id, song_id, (max?.m ?? -1) + 1, notes || '']
    );
    db.run("UPDATE setlists SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q1('SELECT * FROM setlists WHERE id=?', [req.params.id]);
    res.status(201).json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const removeSong = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM setlist_songs WHERE id=? AND setlist_id=?', [req.params.linkId, req.params.id]);
    db.run("UPDATE setlists SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q1('SELECT * FROM setlists WHERE id=?', [req.params.id]);
    res.json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const reorderSongs = (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order array required' });
    const db = getDb();
    order.forEach((linkId, idx) => {
      db.run('UPDATE setlist_songs SET sort_order=? WHERE id=? AND setlist_id=?', [idx, linkId, req.params.id]);
    });
    db.run("UPDATE setlists SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, getOne, create, update, remove, addSong, removeSong, reorderSongs };
