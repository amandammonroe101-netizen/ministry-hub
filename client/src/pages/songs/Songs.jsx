import { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { songService } from '../../services/songService';
import { setlistService } from '../../services/setlistService';
import { startMetronome, startPitchDrone, makeTapTempo } from './audio';
import './Songs.css';

/* ─────────────────────────────────────────────────────────────
   Static config
   ───────────────────────────────────────────────────────────── */
const STATUSES = [
  { value: 'idea',         label: 'Idea',         emoji: '💡', color: '#fcd34d' },
  { value: 'draft',        label: 'Draft',        emoji: '✏️', color: '#c4b5fd' },
  { value: 'in-progress',  label: 'In Progress',  emoji: '🎵', color: '#7dd3fc' },
  { value: 'finished',     label: 'Finished',     emoji: '✓',  color: '#6ee7b7' },
  { value: 'shelved',      label: 'Shelved',      emoji: '📦', color: '#9ca3af' },
];
const getStatus = (v) => STATUSES.find(s => s.value === v) || STATUSES[0];

const SECTION_TYPES = [
  { value: 'intro',      label: 'Intro',      emoji: '🎼' },
  { value: 'verse',      label: 'Verse',      emoji: '📝' },
  { value: 'pre-chorus', label: 'Pre-Chorus', emoji: '↗️' },
  { value: 'chorus',     label: 'Chorus',     emoji: '🌟' },
  { value: 'bridge',     label: 'Bridge',     emoji: '🌉' },
  { value: 'tag',        label: 'Tag',        emoji: '🏷️' },
  { value: 'hook',       label: 'Hook',       emoji: '🎣' },
  { value: 'outro',      label: 'Outro',      emoji: '🎶' },
];
const getSectionType = (v) => SECTION_TYPES.find(s => s.value === v) || SECTION_TYPES[1];

const KEYS = [
  'C','C#','D','D#','E','F','F#','G','G#','A','A#','B',
  'Am','A#m','Bm','Cm','C#m','Dm','D#m','Em','Fm','F#m','Gm','G#m',
];

const TIME_SIGNATURES = ['4/4','3/4','6/8','12/8','2/4','5/4','7/8'];

/* ── Songwriting prompts (cycle daily) ──────────────────────── */
const SONG_PROMPTS = [
  "Write a song that starts in the middle of a conversation.",
  "Begin with a question you can't answer.",
  "Open with a place you've never been and write from there.",
  "Pick a single word and write a chorus around it.",
  "Write a verse that describes a feeling without naming it.",
  "Take a phrase you can't shake and build outward.",
  "Write a song that's a letter you'll never send.",
  "Use only sensory language — no abstract words.",
  "Write from someone else's perspective.",
  "Take a scripture verse and unpack it line by line.",
  "Start with the last line and work backwards.",
  "Write a song you'd want to sing in a small room.",
];
const todaysPrompt = () => SONG_PROMPTS[new Date().getDate() % SONG_PROMPTS.length];

/* ── Structure templates ────────────────────────────────────── */
const STRUCTURE_TEMPLATES = [
  { id: 'aaba',         name: 'AABA',              sections: ['verse','verse','bridge','verse'] },
  { id: 'verse-chorus', name: 'Verse · Chorus',    sections: ['verse','chorus','verse','chorus','bridge','chorus'] },
  { id: 'worship',      name: 'Worship',           sections: ['intro','verse','chorus','verse','chorus','bridge','chorus','outro'] },
  { id: 'anthem',       name: 'Anthem',            sections: ['verse','pre-chorus','chorus','verse','pre-chorus','chorus','bridge','chorus','outro'] },
  { id: 'simple',       name: 'Simple V-C',        sections: ['verse','chorus','verse','chorus'] },
];

/* ── Common chord progressions ──────────────────────────────── */
const PROGRESSIONS = [
  { name: 'Pop axis',       numerals: 'I-V-vi-IV',     positions: [0, 7, 9, 5] },
  { name: '50s doo-wop',    numerals: 'I-vi-IV-V',     positions: [0, 9, 5, 7] },
  { name: 'Worship I-IV-V', numerals: 'I-IV-V-vi',     positions: [0, 5, 7, 9] },
  { name: 'ii-V-I (jazz)',  numerals: 'ii-V-I',        positions: [2, 7, 0], minorIdx: [0] },
  { name: 'Andalusian',     numerals: 'i-VII-VI-V',    positions: [0, 10, 8, 7], minorIdx: [0] },
  { name: 'Pachelbel',      numerals: 'I-V-vi-iii-IV-I-IV-V', positions: [0, 7, 9, 4, 5, 0, 5, 7], minorIdx: [2, 3] },
  { name: 'Sad pop',        numerals: 'vi-IV-I-V',     positions: [9, 5, 0, 7], minorIdx: [0] },
];

/* ── Cliche lexicon (worship + pop overlap) ─────────────────── */
const CLICHES = [
  'heart of gold','broken heart','crazy in love','love is forever','true love',
  'in the rain','in the moonlight','time will tell','set me free','falling for you',
  'tears of joy','amazing love','wonderful name','so high','too deep',
  "can't get enough",'love is blind','love hurts',"baby don't go",'angel from above',
  'set on fire','heart on fire','heart of stone','dance in the rain','reach for the sky',
  'all my heart','soul of mine','rise above','through the storm','here in your presence',
];

/* ── Nashville Number System ────────────────────────────────── */
const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
const NUM_MAP = { 0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7' };
const chordToNashville = (chord, key) => {
  if (!key || !chord) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return chord;
  const root = m[1];
  const suffix = m[2];
  const keyRoot = key.replace(/m$/, '');
  const rs = NOTE_INDEX[root];
  const ks = NOTE_INDEX[keyRoot];
  if (rs === undefined || ks === undefined) return chord;
  const diff = (rs - ks + 12) % 12;
  return (NUM_MAP[diff] || diff) + suffix;
};

/* ── Duration math ──────────────────────────────────────────── */
const songDurationSeconds = (song) => {
  if (!song?.tempo) return null;
  const sections = song.sections || [];
  if (sections.length === 0) return null;
  const totalBars = sections.reduce((sum, s) => sum + (s.bars || 4), 0);
  const bpb = parseInt((song.time_signature || '4/4').split('/')[0], 10) || 4;
  return (totalBars * bpb / song.tempo) * 60;
};
const fmtDuration = (s) => {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

/* ── Word frequency + cliche scan ───────────────────────────── */
const STOP_WORDS = new Set(['the','a','and','or','i','you','to','of','in','it','is','that','this','for','on','my','me','am','was','were','be','have','had','do','did','at','by','as','if','so','no','not','too','but','from','with','an','we','us','they','he','she','his','her','their','will','can','just','all','your','what','when','where','how','there','then','now','up','down','out','over','into','our','one','more','some']);
const wordFrequency = (song) => {
  const all = (song.sections || []).map(s => (s.content || '').replace(/\[[^\]]+\]/g, '')).join(' ');
  const words = all.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
};
const detectCliches = (song) => {
  const found = [];
  (song.sections || []).forEach(s => {
    const text = (s.content || '').replace(/\[[^\]]+\]/g, '').toLowerCase();
    CLICHES.forEach(c => {
      if (text.includes(c)) found.push({ sectionLabel: s.label || s.section_type, cliche: c });
    });
  });
  return found;
};

const TABS = [
  { key: 'lyrics',      label: 'Lyrics',      emoji: '📝', hint: 'Section editor with ChordPro chord syntax, syllable counter, and rhyme finder.' },
  { key: 'music',       label: 'Music',       emoji: '🎼', hint: 'Key, tempo, time signature, and one-click transpose for every chord in the song.' },
  { key: 'inspiration', label: 'Inspiration', emoji: '📖', hint: 'Scripture, theme, what sparked it, and free-form notes.' },
  { key: 'recordings',  label: 'Recordings',  emoji: '🎙', hint: 'Voice memos recorded in-browser — every take saved with the song.' },
  { key: 'insights',    label: 'Insights',    emoji: '📊', hint: 'Stats about the song — section count, word count, syllable totals.' },
];

const EMPTY_FORM = {
  title: '', artist: '', song_key: '', tempo: '', time_signature: '4/4',
  status: 'idea', theme: '', scripture: '', inspiration: '', notes: '',
};

/* ─────────────────────────────────────────────────────────────
   Smart sections
   ───────────────────────────────────────────────────────────── */
const SMART_SECTIONS = [
  { key: 'idea',         label: 'Ideas',        emoji: '💡', tone: 'idea',
    subtitle: 'Half-formed sparks waiting for a chorus.', filter: (s) => s.status === 'idea' },
  { key: 'draft',        label: 'Drafts',       emoji: '✏️', tone: 'draft',
    subtitle: 'Songs you’re shaping but not playing yet.',  filter: (s) => s.status === 'draft' },
  { key: 'in-progress',  label: 'In Progress',  emoji: '🎵', tone: 'progress',
    subtitle: 'Working through these right now.',           filter: (s) => s.status === 'in-progress' },
  { key: 'finished',     label: 'Finished',     emoji: '✓',  tone: 'finished',
    subtitle: 'Songs you’ve completed and can play start to finish.', filter: (s) => s.status === 'finished' },
  { key: 'shelved',      label: 'Shelved',      emoji: '📦', tone: 'shelved',
    subtitle: 'Set aside for now — but still here.',        filter: (s) => s.status === 'shelved' },
];

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
const CHORD_REGEX = /\[([^\]]+)\]/g;

/** Count syllables in a line — strips chords + punctuation first. */
const countSyllables = (line) => {
  if (!line) return 0;
  const clean = line.replace(CHORD_REGEX, '').toLowerCase();
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word) => sum + countWordSyllables(word), 0);
};

const countWordSyllables = (raw) => {
  const word = raw.replace(/[^a-z']/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  // Standard rule-based approximation
  let cleaned = word.replace(/(?:[^laeiouy]|ed|[^laeiouy]e)$/, '');
  cleaned = cleaned.replace(/^y/, '');
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
};

const stripChords = (text) => (text || '').replace(CHORD_REGEX, '');
const wordCount = (text) => stripChords(text).trim().split(/\s+/).filter(Boolean).length;

/* ── Chord transposition ─────────────────────────────────────── */
const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONIC = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

const normalizeRoot = (r) => ENHARMONIC[r] || r;

const transposeChord = (chord, semitones) => {
  // chord = "Gmaj7", "Em", "F#sus4", etc.
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chord;
  const root = normalizeRoot(match[1]);
  const suffix = match[2];
  const idx = CHROMATIC.indexOf(root);
  if (idx < 0) return chord;
  const newRoot = CHROMATIC[(idx + semitones + 12 * 100) % 12];
  return newRoot + suffix;
};

const transposeLine = (line, semitones) => {
  if (!semitones) return line;
  return line.replace(CHORD_REGEX, (_, chord) => `[${transposeChord(chord, semitones)}]`);
};

/* ── Word lookups (free Datamuse API, no key needed) ─────────── */
const LOOKUP_MODES = {
  rhy: { param: 'rel_rhy', label: 'Rhymes',      emoji: '🎯' },
  nry: { param: 'rel_nry', label: 'Near rhymes', emoji: '〰️' },
  ml:  { param: 'ml',      label: 'Synonyms',    emoji: '💭' },
};

const fetchWords = async (word, mode = 'rhy') => {
  if (!word) return [];
  const cfg = LOOKUP_MODES[mode] || LOOKUP_MODES.rhy;
  try {
    const res = await fetch(`https://api.datamuse.com/words?${cfg.param}=${encodeURIComponent(word.toLowerCase())}&max=24`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(d => d.word);
  } catch { return []; }
};

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Songs() {
  const [songs, setSongs]                       = useState([]);
  const [setlists, setSetlists]                 = useState([]);
  const [selected, setSelected]                 = useState(null);
  const [selectedSetlist, setSelectedSetlist]   = useState(null);
  const [showForm, setShowForm]                 = useState(false);
  const [showSetlistForm, setShowSetlistForm]   = useState(false);
  const [form, setForm]                         = useState(EMPTY_FORM);
  const [setlistForm, setSetlistForm]           = useState({ name: '', occasion: '', event_date: '' });
  const [saving, setSaving]                     = useState(false);
  const [error, setError]                       = useState(null);
  const [loading, setLoading]                   = useState(true);

  const [search, setSearch]                     = useState('');
  const [activeSection, setActiveSection]       = useState('idea');
  const [expandedSections, setExpandedSections] = useState({ idea: true, draft: true, setlists: true });
  const [activeTab, setActiveTab]               = useState('lyrics');
  const [leftCollapsed, setLeftCollapsed]       = useState(false);
  const [rightCollapsed, setRightCollapsed]     = useState(false);
  const [performanceMode, setPerformanceMode]   = useState(null); // null | { type: 'song' } | { type: 'setlist' }

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [sR, slR] = await Promise.all([songService.getAll(), setlistService.getAll()]);
      setSongs(sR.data.data);
      setSetlists(slR.data.data);
      if (selected) {
        const fresh = sR.data.data.find(s => s.id === selected.id);
        if (fresh) setSelected(fresh);
      }
      if (selectedSetlist) {
        const fresh = slR.data.data.find(x => x.id === selectedSetlist.id);
        if (fresh) setSelectedSetlist(fresh);
      }
    } catch { setError('Could not load.'); }
    finally { setLoading(false); }
  };

  /* ── setlist mutations ───────────────────────────────────── */
  const handleCreateSetlist = async () => {
    if (!setlistForm.name.trim()) return;
    try {
      const res = await setlistService.create(setlistForm);
      setSetlistForm({ name: '', occasion: '', event_date: '' });
      setShowSetlistForm(false);
      setSelectedSetlist(res.data.data);
      setSelected(null);
      await fetchAll();
    } catch { setError('Failed to create setlist.'); }
  };
  const handleAddToSetlist = async (setlistId, songId) => {
    try {
      const res = await setlistService.addSong(setlistId, songId);
      const updated = res.data.data;
      setSetlists(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selectedSetlist?.id === updated.id) setSelectedSetlist(updated);
    } catch { setError('Failed to add to setlist.'); }
  };
  const handleRemoveFromSetlist = async (setlistId, linkId) => {
    try {
      const res = await setlistService.removeSong(setlistId, linkId);
      const updated = res.data.data;
      setSetlists(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selectedSetlist?.id === updated.id) setSelectedSetlist(updated);
    } catch { setError('Failed to remove from setlist.'); }
  };
  const handleReorderSetlist = async (setlistId, order) => {
    try {
      await setlistService.reorderSongs(setlistId, order);
      const res = await setlistService.getOne(setlistId);
      setSetlists(prev => prev.map(x => x.id === setlistId ? res.data.data : x));
      if (selectedSetlist?.id === setlistId) setSelectedSetlist(res.data.data);
    } catch { setError('Failed to reorder.'); }
  };
  const handleDeleteSetlist = async (setlistId) => {
    if (!confirm('Delete this setlist? Songs stay in your library.')) return;
    try {
      await setlistService.delete(setlistId);
      if (selectedSetlist?.id === setlistId) setSelectedSetlist(null);
      await fetchAll();
    } catch { setError('Failed to delete setlist.'); }
  };

  /* ── mutations ───────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, tempo: form.tempo ? Number(form.tempo) : null };
      const res = await songService.create(payload);
      const created = res.data.data;
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSelected(created);
      setActiveTab('lyrics');
      await fetchAll();
    } catch { setError('Failed to create song.'); }
    finally { setSaving(false); }
  };

  const handleUpdateField = async (field, value) => {
    if (!selected) return;
    try {
      const res = await songService.update(selected.id, { [field]: value });
      const updated = res.data.data;
      setSongs(prev => prev.map(s => s.id === updated.id ? updated : s));
      setSelected(updated);
    } catch { setError('Failed to update.'); }
  };

  const handleDeleteSong = async () => {
    if (!selected) return;
    if (!confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    try {
      await songService.delete(selected.id);
      setSelected(null);
      await fetchAll();
    } catch { setError('Failed to delete.'); }
  };

  const handleAddSection = async (sectionType, options = {}) => {
    if (!selected) return;
    try {
      const existingOfType = (selected.sections || []).filter(s => s.section_type === sectionType).length;
      const t = getSectionType(sectionType);
      const label = ['verse','chorus'].includes(sectionType)
        ? `${t.label} ${existingOfType + 1}`
        : t.label;
      await songService.addSection(selected.id, {
        section_type: sectionType,
        label,
        content: options.initialContent || '',
      });
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
      setActiveTab('lyrics');
    } catch { setError('Failed to add section.'); }
  };

  const handleDuplicateSection = async (sectionId) => {
    if (!selected) return;
    try {
      await songService.duplicateSection(selected.id, sectionId);
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
    } catch { setError('Failed to duplicate section.'); }
  };

  const handleApplyTemplate = async (template) => {
    if (!selected) return;
    try {
      const typeCounts = {};
      for (const type of template.sections) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
        const t = getSectionType(type);
        const label = ['verse','chorus'].includes(type) && typeCounts[type] > 1
          ? `${t.label} ${typeCounts[type]}`
          : (typeCounts[type] === 1 && ['verse','chorus'].includes(type) ? `${t.label} 1` : t.label);
        await songService.addSection(selected.id, { section_type: type, label, content: '' });
      }
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
    } catch { setError('Failed to apply template.'); }
  };

  const handleUpdateSection = async (sectionId, data) => {
    if (!selected) return;
    try {
      await songService.updateSection(selected.id, sectionId, data);
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
    } catch { setError('Failed to update section.'); }
  };

  const handleRemoveSection = async (sectionId) => {
    if (!selected) return;
    try {
      await songService.removeSection(selected.id, sectionId);
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
    } catch { setError('Failed to remove section.'); }
  };

  const handleReorderSections = async (newOrder) => {
    if (!selected) return;
    try {
      // optimistic
      const map = Object.fromEntries(selected.sections.map(s => [s.id, s]));
      setSelected({ ...selected, sections: newOrder.map(id => map[id]).filter(Boolean) });
      await songService.reorderSections(selected.id, newOrder);
    } catch { setError('Failed to reorder.'); }
  };

  const handleTransposeAll = async (semitones) => {
    if (!selected) return;
    try {
      const sections = selected.sections || [];
      for (const sec of sections) {
        const newContent = transposeLine(sec.content || '', semitones);
        if (newContent !== sec.content) {
          await songService.updateSection(selected.id, sec.id, { content: newContent });
        }
      }
      // Also transpose the song's key
      if (selected.song_key) {
        const newKey = transposeChord(selected.song_key, semitones);
        await songService.update(selected.id, { song_key: newKey });
      }
      const res = await songService.getOne(selected.id);
      setSelected(res.data.data);
      setSongs(prev => prev.map(s => s.id === res.data.data.id ? res.data.data : s));
    } catch { setError('Transpose failed.'); }
  };

  /* ── derived ─────────────────────────────────────────────── */
  const filteredBySearch = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return songs;
    return songs.filter(x =>
      x.title?.toLowerCase().includes(s) ||
      x.artist?.toLowerCase().includes(s) ||
      x.theme?.toLowerCase().includes(s) ||
      (x.song_key || '').toLowerCase().includes(s)
    );
  }, [songs, search]);

  const sectionSongs = useMemo(() => {
    const map = {};
    for (const sec of SMART_SECTIONS) map[sec.key] = filteredBySearch.filter(sec.filter);
    return map;
  }, [filteredBySearch]);

  const counts = useMemo(() => ({
    total:    songs.length,
    finished: songs.filter(s => s.status === 'finished').length,
    inProg:   songs.filter(s => s.status === 'in-progress').length,
    ideas:    songs.filter(s => s.status === 'idea').length,
  }), [songs]);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    setActiveSection(key);
  };

  const leftW  = leftCollapsed  ? 'var(--rail-w)' : '300px';
  const rightW = rightCollapsed ? 'var(--rail-w)' : '240px';

  return (
    <div className="sg-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      {/* TOPBAR */}
      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag songs">Songs</span>
        </div>
        <div className="app-tb-actions">
          <button className="app-btn primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); setSelected(null); }}>
            ✦ New Song
          </button>
        </div>
      </div>

      <div className="sg-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* LEFT: smart sections */}
        <aside className={`sg-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">My Songs</span>}
          </div>

          {!leftCollapsed && (
            <>
              <div className="app-search">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search songs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="sg-search-clear" onClick={() => setSearch('')}>✕</button>
                )}
              </div>

              {error && (
                <div className="sg-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}

              <div className="sg-sections-scroll">
                {SMART_SECTIONS.map(sec => {
                  const list = sectionSongs[sec.key] || [];
                  if (list.length === 0 && sec.key !== 'idea') return null;
                  const open = expandedSections[sec.key] ?? false;
                  return (
                    <div key={sec.key} className={`sg-sec sg-sec-${sec.tone}`}>
                      <button
                        className={`sg-sec-header ${activeSection === sec.key ? 'on' : ''}`}
                        onClick={() => toggleSection(sec.key)}
                        title={sec.subtitle}
                      >
                        <span className="sg-sec-emoji">{sec.emoji}</span>
                        <span className="sg-sec-label">{sec.label}</span>
                        <span className="sg-sec-count">{list.length}</span>
                        <span className="sg-sec-chevron">{open ? '▾' : '▸'}</span>
                      </button>
                      {open && sec.subtitle && (
                        <div className="sg-sec-subtitle">{sec.subtitle}</div>
                      )}
                      {open && (
                        <div className="sg-sec-list">
                          {list.length === 0 ? (
                            <div className="sg-sec-empty">No songs here yet.</div>
                          ) : list.map(s => (
                            <SongRow
                              key={s.id}
                              song={s}
                              selected={selected?.id === s.id}
                              onClick={() => {
                                setSelected(s); setSelectedSetlist(null);
                                setShowForm(false); setShowSetlistForm(false);
                                setActiveTab('lyrics');
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Setlists section */}
                <div className="sg-sec sg-sec-setlists">
                  <button
                    className={`sg-sec-header ${activeSection === 'setlists' ? 'on' : ''}`}
                    onClick={() => toggleSection('setlists')}
                    title="Grouped sets of songs — rehearsal, Sunday, gig"
                  >
                    <span className="sg-sec-emoji">📋</span>
                    <span className="sg-sec-label">Setlists</span>
                    <span className="sg-sec-count">{setlists.length}</span>
                    <span className="sg-sec-chevron">{(expandedSections.setlists ?? true) ? '▾' : '▸'}</span>
                  </button>
                  {(expandedSections.setlists ?? true) && (
                    <>
                      <div className="sg-sec-subtitle">Group songs for a Sunday, gig, or rehearsal.</div>
                      <div className="sg-sec-list">
                        {setlists.map(sl => (
                          <button
                            key={sl.id}
                            className={`sg-row ${selectedSetlist?.id === sl.id ? 'sel' : ''}`}
                            onClick={() => {
                              setSelectedSetlist(sl); setSelected(null);
                              setShowForm(false); setShowSetlistForm(false);
                            }}
                          >
                            <span className="sg-row-emoji">📋</span>
                            <div className="sg-row-info">
                              <div className="sg-row-title">{sl.name}</div>
                              <div className="sg-row-meta">
                                {(sl.songs || []).length} song{(sl.songs || []).length === 1 ? '' : 's'}
                                {sl.event_date && <> · {sl.event_date}</>}
                              </div>
                            </div>
                          </button>
                        ))}
                        <button
                          className="sg-row sg-row-add"
                          onClick={() => {
                            setShowSetlistForm(true);
                            setSelected(null); setSelectedSetlist(null); setShowForm(false);
                          }}
                        >
                          <span className="sg-row-emoji">+</span>
                          <div className="sg-row-info">
                            <div className="sg-row-title">New setlist</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* CENTER */}
        <main className="sg-center">
          {showForm ? (
            <NewSongForm
              form={form}
              setForm={setForm}
              saving={saving}
              onSave={handleCreate}
              onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
            />
          ) : showSetlistForm ? (
            <NewSetlistForm
              form={setlistForm}
              setForm={setSetlistForm}
              onSave={handleCreateSetlist}
              onCancel={() => { setShowSetlistForm(false); setSetlistForm({ name: '', occasion: '', event_date: '' }); }}
            />
          ) : selectedSetlist ? (
            <SetlistDetail
              setlist={selectedSetlist}
              allSongs={songs}
              onAddSong={(songId) => handleAddToSetlist(selectedSetlist.id, songId)}
              onRemoveSong={(linkId) => handleRemoveFromSetlist(selectedSetlist.id, linkId)}
              onReorder={(order) => handleReorderSetlist(selectedSetlist.id, order)}
              onDelete={() => handleDeleteSetlist(selectedSetlist.id)}
              onPerform={() => setPerformanceMode('setlist')}
              onOpenSong={(songId) => {
                const s = songs.find(x => x.id === songId);
                if (s) { setSelected(s); setSelectedSetlist(null); setActiveTab('lyrics'); }
              }}
            />
          ) : selected ? (
            <SongDetail
              song={selected}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onUpdateField={handleUpdateField}
              onAddSection={handleAddSection}
              onDuplicateSection={handleDuplicateSection}
              onUpdateSection={handleUpdateSection}
              onRemoveSection={handleRemoveSection}
              onReorderSections={handleReorderSections}
              onApplyTemplate={handleApplyTemplate}
              onTranspose={handleTransposeAll}
              onDelete={handleDeleteSong}
              onRefresh={fetchAll}
              setSelected={setSelected}
              setError={setError}
              onEnterPerformance={() => setPerformanceMode('song')}
            />
          ) : (
            <EmptyState count={songs.length} onNew={() => { setForm(EMPTY_FORM); setShowForm(true); }} />
          )}
        </main>

        {/* RIGHT INSIGHTS */}
        <aside className={`sg-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">Insights</span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>
          {!rightCollapsed && (
            <div className="sg-right-scroll">
              <Section title="Overview">
                <div className="sg-stat-grid">
                  <Stat n={counts.total}    l="Total" />
                  <Stat n={counts.finished} l="Finished" color="#6ee7b7" />
                  <Stat n={counts.inProg}   l="In Progress" color="#7dd3fc" />
                  <Stat n={counts.ideas}    l="Ideas" color="#fcd34d" />
                </div>
              </Section>

              {songs.length > 0 && (
                <Section title="By Status">
                  {STATUSES.map(st => {
                    const count = songs.filter(s => s.status === st.value).length;
                    if (count === 0) return null;
                    const pct = Math.round((count / songs.length) * 100);
                    return (
                      <div key={st.value} className="sg-bar-row">
                        <span className="sg-bar-lbl">{st.emoji} {st.label}</span>
                        <div className="sg-bar-track">
                          <div className="sg-bar-fill" style={{ width: `${pct}%`, background: st.color }} />
                        </div>
                        <span className="sg-bar-n">{count}</span>
                      </div>
                    );
                  })}
                </Section>
              )}

              <Section title="Tip">
                <div className="sg-tip">
                  💡 In the Lyrics tab, type chords inline with brackets:
                  <code>[G]Amazing [D]grace, how [Em]sweet…</code> — they’ll render
                  above the words and transpose with one click in the Music tab.
                </div>
              </Section>
            </div>
          )}
        </aside>
      </div>

      {/* Performance Mode overlay */}
      {performanceMode === 'song' && selected && (
        <PerformanceMode song={selected} onExit={() => setPerformanceMode(null)} />
      )}
      {performanceMode === 'setlist' && selectedSetlist && (
        <PerformanceMode
          song={(selectedSetlist.songs || []).map(s => songs.find(x => x.id === s.id)).filter(Boolean)[0]}
          songs={(selectedSetlist.songs || []).map(s => songs.find(x => x.id === s.id)).filter(Boolean)}
          onExit={() => setPerformanceMode(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components — rows + general
   ───────────────────────────────────────────────────────────── */
function SongRow({ song, selected, onClick }) {
  const st = getStatus(song.status);
  return (
    <button className={`sg-row ${selected ? 'sel' : ''}`} onClick={onClick}>
      <span className="sg-row-emoji">{st.emoji}</span>
      <div className="sg-row-info">
        <div className="sg-row-title">{song.title}</div>
        <div className="sg-row-meta">
          {song.song_key && <span className="sg-row-key">{song.song_key}</span>}
          {song.tempo && <span>· {song.tempo} bpm</span>}
          {(song.sections?.length || 0) > 0 && <span>· {song.sections.length} sections</span>}
        </div>
      </div>
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="sg-r-section">
      <div className="sg-r-section-title">{title}</div>
      {children}
    </div>
  );
}

function Stat({ n, l, color }) {
  return (
    <div className="sg-stat">
      <span className="sg-stat-n" style={color ? { color } : null}>{n}</span>
      <span className="sg-stat-l">{l}</span>
    </div>
  );
}

function EmptyState({ count, onNew }) {
  const prompt = todaysPrompt();
  return (
    <div className="app-empty sg-empty">
      <div className="app-empty-icon">🎵</div>
      <div className="app-empty-title">
        {count === 0 ? 'Capture every melody' : 'Pick a song to work on'}
      </div>
      <div className="app-empty-sub">
        {count === 0
          ? 'Start a new song with whatever you’ve got — a title, a line, a chord progression. The rest can come later.'
          : 'Select a song from the sidebar to open its lyrics, music, and recordings.'}
      </div>

      <div className="sg-daily-prompt">
        <div className="sg-daily-prompt-lbl">✨ Today's prompt</div>
        <div className="sg-daily-prompt-text">"{prompt}"</div>
      </div>

      {count === 0 && (
        <div className="sg-start-steps">
          <div className="sg-start-title">First time? Try this:</div>
          <ol className="sg-start-list">
            <li><b>Tap “New Song”</b> — even just a title is enough to start.</li>
            <li><b>Add a Chorus or Verse</b> in the Lyrics tab and type with chords like <code>[G]hello</code>.</li>
            <li><b>Hit Transpose</b> in the Music tab to find the right key for your voice.</li>
          </ol>
        </div>
      )}

      <button className="app-btn primary" onClick={onNew} style={{ marginTop: 16 }}>
        ✦ Start a new song
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Song Detail (tabbed)
   ───────────────────────────────────────────────────────────── */
function SongDetail({
  song, activeTab, setActiveTab,
  onUpdateField, onAddSection, onDuplicateSection, onUpdateSection, onRemoveSection,
  onReorderSections, onApplyTemplate,
  onTranspose, onDelete, onRefresh, setSelected, setError,
  onEnterPerformance,
}) {
  const st = getStatus(song.status);
  const tabHint = TABS.find(t => t.key === activeTab)?.hint;
  const [showExport, setShowExport] = useState(false);

  const exportChordPro = () => {
    const text = buildChordProText(song);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(song.title || 'song')}.cho`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const exportPlainText = async () => {
    const text = buildPlainText(song);
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard.');
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(song.title || 'song')}.txt`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
    setShowExport(false);
  };

  const exportPDF = () => {
    setShowExport(false);
    // Add the print body class so print stylesheet shows only the song
    document.body.classList.add('sg-printing');
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('sg-printing'), 500);
    });
  };

  return (
    <div className="sg-detail">
      <header className="sg-detail-hd">
        <div className="sg-detail-hd-top">
          <div className="sg-detail-name-block">
            <input
              className="sg-detail-title-input"
              value={song.title}
              onChange={e => onUpdateField('title', e.target.value)}
              placeholder="Untitled song"
            />
            <div className="sg-detail-pills">
              <select
                className="sg-status-select"
                value={song.status}
                onChange={e => onUpdateField('status', e.target.value)}
                style={{ background: `${st.color}22`, color: st.color, borderColor: `${st.color}66` }}
              >
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
              {song.song_key && <span className="sg-pill-key">🎼 {song.song_key}</span>}
              {song.tempo && <span className="sg-pill-tempo">{song.tempo} bpm</span>}
              {song.time_signature && <span className="sg-pill-time">{song.time_signature}</span>}
            </div>
            <div className="sg-detail-meta">
              {song.artist && <span>by {song.artist}</span>}
              {song.artist && <span>·</span>}
              <span>{(song.sections || []).length} section{song.sections?.length === 1 ? '' : 's'}</span>
              {(() => {
                const d = fmtDuration(songDurationSeconds(song));
                return d ? <><span>·</span><span>~{d}</span></> : null;
              })()}
              <span>·</span>
              <span>Updated {song.updated_at ? format(parseISO(song.updated_at.replace(' ', 'T')), 'MMM d') : '—'}</span>
            </div>
          </div>
          <div className="sg-detail-actions">
            <button className="app-btn primary" onClick={onEnterPerformance} title="Full-screen performance view">
              🎤 Perform
            </button>
            <div className="sg-export-wrap">
              <button className="app-btn ghost" onClick={() => setShowExport(v => !v)} title="Export">
                ⬇ Export
              </button>
              {showExport && (
                <>
                  <div className="sg-export-backdrop" onClick={() => setShowExport(false)} />
                  <div className="sg-export-menu">
                    <button className="sg-export-item" onClick={exportPDF}>
                      🖨 Print / Save as PDF
                    </button>
                    <button className="sg-export-item" onClick={exportChordPro}>
                      🎼 Download .cho (ChordPro)
                    </button>
                    <button className="sg-export-item" onClick={exportPlainText}>
                      📋 Copy as plain text
                    </button>
                  </div>
                </>
              )}
            </div>
            <button className="app-btn ghost icon-only" onClick={onDelete} title="Delete song">🗑</button>
          </div>
        </div>
      </header>

      <nav className="sg-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`sg-tab ${activeTab === t.key ? 'on' : ''}`}
            onClick={() => setActiveTab(t.key)}
            title={t.hint}
          >
            <span>{t.emoji}</span> {t.label}
          </button>
        ))}
      </nav>

      <div className="sg-tab-hint">{tabHint}</div>

      <div className="sg-tab-body">
        {activeTab === 'lyrics' && (
          <LyricsTab
            song={song}
            onAddSection={onAddSection}
            onDuplicateSection={onDuplicateSection}
            onUpdateSection={onUpdateSection}
            onRemoveSection={onRemoveSection}
            onReorderSections={onReorderSections}
            onApplyTemplate={onApplyTemplate}
          />
        )}
        {activeTab === 'music' && (
          <MusicTab
            song={song}
            onUpdateField={onUpdateField}
            onTranspose={onTranspose}
            onAddSection={onAddSection}
          />
        )}
        {activeTab === 'inspiration' && (
          <InspirationTab song={song} onUpdateField={onUpdateField} />
        )}
        {activeTab === 'recordings' && (
          <RecordingsTab song={song} onRefresh={onRefresh} setSelected={setSelected} setError={setError} />
        )}
        {activeTab === 'insights' && (
          <InsightsTab song={song} />
        )}
      </div>

      {/* Print-only render — visible only when document.body has .sg-printing */}
      <PrintableSong song={song} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Printable view (only shown via @media print)
   ───────────────────────────────────────────────────────────── */
function PrintableSong({ song }) {
  return (
    <div className="sg-print-view" aria-hidden="true">
      <header className="sg-print-hd">
        <h1 className="sg-print-title">{song.title}</h1>
        <div className="sg-print-meta">
          {song.artist && <span>{song.artist}</span>}
          {song.song_key && <span>· Key of {song.song_key}</span>}
          {song.tempo && <span>· {song.tempo} BPM</span>}
          {song.time_signature && <span>· {song.time_signature}</span>}
        </div>
        {song.scripture && (
          <div className="sg-print-scripture">{song.scripture}</div>
        )}
      </header>
      <div className="sg-print-body">
        {(song.sections || []).map(sec => {
          const t = getSectionType(sec.section_type);
          return (
            <section key={sec.id} className="sg-print-section">
              <h2 className="sg-print-section-title">{sec.label || t.label}</h2>
              <div className="sg-print-section-body">
                {(sec.content || '').split('\n').map((line, i) => (
                  <ChordLine key={i} line={line} onRhymeFor={() => {}} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Export helpers
   ───────────────────────────────────────────────────────────── */
function slugify(s) {
  return (s || 'song')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildChordProText(song) {
  const lines = [];
  if (song.title)          lines.push(`{title: ${song.title}}`);
  if (song.artist)         lines.push(`{artist: ${song.artist}}`);
  if (song.song_key)       lines.push(`{key: ${song.song_key}}`);
  if (song.tempo)          lines.push(`{tempo: ${song.tempo}}`);
  if (song.time_signature) lines.push(`{time: ${song.time_signature}}`);
  if (song.scripture)      lines.push(`{comment: Scripture — ${song.scripture}}`);
  lines.push('');
  (song.sections || []).forEach(sec => {
    const t = getSectionType(sec.section_type);
    const label = sec.label || t.label;
    const tag = sec.section_type === 'chorus' ? 'chorus'
              : sec.section_type === 'bridge' ? 'bridge'
              : sec.section_type === 'verse'  ? 'verse'
              : null;
    if (tag) lines.push(`{start_of_${tag}: ${label}}`);
    else lines.push(`{comment: ${label}}`);
    lines.push(sec.content || '');
    if (tag) lines.push(`{end_of_${tag}}`);
    lines.push('');
  });
  return lines.join('\n');
}

function buildPlainText(song) {
  const lines = [];
  lines.push(song.title || 'Untitled');
  if (song.artist) lines.push(`by ${song.artist}`);
  const meta = [];
  if (song.song_key) meta.push(`Key ${song.song_key}`);
  if (song.tempo)    meta.push(`${song.tempo} BPM`);
  if (song.time_signature) meta.push(song.time_signature);
  if (meta.length) lines.push(meta.join(' · '));
  if (song.scripture) lines.push(`Scripture: ${song.scripture}`);
  lines.push('');
  (song.sections || []).forEach(sec => {
    const t = getSectionType(sec.section_type);
    lines.push(`[${(sec.label || t.label).toUpperCase()}]`);
    lines.push(stripChords(sec.content || ''));
    lines.push('');
  });
  return lines.join('\n');
}

/* ─────────────────────────────────────────────────────────────
   Performance Mode — full-screen overlay + auto-scroll at BPM
   ───────────────────────────────────────────────────────────── */
function PerformanceMode({ song, songs, onExit }) {
  // If `songs` is provided we're in setlist mode; otherwise single song
  const songList = songs && songs.length > 0 ? songs : [song];
  const [idx, setIdx]               = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speed, setSpeed]           = useState(1.0);
  const [fontSize, setFontSize]     = useState(28);
  const [metroOn, setMetroOn]       = useState(false);
  const [droneOn, setDroneOn]       = useState(false);
  const scrollRef = useRef(null);
  const rafRef    = useRef(null);
  const lastRef   = useRef(0);
  const metroStopRef = useRef(null);
  const droneStopRef = useRef(null);

  const current = songList[idx] || song;
  const bpm = current.tempo || 90;
  const pxPerSecond = (bpm / 60) * 0.85 * speed;

  // ESC closes; arrows navigate setlist; Space toggles auto-scroll
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onExit();
      if (e.key === ' ')                   { e.preventDefault(); setAutoScroll(v => !v); }
      if (e.key === '+' || e.key === '=')  setFontSize(s => Math.min(64, s + 2));
      if (e.key === '-' || e.key === '_')  setFontSize(s => Math.max(16, s - 2));
      if (e.key === 'ArrowRight' && idx < songList.length - 1) setIdx(i => i + 1);
      if (e.key === 'ArrowLeft'  && idx > 0)                   setIdx(i => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, idx, songList.length]);

  // Reset scroll, stop audio when changing songs
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    metroStopRef.current?.(); metroStopRef.current = null; setMetroOn(false);
    droneStopRef.current?.(); droneStopRef.current = null; setDroneOn(false);
  }, [idx]);

  // Cleanup on unmount
  useEffect(() => () => {
    metroStopRef.current?.();
    droneStopRef.current?.();
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Auto-scroll loop
  useEffect(() => {
    if (!autoScroll) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = performance.now();
    const tick = (t) => {
      const dt = (t - lastRef.current) / 1000;
      lastRef.current = t;
      if (scrollRef.current) scrollRef.current.scrollTop += pxPerSecond * dt;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoScroll, pxPerSecond]);

  const toggleMetro = () => {
    if (metroOn) {
      metroStopRef.current?.(); metroStopRef.current = null; setMetroOn(false);
    } else if (current.tempo) {
      metroStopRef.current = startMetronome(current.tempo);
      setMetroOn(true);
    }
  };
  const toggleDrone = () => {
    if (droneOn) {
      droneStopRef.current?.(); droneStopRef.current = null; setDroneOn(false);
    } else if (current.song_key) {
      droneStopRef.current = startPitchDrone(current.song_key);
      setDroneOn(true);
    }
  };

  return (
    <div className="sg-perf">
      <div className="sg-perf-bar">
        <div className="sg-perf-bar-left">
          <button className="sg-perf-exit" onClick={onExit} title="Exit (Esc)">✕ Exit</button>
          <div className="sg-perf-title-wrap">
            <span className="sg-perf-title">{current.title}</span>
            <span className="sg-perf-sub">
              {current.song_key && <>Key {current.song_key} · </>}
              {bpm} BPM · {current.time_signature || '4/4'}
              {songList.length > 1 && <> · Song {idx + 1} of {songList.length}</>}
            </span>
          </div>
        </div>
        <div className="sg-perf-bar-right">
          <button className="sg-perf-ctl" onClick={() => setFontSize(s => Math.max(16, s - 2))} title="Smaller (−)">A−</button>
          <span className="sg-perf-fs">{fontSize}px</span>
          <button className="sg-perf-ctl" onClick={() => setFontSize(s => Math.min(64, s + 2))} title="Bigger (+)">A+</button>

          <div className="sg-perf-divider" />

          <button
            className={`sg-perf-ctl ${metroOn ? 'on' : ''}`}
            onClick={toggleMetro}
            disabled={!current.tempo}
            title={current.tempo ? `Metronome at ${current.tempo} BPM` : 'No tempo set'}
          >
            {metroOn ? '⏹' : '▶'} Click
          </button>
          <button
            className={`sg-perf-ctl ${droneOn ? 'on' : ''}`}
            onClick={toggleDrone}
            disabled={!current.song_key}
            title={current.song_key ? `Pitch drone (${current.song_key})` : 'No key set'}
          >
            🎵 Pitch
          </button>

          <div className="sg-perf-divider" />

          <label className="sg-perf-speed">
            <span>Speed</span>
            <input
              type="range"
              min="0.4"
              max="2"
              step="0.1"
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
            />
            <span className="sg-perf-speed-val">{speed.toFixed(1)}×</span>
          </label>

          <button
            className={`sg-perf-play ${autoScroll ? 'on' : ''}`}
            onClick={() => setAutoScroll(v => !v)}
            title="Toggle auto-scroll (Space)"
          >
            {autoScroll ? '⏸ Pause' : '▶ Auto-scroll'}
          </button>
        </div>
      </div>

      {/* Performance notes banner (per-song) */}
      {current.performance_notes && (
        <div className="sg-perf-notes">📌 {current.performance_notes}</div>
      )}

      <div className="sg-perf-scroll" ref={scrollRef} style={{ fontSize: `${fontSize}px` }}>
        <div className="sg-perf-inner">
          {(current.sections || []).map(sec => {
            const t = getSectionType(sec.section_type);
            return (
              <section key={sec.id} className={`sg-perf-section sg-perf-${sec.section_type}`}>
                <h2 className="sg-perf-section-title">
                  {t.emoji} {(sec.label || t.label).toUpperCase()}
                </h2>
                <div className="sg-perf-section-body">
                  {(sec.content || '').split('\n').map((line, i) => (
                    <ChordLine key={i} line={line} onRhymeFor={() => {}} />
                  ))}
                </div>
              </section>
            );
          })}
          <div style={{ height: '40vh' }} />
        </div>
      </div>

      {/* Setlist nav */}
      {songList.length > 1 && (
        <div className="sg-perf-nav">
          <button
            className="sg-perf-nav-btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
          >‹ Prev song</button>
          <div className="sg-perf-nav-dots">
            {songList.map((s, i) => (
              <button
                key={s.id}
                className={`sg-perf-nav-dot ${i === idx ? 'on' : ''}`}
                onClick={() => setIdx(i)}
                title={s.title}
              />
            ))}
          </div>
          <button
            className="sg-perf-nav-btn"
            onClick={() => setIdx(i => Math.min(songList.length - 1, i + 1))}
            disabled={idx === songList.length - 1}
          >Next song ›</button>
        </div>
      )}

      <div className="sg-perf-hint">
        <kbd>Esc</kbd> exit · <kbd>Space</kbd> auto-scroll · <kbd>+</kbd>/<kbd>−</kbd> resize
        {songList.length > 1 && <> · <kbd>←</kbd>/<kbd>→</kbd> change song</>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Lyrics Tab — section editor with ChordPro + helpers
   ───────────────────────────────────────────────────────────── */
function LyricsTab({ song, onAddSection, onUpdateSection, onRemoveSection, onDuplicateSection, onReorderSections, onApplyTemplate }) {
  const sections = song.sections || [];
  const [showAdder, setShowAdder]       = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [rhymeWord, setRhymeWord]       = useState('');
  const [lookupMode, setLookupMode]     = useState('rhy');
  const [rhymes, setRhymes]             = useState([]);
  const [rhymeLoading, setRhymeLoading] = useState(false);
  const [showPreview, setShowPreview]   = useState(false);
  const [nashville, setNashville]       = useState(false);
  const [dragId, setDragId]             = useState(null);

  const runLookup = async (w, mode = lookupMode) => {
    setRhymeWord(w);
    if (!w?.trim()) { setRhymes([]); return; }
    setRhymeLoading(true);
    const list = await fetchWords(w.trim(), mode);
    setRhymes(list);
    setRhymeLoading(false);
  };

  const switchMode = async (mode) => {
    setLookupMode(mode);
    if (rhymeWord.trim()) await runLookup(rhymeWord, mode);
  };

  const moveSection = (idx, dir) => {
    const newOrder = sections.map(s => s.id);
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    onReorderSections(newOrder);
  };

  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const order = sections.map(s => s.id);
    const fromIdx = order.indexOf(dragId);
    const toIdx   = order.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return; }
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragId);
    onReorderSections(order);
    setDragId(null);
  };

  return (
    <div className="sg-lyrics">
      {/* Top action bar */}
      <div className="sg-lyrics-bar">
        <button className={`sg-mode-btn ${!showPreview ? 'on' : ''}`} onClick={() => setShowPreview(false)}>
          ✏️ Edit
        </button>
        <button className={`sg-mode-btn ${showPreview ? 'on' : ''}`} onClick={() => setShowPreview(true)}>
          👁 Preview
        </button>
        <div className="sg-rhyme-bar">
          <div className="sg-lookup-modes">
            {Object.entries(LOOKUP_MODES).map(([key, cfg]) => (
              <button
                key={key}
                className={`sg-lookup-mode ${lookupMode === key ? 'on' : ''}`}
                onClick={() => switchMode(key)}
                title={cfg.label}
              >
                <span>{cfg.emoji}</span> {cfg.label}
              </button>
            ))}
          </div>
          <input
            className="sg-rhyme-input"
            placeholder={`${LOOKUP_MODES[lookupMode].emoji} ${LOOKUP_MODES[lookupMode].label} — type a word…`}
            value={rhymeWord}
            onChange={e => setRhymeWord(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runLookup(rhymeWord); }}
          />
          <button className="app-btn ghost" onClick={() => runLookup(rhymeWord)}>
            {rhymeLoading ? '…' : 'Find'}
          </button>
        </div>
      </div>

      {rhymes.length > 0 && (
        <div className="sg-rhyme-results">
          <span className="sg-rhyme-results-lbl">
            {LOOKUP_MODES[lookupMode].label} for <b>{rhymeWord}</b>:
          </span>
          {rhymes.map(r => (
            <span key={r} className="sg-rhyme-chip">{r}</span>
          ))}
        </div>
      )}

      {/* Structure bar — color-coded chunks for visual overview */}
      {sections.length > 0 && (
        <div className="sg-structure-bar" title="Song structure">
          {sections.map((s, i) => {
            const t = getSectionType(s.section_type);
            return (
              <span
                key={s.id}
                className={`sg-struct-chunk sg-struct-${s.section_type}`}
                title={s.label || t.label}
                style={{ flex: (s.bars || 4) }}
              >
                {(s.label || t.label).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 8) || t.label[0]}
              </span>
            );
          })}
        </div>
      )}

      {/* Nashville toggle row */}
      {sections.length > 0 && (
        <div className="sg-render-toggle">
          <label className="sg-render-toggle-lbl">
            <input
              type="checkbox"
              checked={nashville}
              onChange={e => setNashville(e.target.checked)}
              disabled={!song.song_key}
            />
            Nashville Number System {!song.song_key && '(set a Key in Music tab first)'}
          </label>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="sg-lyrics-empty">
          <div className="sg-lyrics-empty-title">No sections yet</div>
          <div className="sg-lyrics-empty-sub">
            Add a verse, chorus, or any block below. Type chords with square brackets:
            <code>[G]Amazing [D]grace…</code>
          </div>
          <div className="sg-template-row">
            <span className="sg-add-section-lbl">Or start from a template:</span>
            {STRUCTURE_TEMPLATES.map(t => (
              <button
                key={t.id}
                className="sg-template-btn"
                onClick={() => onApplyTemplate(t)}
              >📋 {t.name}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="sg-section-list">
          {sections.map((sec, idx) => (
            <SongSectionCard
              key={sec.id}
              section={sec}
              previewMode={showPreview}
              songKey={song.song_key}
              nashville={nashville}
              onUpdate={(data) => onUpdateSection(sec.id, data)}
              onRemove={() => onRemoveSection(sec.id)}
              onDuplicate={() => onDuplicateSection(sec.id)}
              onMoveUp={idx > 0 ? () => moveSection(idx, -1) : null}
              onMoveDown={idx < sections.length - 1 ? () => moveSection(idx, +1) : null}
              onRhymeFor={(w) => runLookup(w)}
              isDragging={dragId === sec.id}
              onDragStart={() => setDragId(sec.id)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={() => handleDrop(sec.id)}
            />
          ))}
        </div>
      )}

      {/* Add section bar */}
      <div className="sg-add-section">
        {showAdder ? (
          <>
            <span className="sg-add-section-lbl">Add a section:</span>
            <div className="sg-add-section-row">
              {SECTION_TYPES.map(t => (
                <button
                  key={t.value}
                  className="sg-add-type-btn"
                  onClick={() => { onAddSection(t.value); setShowAdder(false); }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
              <button className="app-btn ghost" onClick={() => setShowAdder(false)}>Cancel</button>
            </div>
          </>
        ) : showTemplates ? (
          <>
            <span className="sg-add-section-lbl">Apply a structure template:</span>
            <div className="sg-add-section-row">
              {STRUCTURE_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  className="sg-add-type-btn"
                  onClick={() => { onApplyTemplate(t); setShowTemplates(false); }}
                  title={t.sections.map(s => getSectionType(s).label).join(' → ')}
                >📋 {t.name}</button>
              ))}
              <button className="app-btn ghost" onClick={() => setShowTemplates(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="sg-add-section-actions">
            <button className="app-btn primary" onClick={() => setShowAdder(true)}>+ Add section</button>
            {sections.length === 0 && (
              <button className="app-btn ghost" onClick={() => setShowTemplates(true)}>📋 Use a template</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SongSectionCard({
  section, previewMode, songKey, nashville,
  onUpdate, onRemove, onDuplicate, onMoveUp, onMoveDown, onRhymeFor,
  isDragging, onDragStart, onDragOver, onDrop,
}) {
  const [content, setContent] = useState(section.content || '');
  const [label, setLabel]     = useState(section.label || '');
  const [bars, setBars]       = useState(section.bars || 4);
  const t = getSectionType(section.section_type);
  const saveTimer = useRef(null);

  useEffect(() => {
    setContent(section.content || '');
    setLabel(section.label || '');
    setBars(section.bars || 4);
  }, [section.id]);

  const scheduleSave = (data) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdate(data), 700);
  };

  const handleContent = (e) => {
    const v = e.target.value;
    setContent(v);
    scheduleSave({ content: v, label, bars });
  };
  const handleLabel = (e) => {
    const v = e.target.value;
    setLabel(v);
    scheduleSave({ content, label: v, bars });
  };
  const handleBars = (e) => {
    const v = Math.max(1, Math.min(64, parseInt(e.target.value, 10) || 4));
    setBars(v);
    scheduleSave({ content, label, bars: v });
  };

  // Live syllable count per line
  const lines = content.split('\n');
  const totalSyllables = lines.reduce((sum, l) => sum + countSyllables(l), 0);

  // For Nashville rendering, transform inline chords
  const renderLine = (line, i) => {
    const out = nashville && songKey
      ? line.replace(/\[([^\]]+)\]/g, (_, ch) => `[${chordToNashville(ch, songKey)}]`)
      : line;
    return <ChordLine key={i} line={out} onRhymeFor={onRhymeFor} />;
  };

  return (
    <article
      className={`sg-section sg-section-${section.section_type} ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header
        className="sg-section-hd"
        draggable={true}
        onDragStart={onDragStart}
      >
        <span className="sg-section-drag" title="Drag to reorder">⋮⋮</span>
        <span className="sg-section-emoji">{t.emoji}</span>
        <select
          className="sg-section-type"
          value={section.section_type}
          onChange={e => onUpdate({ section_type: e.target.value })}
        >
          {SECTION_TYPES.map(x => (
            <option key={x.value} value={x.value}>{x.emoji} {x.label}</option>
          ))}
        </select>
        <input
          className="sg-section-label"
          placeholder={t.label}
          value={label}
          onChange={handleLabel}
        />
        <label className="sg-section-bars" title="Number of bars (for duration estimate)">
          <input
            type="number"
            min="1"
            max="64"
            value={bars}
            onChange={handleBars}
          />
          <span>bars</span>
        </label>
        <span className="sg-section-syllables" title="Syllables in this section">
          {totalSyllables} syl
        </span>
        <div className="sg-section-mover">
          <button className="sg-section-move" onClick={onDuplicate} title="Duplicate section">⎘</button>
          <button className="sg-section-move" onClick={onMoveUp}    disabled={!onMoveUp}    title="Move up">↑</button>
          <button className="sg-section-move" onClick={onMoveDown}  disabled={!onMoveDown}  title="Move down">↓</button>
          <button className="sg-section-remove" onClick={() => { if (confirm('Remove this section?')) onRemove(); }} title="Delete">✕</button>
        </div>
      </header>

      {previewMode ? (
        <div className="sg-section-preview">
          {lines.length === 0 || (lines.length === 1 && !lines[0])
            ? <span className="sg-muted">(empty)</span>
            : lines.map((line, i) => renderLine(line, i))}
        </div>
      ) : (
        <div className="sg-section-edit">
          <textarea
            className="sg-section-textarea"
            placeholder={`Type lyrics with chords like:\n[G]Amazing [D]grace, how [Em]sweet the [C]sound…`}
            value={content}
            onChange={handleContent}
            rows={Math.max(3, Math.min(12, lines.length + 1))}
          />
          <div className="sg-section-stats">
            {lines.map((line, i) => {
              if (!line.trim()) return null;
              return (
                <div key={i} className="sg-line-stat">
                  <span className="sg-line-num">{i + 1}</span>
                  <span className="sg-line-syl">{countSyllables(line)} syl</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

/** Render a line with chords above words. */
function ChordLine({ line, onRhymeFor }) {
  // Parse chord positions
  const parts = [];
  let cursor = 0;
  let pendingChord = null;
  CHORD_REGEX.lastIndex = 0;
  let match;
  const matches = [...line.matchAll(/\[([^\]]+)\]/g)];

  if (matches.length === 0) {
    // No chords — just lyrics with rhyme-on-click
    const words = line.split(/(\s+)/);
    return (
      <div className="sg-chord-line">
        <div className="sg-chord-row" />
        <div className="sg-lyric-row">
          {words.map((w, i) =>
            /\S/.test(w)
              ? <span key={i} className="sg-word" onClick={() => onRhymeFor(w.replace(/[^a-zA-Z']/g, ''))}>{w}</span>
              : <span key={i}>{w}</span>
          )}
        </div>
      </div>
    );
  }

  // Build chord + lyric rows interlinearly
  const chordSegments = []; // [{ chord, lyric }]
  let lastEnd = 0;
  let leading = '';
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.index > lastEnd) {
      if (chordSegments.length === 0) {
        leading = line.slice(lastEnd, m.index);
      } else {
        chordSegments[chordSegments.length - 1].lyric += line.slice(lastEnd, m.index);
      }
    }
    chordSegments.push({ chord: m[1], lyric: '' });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < line.length) {
    if (chordSegments.length === 0) leading = line.slice(lastEnd);
    else chordSegments[chordSegments.length - 1].lyric += line.slice(lastEnd);
  }

  return (
    <div className="sg-chord-line">
      <div className="sg-chord-row">
        {leading && <span className="sg-chord-empty">{leading.replace(/./g, ' ')}</span>}
        {chordSegments.map((seg, i) => (
          <span key={i} className="sg-chord-seg">
            <span className="sg-chord">{seg.chord}</span>
            <span className="sg-chord-spacer">{seg.lyric || ' '}</span>
          </span>
        ))}
      </div>
      <div className="sg-lyric-row">
        {leading && <span>{leading}</span>}
        {chordSegments.map((seg, i) => {
          const words = (seg.lyric || ' ').split(/(\s+)/);
          return (
            <span key={i} className="sg-lyric-seg">
              {words.map((w, j) =>
                /\S/.test(w)
                  ? <span key={j} className="sg-word" onClick={() => onRhymeFor(w.replace(/[^a-zA-Z']/g, ''))}>{w}</span>
                  : <span key={j}>{w}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Music Tab — key, tempo, time, transpose
   ───────────────────────────────────────────────────────────── */
function MusicTab({ song, onUpdateField, onTranspose, onAddSection }) {
  const tapperRef = useRef(makeTapTempo());
  const metroStopRef = useRef(null);
  const droneStopRef = useRef(null);
  const [metroOn, setMetroOn] = useState(false);
  const [droneOn, setDroneOn] = useState(false);

  // Stop all audio on unmount
  useEffect(() => () => {
    metroStopRef.current?.();
    droneStopRef.current?.();
  }, []);

  // Restart metronome when BPM changes
  useEffect(() => {
    if (metroOn) {
      metroStopRef.current?.();
      if (song.tempo) metroStopRef.current = startMetronome(song.tempo);
    }
    // eslint-disable-next-line
  }, [song.tempo]);

  const toggleMetro = () => {
    if (metroOn) {
      metroStopRef.current?.();
      metroStopRef.current = null;
      setMetroOn(false);
    } else if (song.tempo) {
      metroStopRef.current = startMetronome(song.tempo);
      setMetroOn(true);
    }
  };

  const toggleDrone = () => {
    if (droneOn) {
      droneStopRef.current?.();
      droneStopRef.current = null;
      setDroneOn(false);
    } else if (song.song_key) {
      droneStopRef.current = startPitchDrone(song.song_key);
      setDroneOn(true);
    }
  };

  const handleTap = () => {
    const bpm = tapperRef.current.tap();
    if (bpm) onUpdateField('tempo', bpm);
  };

  return (
    <div className="sg-music">
      <div className="sg-music-grid">
        <div className="sg-music-field">
          <label className="sg-form-lbl">Key</label>
          <div className="sg-music-row">
            <select
              className="sg-sel"
              value={song.song_key || ''}
              onChange={e => onUpdateField('song_key', e.target.value)}
            >
              <option value="">— Pick key —</option>
              {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button
              className={`sg-audio-btn ${droneOn ? 'on' : ''}`}
              onClick={toggleDrone}
              disabled={!song.song_key}
              title={song.song_key ? `Pitch reference drone (${song.song_key})` : 'Pick a key first'}
            >
              {droneOn ? '⏹' : '🎵'} {droneOn ? 'Stop' : 'Pitch'}
            </button>
          </div>
        </div>
        <div className="sg-music-field">
          <label className="sg-form-lbl">Tempo (BPM)</label>
          <div className="sg-music-row">
            <input
              className="sg-inp"
              type="number"
              min="40"
              max="300"
              value={song.tempo || ''}
              onChange={e => onUpdateField('tempo', e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 120"
            />
            <button className="sg-audio-btn" onClick={handleTap} title="Tap to set tempo">
              ⌐ Tap
            </button>
            <button
              className={`sg-audio-btn ${metroOn ? 'on' : ''}`}
              onClick={toggleMetro}
              disabled={!song.tempo}
              title={song.tempo ? `Metronome at ${song.tempo} BPM` : 'Set a tempo first'}
            >
              {metroOn ? '⏹' : '▶'} {metroOn ? 'Stop' : 'Click'}
            </button>
          </div>
        </div>
        <div className="sg-music-field">
          <label className="sg-form-lbl">Time signature</label>
          <select
            className="sg-sel"
            value={song.time_signature || '4/4'}
            onChange={e => onUpdateField('time_signature', e.target.value)}
          >
            {TIME_SIGNATURES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="sg-music-field">
          <label className="sg-form-lbl">Artist</label>
          <input
            className="sg-inp"
            value={song.artist || ''}
            onChange={e => onUpdateField('artist', e.target.value)}
            placeholder="Solo, co-writer, or band name"
          />
        </div>
      </div>

      <div className="sg-transpose">
        <div className="sg-transpose-label">Transpose every chord in this song</div>
        <div className="sg-transpose-hint">
          Shifts the song's key and every <code>[chord]</code> in every section by N semitones.
          Try this when the song feels too high or too low for your voice.
        </div>
        <div className="sg-transpose-btns">
          <button className="app-btn ghost" onClick={() => onTranspose(-2)}>− Whole step</button>
          <button className="app-btn ghost" onClick={() => onTranspose(-1)}>− Half step</button>
          <button className="app-btn primary" onClick={() => onTranspose(+1)}>+ Half step</button>
          <button className="app-btn primary" onClick={() => onTranspose(+2)}>+ Whole step</button>
        </div>
      </div>

      <div className="sg-key-helper">
        <div className="sg-form-lbl">Common chord families</div>
        <div className="sg-key-grid">
          <KeyFamily title="Major keys" rows={[
            ['C',  'C',   'Dm',  'Em',  'F',   'G',   'Am'],
            ['G',  'G',   'Am',  'Bm',  'C',   'D',   'Em'],
            ['D',  'D',   'Em',  'F#m', 'G',   'A',   'Bm'],
            ['A',  'A',   'Bm',  'C#m', 'D',   'E',   'F#m'],
            ['E',  'E',   'F#m', 'G#m', 'A',   'B',   'C#m'],
            ['F',  'F',   'Gm',  'Am',  'A#',  'C',   'Dm'],
          ]} />
        </div>
      </div>

      <ProgressionsLibrary songKey={song.song_key} onInsert={onAddSection} />

      <div className="sg-form-section">
        <label className="sg-form-lbl">Performance notes</label>
        <div className="sg-form-hint">
          Capo position for live, "Sarah takes the bridge", key change for Sunday — anything
          you want to see at the top of Performance Mode.
        </div>
        <textarea
          className="sg-ta"
          rows={3}
          placeholder="Notes that appear in Performance Mode header…"
          value={song.performance_notes || ''}
          onChange={e => onUpdateField('performance_notes', e.target.value)}
        />
      </div>
    </div>
  );
}

/* ── Chord progressions library ─────────────────────────────── */
function ProgressionsLibrary({ songKey, onInsert }) {
  const buildChords = (positions, minorIdx = []) => {
    const keyRoot = (songKey || 'C').replace(/m$/, '');
    const keySemi = NOTE_INDEX[keyRoot] ?? 0;
    const chromatic = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return positions.map((p, i) => {
      const note = chromatic[(keySemi + p) % 12];
      const isMin = minorIdx.includes(i);
      return note + (isMin ? 'm' : '');
    });
  };

  const insert = (chords) => {
    const content = chords.map(c => `[${c}] `).join('').trim();
    onInsert('verse', { initialContent: content });
  };

  return (
    <div className="sg-progressions">
      <div className="sg-form-lbl">Common chord progressions</div>
      <div className="sg-form-hint">
        Shown in your song's key{songKey ? ` (${songKey})` : ' (defaults to C — set a key above)'}.
        Click <b>+ Insert</b> to add a new section with the chord skeleton ready to fill.
      </div>
      <div className="sg-prog-list">
        {PROGRESSIONS.map(p => {
          const chords = buildChords(p.positions, p.minorIdx);
          return (
            <div key={p.name} className="sg-prog-row">
              <div className="sg-prog-info">
                <span className="sg-prog-name">{p.name}</span>
                <span className="sg-prog-numerals">{p.numerals}</span>
              </div>
              <div className="sg-prog-chords">
                {chords.map((c, i) => <span key={i} className="sg-prog-chord">{c}</span>)}
              </div>
              <button className="app-btn ghost" onClick={() => insert(chords)}>+ Insert</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeyFamily({ title, rows }) {
  return (
    <div className="sg-key-family">
      <div className="sg-key-family-title">{title} — I · ii · iii · IV · V · vi</div>
      {rows.map(([k, ...chords]) => (
        <div key={k} className="sg-key-row">
          <span className="sg-key-name">{k}</span>
          {chords.map((c, i) => <span key={i} className="sg-key-chord">{c}</span>)}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Inspiration Tab
   ───────────────────────────────────────────────────────────── */
function InspirationTab({ song, onUpdateField }) {
  return (
    <div className="sg-inspiration">
      <div className="sg-form-section">
        <label className="sg-form-lbl">Theme</label>
        <input
          className="sg-inp"
          placeholder="e.g. Grace, perseverance, gratitude…"
          value={song.theme || ''}
          onChange={e => onUpdateField('theme', e.target.value)}
        />
      </div>

      <div className="sg-form-section">
        <label className="sg-form-lbl">Scripture</label>
        <input
          className="sg-inp"
          placeholder="e.g. Psalm 23:1, Ephesians 2:8-9"
          value={song.scripture || ''}
          onChange={e => onUpdateField('scripture', e.target.value)}
        />
      </div>

      <div className="sg-form-section">
        <label className="sg-form-lbl">What sparked this?</label>
        <textarea
          className="sg-ta"
          rows={3}
          placeholder="A moment, a verse, a conversation, a phrase you can't shake…"
          value={song.inspiration || ''}
          onChange={e => onUpdateField('inspiration', e.target.value)}
        />
      </div>

      <div className="sg-form-section">
        <label className="sg-form-lbl">Free notes</label>
        <textarea
          className="sg-ta"
          rows={5}
          placeholder="Anything else — alternate lines, melody ideas, places to go next…"
          value={song.notes || ''}
          onChange={e => onUpdateField('notes', e.target.value)}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Recordings Tab — MediaRecorder API + base64 storage
   ───────────────────────────────────────────────────────────── */
function RecordingsTab({ song, onRefresh, setSelected, setError }) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [label, setLabel]             = useState('');
  const [audioUrls, setAudioUrls]     = useState({}); // id → blob url cache
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const startRef = useRef(0);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUrl = reader.result;
          const duration = (Date.now() - startRef.current) / 1000;
          try {
            await songService.addRecording(song.id, {
              label: label || `Take ${(song.recordings?.length || 0) + 1}`,
              audio_data: dataUrl,
              duration,
            });
            setLabel('');
            const res = await songService.getOne(song.id);
            setSelected(res.data.data);
          } catch {
            setError('Failed to save recording.');
          }
        };
        reader.readAsDataURL(blob);
        streamRef.current?.getTracks().forEach(t => t.stop());
      };
      mr.start();
      startRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 200);
    } catch (e) {
      setError('Mic permission denied or unavailable.');
    }
  };

  const stop = () => {
    clearInterval(timerRef.current);
    setIsRecording(false);
    recRef.current?.stop();
  };

  const loadAudio = async (rec) => {
    if (audioUrls[rec.id]) return audioUrls[rec.id];
    try {
      const res = await songService.getRecording(song.id, rec.id);
      const dataUrl = res.data.data.audio_data;
      setAudioUrls(prev => ({ ...prev, [rec.id]: dataUrl }));
      return dataUrl;
    } catch {
      setError('Failed to load audio.');
      return null;
    }
  };

  const remove = async (rec) => {
    if (!confirm('Delete this recording?')) return;
    try {
      await songService.removeRecording(song.id, rec.id);
      const res = await songService.getOne(song.id);
      setSelected(res.data.data);
    } catch { setError('Failed to delete recording.'); }
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const recordings = song.recordings || [];

  return (
    <div className="sg-recordings">
      <div className="sg-rec-controls">
        {!isRecording ? (
          <>
            <input
              className="sg-inp"
              placeholder={`Take ${recordings.length + 1} (optional label)`}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
            <button className="app-btn primary" onClick={start}>🎙 Start recording</button>
          </>
        ) : (
          <>
            <div className="sg-rec-live">
              <span className="sg-rec-dot" />
              Recording… {fmtTime(elapsed)}
            </div>
            <button className="app-btn primary" onClick={stop}>⏹ Stop & save</button>
          </>
        )}
      </div>

      {recordings.length === 0 ? (
        <div className="sg-rec-empty">
          No takes yet. Hit record and sing — voice memos save with the song.
        </div>
      ) : (
        <div className="sg-rec-list">
          {recordings.map(rec => (
            <RecordingCard
              key={rec.id}
              rec={rec}
              onLoad={() => loadAudio(rec)}
              onRemove={() => remove(rec)}
              fmtTime={fmtTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingCard({ rec, onLoad, onRemove, fmtTime }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const play = async () => {
    if (src) return;
    setLoading(true);
    const url = await onLoad();
    setSrc(url);
    setLoading(false);
  };
  return (
    <div className="sg-rec-card">
      <div className="sg-rec-info">
        <div className="sg-rec-label">{rec.label || 'Untitled take'}</div>
        <div className="sg-rec-meta">
          {format(parseISO(rec.created_at.replace(' ', 'T')), 'MMM d, yyyy · h:mm a')}
          {' · '}
          {fmtTime(rec.duration || 0)}
        </div>
      </div>
      {src ? (
        <audio controls src={src} className="sg-rec-audio" />
      ) : (
        <button className="app-btn ghost" onClick={play} disabled={loading}>
          {loading ? 'Loading…' : '▶ Load'}
        </button>
      )}
      <button className="app-btn ghost icon-only" onClick={onRemove} title="Delete take">🗑</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Insights Tab
   ───────────────────────────────────────────────────────────── */
function InsightsTab({ song }) {
  const sections = song.sections || [];
  const totalLines = sections.reduce((sum, s) => sum + (s.content || '').split('\n').filter(l => l.trim()).length, 0);
  const totalWords = sections.reduce((sum, s) => sum + wordCount(s.content), 0);
  const totalSyllables = sections.reduce((sum, s) =>
    sum + (s.content || '').split('\n').reduce((a, l) => a + countSyllables(l), 0)
  , 0);
  const uniqueChords = new Set();
  sections.forEach(s => {
    const matches = (s.content || '').matchAll(/\[([^\]]+)\]/g);
    for (const m of matches) uniqueChords.add(m[1]);
  });

  const sectionTypeCounts = sections.reduce((acc, s) => {
    acc[s.section_type] = (acc[s.section_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="sg-insights">
      <div className="sg-ins-grid">
        <InsightCard label="Sections"        value={sections.length} />
        <InsightCard label="Lines"           value={totalLines} />
        <InsightCard label="Words"           value={totalWords} />
        <InsightCard label="Syllables"       value={totalSyllables} />
        <InsightCard label="Unique chords"   value={uniqueChords.size} />
        <InsightCard label="Recordings"      value={(song.recordings || []).length} />
      </div>

      {uniqueChords.size > 0 && (
        <div className="sg-ins-chords">
          <div className="sg-form-lbl">Chords used</div>
          <div className="sg-chord-list">
            {[...uniqueChords].sort().map(c => (
              <span key={c} className="sg-chord-pill">{c}</span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(sectionTypeCounts).length > 0 && (
        <div className="sg-ins-types">
          <div className="sg-form-lbl">Section breakdown</div>
          {SECTION_TYPES.map(t => {
            const c = sectionTypeCounts[t.value] || 0;
            if (c === 0) return null;
            return (
              <div key={t.value} className="sg-type-row">
                <span>{t.emoji} {t.label}</span>
                <span className="sg-type-count">{c}</span>
              </div>
            );
          })}
        </div>
      )}

      {(() => {
        const freq = wordFrequency(song);
        if (freq.length === 0) return null;
        const max = freq[0][1];
        return (
          <div className="sg-ins-types">
            <div className="sg-form-lbl">Word frequency — most used words</div>
            <div className="sg-form-hint">Watch for over-used words that could be replaced for variety.</div>
            <div className="sg-freq-grid">
              {freq.map(([w, n]) => (
                <div key={w} className="sg-freq-row">
                  <span className="sg-freq-word">{w}</span>
                  <div className="sg-freq-bar">
                    <div className="sg-freq-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="sg-freq-count">{n}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {(() => {
        const cliches = detectCliches(song);
        return (
          <div className="sg-ins-types sg-cliche-box">
            <div className="sg-form-lbl">⚠ Cliche check</div>
            {cliches.length === 0 ? (
              <div className="sg-cliche-clean">✓ No cliches flagged — fresh language!</div>
            ) : (
              <>
                <div className="sg-form-hint">
                  Found {cliches.length} potentially over-used phrase{cliches.length === 1 ? '' : 's'}.
                  Not always wrong — but worth a second look.
                </div>
                <ul className="sg-cliche-list">
                  {cliches.map((c, i) => (
                    <li key={i}>
                      <span className="sg-cliche-where">{c.sectionLabel}</span>
                      <span className="sg-cliche-phrase">"{c.cliche}"</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function InsightCard({ label, value }) {
  return (
    <div className="sg-ins-card">
      <div className="sg-ins-value">{value}</div>
      <div className="sg-ins-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   New Song Form (inline center)
   ───────────────────────────────────────────────────────────── */
function NewSongForm({ form, setForm, saving, onSave, onCancel }) {
  return (
    <div className="sg-form">
      <header className="sg-form-hd">
        <div className="sg-form-title">✦ New Song</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel">✕</button>
      </header>

      <div className="sg-form-body">
        <div className="sg-form-section">
          <label className="sg-form-lbl">Title *</label>
          <input
            className="sg-inp sg-inp-title"
            placeholder="What's the song called? (Working title is fine)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="sg-form-row">
          <div className="sg-form-section">
            <label className="sg-form-lbl">Status</label>
            <select
              className="sg-sel"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>
              ))}
            </select>
          </div>
          <div className="sg-form-section">
            <label className="sg-form-lbl">Artist (optional)</label>
            <input
              className="sg-inp"
              placeholder="You, or co-writer"
              value={form.artist}
              onChange={e => setForm(f => ({ ...f, artist: e.target.value }))}
            />
          </div>
        </div>

        <div className="sg-form-row">
          <div className="sg-form-section">
            <label className="sg-form-lbl">Key (optional)</label>
            <select
              className="sg-sel"
              value={form.song_key}
              onChange={e => setForm(f => ({ ...f, song_key: e.target.value }))}
            >
              <option value="">— Pick a key —</option>
              {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="sg-form-section">
            <label className="sg-form-lbl">Tempo BPM (optional)</label>
            <input
              className="sg-inp"
              type="number"
              min="40"
              max="300"
              value={form.tempo}
              onChange={e => setForm(f => ({ ...f, tempo: e.target.value }))}
              placeholder="120"
            />
          </div>
          <div className="sg-form-section">
            <label className="sg-form-lbl">Time signature</label>
            <select
              className="sg-sel"
              value={form.time_signature}
              onChange={e => setForm(f => ({ ...f, time_signature: e.target.value }))}
            >
              {TIME_SIGNATURES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="sg-form-section">
          <label className="sg-form-lbl">Theme (optional)</label>
          <input
            className="sg-inp"
            placeholder="One word — grace, longing, joy, surrender…"
            value={form.theme}
            onChange={e => setForm(f => ({ ...f, theme: e.target.value }))}
          />
        </div>

        <div className="sg-form-section">
          <label className="sg-form-lbl">Scripture (optional)</label>
          <input
            className="sg-inp"
            placeholder="e.g. Psalm 23, Ephesians 2:8-9"
            value={form.scripture}
            onChange={e => setForm(f => ({ ...f, scripture: e.target.value }))}
          />
        </div>

        <div className="sg-form-section">
          <label className="sg-form-lbl">What sparked it? (optional)</label>
          <textarea
            className="sg-ta"
            rows={3}
            placeholder="A line, a verse, a feeling — even just one phrase you can't shake."
            value={form.inspiration}
            onChange={e => setForm(f => ({ ...f, inspiration: e.target.value }))}
          />
        </div>
      </div>

      <footer className="sg-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={saving || !form.title.trim()}
        >
          {saving ? 'Saving…' : '🎵 Start the song'}
        </button>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Setlist detail view
   ───────────────────────────────────────────────────────────── */
function SetlistDetail({ setlist, allSongs, onAddSong, onRemoveSong, onReorder, onDelete, onPerform, onOpenSong }) {
  const [showPicker, setShowPicker] = useState(false);
  const [dragId, setDragId] = useState(null);

  const songs = setlist.songs || [];
  const linkedIds = new Set(songs.map(s => s.id));
  const available = allSongs.filter(s => !linkedIds.has(s.id));

  const totalDuration = songs.reduce((sum, s) => {
    const fullSong = allSongs.find(x => x.id === s.id);
    return sum + (songDurationSeconds(fullSong) || 0);
  }, 0);

  const handleDrop = (targetLinkId) => {
    if (!dragId || dragId === targetLinkId) { setDragId(null); return; }
    const order = songs.map(s => s.link_id);
    const fromIdx = order.indexOf(dragId);
    const toIdx   = order.indexOf(targetLinkId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return; }
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragId);
    onReorder(order);
    setDragId(null);
  };

  return (
    <div className="sg-setlist">
      <header className="sg-detail-hd">
        <div className="sg-detail-hd-top">
          <div className="sg-detail-name-block">
            <h1 className="sg-setlist-title">📋 {setlist.name}</h1>
            <div className="sg-detail-meta">
              {setlist.occasion && <span>{setlist.occasion}</span>}
              {setlist.event_date && <><span>·</span><span>{setlist.event_date}</span></>}
              <span>·</span>
              <span>{songs.length} song{songs.length === 1 ? '' : 's'}</span>
              {totalDuration > 0 && <><span>·</span><span>~{fmtDuration(totalDuration)}</span></>}
            </div>
          </div>
          <div className="sg-detail-actions">
            <button
              className="app-btn primary"
              onClick={onPerform}
              disabled={songs.length === 0}
              title="Perform this setlist in order"
            >
              🎤 Perform Setlist
            </button>
            <button className="app-btn ghost icon-only" onClick={onDelete} title="Delete setlist">🗑</button>
          </div>
        </div>
      </header>

      <div className="sg-setlist-body">
        {songs.length === 0 ? (
          <div className="sg-setlist-empty">
            <div className="sg-setlist-empty-title">Empty setlist</div>
            <div className="sg-setlist-empty-sub">Add songs from your library below.</div>
          </div>
        ) : (
          <ol className="sg-setlist-songs">
            {songs.map((s, idx) => (
              <li
                key={s.link_id}
                className={`sg-setlist-row ${dragId === s.link_id ? 'is-dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(s.link_id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(s.link_id)}
              >
                <span className="sg-setlist-drag">⋮⋮</span>
                <span className="sg-setlist-num">{idx + 1}</span>
                <div className="sg-setlist-info">
                  <button className="sg-setlist-title-link" onClick={() => onOpenSong(s.id)}>
                    {s.title}
                  </button>
                  <div className="sg-setlist-meta">
                    {s.song_key && <span>Key {s.song_key}</span>}
                    {s.tempo && <span>· {s.tempo} BPM</span>}
                    {s.time_signature && <span>· {s.time_signature}</span>}
                    {s.artist && <span>· {s.artist}</span>}
                  </div>
                </div>
                <button
                  className="sg-setlist-remove"
                  onClick={() => onRemoveSong(s.link_id)}
                  title="Remove from setlist"
                >✕</button>
              </li>
            ))}
          </ol>
        )}

        <div className="sg-setlist-add">
          {showPicker ? (
            <div className="sg-setlist-picker">
              <div className="sg-setlist-picker-hd">
                <span>Add a song to this setlist</span>
                <button className="app-btn ghost" onClick={() => setShowPicker(false)}>Cancel</button>
              </div>
              {available.length === 0 ? (
                <div className="sg-setlist-picker-empty">All your songs are in this setlist.</div>
              ) : (
                <div className="sg-setlist-picker-list">
                  {available.map(s => (
                    <button
                      key={s.id}
                      className="sg-setlist-picker-row"
                      onClick={() => { onAddSong(s.id); }}
                    >
                      <span className="sg-row-emoji">{getStatus(s.status).emoji}</span>
                      <div className="sg-row-info">
                        <div className="sg-row-title">{s.title}</div>
                        <div className="sg-row-meta">
                          {s.song_key && <span>Key {s.song_key}</span>}
                          {s.tempo && <span>· {s.tempo} BPM</span>}
                        </div>
                      </div>
                      <span className="sg-setlist-add-icon">+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button className="app-btn primary" onClick={() => setShowPicker(true)}>
              + Add a song
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   New Setlist form (inline)
   ───────────────────────────────────────────────────────────── */
function NewSetlistForm({ form, setForm, onSave, onCancel }) {
  return (
    <div className="sg-form">
      <header className="sg-form-hd">
        <div className="sg-form-title">📋 New Setlist</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel">✕</button>
      </header>
      <div className="sg-form-body">
        <div className="sg-form-section">
          <label className="sg-form-lbl">Name *</label>
          <input
            className="sg-inp sg-inp-title"
            placeholder='e.g. "Sunday May 18 — 9am service" or "Open mic — Friday"'
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="sg-form-section">
          <label className="sg-form-lbl">Occasion (optional)</label>
          <input
            className="sg-inp"
            placeholder="Worship · Gig · Rehearsal · Recording session"
            value={form.occasion}
            onChange={e => setForm(f => ({ ...f, occasion: e.target.value }))}
          />
        </div>
        <div className="sg-form-section">
          <label className="sg-form-lbl">Date (optional)</label>
          <input
            className="sg-inp"
            type="date"
            value={form.event_date}
            onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
          />
        </div>
      </div>
      <footer className="sg-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={!form.name.trim()}
        >📋 Create Setlist</button>
      </footer>
    </div>
  );
}
