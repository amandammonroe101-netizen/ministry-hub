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
const parseFx = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

const TRACK_META =
  'id, project_id, name, volume, pan, is_muted, is_solo, clip_offset, trim_start, trim_end, effects, sort_order, created_at';

/** List projects with lightweight track metadata (no audio blobs). */
const getAll = (req, res) => {
  try {
    const projects = q('SELECT * FROM studio_projects ORDER BY updated_at DESC, id DESC');
    const data = projects.map(p => ({
      ...p,
      trackCount: q('SELECT COUNT(*) AS c FROM studio_tracks WHERE project_id = ?', [p.id])[0].c,
    }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/** Full project — includes every track's audio_data. */
const getOne = (req, res) => {
  try {
    const project = q1('SELECT * FROM studio_projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ success: false, message: 'Not found' });
    project.tracks = q(
      'SELECT * FROM studio_tracks WHERE project_id = ? ORDER BY sort_order ASC, id ASC',
      [project.id]
    ).map(t => ({ ...t, effects: parseFx(t.effects) }));
    res.json({ success: true, data: project });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = (req, res) => {
  try {
    const { name, tempo } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const db = getDb();
    db.run('INSERT INTO studio_projects (name, tempo) VALUES (?,?)', [name, tempo || 100]);
    persistDb();
    const row = q('SELECT * FROM studio_projects ORDER BY id DESC LIMIT 1')[0];
    row.tracks = [];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const update = (req, res) => {
  try {
    const existing = q1('SELECT * FROM studio_projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const { name, tempo, master_volume } = req.body;
    getDb().run(
      `UPDATE studio_projects SET name=?, tempo=?, master_volume=?, updated_at=datetime('now') WHERE id=?`,
      [
        name ?? existing.name,
        tempo ?? existing.tempo,
        master_volume !== undefined ? master_volume : (existing.master_volume ?? 1),
        req.params.id,
      ]
    );
    persistDb();
    res.json({ success: true, data: q1('SELECT * FROM studio_projects WHERE id=?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const remove = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM studio_tracks WHERE project_id = ?', [req.params.id]);
    db.run('DELETE FROM studio_projects WHERE id = ?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── Tracks ──────────────────────────────────────────────────── */
const addTrack = (req, res) => {
  try {
    const { name, audio_data, clip_offset } = req.body;
    if (!audio_data) return res.status(400).json({ success: false, message: 'audio_data required' });
    const max = q1('SELECT COALESCE(MAX(sort_order), -1) AS m FROM studio_tracks WHERE project_id = ?', [req.params.id]);
    const db = getDb();
    db.run(
      `INSERT INTO studio_tracks (project_id, name, audio_data, clip_offset, sort_order, effects)
       VALUES (?,?,?,?,?,?)`,
      [req.params.id, name || `Track ${(max?.m ?? -1) + 2}`, audio_data, clip_offset || 0, (max?.m ?? -1) + 1, '{}']
    );
    db.run("UPDATE studio_projects SET updated_at=datetime('now') WHERE id=?", [req.params.id]);
    persistDb();
    const row = q('SELECT * FROM studio_tracks WHERE project_id = ? ORDER BY id DESC LIMIT 1', [req.params.id])[0];
    row.effects = parseFx(row.effects);
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateTrack = (req, res) => {
  try {
    const existing = q1('SELECT * FROM studio_tracks WHERE id = ?', [req.params.trackId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const b = req.body;
    const num = (v, d) => (v === undefined ? d : v);
    const effects = b.effects !== undefined
      ? JSON.stringify(b.effects)
      : existing.effects;
    getDb().run(
      `UPDATE studio_tracks SET
         name=?, volume=?, pan=?, is_muted=?, is_solo=?,
         clip_offset=?, trim_start=?, trim_end=?, effects=?, sort_order=?
       WHERE id=?`,
      [
        num(b.name, existing.name),
        num(b.volume, existing.volume),
        num(b.pan, existing.pan),
        b.is_muted !== undefined ? (b.is_muted ? 1 : 0) : existing.is_muted,
        b.is_solo  !== undefined ? (b.is_solo  ? 1 : 0) : existing.is_solo,
        num(b.clip_offset, existing.clip_offset),
        num(b.trim_start, existing.trim_start),
        num(b.trim_end, existing.trim_end),
        effects,
        num(b.sort_order, existing.sort_order),
        req.params.trackId,
      ]
    );
    getDb().run("UPDATE studio_projects SET updated_at=datetime('now') WHERE id=?", [existing.project_id]);
    persistDb();
    // Return metadata only — caller already has the audio
    const row = q1(`SELECT ${TRACK_META} FROM studio_tracks WHERE id=?`, [req.params.trackId]);
    row.effects = parseFx(row.effects);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const removeTrack = (req, res) => {
  try {
    const existing = q1('SELECT project_id FROM studio_tracks WHERE id = ?', [req.params.trackId]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const db = getDb();
    db.run('DELETE FROM studio_tracks WHERE id = ?', [req.params.trackId]);
    db.run("UPDATE studio_projects SET updated_at=datetime('now') WHERE id=?", [existing.project_id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, getOne, create, update, remove, addTrack, updateTrack, removeTrack };
