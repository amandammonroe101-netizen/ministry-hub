import { useState, useEffect, useCallback, useRef } from 'react';
import WorshipShell from '../worship/WorshipShell';
import { useAuth } from '../../context/AuthContext';
import { getValue, setValue, deleteValue } from '../../lib/userStore';
import './Backup.css';

/* ─────────────────────────────────────────────────────────────
   Backup & Export — Firestore export/import tool
   Naming: .bk-*
   Accent: var(--accent-rose, #fb7185)

   The app's data lives in Firestore at /users/{uid}/kv/<key>.
   This page lets the user:
   - Download a single JSON snapshot of all their data
   - Restore from a previously-downloaded JSON file
   - See per-key storage sizes
   - Clear their entire Firestore cloud data (with confirmation)
   ───────────────────────────────────────────────────────────── */

const APP_NAME = 'Ministry Hub';
const BACKUP_VERSION = 2;  // bumped when migrated from localStorage → Firestore

/* Known keys, grouped for the UI. Add a new entry here when a future
   page introduces a new useUserStoreKey('domain:key', ...). */
const STORAGE_GROUPS = [
  { id: 'journal',  label: 'Journal',            keys: ['journal-entries', 'journal-reminders'] },
  { id: 'prayers',  label: 'Prayers',            keys: ['prayer-requests'] },
  { id: 'friends',  label: 'Friends',            keys: ['friends', 'community-prayers', 'prayer-events'] },
  { id: 'calendar', label: 'Calendar events',    keys: ['calendar-events'] },
  { id: 'songs',    label: 'Songs / Worship',    keys: ['songs', 'setlists', 'service-plans', 'worship:themes', 'worship:mix-notes', 'worship:ccli-manual', 'recording:schedule'] },
  { id: 'stems',    label: 'Stems Library',      keys: ['band:stems'] },
  { id: 'band',     label: 'Band / Team',        keys: ['band:roster', 'band:schedule', 'band:subs', 'band:onboarding'] },
  { id: 'studio',   label: 'Multitrack Studio',  keys: ['studio-projects'] },
  { id: 'instr',    label: 'Instrument widgets', keys: ['drums:saved-recordings', 'drums:to-stems', 'seaboard:saved-recordings', 'seaboard:to-stems', 'akai:saved-recordings', 'akai:to-stems', 'akai:settings'] },
  { id: 'podcast',  label: 'Podcast Ministry',   keys: ['podcast:recordings', 'podcast:projects', 'podcast:scenes'] },
  { id: 'blog',     label: 'Blog Ministry',      keys: ['blog:posts', 'blog:ideas', 'blog:quotes', 'blog:categories', 'blog:series', 'blog:authors', 'blog:comments', 'blog:newsletters', 'blog:performance'] },
  { id: 'website',  label: 'Website Ministry',   keys: ['web:page-audit', 'web:forms', 'web:tech-stack', 'web:style-guide', 'web:update-log', 'web:site-issues', 'web:seo', 'web:hosting', 'web:feedback'] },
  { id: 'gear',     label: 'Gear / Tech',        keys: ['gear:inventory', 'gear:maintenance', 'gear:stage-plots', 'gear:tech-issues'] },
  { id: 'admin',    label: 'Admin',              keys: ['admin:documents', 'admin:meetings', 'admin:budget-expenses', 'admin:budget-targets'] },
];

const ALL_KEYS = STORAGE_GROUPS.flatMap(g => g.keys);

/* ─── Helpers ─────────────────────────────────────────────── */
function formatBytes(b) {
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function jsonSize(value) {
  if (value == null) return 0;
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/* ─── Main component ─────────────────────────────────────── */
export default function Backup() {
  const { user } = useAuth();
  const [sizes, setSizes] = useState({});       // key → bytes
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);       // null | 'export' | 'import' | 'clear'
  const [toast, setToast] = useState('');
  const [armedClear, setArmedClear] = useState(false);
  const fileRef = useRef(null);
  const armTimer = useRef(null);

  /* Auto-dismiss the toast */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  /* Auto-disarm Clear after 4 seconds */
  useEffect(() => {
    if (!armedClear) return;
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmedClear(false), 4000);
    return () => { if (armTimer.current) clearTimeout(armTimer.current); };
  }, [armedClear]);

  /* Scan all known keys for the current user and compute per-key size. */
  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    const next = {};
    for (const key of ALL_KEYS) {
      try {
        const v = await getValue(user.uid, key);
        next[key] = jsonSize(v);
      } catch {
        next[key] = 0;
      }
    }
    setSizes(next);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  /* Group totals */
  const groupSizes = STORAGE_GROUPS.map(g => ({
    ...g,
    bytes: g.keys.reduce((acc, k) => acc + (sizes[k] || 0), 0),
    keysWithData: g.keys.filter(k => (sizes[k] || 0) > 0),
  }));
  const totalBytes = Object.values(sizes).reduce((a, b) => a + b, 0);

  /* ── Export all kv docs as a single JSON file ─────────── */
  const handleExport = useCallback(async () => {
    if (!user?.uid) return;
    setBusy('export');
    try {
      const payload = { app: APP_NAME, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), uid: user.uid, data: {} };
      for (const key of ALL_KEYS) {
        const v = await getValue(user.uid, key);
        if (v !== null && v !== undefined) payload.data[key] = v;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ministry-hub-backup-${nowStamp()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast(`Exported ${Object.keys(payload.data).length} keys to JSON.`);
    } catch (err) {
      setToast(`Export failed: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }, [user]);

  /* ── Import a previously-exported JSON file ───────────── */
  const handleFilePick = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    setBusy('import');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) {
        throw new Error('That file does not look like a Ministry Hub backup.');
      }
      const entries = Object.entries(parsed.data);
      let imported = 0;
      for (const [key, value] of entries) {
        if (!ALL_KEYS.includes(key)) continue; // skip unknown keys
        await setValue(user.uid, key, value);
        imported++;
      }
      setToast(`Imported ${imported} of ${entries.length} keys.`);
      refresh();
    } catch (err) {
      setToast(`Import failed: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [user, refresh]);

  /* ── Wipe all of the current user's Firestore kv data ── */
  const handleClear = useCallback(async () => {
    if (!user?.uid) return;
    if (!armedClear) {
      setArmedClear(true);
      return;
    }
    setBusy('clear');
    try {
      for (const key of ALL_KEYS) {
        await deleteValue(user.uid, key);
      }
      setToast('All cloud data cleared for your account.');
      setArmedClear(false);
      refresh();
    } catch (err) {
      setToast(`Clear failed: ${err.message || 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }, [user, armedClear, refresh]);

  return (
    <WorshipShell title="Backup & Export" icon="💾" subtitle="Backup and export tools for worship ministry data.">
    <div className="bk-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1" /><div className="orb o2" />
        <div className="orb o3" /><div className="orb o4" /><div className="orb o5" />
      </div>

      <main className="bk-main">
        <header className="bk-topbar">
          <div className="bk-topbar-left">
            <h1 className="bk-page-title">Backup &amp; Export</h1>
            <p className="bk-page-sub">
              Your data lives in Firebase Firestore at <code>/users/{user?.uid || '…'}/kv/</code>.
              Export it as JSON, import a previous backup, or clear it all.
            </p>
          </div>
        </header>

        <div className="bk-stack" style={{ padding: 24 }}>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="bk-btn bk-btn-accent"
              onClick={handleExport}
              disabled={busy === 'export' || !user}
              style={btnStyle}
            >
              {busy === 'export' ? 'Exporting…' : '⬇ Export All as JSON'}
            </button>

            <button
              className="bk-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'import' || !user}
              style={btnStyle}
            >
              {busy === 'import' ? 'Importing…' : '⬆ Import from JSON'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              onChange={handleFilePick}
              style={{ display: 'none' }}
            />

            <button
              className="bk-btn"
              onClick={handleClear}
              disabled={busy === 'clear' || !user}
              style={{
                ...btnStyle,
                background: armedClear ? 'rgba(239, 68, 68, 0.20)' : 'rgba(239, 68, 68, 0.08)',
                borderColor: armedClear ? 'rgba(239, 68, 68, 0.70)' : 'rgba(239, 68, 68, 0.40)',
                color: armedClear ? '#fca5a5' : '#f87171',
              }}
            >
              {busy === 'clear'
                ? 'Clearing…'
                : armedClear
                  ? '⚠ Click again to confirm — this cannot be undone'
                  : '🗑 Clear All Cloud Data'}
            </button>

            <button
              className="bk-btn"
              onClick={refresh}
              disabled={loading}
              style={btnStyle}
            >
              {loading ? 'Scanning…' : '↻ Refresh Sizes'}
            </button>
          </div>

          {/* Storage breakdown */}
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.85)' }}>
              Storage breakdown — total {formatBytes(totalBytes)}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {groupSizes.map(g => (
                <div key={g.id} style={groupCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{g.label}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{formatBytes(g.bytes)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                    {g.keysWithData.length === 0
                      ? `${g.keys.length} keys · empty`
                      : `${g.keysWithData.length} of ${g.keys.length} keys with data`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={toastStyle} role="status">{toast}</div>
        )}
      </main>
    </div>
    </WorshipShell>
  );
}

/* Inline styles to avoid a CSS rewrite — the existing .bk-* styles still
   work for the page chrome, these just style the action buttons + cards. */
const btnStyle = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '0.5px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.92)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};

const groupCardStyle = {
  padding: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '0.5px solid rgba(255,255,255,0.10)',
  borderRadius: 10,
};

const toastStyle = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  padding: '12px 18px',
  background: '#161413',
  border: '0.5px solid rgba(255,255,255,0.18)',
  borderRadius: 10,
  color: '#f5f5f4',
  fontSize: 13,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  zIndex: 1000,
};
