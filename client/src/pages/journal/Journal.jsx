import React, { useState, useEffect, useRef, useCallback } from 'react';
import { journalService } from '../../services/journalService';
import { journalReminderService } from '../../services/journalReminderService';
import { format } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import JournalDashboard from './JournalDashboard';
import './Journal.css';

const MOODS = [
  { value:'happy',      label:'Happy',      emoji:'😊', color:'rgba(251,191,36,.18)',  text:'#fcd34d' },
  { value:'grateful',   label:'Grateful',   emoji:'🙏', color:'rgba(251,146,60,.18)',  text:'#fb923c' },
  { value:'peaceful',   label:'Peaceful',   emoji:'😌', color:'rgba(52,211,153,.18)',  text:'#6ee7b7' },
  { value:'reflective', label:'Reflective', emoji:'🤔', color:'rgba(167,139,250,.18)', text:'#c4b5fd' },
  { value:'seeking',    label:'Seeking',    emoji:'🔍', color:'rgba(56,189,248,.18)',  text:'#7dd3fc' },
  { value:'burdened',   label:'Burdened',   emoji:'😔', color:'rgba(244,114,182,.18)', text:'#f9a8d4' },
  { value:'wrestling',  label:'Wrestling',  emoji:'⚡', color:'rgba(196,181,253,.18)', text:'#a78bfa' },
  { value:'joyful',     label:'Joyful',     emoji:'✨', color:'rgba(253,224,71,.18)',  text:'#fde047' },
];
const getMood = v => MOODS.find(m => m.value===v)||MOODS[0];

const DAILY_PROMPTS = [
  "What is God speaking to you about today?",
  "Where did you see God's hand in your life this week?",
  "What are you grateful for right now, even in difficulty?",
  "What is one area where you need to trust God more?",
  "Who has God placed on your heart to pray for?",
  "What scripture has been standing out to you lately?",
  "Where do you feel closest to God right now?",
  "What is one thing you want to surrender to God today?",
  "How has God answered a prayer recently?",
  "What does your relationship with God feel like right now?",
  "What is weighing on your heart today?",
  "In what way is God calling you to grow this season?",
];

const todaysPrompt = () => {
  const idx = new Date().getDate() % DAILY_PROMPTS.length;
  return DAILY_PROMPTS[idx];
};

const EMPTY = { title:'', content:'', mood:'peaceful', scripture:'', verse_text:'', verses:[], prompt_used:false, prompt_text:'', image_data:'' };

const BIBLE_BOOKS = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther',
  'Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations',
  'Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah',
  'Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians',
  '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John',
  '3 John','Jude','Revelation'];

async function fetchVerseText(ref) {
  if (!ref.trim()) return '';
  try {
    const encoded = encodeURIComponent(ref.trim());
    const res = await fetch(`https://bible-api.com/${encoded}?translation=kjv`);
    if (!res.ok) return '';
    const data = await res.json();
    if (data.error) return '';
    const verses = data.verses || [];
    if (!verses.length) return (data.text || '').trim();
    // Group consecutive verses by book+chapter for clean reading
    const grouped = [];
    let lastRef = '';
    verses.forEach(v => {
      const ref = `${v.book_name} ${v.chapter}`;
      const verseText = v.text.replace(/\n/g,' ').trim();
      if (ref !== lastRef) {
        grouped.push({ ref, verses: [`${v.verse}. ${verseText}`] });
        lastRef = ref;
      } else {
        grouped[grouped.length-1].verses.push(`${v.verse}. ${verseText}`);
      }
    });
    return grouped.map(g => `${g.ref}\n${g.verses.join(' ')}`).join('\n\n');
  } catch { return ''; }
}


// ── ViewVerse: collapsible verse card for view mode ──
function ViewVerse({ verse }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="j-view-scripture-block">
      <button className="j-scripture-toggle" onClick={() => setOpen(v => !v)}>
        <span className="j-scripture-toggle-ref">📖 {verse.ref}</span>
        {verse.text && (
          <span className="j-scripture-toggle-chevron">{open ? '▲ collapse' : '▼ read verse'}</span>
        )}
      </button>
      {open && verse.text && (
        <div className="j-view-verse-text j-verse-expand-anim">{verse.text}</div>
      )}
    </div>
  );
}

export default function Journal() {
  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [mode, setMode]                 = useState(null); // null=dashboard, 'view', 'edit', 'new'
  const [form, setForm]                 = useState(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');
  const [filterMood, setFilterMood]     = useState('all');
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [promptUsed, setPromptUsed]     = useState(false);
  const [verseLoading, setVerseLoading] = useState(false);
  const verseDebounceRef = useRef(null);
  const [verseExpanded, setVerseExpanded] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminders, setReminders]       = useState([]);
  const [newRemTime, setNewRemTime]     = useState('08:00');
  const [newRemLabel, setNewRemLabel]   = useState('');
  const [newRemDays, setNewRemDays]     = useState(['Mon','Wed','Fri']);
  const [imagePreview, setImagePreview] = useState('');
  const fileRef = useRef(null);
  const prompt  = todaysPrompt();

  useEffect(() => { fetchEntries(); fetchReminders(); }, []);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await journalService.getAll();
      setEntries(res.data.data);
    } catch { setError('Could not load entries.'); }
    finally { setLoading(false); }
  };

  const fetchReminders = async () => {
    try {
      const res = await journalReminderService.getAll();
      setReminders(res.data.data);
    } catch { /* non-critical */ }
  };

  const persistNewReminder = async (rem) => {
    try {
      const res = await journalReminderService.create(rem);
      setReminders(rs => [...rs, res.data.data]);
    } catch { setError('Failed to save reminder.'); }
  };

  const removeReminder = async (id) => {
    try {
      await journalReminderService.delete(id);
      setReminders(rs => rs.filter(r => r.id !== id));
    } catch { setError('Failed to delete reminder.'); }
  };

  const openNew = () => {
    setSelected(null);
    setForm({...EMPTY, prompt_text: prompt});
    setPromptUsed(false);
    setImagePreview('');
    setMode('new');
    setShowMoodPicker(false);
  };

  const openView = (entry) => { setSelected(entry); setMode('view'); };

  const openEdit = (entry) => {
    setSelected(entry);
    setForm({
      title: entry.title,
      content: entry.content,
      mood: entry.mood || 'peaceful',
      scripture: entry.scripture || '',
      verse_text: entry.verse_text || '',
      verses: (() => { try { return JSON.parse(entry.verses || '[]'); } catch { return []; } })(),
      prompt_used: !!entry.prompt_used,
      prompt_text: entry.prompt_text || '',
      image_data: entry.image_data || '',
    });
    setImagePreview(entry.image_data || '');
    setPromptUsed(!!entry.prompt_used);
    setMode('edit');
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, prompt_used: promptUsed, image_data: imagePreview, verses: JSON.stringify(form.verses || []) };
      let result;
      if (mode === 'edit' && selected) {
        result = await journalService.update(selected.id, payload);
      } else {
        result = await journalService.create(payload);
      }
      const saved = result.data.data;
      await fetchEntries();
      setSelected(saved);
      setMode('view');
    } catch { setError('Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await journalService.delete(id);
      const rem = entries.filter(e => e.id !== id);
      setEntries(rem);
      setSelected(null);
      setMode(null);
    } catch { setError('Failed to delete.'); }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      setForm(f => ({ ...f, image_data: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // Add a new verse reference to the list
  const handleAddVerse = async (ref) => {
    if (!ref.trim() || !/\d/.test(ref)) return;
    setVerseLoading(true);
    const text = await fetchVerseText(ref.trim());
    setVerseLoading(false);
    if (!text) return;
    setForm(f => ({
      ...f,
      verses: [...(f.verses||[]), { ref: ref.trim(), text, expanded: false }]
    }));
  };

  const handleRemoveVerse = (idx) => {
    setForm(f => ({ ...f, verses: (f.verses||[]).filter((_,i) => i !== idx) }));
  };

  const toggleVerseExpanded = (idx) => {
    setForm(f => ({
      ...f,
      verses: (f.verses||[]).map((v,i) => i === idx ? {...v, expanded: !v.expanded} : v)
    }));
  };

  const handleScriptureChange = (e) => {
    const val = e.target.value;
    setForm(f => ({ ...f, scripture: val, verse_text: val ? f.verse_text : '' }));
    if (verseDebounceRef.current) clearTimeout(verseDebounceRef.current);
    if (!val.trim()) { setVerseLoading(false); return; }
    // Only fetch if it looks like a real reference (has a number or colon)
    if (!/\d/.test(val)) return;
    setVerseLoading(true);
    verseDebounceRef.current = setTimeout(async () => {
      const text = await fetchVerseText(val);
      setForm(f => ({ ...f, verse_text: text }));
      setVerseLoading(false);
    }, 900);
  };

  const usePrompt = () => {
    setPromptUsed(true);
    setForm(f => ({ ...f, content: f.content ? `${f.content}\n\n${prompt}\n` : `${prompt}\n` }));
  };

  const filtered = entries.filter(e => {
    const ms = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase());
    const mm = filterMood === 'all' || e.mood === filterMood;
    return ms && mm;
  });

  const moodCounts = MOODS.map(m => ({ ...m, count: entries.filter(e=>e.mood===m.value).length })).filter(m=>m.count>0);
  const answeredCount = entries.filter(e=>e.is_answered).length;
  const rightW = sidebarOpen ? '280px' : '44px';
  const leftW  = listCollapsed ? '44px' : '280px';

  return (
    <div className="j-root">
      <div className="j-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* ── TOPBAR ── */}
      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag journal">Journal</span>
        </div>
        <div className="app-tb-actions">
          <button
            className="app-btn ghost icon-only"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '›' : '‹'}
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="j-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* ── LEFT: Entry List ── */}
        <div className={`j-list-panel ${listCollapsed ? 'collapsed' : ''}`}>
          <div className="j-panel-header">
            <button
              className="j-collapse-btn"
              onClick={() => setListCollapsed(v=>!v)}
              title={listCollapsed ? 'Expand entries list' : 'Collapse entries list'}
              aria-label={listCollapsed ? 'Expand entries list' : 'Collapse entries list'}
            >
              {listCollapsed ? '›' : '‹'}
            </button>
            {!listCollapsed && <span className="j-panel-title">Entries</span>}
            {!listCollapsed && <button className="j-icon-btn" onClick={openNew} title="New entry">✦</button>}
          </div>

          {!listCollapsed && (
            <>
              <div className="j-search">
                <span>🔍</span>
                <input className="j-search-input" type="text" placeholder="Search..."
                  value={search} onChange={e=>setSearch(e.target.value)} />
                {search && <button className="j-search-clear" onClick={()=>setSearch('')} title="Clear search" aria-label="Clear search">✕</button>}
              </div>

              <div className="j-filter-pills">
                <button className={`j-fpill ${filterMood==='all'?'active':''}`} onClick={()=>setFilterMood('all')}>All</button>
                {MOODS.map(m => {
                  const cnt = entries.filter(e=>e.mood===m.value).length;
                  if (!cnt) return null;
                  return (
                    <button key={m.value} className={`j-fpill ${filterMood===m.value?'active':''}`}
                      onClick={()=>setFilterMood(filterMood===m.value?'all':m.value)} title={m.label}>
                      {m.emoji}
                    </button>
                  );
                })}
              </div>

              {error && <div className="j-error">{error}<button onClick={()=>setError(null)}>✕</button></div>}

              <div className="j-entries">
                {loading ? (
                  <div className="j-list-empty">Loading...</div>
                ) : filtered.length === 0 ? (
                  <div className="j-list-empty">
                    <div>{entries.length===0 ? 'No entries yet.' : 'No matches.'}</div>
                    <button className="j-empty-cta" onClick={openNew}>+ Write first prayer</button>
                  </div>
                ) : filtered.map(entry => {
                  const mood = getMood(entry.mood);
                  const isSel = selected?.id===entry.id;
                  return (
                    <div key={entry.id} className={`j-ecard ${isSel?'sel':''}`}>
                      <div className="j-ecard-row">
                        <div className="j-ecard-info" onClick={() => openView(entry)}>
                          <div className="j-ecard-title">{entry.title}</div>
                          <div className="j-ecard-date">{format(new Date(entry.created_at),'MMM d, yyyy')}</div>
                        </div>
                        <button className="j-ecard-del" onClick={()=>handleDelete(entry.id)} title="Delete entry" aria-label="Delete entry">✕</button>
                      </div>
                      <div className="j-ecard-pills">
                        <span className="j-mood-pill" style={{background:mood.color,color:mood.text}}>
                          {mood.emoji} {mood.label}
                        </span>
                      </div>
                      {/* View + Edit buttons */}
                      <div className="j-ecard-actions">
                        <button className="j-ecard-view" onClick={() => openView(entry)}>👁 View</button>
                        <button className="j-ecard-edit" onClick={() => openEdit(entry)}>✏ Edit</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── CENTER ── */}
        <div className="j-center">

          {/* DASHBOARD */}
          {mode === null && (
            <JournalDashboard
              entries={entries}
              onOpenNew={openNew}
              onOpenView={openView}
            />
          )}

          {/* VIEW MODE */}
          {mode === 'view' && selected && (
            <div className="j-view-wrap">
              {/* Cover image */}
              {selected.image_data && (
                <div className="j-view-cover">
                  <img src={selected.image_data} alt="Entry cover" className="j-view-cover-img"/>
                </div>
              )}
              {!selected.image_data && <div className="j-detail-hero"><div className="hero-shine"/></div>}

              <div className="j-view-body">
                {/* Prompt used badge */}
                {selected.prompt_used && selected.prompt_text && (
                  <div className="j-view-prompt-badge">
                    ✨ Prompted: <em>"{selected.prompt_text}"</em>
                  </div>
                )}

                <div className="j-view-title">{selected.title}</div>
                <div className="j-view-meta">
                  <span>📅 {format(new Date(selected.created_at), 'MMMM d, yyyy · h:mm a')}</span>
                  <span className="j-mood-pill" style={{background:getMood(selected.mood).color,color:getMood(selected.mood).text}}>
                    {getMood(selected.mood).emoji} {getMood(selected.mood).label}
                  </span>
                </div>

                {/* Multi-verse display — view mode */}
                {(() => {
                  let verses = [];
                  try { verses = JSON.parse(selected.verses || '[]'); } catch {}
                  // Fall back to legacy single scripture
                  if (!verses.length && selected.scripture) {
                    verses = [{ ref: selected.scripture, text: selected.verse_text || '', expanded: false }];
                  }
                  if (!verses.length) return null;
                  return (
                    <div className="j-view-verses">
                      {verses.map((v, idx) => (
                        <ViewVerse key={idx} verse={v} />
                      ))}
                    </div>
                  );
                })()}

                <div className="j-view-content">{selected.content}</div>

                {/* Actions */}
                <div className="j-view-actions">
                  <button className="j-view-edit-btn" onClick={() => openEdit(selected)}>✏ Edit Entry</button>
                  <button className="j-view-del-btn" onClick={() => handleDelete(selected.id)}>🗑 Delete</button>
                  <button className="j-view-back-btn" onClick={() => setMode(null)}>← Dashboard</button>
                </div>
              </div>
            </div>
          )}

          {/* NEW / EDIT MODE */}
          {(mode === 'new' || mode === 'edit') && (
            <div className="j-form-wrap">
              <div className="j-form-header">
                <div className="j-form-header-title">
                  {mode === 'new' ? '✨ New Journal Entry' : '✏ Edit Entry'}
                </div>
                <button className="j-form-close" onClick={() => setMode(mode==='new'?null:'view')} title="Close" aria-label="Close">✕</button>
              </div>

              <div className="j-form-fields">

                {/* Today's Prompt */}
                <div className="j-prompt-card">
                  <div className="j-prompt-label">✨ Today's Prompt</div>
                  <div className="j-prompt-text">"{prompt}"</div>
                  <div className="j-prompt-btns">
                    <button
                      className={`j-prompt-use ${promptUsed ? 'used' : ''}`}
                      onClick={usePrompt}
                      disabled={promptUsed}
                    >
                      {promptUsed ? '✓ Used' : 'Use Prompt'}
                    </button>
                    <button className="j-prompt-skip" onClick={() => setPromptUsed(false)}>
                      Don't Use
                    </button>
                  </div>
                </div>

                {/* Image upload */}
                <div className="j-image-upload-area" onClick={() => fileRef.current?.click()}>
                  {imagePreview ? (
                    <div className="j-image-preview-wrap">
                      <img src={imagePreview} alt="Entry cover" className="j-image-preview"/>
                      <button className="j-image-remove" onClick={e=>{e.stopPropagation();setImagePreview('');setForm(f=>({...f,image_data:''}));}}>✕ Remove</button>
                    </div>
                  ) : (
                    <div className="j-image-placeholder">
                      <span style={{fontSize:28,opacity:.4}}>🖼</span>
                      <span className="j-image-hint">Click to upload a cover photo</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImageUpload}/>
                </div>

                <input
                  className="j-title-input"
                  type="text"
                  placeholder="What are you bringing before God today?"
                  value={form.title}
                  onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                />

                <textarea
                  className="j-body-textarea"
                  placeholder="Write your prayer, reflection, or request..."
                  value={form.content}
                  onChange={e=>setForm(f=>({...f,content:e.target.value}))}
                />

                {/* Multi-verse references */}
                <div className="j-verses-section">
                  <div className="j-verses-label">📖 Scripture References</div>

                  {/* Saved verse chips */}
                  {(form.verses||[]).map((v, idx) => (
                    <div key={idx} className="j-verse-card">
                      <button
                        className="j-verse-card-toggle"
                        onClick={() => toggleVerseExpanded(idx)}
                      >
                        <span className="j-verse-card-ref">📖 {v.ref}</span>
                        <span className="j-verse-card-chevron">{v.expanded ? '▲' : '▼ read'}</span>
                        <button
                          className="j-verse-card-del"
                          onClick={e => { e.stopPropagation(); handleRemoveVerse(idx); }}
                          aria-label="Remove verse"
                        >✕</button>
                      </button>
                      {v.expanded && (
                        <div className="j-verse-card-text j-verse-expand-anim">{v.text}</div>
                      )}
                    </div>
                  ))}

                  {/* Add new verse row */}
                  <div className="j-verse-add-row">
                    <div className="j-scripture-input-row">
                      <input
                        className="j-scripture-input"
                        type="text"
                        placeholder="e.g. John 3:16, Psalm 23, Romans 8:28-39..."
                        value={form.scripture}
                        onChange={handleScriptureChange}
                        onKeyDown={e => { if (e.key === 'Enter') { handleAddVerse(form.scripture); setForm(f=>({...f,scripture:'',verse_text:''})); }}}
                      />
                      {verseLoading && (
                        <div className="j-verse-spinner">
                          <div className="j-verse-dot"/><div className="j-verse-dot"/><div className="j-verse-dot"/>
                        </div>
                      )}
                    </div>
                    <button
                      className="j-verse-add-btn"
                      disabled={verseLoading || !form.scripture.trim() || !/\d/.test(form.scripture)}
                      onClick={() => { handleAddVerse(form.scripture); setForm(f=>({...f,scripture:'',verse_text:''})); }}
                    >+ Add</button>
                  </div>
                  <div className="j-verse-hint">Press Enter or click Add · You can add multiple references</div>
                </div>

                <div className="j-form-footer">
                  <div className="j-mood-sel-wrap">
                    <button className="j-mood-sel" onClick={()=>setShowMoodPicker(v=>!v)}>
                      {getMood(form.mood).emoji} {getMood(form.mood).label} ▾
                    </button>
                    {showMoodPicker && (
                      <div className="j-mood-dropdown">
                        {MOODS.map(m => (
                          <button key={m.value}
                            className={`j-mood-opt ${form.mood===m.value?'active':''}`}
                            onClick={()=>{setForm(f=>({...f,mood:m.value}));setShowMoodPicker(false);}}>
                            {m.emoji} {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="j-cancel-btn" onClick={() => setMode(mode==='new'?null:'view')}>Cancel</button>
                    <button className="j-save-btn" onClick={handleSave}
                      disabled={saving||!form.title.trim()||!form.content.trim()}>
                      💾 {saving ? 'Saving...' : 'Save Journal'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR: as 4th grid column ── */}
      <div className={`j-sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
        <div className="j-drawer-close-btn-wrap">
          <button
            className="j-sidebar-arrow-btn inside"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'Collapse' : 'Expand'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >{sidebarOpen ? '›' : '‹'}</button>
          {sidebarOpen && <span className="j-drawer-panel-title">Menu</span>}
        </div>
        <div className="j-drawer-body">

          <button className="j-drawer-new-btn" onClick={()=>{openNew();setSidebarOpen(false);}}>
            ✦ New Entry
          </button>

          <div className="j-drawer-divider"/>
          <div className="j-drawer-section-lbl">Tools</div>
          <button className="j-drawer-nav-btn">📄 Export Journal</button>
          <button className="j-drawer-nav-btn">🔔 Alerts</button>

          <div className="j-drawer-divider"/>
          <div className="j-drawer-section-lbl">Reminders</div>

          {/* Reminders list */}
          {reminders.length === 0 ? (
            <div className="j-rem-empty">No reminders set yet.</div>
          ) : reminders.map((r) => (
            <div key={r.id} className="j-rem-item">
              <span className="j-rem-dot"/>
              <div className="j-rem-info">
                <span className="j-rem-time">{r.time}</span>
                {r.label && <span className="j-rem-label">{r.label}</span>}
                <span className="j-rem-days">{(r.days || []).join(', ')}</span>
              </div>
              <button className="j-rem-del" onClick={() => removeReminder(r.id)} title="Delete reminder">✕</button>
            </div>
          ))}

          <button className="j-rem-add-btn" onClick={() => setShowReminders(true)}>
            🔔 Add Reminder
          </button>

          <div className="j-drawer-divider"/>
          <div className="j-drawer-section-lbl">Analytics</div>

          <div className="j-drawer-stats">
            <div className="j-dstat"><span className="j-dstat-n">{entries.length}</span><span className="j-dstat-l">Total</span></div>
            <div className="j-dstat"><span className="j-dstat-n" style={{color:'#6ee7b7'}}>{answeredCount}</span><span className="j-dstat-l">Answered</span></div>
            <div className="j-dstat"><span className="j-dstat-n" style={{color:'#f59e0b'}}>🔥</span><span className="j-dstat-l">Streak</span></div>
          </div>
          {moodCounts.slice(0,5).map(m => (
            <div key={m.value} className="j-drawer-bar-row">
              <span style={{fontSize:12}}>{m.emoji}</span>
              <div className="j-drawer-bar-track">
                <div className="j-drawer-bar-fill" style={{width:`${Math.round(m.count/Math.max(entries.length,1)*100)}%`,background:m.text}}/>
              </div>
              <span className="j-drawer-bar-n">{m.count}</span>
            </div>
          ))}

        </div>
      </div>
      </div>{/* end j-body */}
      {/* Modal overlay outside grid */}

      {/* ── REMINDER MODAL ── */}
      {showReminders && (
        <>
          <div className="j-modal-overlay" onClick={() => setShowReminders(false)}/>
          <div className="j-reminder-modal">
            <div className="j-rem-modal-hd">
              <span>🔔 Set Journal Reminder</span>
              <button className="j-rem-modal-close" onClick={() => setShowReminders(false)}>✕</button>
            </div>
            <div className="j-rem-modal-body">
              <div className="j-rem-modal-lbl">Time</div>
              <input
                className="j-rem-modal-time"
                type="time"
                value={newRemTime}
                onChange={e => setNewRemTime(e.target.value)}
              />
              <div className="j-rem-modal-lbl">Label (optional)</div>
              <input
                className="j-rem-modal-input"
                type="text"
                placeholder="e.g. Morning devotion, Evening reflection"
                value={newRemLabel}
                onChange={e => setNewRemLabel(e.target.value)}
              />
              <div className="j-rem-modal-lbl">Repeat on</div>
              <div className="j-rem-modal-days">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <button
                    key={d}
                    className={`j-rem-modal-day ${newRemDays.includes(d) ? 'on' : ''}`}
                    onClick={() => setNewRemDays(ds =>
                      ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]
                    )}
                  >{d}</button>
                ))}
              </div>
              <div className="j-rem-modal-presets">
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Mon','Tue','Wed','Thu','Fri'])}>Weekdays</button>
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Sat','Sun'])}>Weekends</button>
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])}>Daily</button>
              </div>
            </div>
            <div className="j-rem-modal-ft">
              <button className="j-cancel-btn" onClick={() => setShowReminders(false)}>Cancel</button>
              <button
                className="j-save-btn"
                disabled={newRemDays.length === 0}
                onClick={async () => {
                  if (!newRemDays.length) return;
                  await persistNewReminder({ time: newRemTime, label: newRemLabel, days: newRemDays });
                  setNewRemTime('08:00');
                  setNewRemLabel('');
                  setNewRemDays(['Mon','Wed','Fri']);
                  setShowReminders(false);
                }}
              >✓ Add Reminder</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
