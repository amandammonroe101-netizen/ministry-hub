import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './StyleGuide.css';

/* ─────────────────────────────────────────────────────────────
   Style Guide — single source of truth for church brand
   Naming: .stg-*  (Songs already uses .sg-*)
   Persistence: localStorage key "web:style-guide" (single object)
   Accent: var(--accent-rose, #fb7185)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:style-guide';

const COLOR_ROLES = [
  { key: 'primary',    label: 'Primary'    },
  { key: 'secondary',  label: 'Secondary'  },
  { key: 'accent',     label: 'Accent'     },
  { key: 'neutral',    label: 'Neutral'    },
  { key: 'success',    label: 'Success'    },
  { key: 'warning',    label: 'Warning'    },
  { key: 'error',      label: 'Error'      },
  { key: 'text',       label: 'Text'       },
  { key: 'background', label: 'Background' },
  { key: 'other',      label: 'Other'      },
];

const FONT_USAGES = [
  { key: 'headings',    label: 'Headings'    },
  { key: 'subheadings', label: 'Subheadings' },
  { key: 'body',        label: 'Body'        },
  { key: 'caption',     label: 'Caption'     },
  { key: 'special',     label: 'Special'     },
  { key: 'other',       label: 'Other'       },
];

const SECTIONS = [
  { key: 'colors',   icon: '🎨', label: 'Color Palette'  },
  { key: 'fonts',    icon: '🔤', label: 'Typography'     },
  { key: 'voice',    icon: '🗣',  label: 'Voice & Tone'   },
  { key: 'imagery',  icon: '📸', label: 'Imagery'        },
  { key: 'logo',     icon: '🎭', label: 'Logo & Marks'   },
  { key: 'links',    icon: '🔗', label: 'Links'          },
  { key: 'notes',    icon: '📝', label: 'Notes'          },
];

function makeId(prefix = 'stg') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultGuide() {
  const now = Date.now();
  return {
    brandName: 'First Community Church',
    tagline: 'Real people. Real faith.',
    colors: [
      { id: makeId('c'), name: 'Rose',   hex: '#fb7185', role: 'primary'    },
      { id: makeId('c'), name: 'Purple', hex: '#a78bfa', role: 'secondary'  },
      { id: makeId('c'), name: 'Amber',  hex: '#fbbf24', role: 'accent'     },
      { id: makeId('c'), name: 'Teal',   hex: '#2dd4bf', role: 'accent'     },
      { id: makeId('c'), name: 'Pink',   hex: '#f472b6', role: 'accent'     },
      { id: makeId('c'), name: 'Blue',   hex: '#60a5fa', role: 'accent'     },
      { id: makeId('c'), name: 'Green',  hex: '#6ee7b7', role: 'success'    },
      { id: makeId('c'), name: 'Deep',   hex: '#0b0a1a', role: 'background' },
      { id: makeId('c'), name: 'Snow',   hex: '#ffffff', role: 'text'       },
    ],
    fonts: [
      {
        id: makeId('f'),
        name: 'Plus Jakarta Sans',
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        weight: '400 / 600 / 800',
        usage: 'body',
      },
      {
        id: makeId('f'),
        name: 'Cormorant Garamond',
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        weight: '500 / 700',
        usage: 'headings',
      },
    ],
    voice: {
      tone: 'Warm, welcoming, plainspoken. We talk to people, not at them.',
      do: [
        'Use second person — "you" and "we"',
        'Keep sentences short and clear',
        'Lead with hospitality, not hierarchy',
      ],
      dont: [
        'Avoid insider church jargon without context',
        'Don’t shout in ALL CAPS',
        'Skip clichés like "doing life together"',
      ],
      examples: [
        {
          id: makeId('ex'),
          label: 'Welcoming a first-time guest',
          good: 'Glad you’re here. Coffee’s on us — grab a cup and we’ll save you a seat.',
          bad: 'WELCOME, BELOVED PILGRIM, TO OUR SACRED ASSEMBLY!!!',
        },
      ],
    },
    imagery: {
      standards:
        'Natural light. Real congregation members (with releases). Candid over posed. Avoid stock imagery whenever possible.',
      aspectRatios: ['16:9', '1:1', '4:5'],
      formatNotes:
        'WebP for web, JPG fallback. PNG for graphics with transparency. SVG for logos and icons.',
      referenceUrls: [],
    },
    logo: {
      primaryUrl: '',
      clearSpaceNotes:
        'Maintain a minimum clear space equal to the height of the wordmark’s capital letter on all sides.',
      minSizeNotes:
        'Never display the primary logo smaller than 24px tall on screen or 0.5" tall in print.',
      placementRules:
        'Preferred placement is top-left or center. Place on solid backgrounds with sufficient contrast.',
      misuseExamples:
        'Do not stretch, recolor, add drop shadows, place on busy photos, or rotate the logo.',
    },
    links: [
      { id: makeId('l'), label: 'Website',   url: 'https://', icon: '🌐' },
      { id: makeId('l'), label: 'Instagram', url: 'https://', icon: '📷' },
      { id: makeId('l'), label: 'YouTube',   url: 'https://', icon: '▶️' },
    ],
    notes: '',
    updatedAt: now,
  };
}

function loadGuide() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGuide();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultGuide();
    // Merge against defaults to backfill missing keys
    const d = defaultGuide();
    return {
      ...d,
      ...parsed,
      voice: { ...d.voice, ...(parsed.voice || {}) },
      imagery: { ...d.imagery, ...(parsed.imagery || {}) },
      logo: { ...d.logo, ...(parsed.logo || {}) },
      colors: Array.isArray(parsed.colors) ? parsed.colors : d.colors,
      fonts: Array.isArray(parsed.fonts) ? parsed.fonts : d.fonts,
      links: Array.isArray(parsed.links) ? parsed.links : d.links,
    };
  } catch {
    return defaultGuide();
  }
}

function saveGuide(guide) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guide));
  } catch {
    /* quota ignored */
  }
}

function formatTimestamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Decide whether a swatch's foreground should be light or dark.
   Used so the hex code on top of the swatch is always readable. */
function isLightColor(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const v = hex.replace('#', '').trim();
  if (v.length !== 3 && v.length !== 6) return false;
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return false;
  // Perceived luminance
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.65;
}

/* ─── Collapsible section wrapper ──────────────────────────── */
function Section({ icon, label, sectionKey, expanded, onToggle, count, children }) {
  return (
    <section className={`stg-sec${expanded ? ' open' : ' closed'}`} data-section={sectionKey}>
      <button
        type="button"
        className="stg-sec-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="stg-sec-icon" aria-hidden="true">{icon}</span>
        <span className="stg-sec-label">{label}</span>
        {typeof count === 'number' && (
          <span className="stg-sec-count">{count}</span>
        )}
        <span className="stg-sec-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div className="stg-sec-body">{children}</div>}
    </section>
  );
}

/* ─── A single color swatch tile ───────────────────────────── */
function ColorSwatch({ color, onChange, onRemove, onCopy }) {
  const safeHex = (color.hex || '').trim();
  const valid = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(safeHex);
  const displayBg = valid ? safeHex : 'transparent';
  const light = isLightColor(safeHex);

  return (
    <div className="stg-swatch">
      <div
        className={`stg-swatch-color${light ? ' light' : ''}${valid ? '' : ' invalid'}`}
        style={{ background: displayBg }}
        title={valid ? safeHex : 'Invalid hex'}
      >
        {!valid && <span className="stg-swatch-warn">?</span>}
        <button
          type="button"
          className="stg-swatch-x"
          onClick={onRemove}
          title="Remove color"
          aria-label="Remove color"
        >
          ✕
        </button>
      </div>
      <input
        className="stg-inp stg-swatch-name"
        value={color.name || ''}
        placeholder="Name"
        onChange={e => onChange({ ...color, name: e.target.value })}
      />
      <button
        type="button"
        className="stg-swatch-hex"
        title="Click to copy"
        onClick={() => onCopy(safeHex)}
      >
        <input
          className="stg-swatch-hex-inp"
          value={color.hex || ''}
          onChange={e => onChange({ ...color, hex: e.target.value })}
          onClick={e => e.stopPropagation()}
          spellCheck={false}
          placeholder="#000000"
        />
        <span className="stg-swatch-hex-copy" aria-hidden="true">⧉</span>
      </button>
      <select
        className="stg-inp stg-swatch-role"
        value={color.role || 'other'}
        onChange={e => onChange({ ...color, role: e.target.value })}
      >
        {COLOR_ROLES.map(r => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── A single font row ────────────────────────────────────── */
function FontRow({ font, onChange, onRemove }) {
  const family = font.fontFamily && font.fontFamily.trim()
    ? font.fontFamily
    : font.name || 'inherit';
  const weight = (font.weight || '').toString().match(/\d+/)?.[0] || '400';

  return (
    <div className="stg-font-row">
      <div className="stg-font-fields">
        <input
          className="stg-inp"
          placeholder="Name (e.g. Plus Jakarta Sans)"
          value={font.name || ''}
          onChange={e => onChange({ ...font, name: e.target.value })}
        />
        <input
          className="stg-inp"
          placeholder="CSS font-family (e.g. 'Plus Jakarta Sans', sans-serif)"
          value={font.fontFamily || ''}
          onChange={e => onChange({ ...font, fontFamily: e.target.value })}
          spellCheck={false}
        />
        <input
          className="stg-inp stg-font-weight"
          placeholder="Weight"
          value={font.weight || ''}
          onChange={e => onChange({ ...font, weight: e.target.value })}
        />
        <select
          className="stg-inp stg-font-usage"
          value={font.usage || 'other'}
          onChange={e => onChange({ ...font, usage: e.target.value })}
        >
          {FONT_USAGES.map(u => (
            <option key={u.key} value={u.key}>{u.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="stg-btn stg-btn-ghost stg-btn-sm"
          onClick={onRemove}
          title="Remove font"
        >
          ✕
        </button>
      </div>
      <div
        className="stg-font-preview"
        style={{ fontFamily: family, fontWeight: weight }}
      >
        The quick brown fox jumps over the lazy dog
      </div>
    </div>
  );
}

/* ─── Chip-input (for Do, Don't, aspect ratios, ref URLs) ──── */
function ChipInput({ items, onChange, placeholder, variant }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(items) ? items : [];

  const add = (val) => {
    const v = (val ?? draft).trim();
    if (!v) return;
    if (list.some(x => x.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...list, v]);
    setDraft('');
  };
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));

  return (
    <div className={`stg-chip-input stg-chip-${variant || 'neutral'}`}>
      <div className="stg-chip-list">
        {list.map((t, i) => (
          <span key={i} className={`stg-chip stg-chip-${variant || 'neutral'}-item`}>
            {t}
            <button
              type="button"
              className="stg-chip-x"
              onClick={() => remove(i)}
              title="Remove"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className="stg-chip-inp"
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            else if (e.key === 'Backspace' && draft === '' && list.length > 0) {
              e.preventDefault();
              remove(list.length - 1);
            }
          }}
          onBlur={() => add()}
        />
      </div>
    </div>
  );
}

/* ─── Toast ────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return <div className="stg-toast" role="status">{message}</div>;
}

/* ─── Main component ───────────────────────────────────────── */
export default function StyleGuide() {
  /* Stored as a single object doc (not an array). When the user has nothing
     yet, useUserStoreKey returns null → fall back to the default skeleton. */
  const [rawGuide, setRawGuide] = useUserStoreKey('web:style-guide', null);
  const guide = useMemo(() => rawGuide || defaultGuide(), [rawGuide]);
  const setGuide = useCallback((next) => {
    /* Accepts a value OR an updater fn, like setState. */
    if (typeof next === 'function') {
      setRawGuide((prev) => next(prev || defaultGuide()));
    } else {
      setRawGuide(next);
    }
  }, [setRawGuide]);

  const [expanded, setExpanded] = useState(() =>
    SECTIONS.reduce((acc, s) => ({ ...acc, [s.key]: true }), {})
  );
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ── Toast lifecycle ─────────────────────────────────────── */
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 1800);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  /* ── Mutators ────────────────────────────────────────────── */
  const update = useCallback((patch) => {
    setGuide(g => ({ ...g, ...patch, updatedAt: Date.now() }));
  }, []);

  const updateNested = useCallback((key, patch) => {
    setGuide(g => ({
      ...g,
      [key]: { ...(g[key] || {}), ...patch },
      updatedAt: Date.now(),
    }));
  }, []);

  const toggleSection = useCallback((key) => {
    setExpanded(e => ({ ...e, [key]: !e[key] }));
  }, []);

  /* ── Color helpers ───────────────────────────────────────── */
  const addColor = useCallback(() => {
    setGuide(g => ({
      ...g,
      colors: [
        ...(g.colors || []),
        { id: makeId('c'), name: 'New color', hex: '#888888', role: 'other' },
      ],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateColor = useCallback((id, next) => {
    setGuide(g => ({
      ...g,
      colors: (g.colors || []).map(c => (c.id === id ? next : c)),
      updatedAt: Date.now(),
    }));
  }, []);

  const removeColor = useCallback((id) => {
    setGuide(g => ({
      ...g,
      colors: (g.colors || []).filter(c => c.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  const copyHex = useCallback((hex) => {
    if (!hex) return;
    const text = hex.startsWith('#') ? hex : `#${hex}`;
    const finalize = () => showToast(`Copied ${text.toUpperCase()}`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(finalize).catch(() => {
        // Fallback for environments without clipboard permission
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          finalize();
        } catch {
          showToast('Could not copy');
        }
      });
    } else {
      finalize();
    }
  }, [showToast]);

  /* ── Font helpers ────────────────────────────────────────── */
  const addFont = useCallback(() => {
    setGuide(g => ({
      ...g,
      fonts: [
        ...(g.fonts || []),
        {
          id: makeId('f'),
          name: 'New font',
          fontFamily: "system-ui, sans-serif",
          weight: '400',
          usage: 'other',
        },
      ],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateFont = useCallback((id, next) => {
    setGuide(g => ({
      ...g,
      fonts: (g.fonts || []).map(f => (f.id === id ? next : f)),
      updatedAt: Date.now(),
    }));
  }, []);

  const removeFont = useCallback((id) => {
    setGuide(g => ({
      ...g,
      fonts: (g.fonts || []).filter(f => f.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  /* ── Voice example helpers ───────────────────────────────── */
  const addExample = useCallback(() => {
    setGuide(g => ({
      ...g,
      voice: {
        ...(g.voice || {}),
        examples: [
          ...((g.voice && g.voice.examples) || []),
          { id: makeId('ex'), label: '', good: '', bad: '' },
        ],
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const updateExample = useCallback((id, patch) => {
    setGuide(g => ({
      ...g,
      voice: {
        ...(g.voice || {}),
        examples: ((g.voice && g.voice.examples) || []).map(ex =>
          ex.id === id ? { ...ex, ...patch } : ex
        ),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const removeExample = useCallback((id) => {
    setGuide(g => ({
      ...g,
      voice: {
        ...(g.voice || {}),
        examples: ((g.voice && g.voice.examples) || []).filter(ex => ex.id !== id),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  /* ── Logo upload ────────────────────────────────────────── */
  const handleLogoUpload = useCallback((file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Warning: logo is larger than 2 MB');
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || '');
      updateNested('logo', { primaryUrl: dataUrl });
    };
    reader.onerror = () => showToast('Failed to read file');
    reader.readAsDataURL(file);
  }, [showToast, updateNested]);

  const handleLogoClear = useCallback(() => {
    updateNested('logo', { primaryUrl: '' });
  }, [updateNested]);

  /* ── Link helpers ───────────────────────────────────────── */
  const addLink = useCallback(() => {
    setGuide(g => ({
      ...g,
      links: [
        ...(g.links || []),
        { id: makeId('l'), label: '', url: 'https://', icon: '🔗' },
      ],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateLink = useCallback((id, patch) => {
    setGuide(g => ({
      ...g,
      links: (g.links || []).map(l => (l.id === id ? { ...l, ...patch } : l)),
      updatedAt: Date.now(),
    }));
  }, []);

  const removeLink = useCallback((id) => {
    setGuide(g => ({
      ...g,
      links: (g.links || []).filter(l => l.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  /* ── Export / Import / Print ─────────────────────────────── */
  const handleExport = useCallback(() => {
    const json = JSON.stringify(guide, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `style-guide-${todayStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported style guide');
  }, [guide, showToast]);

  const handleImportFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ''));
        if (!parsed || typeof parsed !== 'object') {
          showToast('Import failed — invalid JSON');
          return;
        }
        const d = defaultGuide();
        const merged = {
          ...d,
          ...parsed,
          voice: { ...d.voice, ...(parsed.voice || {}) },
          imagery: { ...d.imagery, ...(parsed.imagery || {}) },
          logo: { ...d.logo, ...(parsed.logo || {}) },
          colors: Array.isArray(parsed.colors) ? parsed.colors : d.colors,
          fonts: Array.isArray(parsed.fonts) ? parsed.fonts : d.fonts,
          links: Array.isArray(parsed.links) ? parsed.links : d.links,
          updatedAt: Date.now(),
        };
        setGuide(merged);
        showToast('Imported style guide');
      } catch {
        showToast('Import failed — invalid JSON');
      }
    };
    reader.onerror = () => showToast('Failed to read file');
    reader.readAsText(file);
  }, [showToast]);

  const handleImportClick = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handlePrint = useCallback(() => {
    // Ensure all sections are expanded so print captures everything.
    setExpanded(SECTIONS.reduce((acc, s) => ({ ...acc, [s.key]: true }), {}));
    // Defer to next frame to let layout update before opening print dialog.
    setTimeout(() => window.print(), 100);
  }, []);

  /* ── Derived counts ──────────────────────────────────────── */
  const counts = useMemo(() => ({
    colors: (guide.colors || []).length,
    fonts: (guide.fonts || []).length,
    voice: ((guide.voice && guide.voice.examples) || []).length,
    imagery: (guide.imagery && guide.imagery.aspectRatios || []).length,
    logo: guide.logo && guide.logo.primaryUrl ? 1 : 0,
    links: (guide.links || []).length,
    notes: (guide.notes || '').length > 0 ? 1 : 0,
  }), [guide]);

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <WebsiteShell
      title="Style Guide"
      icon="🎨"
      subtitle="The church's brand style guide — color palette, typography, voice & tone — kept consistent with the website."
      fullBleed
    >
    <div className="stg-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="stg-main">
        {/* hidden file input for Import */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            handleImportFile(f);
            // Reset so re-importing the same file works.
            e.target.value = '';
          }}
        />

        {/* Page header */}
        <header className="stg-page-head">
          <div className="stg-page-head-left">
            <div className="stg-eyebrow">Website Ministry · Brand</div>
            <h1 className="stg-page-title">Style Guide</h1>
            <div className="stg-page-sub">
              Single source of truth for the church’s brand — colors, fonts, voice, imagery, logo.
            </div>
          </div>
          <div className="stg-page-head-actions">
            <button className="stg-btn stg-btn-ghost" onClick={handleImportClick} title="Import JSON">
              Import
            </button>
            <button className="stg-btn stg-btn-ghost" onClick={handleExport} title="Download JSON">
              Export
            </button>
            <button className="stg-btn stg-btn-accent" onClick={handlePrint} title="Print / Save PDF">
              Print / View
            </button>
          </div>
        </header>

        {/* Brand identity header — always visible */}
        <section className="stg-brand">
          <label className="stg-field">
            <span className="stg-label">Brand name</span>
            <input
              className="stg-inp stg-inp-lg stg-brand-name"
              placeholder="e.g. First Community Church"
              value={guide.brandName || ''}
              onChange={e => update({ brandName: e.target.value })}
            />
          </label>
          <label className="stg-field">
            <span className="stg-label">Tagline</span>
            <input
              className="stg-inp"
              placeholder="e.g. Real people. Real faith."
              value={guide.tagline || ''}
              onChange={e => update({ tagline: e.target.value })}
            />
          </label>
        </section>

        {/* Color palette */}
        <Section
          icon="🎨"
          label="Color Palette"
          sectionKey="colors"
          expanded={expanded.colors}
          onToggle={() => toggleSection('colors')}
          count={counts.colors}
        >
          <div className="stg-swatch-grid">
            {(guide.colors || []).map(c => (
              <ColorSwatch
                key={c.id}
                color={c}
                onChange={(next) => updateColor(c.id, next)}
                onRemove={() => removeColor(c.id)}
                onCopy={copyHex}
              />
            ))}
            <button
              type="button"
              className="stg-swatch stg-swatch-add"
              onClick={addColor}
              title="Add a color"
            >
              <span className="stg-swatch-add-plus">+</span>
              <span className="stg-swatch-add-label">Add color</span>
            </button>
          </div>
          <p className="stg-hint">
            Click a hex code to copy it. Type into the hex box to live-update the swatch.
          </p>
        </Section>

        {/* Typography */}
        <Section
          icon="🔤"
          label="Typography"
          sectionKey="fonts"
          expanded={expanded.fonts}
          onToggle={() => toggleSection('fonts')}
          count={counts.fonts}
        >
          <div className="stg-font-list">
            {(guide.fonts || []).map(f => (
              <FontRow
                key={f.id}
                font={f}
                onChange={(next) => updateFont(f.id, next)}
                onRemove={() => removeFont(f.id)}
              />
            ))}
          </div>
          <button className="stg-btn stg-btn-ghost stg-btn-add" onClick={addFont}>
            + Add font
          </button>
        </Section>

        {/* Voice & tone */}
        <Section
          icon="🗣"
          label="Voice & Tone"
          sectionKey="voice"
          expanded={expanded.voice}
          onToggle={() => toggleSection('voice')}
        >
          <label className="stg-field">
            <span className="stg-label">Tone description</span>
            <textarea
              className="stg-inp stg-textarea"
              placeholder="Warm, welcoming, plainspoken…"
              rows={3}
              value={guide.voice?.tone || ''}
              onChange={e => updateNested('voice', { tone: e.target.value })}
            />
          </label>

          <div className="stg-voice-grid">
            <div className="stg-field">
              <span className="stg-label stg-label-do">Do</span>
              <ChipInput
                items={guide.voice?.do || []}
                onChange={(items) => updateNested('voice', { do: items })}
                placeholder="Add a do — press Enter"
                variant="good"
              />
            </div>
            <div className="stg-field">
              <span className="stg-label stg-label-dont">Don’t</span>
              <ChipInput
                items={guide.voice?.dont || []}
                onChange={(items) => updateNested('voice', { dont: items })}
                placeholder="Add a don’t — press Enter"
                variant="bad"
              />
            </div>
          </div>

          <div className="stg-field">
            <span className="stg-label">Examples</span>
            <div className="stg-examples">
              {((guide.voice && guide.voice.examples) || []).map(ex => (
                <div key={ex.id} className="stg-example">
                  <div className="stg-example-head">
                    <input
                      className="stg-inp stg-example-label"
                      placeholder="Situation label (e.g. Welcoming a guest)"
                      value={ex.label || ''}
                      onChange={e => updateExample(ex.id, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      className="stg-btn stg-btn-ghost stg-btn-sm"
                      onClick={() => removeExample(ex.id)}
                      title="Remove example"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="stg-example-body">
                    <div className="stg-example-cell stg-example-good">
                      <span className="stg-example-tag stg-example-tag-good">Good</span>
                      <textarea
                        className="stg-inp stg-textarea"
                        rows={2}
                        placeholder="A good example…"
                        value={ex.good || ''}
                        onChange={e => updateExample(ex.id, { good: e.target.value })}
                      />
                    </div>
                    <div className="stg-example-cell stg-example-bad">
                      <span className="stg-example-tag stg-example-tag-bad">Bad</span>
                      <textarea
                        className="stg-inp stg-textarea"
                        rows={2}
                        placeholder="What we don’t do…"
                        value={ex.bad || ''}
                        onChange={e => updateExample(ex.id, { bad: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="stg-btn stg-btn-ghost stg-btn-add"
                onClick={addExample}
              >
                + Add example
              </button>
            </div>
          </div>
        </Section>

        {/* Imagery */}
        <Section
          icon="📸"
          label="Imagery"
          sectionKey="imagery"
          expanded={expanded.imagery}
          onToggle={() => toggleSection('imagery')}
        >
          <label className="stg-field">
            <span className="stg-label">Image standards</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={3}
              placeholder="Natural light, real members, candid over posed…"
              value={guide.imagery?.standards || ''}
              onChange={e => updateNested('imagery', { standards: e.target.value })}
            />
          </label>

          <div className="stg-field">
            <span className="stg-label">Aspect ratios</span>
            <ChipInput
              items={guide.imagery?.aspectRatios || []}
              onChange={(items) => updateNested('imagery', { aspectRatios: items })}
              placeholder="e.g. 16:9, 1:1, 4:5"
              variant="neutral"
            />
          </div>

          <label className="stg-field">
            <span className="stg-label">Format notes</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={2}
              placeholder="WebP for web, JPG fallback, SVG for icons…"
              value={guide.imagery?.formatNotes || ''}
              onChange={e => updateNested('imagery', { formatNotes: e.target.value })}
            />
          </label>

          <div className="stg-field">
            <span className="stg-label">Reference URLs</span>
            <ChipInput
              items={guide.imagery?.referenceUrls || []}
              onChange={(items) => updateNested('imagery', { referenceUrls: items })}
              placeholder="Paste a URL — press Enter"
              variant="neutral"
            />
          </div>
        </Section>

        {/* Logo & marks */}
        <Section
          icon="🎭"
          label="Logo & Marks"
          sectionKey="logo"
          expanded={expanded.logo}
          onToggle={() => toggleSection('logo')}
        >
          <div className="stg-logo-row">
            <div className="stg-logo-preview" aria-label="Logo preview">
              {guide.logo?.primaryUrl ? (
                <img
                  src={guide.logo.primaryUrl}
                  alt="Primary logo"
                  className="stg-logo-img"
                />
              ) : (
                <span className="stg-logo-empty">No logo uploaded</span>
              )}
            </div>
            <div className="stg-logo-actions">
              <label className="stg-btn stg-btn-ghost">
                Upload logo
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    handleLogoUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {guide.logo?.primaryUrl && (
                <button
                  type="button"
                  className="stg-btn stg-btn-ghost"
                  onClick={handleLogoClear}
                >
                  Clear logo
                </button>
              )}
            </div>
          </div>

          <label className="stg-field">
            <span className="stg-label">Clear space</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={2}
              placeholder="Maintain X clear space on all sides…"
              value={guide.logo?.clearSpaceNotes || ''}
              onChange={e => updateNested('logo', { clearSpaceNotes: e.target.value })}
            />
          </label>

          <label className="stg-field">
            <span className="stg-label">Minimum size</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={2}
              placeholder="Never display smaller than…"
              value={guide.logo?.minSizeNotes || ''}
              onChange={e => updateNested('logo', { minSizeNotes: e.target.value })}
            />
          </label>

          <label className="stg-field">
            <span className="stg-label">Placement rules</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={2}
              placeholder="Where the logo should and shouldn’t go…"
              value={guide.logo?.placementRules || ''}
              onChange={e => updateNested('logo', { placementRules: e.target.value })}
            />
          </label>

          <label className="stg-field">
            <span className="stg-label stg-label-dont">Misuse examples</span>
            <textarea
              className="stg-inp stg-textarea"
              rows={2}
              placeholder="Don’t stretch, recolor, rotate, or shadow…"
              value={guide.logo?.misuseExamples || ''}
              onChange={e => updateNested('logo', { misuseExamples: e.target.value })}
            />
          </label>
        </Section>

        {/* Links */}
        <Section
          icon="🔗"
          label="Links"
          sectionKey="links"
          expanded={expanded.links}
          onToggle={() => toggleSection('links')}
          count={counts.links}
        >
          <div className="stg-link-list">
            {(guide.links || []).map(l => (
              <div key={l.id} className="stg-link-row">
                <input
                  className="stg-inp stg-link-icon"
                  placeholder="🔗"
                  value={l.icon || ''}
                  onChange={e => updateLink(l.id, { icon: e.target.value })}
                  maxLength={4}
                />
                <input
                  className="stg-inp stg-link-label"
                  placeholder="Label (e.g. Instagram)"
                  value={l.label || ''}
                  onChange={e => updateLink(l.id, { label: e.target.value })}
                />
                <input
                  className="stg-inp stg-link-url"
                  placeholder="https://…"
                  value={l.url || ''}
                  onChange={e => updateLink(l.id, { url: e.target.value })}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="stg-btn stg-btn-ghost stg-btn-sm"
                  onClick={() => removeLink(l.id)}
                  title="Remove link"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="stg-btn stg-btn-ghost stg-btn-add" onClick={addLink}>
            + Add link
          </button>
        </Section>

        {/* Notes */}
        <Section
          icon="📝"
          label="Notes"
          sectionKey="notes"
          expanded={expanded.notes}
          onToggle={() => toggleSection('notes')}
        >
          <textarea
            className="stg-inp stg-textarea stg-notes"
            rows={6}
            placeholder="Anything else worth recording — naming conventions, accessibility notes, edge cases…"
            value={guide.notes || ''}
            onChange={e => update({ notes: e.target.value })}
          />
        </Section>

        <footer className="stg-foot">
          <span className="stg-muted">
            Last updated {formatTimestamp(guide.updatedAt)}
          </span>
        </footer>
      </main>

      <Toast message={toast} />
    </div>
    </WebsiteShell>
  );
}
