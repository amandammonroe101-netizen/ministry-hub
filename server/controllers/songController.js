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

const hydrate = (song) => {
  if (!song) return null;
  song.tags = parseArr(song.tags);
  song.sections = q(
    'SELECT * FROM song_sections WHERE song_id = ? ORDER BY sort_order ASC, id ASC',
    [song.id]
  );
  song.recordings = q(
    'SELECT id, song_id, label, duration, created_at FROM song_recordings WHERE song_id = ? ORDER BY created_at DESC',
    [song.id]
  );
  return song;
};

/* ── Songs CRUD ──────────────────────────────────────────────── */
const getAll = (req, res) => {
  try {
    const songs = q('SELECT * FROM songs ORDER BY updated_at DESC, id DESC');
    res.json({ success: true, data: songs.map(hydrate) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getOne = (req, res) => {
  try {
    const song = q1('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (!song) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: hydrate(song) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const {
      title, artist, song_key, tempo, time_signature, status,
      tags, theme, scripture, inspiration, notes, prayer_id, journal_id,
      performance_notes,
    } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title required' });
    const db = getDb();
    db.run(
      `INSERT INTO songs
       (title, artist, song_key, tempo, time_signature, status, tags, theme, scripture, inspiration, notes, prayer_id, journal_id, performance_notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        title,
        artist || '',
        song_key || '',
        tempo || null,
        time_signature || '4/4',
        status || 'idea',
        JSON.stringify(tags || []),
        theme || '',
        scripture || '',
        inspiration || '',
        notes || '',
        prayer_id || null,
        journal_id || null,
        performance_notes || '',
      ]
    );
    persistDb();
    const row = q('SELECT * FROM songs ORDER BY id DESC LIMIT 1')[0];
    res.status(201).json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const {
      title, artist, song_key, tempo, time_signature, status,
      tags, theme, scripture, inspiration, notes, prayer_id, journal_id,
      performance_notes,
    } = req.body;
    const db = getDb();
    db.run(
      `UPDATE songs SET
          title=?, artist=?, song_key=?, tempo=?, time_signature=?, status=?,
          tags=?, theme=?, scripture=?, inspiration=?, notes=?,
          prayer_id=?, journal_id=?, performance_notes=?,
          updated_at=datetime('now')
        WHERE id=?`,
      [
        title ?? existing.title,
        artist ?? existing.artist,
        song_key ?? existing.song_key,
        tempo !== undefined ? tempo : existing.tempo,
        time_signature ?? existing.time_signature,
        status ?? existing.status,
        tags !== undefined ? JSON.stringify(tags) : existing.tags,
        theme ?? existing.theme,
        scripture ?? existing.scripture,
        inspiration ?? existing.inspiration,
        notes ?? existing.notes,
        prayer_id !== undefined ? prayer_id : existing.prayer_id,
        journal_id !== undefined ? journal_id : existing.journal_id,
        performance_notes ?? existing.performance_notes,
        req.params.id,
      ]
    );
    persistDb();
    const row = q1('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: hydrate(row) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM song_sections WHERE song_id = ?', [req.params.id]);
    db.run('DELETE FROM song_recordings WHERE song_id = ?', [req.params.id]);
    db.run('DELETE FROM songs WHERE id = ?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── Sections (lyric blocks) ─────────────────────────────────── */
const addSection = (req, res) => {
  try {
    const { section_type, label, content, bars } = req.body;
    if (!section_type) return res.status(400).json({ success: false, message: 'section_type required' });
    const max = q1('SELECT COALESCE(MAX(sort_order), -1) AS m FROM song_sections WHERE song_id = ?', [req.params.id]);
    const db = getDb();
    db.run(
      `INSERT INTO song_sections (song_id, section_type, label, content, sort_order, bars) VALUES (?,?,?,?,?,?)`,
      [req.params.id, section_type, label || '', content || '', (max?.m ?? -1) + 1, bars || 4]
    );
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q('SELECT * FROM song_sections WHERE song_id = ? ORDER BY id DESC LIMIT 1', [req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const duplicateSection = (req, res) => {
  try {
    const existing = q1('SELECT * FROM song_sections WHERE id = ?', [req.params.sectionId]);
    if (!existing || existing.song_id != req.params.id)
      return res.status(404).json({ success: false, message: 'Not found' });
    const max = q1('SELECT COALESCE(MAX(sort_order), -1) AS m FROM song_sections WHERE song_id = ?', [req.params.id]);
    const db = getDb();
    db.run(
      `INSERT INTO song_sections (song_id, section_type, label, content, sort_order, bars) VALUES (?,?,?,?,?,?)`,
      [
        req.params.id,
        existing.section_type,
        existing.label || '',
        existing.content || '',
        (max?.m ?? -1) + 1,
        existing.bars || 4,
      ]
    );
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q('SELECT * FROM song_sections WHERE song_id = ? ORDER BY id DESC LIMIT 1', [req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateSection = (req, res) => {
  try {
    const existing = q1('SELECT * FROM song_sections WHERE id = ?', [req.params.sectionId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const { section_type, label, content, sort_order, bars } = req.body;
    const db = getDb();
    db.run(
      `UPDATE song_sections SET section_type=?, label=?, content=?, sort_order=?, bars=? WHERE id=?`,
      [
        section_type ?? existing.section_type,
        label ?? existing.label,
        content ?? existing.content,
        sort_order !== undefined ? sort_order : existing.sort_order,
        bars !== undefined ? bars : (existing.bars || 4),
        req.params.sectionId,
      ]
    );
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [existing.song_id]);
    persistDb();
    const row = q1('SELECT * FROM song_sections WHERE id = ?', [req.params.sectionId]);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const removeSection = (req, res) => {
  try {
    const existing = q1('SELECT * FROM song_sections WHERE id = ?', [req.params.sectionId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const db = getDb();
    db.run('DELETE FROM song_sections WHERE id = ?', [req.params.sectionId]);
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [existing.song_id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const reorderSections = (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order array required' });
    const db = getDb();
    order.forEach((sectionId, idx) => {
      db.run('UPDATE song_sections SET sort_order=? WHERE id=? AND song_id=?', [idx, sectionId, req.params.id]);
    });
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── Recordings ──────────────────────────────────────────────── */
const addRecording = (req, res) => {
  try {
    const { label, audio_data, duration } = req.body;
    if (!audio_data) return res.status(400).json({ success: false, message: 'audio_data required' });
    const db = getDb();
    db.run(
      'INSERT INTO song_recordings (song_id, label, audio_data, duration) VALUES (?,?,?,?)',
      [req.params.id, label || '', audio_data, duration || 0]
    );
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q('SELECT id, song_id, label, duration, created_at FROM song_recordings WHERE song_id = ? ORDER BY id DESC LIMIT 1', [req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getRecording = (req, res) => {
  try {
    const rec = q1('SELECT * FROM song_recordings WHERE id = ?', [req.params.recordingId]);
    if (!rec) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rec });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const removeRecording = (req, res) => {
  try {
    const rec = q1('SELECT * FROM song_recordings WHERE id = ?', [req.params.recordingId]);
    if (!rec) return res.status(404).json({ success: false, message: 'Not found' });
    const db = getDb();
    db.run('DELETE FROM song_recordings WHERE id = ?', [req.params.recordingId]);
    db.run("UPDATE songs SET updated_at=datetime('now') WHERE id=?", [rec.song_id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = {
  getAll, getOne, create, update, remove,
  addSection, duplicateSection, updateSection, removeSection, reorderSections,
  addRecording, getRecording, removeRecording,
};
