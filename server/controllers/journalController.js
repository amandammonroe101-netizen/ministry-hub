const { getDb, persistDb } = require('../config/db');

const q  = (sql, p=[]) => { const db=getDb(); const s=db.prepare(sql); const r=[]; s.bind(p); while(s.step()) r.push(s.getAsObject()); s.free(); return r; };
const q1 = (sql, p=[]) => q(sql,p)[0]||null;

const getEntries  = (req,res) => { try { res.json({success:true,data:q('SELECT * FROM journal_entries ORDER BY created_at DESC')}); } catch(e){res.status(500).json({success:false,message:e.message});} };
const getEntry    = (req,res) => { try { const e=q1('SELECT * FROM journal_entries WHERE id=?',[req.params.id]); if(!e) return res.status(404).json({success:false,message:'Not found'}); res.json({success:true,data:e}); } catch(e){res.status(500).json({success:false,message:e.message});} };

const createEntry = (req,res) => {
  try {
    const { title, content, mood, scripture, verse_text, verses, prompt_used, prompt_text, image_data } = req.body;
    if (!title||!content) return res.status(400).json({success:false,message:'Title and content required'});
    const db=getDb();
    db.run(
      'INSERT INTO journal_entries (title,content,mood,scripture,verse_text,verses,prompt_used,prompt_text,image_data) VALUES (?,?,?,?,?,?,?,?,?)',
      [title,content,mood||'peaceful',scripture||null,verse_text||null,verses||'[]',prompt_used?1:0,prompt_text||null,image_data||null]
    );
    persistDb();
    res.status(201).json({success:true,data:q('SELECT * FROM journal_entries ORDER BY id DESC LIMIT 1')[0]});
  } catch(e){res.status(500).json({success:false,message:e.message});}
};

const updateEntry = (req,res) => {
  try {
    const ex=q1('SELECT * FROM journal_entries WHERE id=?',[req.params.id]);
    if(!ex) return res.status(404).json({success:false,message:'Not found'});
    const {title,content,mood,scripture,verse_text,prompt_used,prompt_text,image_data} = req.body;
    const db=getDb();
    db.run(
      `UPDATE journal_entries SET title=?,content=?,mood=?,scripture=?,verse_text=?,verses=?,prompt_used=?,prompt_text=?,image_data=?,updated_at=datetime('now') WHERE id=?`,
      [title??ex.title,content??ex.content,mood??ex.mood,scripture??ex.scripture,
       verse_text!==undefined?verse_text:ex.verse_text,
       verses!==undefined?verses:(ex.verses||'[]'),
       prompt_used!==undefined?(prompt_used?1:0):ex.prompt_used,
       prompt_text!==undefined?prompt_text:ex.prompt_text,
       image_data!==undefined?image_data:ex.image_data,
       req.params.id]
    );
    persistDb();
    res.json({success:true,data:q1('SELECT * FROM journal_entries WHERE id=?',[req.params.id])});
  } catch(e){res.status(500).json({success:false,message:e.message});}
};

const deleteEntry = (req,res) => {
  try {
    const ex=q1('SELECT * FROM journal_entries WHERE id=?',[req.params.id]);
    if(!ex) return res.status(404).json({success:false,message:'Not found'});
    getDb().run('DELETE FROM journal_entries WHERE id=?',[req.params.id]);
    persistDb();
    res.json({success:true,message:'Deleted'});
  } catch(e){res.status(500).json({success:false,message:e.message});}
};

module.exports = { getEntries, getEntry, createEntry, updateEntry, deleteEntry };
