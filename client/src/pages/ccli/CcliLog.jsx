import { useState, useEffect, useMemo, useRef } from 'react';
import { songService } from '../../services/songService';
import { setlistService } from '../../services/setlistService';
import { useUserStoreKey } from '../../lib/userStore';
import WorshipShell from '../worship/WorshipShell';
import './CcliLog.css';

/* ─────────────────────────────────────────────────────────────
   CCLI Log — performance/play log for CCLI reporting compliance
   Naming: .cc-*
   Persistence: localStorage key 'band:ccli-manual'
   Accent:     var(--accent-purple, #a78bfa)
   ───────────────────────────────────────────────────────────── */

const LS_MANUAL = 'band:ccli-manual';

/* ─── Date helpers ─────────────────────────────────────────────── */
function toISO(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayISO() {
  return toISO(new Date());
}
function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return toISO(d);
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/* Date-range presets */
function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-11
  if (key === 'thisQuarter') {
    const qStart = Math.floor(m / 3) * 3;
    return { from: toISO(new Date(y, qStart, 1)), to: toISO(new Date(y, qStart + 3, 0)) };
  }
  if (key === 'lastQuarter') {
    const qStart = Math.floor(m / 3) * 3 - 3;
    const start = new Date(y, qStart, 1);
    const end   = new Date(y, qStart + 3, 0);
    return { from: toISO(start), to: toISO(end) };
  }
  if (key === 'thisYear') {
    return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) };
  }
  if (key === 'allTime') {
    return { from: '', to: '' };
  }
  if (key === 'last6mo') {
    return { from: sixMonthsAgoISO(), to: todayISO() };
  }
  return { from: '', to: '' };
}

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadManual() {
  try {
    const raw = localStorage.getItem(LS_MANUAL);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveManual(arr) {
  try { localStorage.setItem(LS_MANUAL, JSON.stringify(arr)); } catch {}
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── CSV helpers ──────────────────────────────────────────────── */
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  const header = ['Date', 'Song Title', 'Artist', 'CCLI Number', 'Service', 'Source'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.date,
      r.songTitle,
      r.artist || '',
      r.ccliNumber || '',
      r.service || '',
      r.source,
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/* ─── Song autocomplete ────────────────────────────────────────── */
function SongAutocomplete({ value, onPick, allSongs, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = (value || '').toLowerCase().trim();
  const matches = q
    ? allSongs
        .filter(s =>
          (s.title || '').toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q)
        )
        .slice(0, 8)
    : allSongs.slice(0, 8);

  return (
    <div className="cc-ac" ref={wrap}>
      <input
        className="cc-inp"
        type="text"
        placeholder="Start typing a song title…"
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onPick({ songTitle: e.target.value, songId: null, artist: '' }); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="cc-ac-list">
          {matches.map(s => (
            <button
              key={s.id}
              type="button"
              className="cc-ac-item"
              onClick={() => {
                onPick({ songTitle: s.title, songId: s.id, artist: s.artist || '' });
                setOpen(false);
              }}
            >
              <span className="cc-ac-title">{s.title}</span>
              {s.artist && <span className="cc-ac-artist">· {s.artist}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Manual entry modal ───────────────────────────────────────── */
function ManualEntryModal({ initial, allSongs, onSave, onCancel }) {
  const [date,       setDate]       = useState(initial?.date       || todayISO());
  const [songTitle,  setSongTitle]  = useState(initial?.songTitle  || '');
  const [songId,     setSongId]     = useState(initial?.songId     ?? null);
  const [artist,     setArtist]     = useState(initial?.artist     || '');
  const [ccliNumber, setCcliNumber] = useState(initial?.ccliNumber || '');
  const [service,    setService]    = useState(initial?.service    || '');
  const [notes,      setNotes]      = useState(initial?.notes      || '');
  const [error,      setError]      = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!songTitle.trim()) { setError('Song title is required.'); return; }
    if (!date)             { setError('Date is required.'); return; }
    onSave({
      date,
      songId,
      songTitle:  songTitle.trim(),
      artist:     artist.trim(),
      ccliNumber: ccliNumber.trim(),
      service:    service.trim(),
      notes:      notes.trim(),
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div className="cc-modal-overlay" onClick={onCancel}>
      <form className="cc-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="cc-modal-head">
          <span>{isEdit ? 'Edit Play Entry' : 'Add Manual Play Entry'}</span>
          <button type="button" className="cc-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="cc-modal-body">
          {error && <div className="cc-error">{error}</div>}

          <div className="cc-form-row">
            <div className="cc-field">
              <label className="cc-lbl">Date</label>
              <input
                className="cc-inp"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="cc-field">
              <label className="cc-lbl">Service / context</label>
              <input
                className="cc-inp"
                type="text"
                placeholder="e.g. Sunday Morning, Wednesday Night"
                value={service}
                onChange={e => setService(e.target.value)}
              />
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-lbl">Song</label>
            <SongAutocomplete
              value={songTitle}
              allSongs={allSongs}
              autoFocus
              onPick={({ songTitle: t, songId: id, artist: a }) => {
                setSongTitle(t);
                setSongId(id);
                if (id) setArtist(a || '');
              }}
            />
            <div className="cc-hint">
              Pick from the library or type a title for an "Other" entry.
            </div>
          </div>

          <div className="cc-form-row">
            <div className="cc-field">
              <label className="cc-lbl">Artist</label>
              <input
                className="cc-inp"
                type="text"
                placeholder="Songwriter / artist"
                value={artist}
                onChange={e => setArtist(e.target.value)}
              />
            </div>
            <div className="cc-field">
              <label className="cc-lbl">CCLI Number (optional)</label>
              <input
                className="cc-inp"
                type="text"
                placeholder="e.g. 4768151"
                value={ccliNumber}
                onChange={e => setCcliNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="cc-field">
            <label className="cc-lbl">Notes (optional)</label>
            <textarea
              className="cc-inp cc-textarea"
              rows={3}
              placeholder="Any context for this play…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <footer className="cc-modal-ft">
          <button type="button" className="cc-btn cc-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="cc-btn cc-btn-accent">
            {isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Source pill ──────────────────────────────────────────────── */
function SourcePill({ source, confirmed }) {
  const isManual = source === 'manual';
  const label = isManual ? 'manual' : (confirmed ? 'auto · played' : 'auto');
  return (
    <span
      className={`cc-pill ${isManual ? 'cc-pill-manual' : 'cc-pill-auto'}`}
      title={!isManual && confirmed ? 'Confirmed via "Mark as Played" on the setlist' : undefined}
    >
      {label}
    </span>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */
export default function CcliLog() {
  /* Live-synced via Firestore. Setlists trigger a re-hydrate via the service
     when their raw doc changes (see effect below). */
  const [setlistsRaw]               = useUserStoreKey('setlists', []);
  const [songsRaw]                  = useUserStoreKey('songs',    []);
  const [setlists,   setSetlists]   = useState([]);
  const [allSongs,   setAllSongs]   = useState([]);
  const [manual,     setManual]     = useUserStoreKey('worship:ccli-manual', []);
  const [loadError,  setLoadError]  = useState('');
  const [loading,    setLoading]    = useState(false);

  /* Filters */
  const initial6 = useMemo(presetRange.bind(null, 'last6mo'), []);
  const [fromDate, setFromDate] = useState(initial6.from);
  const [toDate,   setToDate]   = useState(initial6.to);
  const [songFilter, setSongFilter] = useState(''); // '' = all, otherwise normalized title

  /* Modal state */
  const [showForm, setShowForm]   = useState(false);
  const [editing,  setEditing]    = useState(null);
  const [armedDel, setArmedDel]   = useState(null);

  /* ── Re-hydrate when underlying setlists/songs change ────── */
  useEffect(() => {
    let alive = true;
    Promise.all([
      setlistService.getAll().catch(err => { throw err; }),
      songService.getAll().catch(() => ({ data: { data: [] } })),
    ])
      .then(([slRes, songRes]) => {
        if (!alive) return;
        setSetlists(slRes.data?.data || []);
        setAllSongs(songRes.data?.data || []);
        setLoadError('');
      })
      .catch(() => {
        if (!alive) return;
        setLoadError("Couldn't load setlist data — manual entries only.");
        setSetlists([]);
      });
    return () => { alive = false; };
  }, [setlistsRaw, songsRaw]);

  /* (Manual entries autosaved via useUserStoreKey.) */

  /* ── Build a set of valid song ids (for "song removed" detection) */
  const songIdSet = useMemo(() => new Set(allSongs.map(s => s.id)), [allSongs]);

  /* ── Derive auto entries from setlists ───────────────────────
     A setlist counts as "played" — and gets logged for CCLI — once
     its event date has passed, OR as soon as it's explicitly
     confirmed via "Mark as Played" on the Setlist detail view
     (which stamps `played_at`). Scheduled-but-future services are
     excluded until confirmed, so the log only reports what was
     actually performed. */
  const autoEntries = useMemo(() => {
    const out = [];
    const today = todayISO();
    for (const sl of setlists) {
      const confirmed = Boolean(sl?.played_at);
      const logDate   = confirmed ? sl.played_at.slice(0, 10) : sl?.event_date;
      if (!logDate) continue;
      if (!confirmed && logDate > today) continue;
      const songs = Array.isArray(sl.songs) ? sl.songs : [];
      for (const s of songs) {
        out.push({
          id:        `auto-${sl.id}-${s.link_id ?? s.id}`,
          date:      logDate,
          songId:    s.id,
          songTitle: s.title || '(untitled)',
          artist:    s.artist || '',
          ccliNumber: '',
          service:   sl.name || sl.occasion || '',
          source:    'setlist',
          confirmed,
          songRemoved: s.id != null && !songIdSet.has(s.id),
        });
      }
    }
    return out;
  }, [setlists, songIdSet]);

  /* ── All entries (auto + manual) ─────────────────────────── */
  const allEntries = useMemo(() => {
    const manualNormalized = manual.map(m => ({
      ...m,
      source: 'manual',
    }));
    return [...autoEntries, ...manualNormalized];
  }, [autoEntries, manual]);

  /* ── Filter ─────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const f = fromDate || '0000-00-00';
    const t = toDate   || '9999-12-31';
    const songQ = songFilter.trim().toLowerCase();
    return allEntries
      .filter(e => {
        if (!e.date) return false;
        if (e.date < f) return false;
        if (e.date > t) return false;
        if (songQ && (e.songTitle || '').toLowerCase() !== songQ) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (a.songTitle || '').localeCompare(b.songTitle || '');
      });
  }, [allEntries, fromDate, toDate, songFilter]);

  /* ── Stats ──────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalPlays = filtered.length;
    const songCounts = new Map();
    const services   = new Set();
    for (const e of filtered) {
      const key = (e.songTitle || '').toLowerCase();
      songCounts.set(key, (songCounts.get(key) || 0) + 1);
      const svcKey = `${e.date}::${(e.service || '').toLowerCase()}`;
      services.add(svcKey);
    }
    let mostPlayed = '—';
    let mostCount = 0;
    let mostPlayedDisplay = '—';
    for (const e of filtered) {
      const key = (e.songTitle || '').toLowerCase();
      const c   = songCounts.get(key) || 0;
      if (c > mostCount) {
        mostCount = c;
        mostPlayed = key;
        mostPlayedDisplay = e.songTitle || '—';
      }
    }
    return {
      totalPlays,
      uniqueSongs: songCounts.size,
      mostPlayed: mostPlayedDisplay,
      mostPlayedCount: mostCount,
      serviceCount: services.size,
    };
  }, [filtered]);

  /* ── Song dropdown options (unique titles) ──────────────── */
  const songOptions = useMemo(() => {
    const titles = new Set();
    for (const s of allSongs)      titles.add(s.title);
    for (const e of autoEntries)   if (e.songTitle) titles.add(e.songTitle);
    for (const m of manual)        if (m.songTitle) titles.add(m.songTitle);
    return [...titles].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [allSongs, autoEntries, manual]);

  /* ── Handlers ───────────────────────────────────────────── */
  function applyPreset(key) {
    const r = presetRange(key);
    setFromDate(r.from);
    setToDate(r.to);
  }

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(entry) {
    if (entry.source !== 'manual') return;
    setEditing(entry);
    setShowForm(true);
  }

  function handleSave(data) {
    if (editing && editing.id) {
      setManual(prev => prev.map(m =>
        m.id === editing.id ? { ...m, ...data } : m
      ));
    } else {
      setManual(prev => [
        { id: uid(), createdAt: Date.now(), ...data },
        ...prev,
      ]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id) {
    if (armedDel !== id) { setArmedDel(id); return; }
    setManual(prev => prev.filter(m => m.id !== id));
    setArmedDel(null);
  }

  function handleExport() {
    const from = fromDate || 'all';
    const to   = toDate   || 'all';
    const filename = `ccli-log-${from}-to-${to}.csv`;
    const csv = buildCsv(filtered);
    downloadCsv(filename, csv);
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <WorshipShell title="CCLI Log" icon="📑" subtitle="CCLI reporting log for licensed songs used in services.">
    <div className="cc-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="cc-main">
        {/* ── Top bar ── */}
        <div className="cc-topbar">
          <div className="cc-topbar-left">
            <h1 className="cc-page-title">CCLI Log</h1>
            <p className="cc-page-sub">
              Track which songs were performed in services for CCLI reporting compliance.
              Auto-derived from setlists; add manual entries for spontaneous plays.
            </p>
          </div>
          <div className="cc-topbar-right">
            <button className="cc-btn cc-btn-ghost cc-btn-lg" onClick={handleExport} disabled={filtered.length === 0}>
              <span aria-hidden="true">📥</span> Export CSV
            </button>
            <button className="cc-btn cc-btn-accent cc-btn-lg" onClick={openNew}>
              + Add Manual Entry
            </button>
          </div>
        </div>

        {loadError && (
          <div className="cc-banner cc-banner-warn">{loadError}</div>
        )}

        {/* ── Filter bar ── */}
        <div className="cc-filterbar">
          <div className="cc-filter-row">
            <div className="cc-filter-field">
              <label className="cc-lbl">From</label>
              <input
                className="cc-inp"
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div className="cc-filter-field">
              <label className="cc-lbl">To</label>
              <input
                className="cc-inp"
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
            <div className="cc-filter-field cc-filter-field-wide">
              <label className="cc-lbl">Song</label>
              <select
                className="cc-inp"
                value={songFilter}
                onChange={e => setSongFilter(e.target.value)}
              >
                <option value="">All songs</option>
                {songOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="cc-presets">
            <button className="cc-preset" onClick={() => applyPreset('thisQuarter')}>This Quarter</button>
            <button className="cc-preset" onClick={() => applyPreset('lastQuarter')}>Last Quarter</button>
            <button className="cc-preset" onClick={() => applyPreset('thisYear')}>This Year</button>
            <button className="cc-preset" onClick={() => applyPreset('last6mo')}>Last 6 Months</button>
            <button className="cc-preset" onClick={() => applyPreset('allTime')}>All Time</button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="cc-stats">
          <div className="cc-stat">
            <div className="cc-stat-num">{stats.totalPlays}</div>
            <div className="cc-stat-lbl">Total plays</div>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-num">{stats.uniqueSongs}</div>
            <div className="cc-stat-lbl">Unique songs</div>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-num cc-stat-num-sm" title={stats.mostPlayed}>
              {stats.mostPlayed}
              {stats.mostPlayedCount > 0 && (
                <span className="cc-stat-suffix"> · {stats.mostPlayedCount}×</span>
              )}
            </div>
            <div className="cc-stat-lbl">Most played</div>
          </div>
          <div className="cc-stat">
            <div className="cc-stat-num">{stats.serviceCount}</div>
            <div className="cc-stat-lbl">Services</div>
          </div>
        </div>

        {/* ── Log table ── */}
        <div className="cc-table-wrap">
          {loading ? (
            <div className="cc-empty">
              <div className="cc-empty-title">Loading…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="cc-empty">
              <div className="cc-empty-icon" aria-hidden="true">📑</div>
              <div className="cc-empty-title">No song plays logged in this range</div>
              <div className="cc-empty-sub">
                {allEntries.length === 0
                  ? 'Get started by playing a song in a Sunday service via the Setlist tab — or click "+ Add Manual Entry" to log a play directly.'
                  : 'Try widening the date range with a preset like "All Time", or clear the song filter.'}
              </div>
              <div className="cc-empty-actions">
                <button className="cc-btn cc-btn-accent" onClick={openNew}>+ Add Manual Entry</button>
                {allEntries.length > 0 && (
                  <button className="cc-btn cc-btn-ghost" onClick={() => applyPreset('allTime')}>
                    Show All Time
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="cc-table">
              <div className="cc-thead">
                <div className="cc-th cc-th-date">Date</div>
                <div className="cc-th cc-th-song">Song Title</div>
                <div className="cc-th cc-th-artist">Artist</div>
                <div className="cc-th cc-th-service">Service</div>
                <div className="cc-th cc-th-source">Source</div>
                <div className="cc-th cc-th-actions">Actions</div>
              </div>
              <div className="cc-tbody">
                {filtered.map(e => (
                  <div key={e.id} className={`cc-tr ${e.source === 'manual' ? 'cc-tr-manual' : ''}`}>
                    <div className="cc-td cc-td-date">{formatDate(e.date)}</div>
                    <div className="cc-td cc-td-song">
                      <span className="cc-song-title">{e.songTitle || '(untitled)'}</span>
                      {e.songRemoved && (
                        <span className="cc-removed-note"> (song removed)</span>
                      )}
                      {e.ccliNumber && (
                        <div className="cc-ccli-num">CCLI #{e.ccliNumber}</div>
                      )}
                    </div>
                    <div className="cc-td cc-td-artist">{e.artist || '—'}</div>
                    <div className="cc-td cc-td-service">{e.service || '—'}</div>
                    <div className="cc-td cc-td-source">
                      <SourcePill source={e.source} confirmed={e.confirmed} />
                    </div>
                    <div className="cc-td cc-td-actions">
                      {e.source === 'manual' ? (
                        <>
                          <button
                            className="cc-btn cc-btn-ghost cc-btn-sm"
                            onClick={() => openEdit(e)}
                          >
                            Edit
                          </button>
                          <button
                            className={`cc-btn cc-btn-sm ${armedDel === e.id ? 'cc-btn-danger-armed' : 'cc-btn-danger'}`}
                            onClick={() => handleDelete(e.id)}
                            onBlur={() => setArmedDel(null)}
                            title={armedDel === e.id ? 'Click again to confirm' : 'Delete entry'}
                          >
                            {armedDel === e.id ? 'Confirm' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <span className="cc-muted-sm">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal ── */}
      {showForm && (
        <ManualEntryModal
          initial={editing}
          allSongs={allSongs}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
    </WorshipShell>
  );
}
