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

const hydrate = (prayer) => {
  if (!prayer) return null;
  prayer.updates = q(
    'SELECT * FROM prayer_updates WHERE prayer_id = ? ORDER BY created_at DESC',
    [prayer.id]
  );
  prayer.friends = q(
    `SELECT f.id, f.name, f.initials, f.color_from, f.color_to
       FROM prayer_friend_links l
       JOIN friends f ON f.id = l.friend_id
      WHERE l.prayer_id = ?
      ORDER BY f.name`,
    [prayer.id]
  );
  return prayer;
};

const setFriendLinks = (prayerId, friendIds) => {
  const db = getDb();
  db.run('DELETE FROM prayer_friend_links WHERE prayer_id = ?', [prayerId]);
  if (Array.isArray(friendIds)) {
    friendIds.forEach((fid) => {
      if (!fid) return;
      try {
        db.run(
          'INSERT OR IGNORE INTO prayer_friend_links (prayer_id, friend_id) VALUES (?,?)',
          [prayerId, fid]
        );
      } catch (e) { /* ignore duplicates */ }
    });
  }
};

const getAll = (req, res) => {
  try {
    const prayers = q(
      'SELECT * FROM prayer_requests ORDER BY is_urgent DESC, created_at DESC'
    );
    res.json({ success: true, data: prayers.map(hydrate) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getOne = (req, res) => {
  try {
    const prayer = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    if (!prayer) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: hydrate(prayer) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = (req, res) => {
  try {
    const {
      title, content, category, status, is_urgent, scripture,
      is_daily, entry_type, friend_ids,
    } = req.body;
    if (!title || !content)
      return res.status(400).json({ success: false, message: 'Title and content required' });
    const db = getDb();
    db.run(
      `INSERT INTO prayer_requests
       (title, content, category, status, is_urgent, scripture, is_daily, entry_type)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        title,
        content,
        category || 'General',
        status || 'praying',
        is_urgent ? 1 : 0,
        scripture || null,
        is_daily ? 1 : 0,
        entry_type === 'praise' ? 'praise' : 'request',
      ]
    );
    const row = q('SELECT * FROM prayer_requests ORDER BY id DESC LIMIT 1')[0];
    setFriendLinks(row.id, friend_ids);
    persistDb();
    res.status(201).json({ success: true, data: hydrate(row) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const {
      title, content, category, status, is_urgent, scripture,
      is_daily, entry_type, friend_ids,
    } = req.body;
    const db = getDb();
    db.run(
      `UPDATE prayer_requests
          SET title=?, content=?, category=?, status=?, is_urgent=?,
              scripture=?, is_daily=?, entry_type=?,
              updated_at=datetime('now')
        WHERE id=?`,
      [
        title ?? existing.title,
        content ?? existing.content,
        category ?? existing.category,
        status ?? existing.status,
        is_urgent !== undefined ? (is_urgent ? 1 : 0) : existing.is_urgent,
        scripture !== undefined ? scripture : existing.scripture,
        is_daily !== undefined ? (is_daily ? 1 : 0) : existing.is_daily,
        entry_type !== undefined
          ? (entry_type === 'praise' ? 'praise' : 'request')
          : (existing.entry_type || 'request'),
        req.params.id,
      ]
    );
    if (Array.isArray(friend_ids)) setFriendLinks(req.params.id, friend_ids);
    persistDb();
    const row = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: hydrate(row) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = (req, res) => {
  try {
    const existing = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const db = getDb();
    db.run('DELETE FROM prayer_updates WHERE prayer_id = ?', [req.params.id]);
    db.run('DELETE FROM prayer_friend_links WHERE prayer_id = ?', [req.params.id]);
    db.run('DELETE FROM prayer_requests WHERE id = ?', [req.params.id]);
    persistDb();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addUpdate = (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    const prayer = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    if (!prayer) return res.status(404).json({ success: false, message: 'Prayer not found' });
    const db = getDb();
    db.run('INSERT INTO prayer_updates (prayer_id, content) VALUES (?,?)', [
      req.params.id,
      content,
    ]);
    persistDb();
    const row = q(
      'SELECT * FROM prayer_updates WHERE prayer_id = ? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    )[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const setFriends = (req, res) => {
  try {
    const { friend_ids } = req.body;
    const prayer = q1('SELECT * FROM prayer_requests WHERE id = ?', [req.params.id]);
    if (!prayer) return res.status(404).json({ success: false, message: 'Not found' });
    setFriendLinks(req.params.id, friend_ids || []);
    persistDb();
    res.json({ success: true, data: hydrate(prayer) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove, addUpdate, setFriends };
