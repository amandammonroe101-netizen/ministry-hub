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
const parseTags = (t) => { try { return JSON.parse(t || '[]'); } catch { return []; } };

/* ── FRIENDS CRUD ── */
const getFriends = (req, res) => {
  try {
    const friends = q('SELECT * FROM friends ORDER BY name ASC');
    res.json({ success: true, data: friends.map(f => ({
      ...f,
      tags: parseTags(f.tags),
      interests: parseTags(f.interests),
      reach_out_days: parseTags(f.reach_out_days),
    })) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const getFriendDetail = (req, res) => {
  try {
    const f = q1('SELECT * FROM friends WHERE id = ?', [req.params.id]);
    if (!f) return res.status(404).json({ success: false, message: 'Not found' });
    f.tags = parseTags(f.tags);
    f.interests = parseTags(f.interests);
    f.reach_out_days = parseTags(f.reach_out_days);
    f.prayers = q('SELECT * FROM friend_prayers WHERE friend_id = ? ORDER BY is_urgent DESC, created_at DESC', [f.id]);
    f.events = q('SELECT * FROM friend_events WHERE friend_id = ? ORDER BY event_date ASC', [f.id]);
    f.timeline = q('SELECT * FROM friend_timeline WHERE friend_id = ? ORDER BY created_at DESC LIMIT 10', [f.id]);
    res.json({ success: true, data: f });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const addFriend = (req, res) => {
  try {
    const { name, role, church, initials, color_from, color_to, tags, nickname, city,
            life_season, life_update, emotional_status, interests, birthday, how_met,
            communication_frequency, reach_out_days, friend_status, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const db = getDb();
    db.run(
      `INSERT INTO friends (name,role,church,initials,color_from,color_to,tags,nickname,city,
        life_season,life_update,emotional_status,interests,birthday,how_met,communication_frequency,reach_out_days,friend_status,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, role||'', church||'',
       initials || name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
       color_from||'#3730a3', color_to||'#6c3fc9',
       JSON.stringify(tags||[]), nickname||'', city||'',
       life_season||'', life_update||'', emotional_status||'peaceful',
       JSON.stringify(interests||[]), birthday||'', how_met||'',
       communication_frequency||'weekly',
       JSON.stringify(reach_out_days||[]),
       friend_status||'',
       notes||'']
    );
    persistDb();
    const row = q('SELECT * FROM friends ORDER BY id DESC LIMIT 1')[0];
    row.tags = parseTags(row.tags);
    row.interests = parseTags(row.interests);
    row.reach_out_days = parseTags(row.reach_out_days);
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateFriend = (req, res) => {
  try {
    const existing = q1('SELECT * FROM friends WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    const fields = ['name','role','church','nickname','city','life_season','life_update',
      'emotional_status','birthday','how_met','communication_frequency','notes','last_contacted','friend_status'];
    const arrayFields = ['tags','interests','reach_out_days'];
    const updates = [];
    const vals = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f}=?`); vals.push(req.body[f]); }
    });
    arrayFields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f}=?`); vals.push(JSON.stringify(req.body[f])); }
    });
    if (!updates.length) return res.json({ success: true, data: existing });
    vals.push(req.params.id);
    getDb().run(`UPDATE friends SET ${updates.join(',')} WHERE id=?`, vals);
    persistDb();
    const row = q1('SELECT * FROM friends WHERE id=?', [req.params.id]);
    row.tags = parseTags(row.tags);
    row.interests = parseTags(row.interests);
    row.reach_out_days = parseTags(row.reach_out_days);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const removeFriend = (req, res) => {
  try {
    const db = getDb();
    db.run('DELETE FROM friend_prayers WHERE friend_id=?', [req.params.id]);
    db.run('DELETE FROM friend_events WHERE friend_id=?', [req.params.id]);
    db.run('DELETE FROM friend_timeline WHERE friend_id=?', [req.params.id]);
    db.run('DELETE FROM friends WHERE id=?', [req.params.id]);
    persistDb();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── FRIEND PRAYERS ── */
const addFriendPrayer = (req, res) => {
  try {
    const { content, category, is_urgent } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    const db = getDb();
    db.run('INSERT INTO friend_prayers (friend_id,content,category,is_urgent) VALUES (?,?,?,?)',
      [req.params.id, content, category||'General', is_urgent?1:0]);
    persistDb();
    const row = q('SELECT * FROM friend_prayers WHERE friend_id=? ORDER BY id DESC LIMIT 1',[req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const updateFriendPrayer = (req, res) => {
  try {
    const { status } = req.body;
    getDb().run(`UPDATE friend_prayers SET status=?,updated_at=datetime('now') WHERE id=?`,
      [status, req.params.prayerId]);
    persistDb();
    const row = q1('SELECT * FROM friend_prayers WHERE id=?',[req.params.prayerId]);
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── FRIEND TIMELINE ── */
const addTimeline = (req, res) => {
  try {
    const { content, entry_type, dot_color } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    const db = getDb();
    db.run('INSERT INTO friend_timeline (friend_id,content,entry_type,dot_color) VALUES (?,?,?,?)',
      [req.params.id, content, entry_type||'note', dot_color||'#c4b5fd']);
    persistDb();
    const row = q('SELECT * FROM friend_timeline WHERE friend_id=? ORDER BY id DESC LIMIT 1',[req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── FRIEND EVENTS ── */
const addFriendEvent = (req, res) => {
  try {
    const { title, event_date, event_type, description } = req.body;
    if (!title || !event_date) return res.status(400).json({ success: false, message: 'Title and date required' });
    const db = getDb();
    db.run('INSERT INTO friend_events (friend_id,title,event_date,event_type,description) VALUES (?,?,?,?,?)',
      [req.params.id, title, event_date, event_type||'general', description||'']);
    persistDb();
    const row = q('SELECT * FROM friend_events WHERE friend_id=? ORDER BY id DESC LIMIT 1',[req.params.id])[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── COMMUNITY PRAYERS ── */
const getCommunityPrayers = (req, res) => {
  try {
    const rows = q(`SELECT cp.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM community_prayers cp LEFT JOIN friends f ON f.id=cp.friend_id
      ORDER BY cp.is_urgent DESC, cp.created_at DESC`);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const addCommunityPrayer = (req, res) => {
  try {
    const { friend_id, content, category, is_urgent } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content required' });
    const db = getDb();
    db.run('INSERT INTO community_prayers (friend_id,content,category,is_urgent) VALUES (?,?,?,?)',
      [friend_id||null, content, category||'General', is_urgent?1:0]);
    persistDb();
    const row = q(`SELECT cp.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM community_prayers cp LEFT JOIN friends f ON f.id=cp.friend_id ORDER BY cp.id DESC LIMIT 1`)[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const togglePraying = (req, res) => {
  try {
    const row = q1('SELECT * FROM community_prayers WHERE id=?',[req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    const now = row.user_is_praying ? 0 : 1;
    getDb().run('UPDATE community_prayers SET user_is_praying=?,praying_count=? WHERE id=?',
      [now, Math.max(1, row.praying_count+(now?1:-1)), req.params.id]);
    persistDb();
    const updated = q1(`SELECT cp.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM community_prayers cp LEFT JOIN friends f ON f.id=cp.friend_id WHERE cp.id=?`,[req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── PRAYER EVENTS ── */
const getEvents = (req, res) => {
  try {
    const rows = q(`SELECT pe.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM prayer_events pe LEFT JOIN friends f ON f.id=pe.friend_id
      ORDER BY pe.event_date ASC, pe.event_time ASC`);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const addEvent = (req, res) => {
  try {
    const { friend_id, title, description, location, event_date, event_time } = req.body;
    if (!title || !event_date) return res.status(400).json({ success: false, message: 'Title and date required' });
    const db = getDb();
    db.run('INSERT INTO prayer_events (friend_id,title,description,location,event_date,event_time) VALUES (?,?,?,?,?,?)',
      [friend_id||null, title, description||'', location||'', event_date, event_time||'']);
    persistDb();
    const row = q(`SELECT pe.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM prayer_events pe LEFT JOIN friends f ON f.id=pe.friend_id ORDER BY pe.id DESC LIMIT 1`)[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const toggleJoining = (req, res) => {
  try {
    const row = q1('SELECT * FROM prayer_events WHERE id=?',[req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    getDb().run('UPDATE prayer_events SET user_is_joining=? WHERE id=?',[row.user_is_joining?0:1,req.params.id]);
    persistDb();
    const updated = q1(`SELECT pe.*,f.name as friend_name,f.initials,f.color_from,f.color_to
      FROM prayer_events pe LEFT JOIN friends f ON f.id=pe.friend_id WHERE pe.id=?`,[req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = {
  getFriends, getFriendDetail, addFriend, updateFriend, removeFriend,
  addFriendPrayer, updateFriendPrayer, addTimeline, addFriendEvent,
  getCommunityPrayers, addCommunityPrayer, togglePraying,
  getEvents, addEvent, toggleJoining
};
