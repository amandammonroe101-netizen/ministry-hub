import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import MinistryBrand from '../../components/layout/MinistryBrand';
import WorshipShell from '../worship/WorshipShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { songService } from '../../services/songService';
import { addStemFromRecording } from '../../utils/stemsLibrary';
import { useUserStoreKey } from '../../lib/userStore';
import {
  playNote, getRecordStream, VOICE_LIST, VOICES, voiceParams,
  applyReverb, applyReverbSize, applyDelay,
  NOTE_NAMES, midiToName, midiToNoteName,
  SCALES, CHORD_TYPES, DIATONIC,
} from './synth';
import './Studio.css';

/* ─────────────────────────────────────────────────────────────
   Computer-keyboard → semitone map.

   Covers all 3 octaves of the visible piano:

     Home row:    A S D F G H J K L ;     → semitones 0-9  (low octave)
     QWERTY row:  Q W E R T Y U I O P     → semitones 10-19 (mid octave)
     Number row:  1 2 3 4 5 6 7 8 9       → 9 white keys on the right
     Shift+1..7:  ! @ # $ % ^ &           → 7 black keys on the right

   Bottom letter row (Z X C V B N M , . /) is reserved for saved-
   chord entry shortcuts. The octave control still shifts the entire
   window if you want to play even lower or higher.
   ───────────────────────────────────────────────────────────── */
const KEY_MAP = {
  // Home row — lower octave (semitones 0-9)
  a: 0,  s: 1,  d: 2,  f: 3,  g: 4,  h: 5,  j: 6,  k: 7,  l: 8,  ';': 9,
  // QWERTY row — middle octave (semitones 10-19)
  q: 10, w: 11, e: 12, r: 13, t: 14, y: 15, u: 16, i: 17, o: 18, p: 19,
  // Number row 1-9 — the 9 remaining white keys (A5, B5, C6, D6, E6, F6, G6, A6, B6)
  '1': 21, '2': 23, '3': 24, '4': 26, '5': 28, '6': 29, '7': 31, '8': 33, '9': 35,
  // Shift + 1-7 → punctuation chars on a US layout — the 7 remaining black keys
  // (G#5, A#5, C#6, D#6, F#6, G#6, A#6)
  '!': 20, '@': 22, '#': 25, '$': 27, '%': 30, '^': 32, '&': 34,
};

/* Pretty display for the shifted-number bindings so the badge on each
   piano key reads "⇧1" instead of "!". */
const KEY_DISPLAY_OVERRIDE = {
  '!': '⇧1', '@': '⇧2', '#': '⇧3', '$': '⇧4',
  '%': '⇧5', '^': '⇧6', '&': '⇧7',
};
const SEMI_TO_KEY = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, KEY_DISPLAY_OVERRIDE[k] || k.toUpperCase()])
);

const BLACK_SEMITONES = [1, 3, 6, 8, 10];
const VISIBLE_OCTAVES = 3;
const KEYS = NOTE_NAMES; // for root pickers

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

/* Custom voices now live in Firestore via useUserStoreKey — these stubs are
   no-ops kept so existing call sites compile without rewrites. */
const loadCustomVoices = () => [];
const persistCustomVoices = () => {};

/* Saved chords (custom user-built chords, grouped by song category) persist locally.
   Each entry now holds one OR MORE chords, so a single save can capture a whole
   progression for a song. Old single-chord entries (with a `notes` field) are
   migrated transparently on load. */
const SAVED_CHORDS_KEY = 'piano:saved-chords';
const loadSavedChords = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_CHORDS_KEY) || '[]');
    return raw.map(e => {
      if (Array.isArray(e.chords) && e.chords.length) return e;
      // Migrate legacy { notes: [...] } → { chords: [{ id, notes }] }
      if (Array.isArray(e.notes) && e.notes.length) {
        return { ...e, chords: [{ id: 'c-' + e.id + '-0', notes: e.notes }] };
      }
      return { ...e, chords: [] };
    });
  } catch { return []; }
};

const REVERB_SIZES = { room: [1.2, 2], hall: [2.8, 2.5], cathedral: [5, 3] };
const DELAY_DIVS   = { '1/16': 0.25, '1/8': 0.5, '1/8d': 0.75, '1/4': 1, '1/2': 2 };

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Studio() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [voice, setVoice]         = useState('piano');
  const [octave, setOctave]       = useState(4);
  const [sustain, setSustain]     = useState(false);
  const [volume, setVolume]       = useState(0.3);
  const [octaveDouble, setOctaveDouble] = useState(false);
  const [activeNotes, setActive]  = useState(new Set());

  // effects
  const [reverbOn, setReverbOn]           = useState(false);
  const [reverbSize, setReverbSize]       = useState('hall');
  const [reverbAmount, setReverbAmount]   = useState(0.3);
  const [delayOn, setDelayOn]             = useState(false);
  const [delayAmount, setDelayAmount]     = useState(0.28);
  const [delayDivision, setDelayDivision] = useState('1/8');
  const [delayFeedback, setDelayFeedback] = useState(0.35);
  const [bpm, setBpm]                     = useState(100);

  // voice editor
  const [customVoices, setCustomVoices]   = useUserStoreKey('studio:custom-voices', []);
  const [voiceEdits, setVoiceEdits]       = useState(null);

  // scale highlight
  const [scaleOn, setScaleOn]     = useState(false);
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleType, setScaleType] = useState('major');

  // chord helper
  const [chordRoot, setChordRoot] = useState('C');
  const [chordType, setChordType] = useState('maj');

  // saved chord memory (custom chords organized by song category)
  const [savedChords, setSavedChords] = useUserStoreKey('studio:saved-chords', []);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveChordName, setSaveChordName] = useState('');
  const [saveChordCategory, setSaveChordCategory] = useState('');
  const [armedDeleteId, setArmedDeleteId] = useState(null);
  /* When non-null the save dialog is in "edit" mode for that entry id —
     submitting replaces the existing entry instead of creating a new one. */
  const [editingEntryId, setEditingEntryId] = useState(null);
  /* While the save dialog is open the user can capture multiple chords; each
     entry: { id, notes: [midi], label? } */
  const [capturedChords, setCapturedChords] = useState([]);
  /* When `armingCapture` is true the user is in "play a chord now" mode — the
     piano stays interactive, and a preview of the currently held / last played
     notes shows in the dialog until they click "Capture" to commit. */
  const [armingCapture, setArmingCapture] = useState(false);
  /* Saved-chord pads currently being held (by mouse or laptop keyboard). */
  const [activePadIds, setActivePadIds] = useState(() => new Set());

  // recording
  const [isRecording, setIsRecording]   = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [pending, setPending]           = useState(null);   // { dataUrl, duration }
  const [songs, setSongs]               = useUserStoreKey('songs', []);
  const [saveLabel, setSaveLabel]       = useState('');
  const [toast, setToast]               = useState(null);

  // refs
  const handlesRef   = useRef(new Map());   // midi → handle (currently held)
  const sustainedRef = useRef(new Map());   // midi → handle (ringing after key-up while sustain on)
  const lastCapturedRef = useRef([]);       // last set of midi notes the user played (for chord capture)
  const recRef       = useRef(null);
  const chunksRef    = useRef([]);
  const recStartRef  = useRef(0);
  const recTimerRef  = useRef(null);
  const voiceDefRef     = useRef(null);
  const volumeRef       = useRef(volume);
  const sustainRef      = useRef(sustain);
  const octaveRef       = useRef(octave);
  const octaveDoubleRef = useRef(octaveDouble);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { octaveRef.current = octave; }, [octave]);
  useEffect(() => { octaveDoubleRef.current = octaveDouble; }, [octaveDouble]);
  useEffect(() => {
    sustainRef.current = sustain;
    if (!sustain) {
      // release every note that was being held by the pedal
      sustainedRef.current.forEach(h => h.release());
      sustainedRef.current.clear();
    }
  }, [sustain]);

  /* Songs are now live-synced via useUserStoreKey above — no initial fetch. */

  /* ── resolved voice definition (built-in or custom + live edits) ── */
  const resolvedDef = useMemo(() => {
    const custom = customVoices.find(v => v.id === voice);
    const base = custom ? custom.def : (VOICES[voice] || VOICES.piano);
    return voiceEdits ? { ...base, ...voiceEdits } : base;
  }, [voice, customVoices, voiceEdits]);
  useEffect(() => { voiceDefRef.current = resolvedDef; }, [resolvedDef]);

  /* ── effects wiring ──────────────────────────────────────── */
  useEffect(() => { applyReverb(reverbOn ? reverbAmount : 0); }, [reverbOn, reverbAmount]);
  useEffect(() => {
    const [sec, decay] = REVERB_SIZES[reverbSize];
    applyReverbSize(sec, decay);
  }, [reverbSize]);
  useEffect(() => {
    const timeSec = (60 / bpm) * DELAY_DIVS[delayDivision];
    applyDelay(delayOn ? delayAmount : 0, timeSec, delayFeedback);
  }, [delayOn, delayAmount, delayDivision, delayFeedback, bpm]);

  /* ── note on/off ─────────────────────────────────────────── */
  const noteOn = useCallback((midi) => {
    if (handlesRef.current.has(midi)) return;
    // if it was ringing from the pedal, retrigger cleanly
    const sustained = sustainedRef.current.get(midi);
    if (sustained) { sustained.release(); sustainedRef.current.delete(midi); }
    const handle = playNote(midi, {
      voice: voiceDefRef.current,
      volume: volumeRef.current,
      octaveDouble: octaveDoubleRef.current,
    });
    handlesRef.current.set(midi, handle);
    setActive(prev => {
      const n = new Set(prev); n.add(midi);
      // remember whatever's currently being held — that's what "Save current notes" grabs
      lastCapturedRef.current = Array.from(n).sort((a, b) => a - b);
      return n;
    });
  }, []);

  const noteOff = useCallback((midi) => {
    const handle = handlesRef.current.get(midi);
    if (!handle) return;
    handlesRef.current.delete(midi);
    if (sustainRef.current) {
      sustainedRef.current.set(midi, handle);
    } else {
      handle.release();
    }
    setActive(prev => { const n = new Set(prev); n.delete(midi); return n; });
  }, []);

  /* ── computer keyboard ─────────────────────────────────────
     Track keydowns by physical key code (e.code) so a note still
     releases correctly even if the user lets go of Shift before
     letting go of the digit (e.g. Shift+1 / "!" → "1"). */
  useEffect(() => {
    const codeToMidi = new Map();
    const down = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // e.key may be '!' (shift+1) or '1' (plain 1) — KEY_MAP has both.
      const semi = KEY_MAP[e.key.toLowerCase()] ?? KEY_MAP[e.key];
      if (semi === undefined) return;
      e.preventDefault();
      const midi = (octaveRef.current + 1) * 12 + semi;
      codeToMidi.set(e.code, midi);
      noteOn(midi);
    };
    const up = (e) => {
      const midi = codeToMidi.get(e.code);
      if (midi === undefined) return;
      codeToMidi.delete(e.code);
      noteOff(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [noteOn, noteOff]);

  // release everything on unmount
  useEffect(() => () => {
    handlesRef.current.forEach(h => h.release());
    sustainedRef.current.forEach(h => h.release());
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  /* ── derived: visible keyboard + scale set ───────────────── */
  const keyboard = useMemo(() => {
    const whites = [];
    const blacks = [];
    for (let o = 0; o < VISIBLE_OCTAVES; o++) {
      for (let s = 0; s < 12; s++) {
        const midi = (octave + o + 1) * 12 + s;
        if (BLACK_SEMITONES.includes(s)) {
          blacks.push({ midi, afterWhiteIndex: whites.length - 1 });
        } else {
          whites.push({ midi });
        }
      }
    }
    return { whites, blacks };
  }, [octave]);

  const scaleSet = useMemo(() => {
    if (!scaleOn) return null;
    const rootIdx = NOTE_NAMES.indexOf(scaleRoot);
    const set = new Set(SCALES[scaleType].map(iv => (rootIdx + iv) % 12));
    return set;
  }, [scaleOn, scaleRoot, scaleType]);

  const computerKeyFor = (midi) => {
    const semi = midi - (octave + 1) * 12;
    return SEMI_TO_KEY[semi];
  };

  /* ── chord playing ───────────────────────────────────────── */
  const chordMidis = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(chordRoot);
    const base = (octave + 1) * 12 + rootIdx;
    return CHORD_TYPES[chordType].intervals.map(iv => base + iv);
  }, [chordRoot, chordType, octave]);

  const chordHeldRef = useRef([]);
  const playChord = (midis) => {
    chordHeldRef.current.forEach(h => h.release());
    chordHeldRef.current = midis.map((m) => playNote(m, {
      voice: voiceDefRef.current,
      volume: volumeRef.current,
      octaveDouble: octaveDoubleRef.current,
    }));
    lastCapturedRef.current = [...midis].sort((a, b) => a - b);
    setActive(prev => { const n = new Set(prev); midis.forEach(m => n.add(m)); return n; });
  };
  const releaseChord = (midis) => {
    chordHeldRef.current.forEach(h => {
      if (sustainRef.current) sustainedRef.current.set('chord-' + Math.random(), h);
      else h.release();
    });
    chordHeldRef.current = [];
    setActive(prev => { const n = new Set(prev); (midis || []).forEach(m => n.delete(m)); return n; });
  };

  /* Press / release helpers for the saved-chord pads — match the diatonic
     pads' onMouseDown / onMouseUp / onMouseLeave / keyboard contract.
     Defined HERE (before flatPads / keyboard useEffect) so the temporal
     dead zone is respected. */
  const pressPad = useCallback((padId, notes) => {
    setActivePadIds(s => {
      if (s.has(padId)) return s;
      const n = new Set(s);
      n.add(padId);
      return n;
    });
    playChord(notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const releasePad = useCallback((padId, notes) => {
    setActivePadIds(s => {
      if (!s.has(padId)) return s;
      const n = new Set(s);
      n.delete(padId);
      return n;
    });
    releaseChord(notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── voice editor ────────────────────────────────────────── */
  const editParam = (key, val) => {
    setVoiceEdits({
      attack:     resolvedDef.attack,
      decay:      resolvedDef.decay,
      sustain:    resolvedDef.sustain,
      release:    resolvedDef.release,
      filter:     resolvedDef.filter || 0,
      detune:     resolvedDef.detune ?? 0,
      brightness: resolvedDef.brightness ?? 1,
      resonance:  resolvedDef.resonance ?? 1,
      level:      resolvedDef.level ?? 1,
      [key]: val,
    });
  };
  const pickVoice = (id) => { setVoice(id); setVoiceEdits(null); };
  const saveCustomVoice = () => {
    const name = prompt('Name this custom voice:');
    if (!name || !name.trim()) return;
    const id = 'custom-' + Date.now();
    const next = [...customVoices, { id, label: name.trim(), def: { ...resolvedDef } }];
    setCustomVoices(next);
    persistCustomVoices(next);
    setVoice(id);
    setVoiceEdits(null);
    setToast(`Saved voice "${name.trim()}".`);
  };
  const deleteCustomVoice = (id) => {
    const next = customVoices.filter(v => v.id !== id);
    setCustomVoices(next);
    persistCustomVoices(next);
    if (voice === id) { setVoice('piano'); setVoiceEdits(null); }
  };

  /* ── saved chords: useUserStoreKey autosaves; helpers below ─ */

  const savedCategories = useMemo(() => {
    const set = new Set();
    savedChords.forEach(c => { if (c.category) set.add(c.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [savedChords]);

  const visibleSavedChords = useMemo(() => {
    if (selectedCategory === 'All') return savedChords;
    if (selectedCategory === 'Uncategorized') {
      return savedChords.filter(c => !c.category);
    }
    return savedChords.filter(c => c.category === selectedCategory);
  }, [savedChords, selectedCategory]);

  /* For each visible saved entry, precompute the FULL stacked set of midi notes
     across all of its chords (deduped + sorted). A single laptop-keyboard key
     plays the entire stack together; mouse clicks on individual pads still
     trigger just that one chord.

     Shortcuts live on the bottom letter row so the piano's home + QWERTY rows
     stay free for note input. */
  const SAVED_ENTRY_KEYS = ['z','x','c','v','b','n','m',',','.','/'];
  const entryMeta = useMemo(() => {
    const out = [];
    visibleSavedChords.forEach((entry, i) => {
      const list = Array.isArray(entry.chords) && entry.chords.length
        ? entry.chords
        : (Array.isArray(entry.notes) && entry.notes.length
            ? [{ id: entry.id + '-0', notes: entry.notes }]
            : []);
      const stack = Array.from(
        new Set(list.flatMap(c => Array.isArray(c.notes) ? c.notes : []))
      ).sort((a, b) => a - b);
      out.push({
        entry,
        chordList: list,
        stack,
        key: i < SAVED_ENTRY_KEYS.length ? SAVED_ENTRY_KEYS[i] : null,
      });
    });
    return out;
  }, [visibleSavedChords]);

  /* Lookup tables — by entry id (for rendering) and by key (for keyboard). */
  const entryKeyById = useMemo(() => {
    const m = {};
    entryMeta.forEach(e => { if (e.key) m[e.entry.id] = e.key; });
    return m;
  }, [entryMeta]);

  useEffect(() => {
    if (entryMeta.length === 0) return;
    const byKey = {};
    entryMeta.forEach(e => { if (e.key) byKey[e.key] = e; });
    const down = (ev) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const meta = byKey[ev.key];
      if (!meta || meta.stack.length === 0) return;
      ev.preventDefault();
      // Mark every pad in this entry as active so they all light up together.
      pressPad('entry:' + meta.entry.id, meta.stack);
    };
    const up = (ev) => {
      const meta = byKey[ev.key];
      if (!meta || meta.stack.length === 0) return;
      releasePad('entry:' + meta.entry.id, meta.stack);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryMeta, pressPad, releasePad]);

  const openSaveDialog = () => {
    // Pre-fill the category with whatever's currently selected (if it's a real one)
    const preCat = (selectedCategory !== 'All' && selectedCategory !== 'Uncategorized')
      ? selectedCategory
      : '';
    setEditingEntryId(null);
    setSaveChordCategory(preCat);
    setSaveChordName('');
    setCapturedChords([]);
    setArmingCapture(false);
    setShowSaveDialog(true);
  };

  /* Load an existing entry's name/category/chords into the save dialog so the
     user can rename, recategorize, add new chords, remove chords, or relabel. */
  const openEditDialog = (entry) => {
    const list = Array.isArray(entry.chords) && entry.chords.length
      ? entry.chords
      : (Array.isArray(entry.notes) && entry.notes.length
          ? [{ id: entry.id + '-0', notes: entry.notes, label: '' }]
          : []);
    setEditingEntryId(entry.id);
    setSaveChordName(entry.name || '');
    setSaveChordCategory(entry.category || '');
    setCapturedChords(list.map((c, i) => ({
      id: 'cap-edit-' + entry.id + '-' + i,
      notes: Array.isArray(c.notes) ? c.notes.slice() : [],
      label: c.label || '',
    })));
    setArmingCapture(false);
    setShowSaveDialog(true);
  };

  const cancelSaveDialog = () => {
    setShowSaveDialog(false);
    setSaveChordName('');
    setSaveChordCategory('');
    setCapturedChords([]);
    setArmingCapture(false);
    setEditingEntryId(null);
  };

  /* Arm capture mode — the dialog stays open but the user can now play notes
     on the piano; they click "Capture" to commit the current chord. */
  const armCapture = () => {
    // Clear any leftover "last played" so the preview shows nothing until the
    // user actually plays something in this capture session.
    lastCapturedRef.current = [];
    setArmingCapture(true);
  };

  const cancelArmCapture = () => setArmingCapture(false);

  /* Commit the currently held / just-played notes as a captured chord. */
  const commitArmedCapture = () => {
    const held = Array.from(activeNotes);
    const notes = (held.length > 0 ? held : lastCapturedRef.current)
      .slice()
      .sort((a, b) => a - b);
    if (notes.length === 0) {
      setToast('Play some notes on the piano first.');
      return;
    }
    setCapturedChords(prev => [
      ...prev,
      { id: 'cap-' + Date.now() + '-' + prev.length, notes, label: '' },
    ]);
    setArmingCapture(false);
    lastCapturedRef.current = [];
  };

  const removeCapturedChord = (id) => {
    setCapturedChords(prev => prev.filter(c => c.id !== id));
  };

  const updateCapturedLabel = (id, label) => {
    setCapturedChords(prev => prev.map(c => c.id === id ? { ...c, label } : c));
  };

  const previewCapturedChord = (notes) => playChord(notes);
  const releaseCapturedChord = (notes) => releaseChord(notes);

  const confirmSaveChord = () => {
    // If nothing has been explicitly added yet, fall back to whatever is currently
    // held/just-played so single-chord saves still work as a one-click flow.
    let chordsToSave = capturedChords;
    if (chordsToSave.length === 0) {
      const held = Array.from(activeNotes);
      const notes = (held.length > 0 ? held : lastCapturedRef.current)
        .slice()
        .sort((a, b) => a - b);
      if (notes.length === 0) {
        setToast('Play some notes and add at least one chord first.');
        return;
      }
      chordsToSave = [{ id: 'cap-' + Date.now(), notes, label: '' }];
    }
    const name = saveChordName.trim() || `Progression ${savedChords.length + 1}`;
    const category = saveChordCategory.trim();
    const stableChords = chordsToSave.map((c, i) => ({
      id: 'c-' + Date.now() + '-' + i,
      notes: c.notes,
      label: c.label || '',
    }));
    const countLabel = chordsToSave.length === 1 ? '1 chord' : `${chordsToSave.length} chords`;

    if (editingEntryId) {
      // Update in place, preserving the original entry id and createdAt timestamp.
      setSavedChords(prev => prev.map(e => e.id === editingEntryId
        ? {
            ...e,
            name,
            category,
            chords: stableChords,
            // Drop legacy single-chord `notes` field on first save so the
            // entry is fully migrated.
            notes: undefined,
            updatedAt: Date.now(),
          }
        : e
      ));
      setToast(`Updated "${name}" (${countLabel})${category ? ` in "${category}"` : ''}.`);
    } else {
      const entry = {
        id: 'chord-' + Date.now(),
        name,
        chords: stableChords,
        category,
        createdAt: Date.now(),
      };
      setSavedChords(prev => [...prev, entry]);
      setToast(`Saved "${name}" (${countLabel})${category ? ` to "${category}"` : ''}.`);
    }
    cancelSaveDialog();
  };

  const deleteSavedChord = (id) => {
    setSavedChords(prev => prev.filter(c => c.id !== id));
    setArmedDeleteId(null);
  };

  // If the filter points at a category that no longer exists, fall back to "All"
  useEffect(() => {
    if (selectedCategory === 'All' || selectedCategory === 'Uncategorized') return;
    if (!savedCategories.includes(selectedCategory)) setSelectedCategory('All');
  }, [savedCategories, selectedCategory]);

  // Diatonic chords for the scale key (drives the chord pads)
  const diatonicChords = useMemo(() => {
    const rootIdx = NOTE_NAMES.indexOf(scaleRoot);
    const scale = SCALES[scaleType];
    const dia = DIATONIC[scaleType];
    return scale.map((deg, i) => {
      const noteIdx = (rootIdx + deg) % 12;
      const qual = dia.quals[i];
      const base = (octave + 1) * 12 + noteIdx;
      const midis = CHORD_TYPES[qual].intervals.map(iv => base + iv);
      return {
        roman: dia.romans[i],
        name: NOTE_NAMES[noteIdx] + CHORD_TYPES[qual].suffix,
        midis,
      };
    });
  }, [scaleRoot, scaleType, octave]);

  /* ── recording ───────────────────────────────────────────── */
  const startRecording = () => {
    try {
      const stream = getRecordStream();
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setPending({
            dataUrl: reader.result,
            duration: (Date.now() - recStartRef.current) / 1000,
          });
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      recStartRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      recTimerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
    } catch {
      setToast('Could not start recording.');
    }
  };

  const stopRecording = () => {
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    recRef.current?.stop();
  };

  const saveToSong = async (songId) => {
    if (!pending) return;
    try {
      await songService.addRecording(songId, {
        label: saveLabel || 'Studio take',
        audio_data: pending.dataUrl,
        duration: pending.duration,
      });
      const song = songs.find(s => s.id === songId);
      setToast(`Saved to "${song?.title || 'song'}".`);
      setPending(null);
      setSaveLabel('');
    } catch {
      setToast('Failed to save recording.');
    }
  };

  const saveToStemsLibrary = async () => {
    if (!pending) return;
    const result = await addStemFromRecording({
      name: saveLabel || 'Piano take',
      audioDataUrl: pending.dataUrl,
      type: 'keys',
      duration: pending.duration,
      source: 'Piano',
    });
    if (result.ok) {
      setToast(result.warning ? `Saved to Stems Library — ${result.warning}` : 'Saved to Stems Library');
      setPending(null);
      setSaveLabel('');
    } else {
      setToast(result.error || 'Failed to save to Stems Library.');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <WorshipShell title="Piano" icon="🎹" subtitle="Virtual piano/keys instrument — play, record, and practice.">
    <div className="st-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <div className="app-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag studio">Studio</span>
        </div>
        <div className="app-tb-actions">
          {isRecording ? (
            <span className="st-rec-indicator">
              <span className="st-rec-dot" /> Recording {fmtTime(elapsed)}
            </span>
          ) : (
            <span className="st-tb-hint">Play with your mouse or computer keys</span>
          )}
          <button
            className="pm-tb-avatar"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>
      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />

      <div className="st-body">
        <main className="st-main">
          {toast && <div className="st-toast">{toast}</div>}

          {/* ── Controls ── */}
          <section className="st-controls">
            <div className="st-control-group">
              <span className="st-control-lbl">Voice</span>
              <div className="st-voice-pills">
                {VOICE_LIST.map(v => (
                  <button
                    key={v.id}
                    className={`st-voice-pill ${voice === v.id ? 'on' : ''}`}
                    onClick={() => pickVoice(v.id)}
                  >
                    <span>{v.emoji}</span> {v.label}
                  </button>
                ))}
                {customVoices.map(v => (
                  <span key={v.id} className={`st-voice-pill st-voice-custom ${voice === v.id ? 'on' : ''}`}>
                    <button className="st-voice-custom-main" onClick={() => pickVoice(v.id)}>
                      <span>⚙</span> {v.label}
                    </button>
                    <button
                      className="st-voice-custom-del"
                      onClick={() => deleteCustomVoice(v.id)}
                      title="Delete custom voice"
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Octave</span>
              <div className="st-octave">
                <button className="st-oct-btn" onClick={() => setOctave(o => Math.max(1, o - 1))} title="Octave down">−</button>
                <span className="st-oct-val">C{octave}</span>
                <button className="st-oct-btn" onClick={() => setOctave(o => Math.min(7, o + 1))} title="Octave up">+</button>
              </div>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Sustain</span>
              <button
                className={`st-toggle ${sustain ? 'on' : ''}`}
                onClick={() => setSustain(s => !s)}
                title="Hold notes after key-up (sustain pedal)"
              >
                {sustain ? '🦶 On' : '🦶 Off'}
              </button>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Octave ×2</span>
              <button
                className={`st-toggle ${octaveDouble ? 'on' : ''}`}
                onClick={() => setOctaveDouble(v => !v)}
                title="Double every note an octave up for a fuller sound"
              >
                {octaveDouble ? 'On' : 'Off'}
              </button>
            </div>

            <div className="st-control-group">
              <span className="st-control-lbl">Volume</span>
              <input
                type="range"
                className="st-volume"
                min="0" max="0.6" step="0.02"
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
              />
            </div>

            <div className="st-control-group st-control-scale">
              <span className="st-control-lbl">Scale highlight</span>
              <div className="st-scale-row">
                <button
                  className={`st-toggle ${scaleOn ? 'on' : ''}`}
                  onClick={() => setScaleOn(v => !v)}
                >
                  {scaleOn ? 'On' : 'Off'}
                </button>
                <select className="st-sel" value={scaleRoot} onChange={e => setScaleRoot(e.target.value)}>
                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="st-sel" value={scaleType} onChange={e => setScaleType(e.target.value)}>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
            </div>
          </section>

          {/* ── Keyboard ── */}
          <section className="st-keyboard-section">
            <div className="st-keyboard" role="group" aria-label="Piano keyboard">
              {keyboard.whites.map((k, i) => {
                const inScale = !scaleSet || scaleSet.has(k.midi % 12);
                const ck = computerKeyFor(k.midi);
                return (
                  <button
                    key={k.midi}
                    className={`st-key st-key-white
                      ${activeNotes.has(k.midi) ? 'active' : ''}
                      ${scaleSet && !inScale ? 'dim' : ''}
                      ${scaleSet && inScale ? 'in-scale' : ''}`}
                    style={{ width: `${100 / keyboard.whites.length}%` }}
                    onMouseDown={() => noteOn(k.midi)}
                    onMouseUp={() => noteOff(k.midi)}
                    onMouseLeave={() => activeNotes.has(k.midi) && noteOff(k.midi)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <span className="st-key-name">{midiToNoteName(k.midi)}</span>
                    {ck && <span className="st-key-comp">{ck}</span>}
                  </button>
                );
              })}
              {keyboard.blacks.map((k) => {
                const inScale = !scaleSet || scaleSet.has(k.midi % 12);
                const ck = computerKeyFor(k.midi);
                const wW = 100 / keyboard.whites.length;
                const left = (k.afterWhiteIndex + 1) * wW;
                return (
                  <button
                    key={k.midi}
                    className={`st-key st-key-black
                      ${activeNotes.has(k.midi) ? 'active' : ''}
                      ${scaleSet && !inScale ? 'dim' : ''}
                      ${scaleSet && inScale ? 'in-scale' : ''}`}
                    style={{ left: `${left}%`, width: `${wW * 0.62}%`, marginLeft: `${-wW * 0.31}%` }}
                    onMouseDown={() => noteOn(k.midi)}
                    onMouseUp={() => noteOff(k.midi)}
                    onMouseLeave={() => activeNotes.has(k.midi) && noteOff(k.midi)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {ck && <span className="st-key-comp-black">{ck}</span>}
                  </button>
                );
              })}
            </div>
            <div className="st-keyboard-legend">
              Computer keys: <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>… = white ·
              <kbd>W</kbd><kbd>E</kbd><kbd>T</kbd><kbd>Y</kbd>… = black ·
              octave −/+ shifts the playable range
            </div>
          </section>

          {/* ── Effects + Voice Editor ── */}
          <section className="st-panels st-panels-fx">
            {/* Effects */}
            <div className="st-panel">
              <div className="st-panel-title">🌊 Effects</div>

              <div className="st-fx-block">
                <div className="st-fx-head">
                  <button
                    className={`st-toggle ${reverbOn ? 'on' : ''}`}
                    onClick={() => setReverbOn(v => !v)}
                  >{reverbOn ? 'Reverb On' : 'Reverb Off'}</button>
                  <select className="st-sel" value={reverbSize} onChange={e => setReverbSize(e.target.value)}>
                    <option value="room">Room</option>
                    <option value="hall">Hall</option>
                    <option value="cathedral">Cathedral</option>
                  </select>
                </div>
                <label className="st-fx-slider">
                  <span>Amount</span>
                  <input type="range" min="0" max="1" step="0.02"
                    value={reverbAmount} onChange={e => setReverbAmount(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(reverbAmount * 100)}%</span>
                </label>
              </div>

              <div className="st-fx-block">
                <div className="st-fx-head">
                  <button
                    className={`st-toggle ${delayOn ? 'on' : ''}`}
                    onClick={() => setDelayOn(v => !v)}
                  >{delayOn ? 'Delay On' : 'Delay Off'}</button>
                  <select className="st-sel" value={delayDivision} onChange={e => setDelayDivision(e.target.value)}>
                    <option value="1/16">1/16 note</option>
                    <option value="1/8">1/8 note</option>
                    <option value="1/8d">Dotted 1/8</option>
                    <option value="1/4">1/4 note</option>
                    <option value="1/2">1/2 note</option>
                  </select>
                  <label className="st-fx-bpm">
                    <input type="number" min="40" max="240" value={bpm}
                      onChange={e => setBpm(parseInt(e.target.value, 10) || 100)} />
                    <span>BPM</span>
                  </label>
                </div>
                <label className="st-fx-slider">
                  <span>Amount</span>
                  <input type="range" min="0" max="1" step="0.02"
                    value={delayAmount} onChange={e => setDelayAmount(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(delayAmount * 100)}%</span>
                </label>
                <label className="st-fx-slider">
                  <span>Feedback</span>
                  <input type="range" min="0" max="0.85" step="0.02"
                    value={delayFeedback} onChange={e => setDelayFeedback(parseFloat(e.target.value))} />
                  <span className="st-fx-val">{Math.round(delayFeedback * 100)}%</span>
                </label>
              </div>
            </div>

            {/* Voice Editor */}
            <div className="st-panel">
              <div className="st-panel-title">⚙ Voice Editor</div>
              <div className="st-fx-hint">
                Shape the current voice — changes apply live as you play.
              </div>
              {[
                { key: 'attack',     label: 'Attack',     min: 0,    max: 1,    step: 0.005, def: 0 },
                { key: 'decay',      label: 'Decay',      min: 0,    max: 2,    step: 0.01,  def: 0 },
                { key: 'sustain',    label: 'Sustain',    min: 0,    max: 1,    step: 0.02,  def: 0 },
                { key: 'release',    label: 'Release',    min: 0.05, max: 2.5,  step: 0.01,  def: 0 },
                { key: 'filter',     label: 'Filter',     min: 0,    max: 8000, step: 100,   def: 0 },
                { key: 'detune',     label: 'Detune',     min: -50,  max: 50,   step: 1,     def: 0 },
                { key: 'brightness', label: 'Brightness', min: 0,    max: 2,    step: 0.02,  def: 1 },
                { key: 'resonance',  label: 'Resonance',  min: 0.1,  max: 20,   step: 0.1,   def: 1 },
                { key: 'level',      label: 'Level',      min: 0.2,  max: 2,    step: 0.02,  def: 1 },
              ].map(p => (
                <label key={p.key} className="st-fx-slider">
                  <span>{p.label}</span>
                  <input
                    type="range"
                    min={p.min} max={p.max} step={p.step}
                    value={resolvedDef[p.key] ?? p.def}
                    onChange={e => editParam(p.key, parseFloat(e.target.value))}
                  />
                  <span className="st-fx-val">
                    {p.key === 'filter'
                      ? (resolvedDef.filter ? `${Math.round(resolvedDef.filter)}Hz` : 'off')
                      : p.key === 'detune'
                      ? `${resolvedDef.detune > 0 ? '+' : ''}${resolvedDef.detune ?? 0}¢`
                      : p.key === 'brightness' || p.key === 'level'
                      ? `${Math.round((resolvedDef[p.key] ?? p.def) * 100)}%`
                      : (resolvedDef[p.key] ?? p.def).toFixed(2)}
                  </span>
                </label>
              ))}
              <div className="st-ve-actions">
                {voiceEdits && (
                  <button className="st-ve-reset" onClick={() => setVoiceEdits(null)}>↺ Reset</button>
                )}
                <button className="st-ve-save" onClick={saveCustomVoice}>💾 Save as custom voice</button>
              </div>
            </div>
          </section>

          {/* ── Lower panels ── */}
          <section className="st-panels">
            {/* Chord helper */}
            <div className="st-panel st-chord-panel">
              <div className="st-panel-title">🎶 Chord Helper</div>

              <div className="st-chord-builder">
                <select className="st-sel" value={chordRoot} onChange={e => setChordRoot(e.target.value)}>
                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="st-sel" value={chordType} onChange={e => setChordType(e.target.value)}>
                  {Object.entries(CHORD_TYPES).map(([id, c]) => (
                    <option key={id} value={id}>{c.label}</option>
                  ))}
                </select>
                <button
                  className="st-chord-play"
                  onMouseDown={() => playChord(chordMidis)}
                  onMouseUp={() => releaseChord(chordMidis)}
                  onMouseLeave={() => releaseChord(chordMidis)}
                >
                  ▶ Play {chordRoot}{CHORD_TYPES[chordType].suffix}
                </button>
              </div>
              <div className="st-chord-notes">
                Notes: {chordMidis.map(m => midiToNoteName(m)).join(' · ')}
              </div>

              <div className="st-chord-pads-lbl">
                Diatonic chords in {scaleRoot} {scaleType}
                <span className="st-chord-pads-hint">— press &amp; hold to play</span>
              </div>
              <div className="st-chord-pads">
                {diatonicChords.map((c, i) => (
                  <button
                    key={i}
                    className="st-chord-pad"
                    onMouseDown={() => playChord(c.midis)}
                    onMouseUp={() => releaseChord(c.midis)}
                    onMouseLeave={() => releaseChord(c.midis)}
                  >
                    <span className="st-pad-roman">{c.roman}</span>
                    <span className="st-pad-name">{c.name}</span>
                  </button>
                ))}
              </div>

              {/* ── Saved chord memory ── */}
              <div className="st-saved-head">
                <div className="st-chord-pads-lbl">
                  Saved chords
                  <span className="st-chord-pads-hint">— your custom library, grouped by song</span>
                </div>
                <button
                  className="st-saved-add"
                  onClick={openSaveDialog}
                  title="Save the currently held / last played notes as a chord"
                >+ Save chord</button>
              </div>

              <div className="st-saved-filter">
                <span className="st-saved-filter-lbl">Song:</span>
                <select
                  className="st-sel"
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                >
                  <option value="All">All ({savedChords.length})</option>
                  {savedCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat} ({savedChords.filter(c => c.category === cat).length})
                    </option>
                  ))}
                  {savedChords.some(c => !c.category) && (
                    <option value="Uncategorized">
                      Uncategorized ({savedChords.filter(c => !c.category).length})
                    </option>
                  )}
                </select>
              </div>

              {showSaveDialog && (
                <div className="st-saved-dialog">
                  <div className="st-saved-dialog-title">
                    {editingEntryId ? 'Edit chord entry' : `Save chord${capturedChords.length !== 1 ? 's' : ''}`}
                    <span className="st-saved-dialog-hint">
                      {editingEntryId
                        ? '— rename, recategorize, or add / remove chords below'
                        : '— capture as many as you want, then save them together'}
                    </span>
                  </div>
                  <input
                    className="st-sel st-saved-input"
                    placeholder="Name (e.g. Verse progression, Cmaj7, Chorus)"
                    value={saveChordName}
                    onChange={e => setSaveChordName(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="st-sel st-saved-input"
                    placeholder="Song / category (e.g. Amazing Grace)"
                    value={saveChordCategory}
                    onChange={e => setSaveChordCategory(e.target.value)}
                    list="st-saved-category-list"
                  />
                  <datalist id="st-saved-category-list">
                    {savedCategories.map(cat => <option key={cat} value={cat} />)}
                  </datalist>

                  {/* Arming mode shows a prominent "play now" preview;
                      idle mode shows quieter "currently playing" status. */}
                  {armingCapture ? (
                    <div className="st-saved-dialog-arming">
                      <div className="st-saved-dialog-arming-head">
                        🎹 Play a chord on the piano…
                      </div>
                      <div className="st-saved-dialog-arming-notes">
                        {(() => {
                          const held = Array.from(activeNotes);
                          const notes = (held.length > 0 ? held : lastCapturedRef.current)
                            .slice().sort((a, b) => a - b);
                          return notes.length === 0
                            ? <span className="st-saved-dialog-empty">waiting for notes…</span>
                            : notes.map(m => midiToName(m)).join(' · ');
                        })()}
                      </div>
                      <div className="st-saved-dialog-arming-hint">
                        Hold the keys you want, then click <b>Capture</b>. You can use the
                        keyboard, click piano keys, or hit a chord pad.
                      </div>
                    </div>
                  ) : (
                    <div className="st-saved-dialog-preview">
                      Currently playing: {(() => {
                        const held = Array.from(activeNotes);
                        const notes = held.slice().sort((a, b) => a - b);
                        return notes.length === 0
                          ? <span className="st-saved-dialog-empty">nothing — click “+ Add chord” to capture one</span>
                          : notes.map(m => midiToName(m)).join(' · ');
                      })()}
                    </div>
                  )}

                  {/* List of chords captured so far */}
                  {capturedChords.length > 0 && (
                    <div className="st-saved-dialog-list">
                      <div className="st-saved-dialog-list-head">
                        {capturedChords.length} chord{capturedChords.length !== 1 ? 's' : ''} captured
                      </div>
                      {capturedChords.map((c, idx) => (
                        <div key={c.id} className="st-saved-dialog-row">
                          <span className="st-saved-dialog-row-idx">{idx + 1}</span>
                          <button
                            type="button"
                            className="st-saved-dialog-row-play"
                            onMouseDown={() => previewCapturedChord(c.notes)}
                            onMouseUp={() => releaseCapturedChord(c.notes)}
                            onMouseLeave={() => releaseCapturedChord(c.notes)}
                            title="Hold to preview"
                          >
                            ▶ {c.notes.map(m => midiToNoteName(m)).join(' · ')}
                          </button>
                          <input
                            className="st-saved-dialog-row-label"
                            placeholder="label (I, IV, V…)"
                            value={c.label}
                            onChange={e => updateCapturedLabel(c.id, e.target.value)}
                          />
                          <button
                            type="button"
                            className="st-saved-dialog-row-del"
                            onClick={() => removeCapturedChord(c.id)}
                            title="Remove"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="st-saved-dialog-actions">
                    {armingCapture ? (
                      <>
                        <button className="st-saved-cancel" onClick={cancelArmCapture}>
                          Cancel
                        </button>
                        <button
                          className="st-saved-capture"
                          onClick={commitArmedCapture}
                          disabled={activeNotes.size === 0 && lastCapturedRef.current.length === 0}
                          title="Save the notes you're holding right now"
                        >
                          ✓ Capture chord
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="st-saved-cancel" onClick={cancelSaveDialog}>
                          Cancel
                        </button>
                        <button
                          className="st-saved-add-chord"
                          onClick={armCapture}
                          title="Start capturing — play a chord on the piano"
                        >+ Add chord</button>
                        <button
                          className="st-saved-confirm"
                          onClick={confirmSaveChord}
                          disabled={capturedChords.length === 0}
                        >
                          {editingEntryId ? '✓ Update' : '💾 Save'}
                          {capturedChords.length > 0 ? ` (${capturedChords.length})` : ''}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {visibleSavedChords.length === 0 ? (
                <div className="st-saved-empty">
                  {savedChords.length === 0
                    ? 'No saved chords yet. Play some notes, then click “+ Save chord”.'
                    : 'No chords in this category.'}
                </div>
              ) : (
                <div className="st-saved-groups">
                  {visibleSavedChords.map(entry => {
                    const chordList = Array.isArray(entry.chords) && entry.chords.length
                      ? entry.chords
                      : (Array.isArray(entry.notes) && entry.notes.length
                          ? [{ id: entry.id + '-0', notes: entry.notes }]
                          : []);
                    const entryKey = entryKeyById[entry.id];
                    const entryHeld = activePadIds.has('entry:' + entry.id);
                    return (
                      <div key={entry.id} className={`st-saved-group ${entryHeld ? 'is-held' : ''}`}>
                        <div className="st-saved-group-head">
                          {entryKey && (
                            <span
                              className="st-saved-group-key"
                              title={`Press ${entryKey.toUpperCase()} to play every chord in this entry together`}
                            >{entryKey}</span>
                          )}
                          <div className="st-saved-group-meta">
                            <span className="st-saved-name">{entry.name}</span>
                            {entry.category && (
                              <span className="st-saved-cat">🎵 {entry.category}</span>
                            )}
                          </div>
                          <button
                            className="st-saved-edit"
                            onClick={() => openEditDialog(entry)}
                            title="Edit name, category, and chords"
                          >✎</button>
                          <button
                            className={`st-saved-del ${armedDeleteId === entry.id ? 'armed' : ''}`}
                            onClick={() => {
                              if (armedDeleteId === entry.id) deleteSavedChord(entry.id);
                              else setArmedDeleteId(entry.id);
                            }}
                            onMouseLeave={() => armedDeleteId === entry.id && setArmedDeleteId(null)}
                            title={armedDeleteId === entry.id ? 'Click again to confirm' : 'Delete'}
                          >
                            {armedDeleteId === entry.id ? '✓' : '✕'}
                          </button>
                        </div>

                        <div className="st-saved-pads">
                          {chordList.map((ch, idx) => {
                            const padId = ch.id || `${entry.id}-${idx}`;
                            const isMulti = chordList.length > 1;
                            // A pad lights up when its own chord is being held
                            // OR when the entry-level key is being held.
                            const isActive = activePadIds.has(padId) || entryHeld;
                            return (
                              <button
                                key={padId}
                                className={`st-chord-pad st-saved-pad ${isActive ? 'is-active' : ''}`}
                                onMouseDown={() => pressPad(padId, ch.notes)}
                                onMouseUp={() => releasePad(padId, ch.notes)}
                                onMouseLeave={() => activePadIds.has(padId) && releasePad(padId, ch.notes)}
                                title={`Hold to play · ${ch.notes.map(m => midiToName(m)).join(' · ')}`}
                              >
                                <span className="st-pad-roman">
                                  {ch.label || (isMulti ? String(idx + 1) : entry.name)}
                                </span>
                                <span className="st-pad-name">
                                  {ch.notes.map(m => midiToNoteName(m)).join(' · ')}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Record panel */}
            <div className="st-panel st-record-panel">
              <div className="st-panel-title">🎙 Record</div>

              {!pending ? (
                <>
                  <div className="st-record-controls">
                    {isRecording ? (
                      <button className="st-rec-btn stop" onClick={stopRecording}>
                        ⏹ Stop ({fmtTime(elapsed)})
                      </button>
                    ) : (
                      <button className="st-rec-btn" onClick={startRecording}>
                        🎙 Start recording
                      </button>
                    )}
                  </div>
                  <div className="st-record-hint">
                    Captures everything you play. When you stop, save the take
                    straight onto one of your songs.
                  </div>
                </>
              ) : (
                <div className="st-save-box">
                  <div className="st-save-title">
                    ✓ Take captured · {fmtTime(pending.duration)}
                  </div>
                  <input
                    className="st-sel st-save-label"
                    placeholder="Label (e.g. Verse idea, chord sketch)"
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                  />
                  <div className="st-save-songs-lbl">Save to which song?</div>
                  {songs.length === 0 ? (
                    <div className="st-save-empty">
                      No songs yet — create one in the Songs tab first.
                    </div>
                  ) : (
                    <div className="st-save-songs">
                      {songs.map(s => (
                        <button
                          key={s.id}
                          className="st-save-song"
                          onClick={() => saveToSong(s.id)}
                        >
                          🎵 {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="st-rec-stems-btn"
                    onClick={saveToStemsLibrary}
                    title="Save to Stems Library"
                  >
                    💾 Save to Stems Library
                  </button>
                  <button className="st-discard" onClick={() => { setPending(null); setSaveLabel(''); }}>
                    Discard take
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
    </WorshipShell>
  );
}
