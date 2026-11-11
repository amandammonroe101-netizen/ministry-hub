import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BlogShell from '../blog/BlogShell';
import { useUserStoreKey } from '../../lib/userStore';
import './BlogPerformance.css';

/* ─────────────────────────────────────────────────────────────
   Post Performance — manual analytics log for the church blog.
   Tracks per-post views/comments/shares with monthly trends.
   Naming: .bpf-* (NOT .bp-* — that's Blog Posts)
   Persistence: localStorage key 'blog:performance'
   Reads:       'blog:posts' for post autocomplete
   Accent:      var(--accent-amber, #fbbf24)
   ───────────────────────────────────────────────────────────── */

const LS_PERF  = 'blog:performance';
const LS_POSTS = 'blog:posts';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ─── Helpers ──────────────────────────────────────────────── */
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function monthKey(y, m /* 0-11 */) {
  return `${y}-${pad2(m + 1)}`;
}

function currentMonthKey() {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth());
}

function shiftMonthKey(key, delta) {
  const [ys, ms] = key.split('-');
  let y = parseInt(ys, 10);
  let m = parseInt(ms, 10) - 1 + delta;
  while (m < 0)  { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return monthKey(y, m);
}

function formatMonth(key) {
  if (!key || key.length < 7) return '—';
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  if (Number.isNaN(y) || Number.isNaN(m)) return key;
  return `${MONTH_NAMES[m]} ${y}`;
}

function formatMonthShort(key) {
  if (!key || key.length < 7) return '—';
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  if (Number.isNaN(y) || Number.isNaN(m)) return key;
  return `${MONTH_NAMES[m].slice(0, 3)} ${String(y).slice(2)}`;
}

function formatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/* ─── Storage ──────────────────────────────────────────────── */
function loadPerf() {
  try {
    const raw = localStorage.getItem(LS_PERF);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function savePerf(arr) {
  try { localStorage.setItem(LS_PERF, JSON.stringify(arr)); } catch {}
}
function loadPosts() {
  try {
    const raw = localStorage.getItem(LS_POSTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/* ─── CSV helpers ──────────────────────────────────────────── */
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function buildCsv(rows) {
  const header = [
    'Month','Post Title','Views','Unique Viewers',
    'Comments','Shares','Email Opens','Top Referrer','Notes',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.month || '',
      r.postTitle || '',
      Number(r.views) || 0,
      r.uniqueViewers != null && r.uniqueViewers !== '' ? Number(r.uniqueViewers) : '',
      Number(r.comments) || 0,
      Number(r.shares)   || 0,
      r.emailOpens != null && r.emailOpens !== '' ? Number(r.emailOpens) : '',
      r.topReferrer || '',
      r.engagementNotes || '',
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

/* ─── Post autocomplete ────────────────────────────────────── */
function PostAutocomplete({ value, onPick, allPosts, autoFocus }) {
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
    ? allPosts
        .filter(p => (p.title || '').toLowerCase().includes(q))
        .slice(0, 8)
    : allPosts.slice(0, 8);

  return (
    <div className="bpf-ac" ref={wrap}>
      <input
        className="bpf-inp"
        type="text"
        placeholder="Start typing a post title…"
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onPick({ postTitle: e.target.value, postId: null }); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="bpf-ac-list">
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className="bpf-ac-item"
              onClick={() => {
                onPick({ postTitle: p.title || '(untitled)', postId: p.id });
                setOpen(false);
              }}
            >
              <span className="bpf-ac-title">{p.title || '(untitled)'}</span>
              {p.category && <span className="bpf-ac-meta">· {p.category}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Entry modal ──────────────────────────────────────────── */
function EntryModal({ initial, allPosts, defaultMonth, onSave, onCancel }) {
  const [postId,        setPostId]        = useState(initial?.postId        ?? null);
  const [postTitle,     setPostTitle]     = useState(initial?.postTitle     || '');
  const [month,         setMonth]         = useState(initial?.month         || defaultMonth);
  const [views,         setViews]         = useState(initial?.views         != null ? String(initial.views) : '');
  const [uniqueViewers, setUniqueViewers] = useState(initial?.uniqueViewers != null ? String(initial.uniqueViewers) : '');
  const [comments,      setComments]      = useState(initial?.comments      != null ? String(initial.comments) : '');
  const [shares,        setShares]        = useState(initial?.shares        != null ? String(initial.shares) : '');
  const [emailOpens,    setEmailOpens]    = useState(initial?.emailOpens    != null ? String(initial.emailOpens) : '');
  const [topReferrer,   setTopReferrer]   = useState(initial?.topReferrer   || '');
  const [notes,         setNotes]         = useState(initial?.engagementNotes || '');
  const [error,         setError]         = useState('');

  function num(v, allowEmpty) {
    if (v === '' || v == null) return allowEmpty ? '' : 0;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : (allowEmpty ? '' : 0);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!postTitle.trim()) { setError('Post is required.'); return; }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) { setError('Month must be YYYY-MM.'); return; }
    const v = parseFloat(views);
    if (!Number.isFinite(v) || v < 0) { setError('Views must be a non-negative number.'); return; }
    onSave({
      postId,
      postTitle: postTitle.trim(),
      month,
      views: Math.round(v),
      uniqueViewers: num(uniqueViewers, true),
      comments: num(comments, false),
      shares:   num(shares,   false),
      emailOpens: num(emailOpens, true),
      topReferrer: topReferrer.trim(),
      engagementNotes: notes.trim(),
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div className="bpf-modal-overlay" onClick={onCancel}>
      <form className="bpf-modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="bpf-modal-head">
          <span>{isEdit ? 'Edit Performance Entry' : 'Add Performance Entry'}</span>
          <button type="button" className="bpf-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="bpf-modal-body">
          {error && <div className="bpf-error">{error}</div>}

          <div className="bpf-field">
            <label className="bpf-lbl">Post</label>
            <PostAutocomplete
              value={postTitle}
              allPosts={allPosts}
              autoFocus
              onPick={({ postTitle: t, postId: id }) => {
                setPostTitle(t);
                setPostId(id);
              }}
            />
            <div className="bpf-hint">
              Pick from your library or type a title for an ad-hoc entry.
            </div>
          </div>

          <div className="bpf-form-row">
            <div className="bpf-field">
              <label className="bpf-lbl">Month</label>
              <input
                className="bpf-inp"
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
            </div>
            <div className="bpf-field">
              <label className="bpf-lbl">Views <span className="bpf-req">*</span></label>
              <input
                className="bpf-inp"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={views}
                onChange={e => setViews(e.target.value)}
              />
            </div>
          </div>

          <div className="bpf-form-row">
            <div className="bpf-field">
              <label className="bpf-lbl">Unique viewers</label>
              <input
                className="bpf-inp"
                type="number"
                min="0"
                step="1"
                placeholder="optional"
                value={uniqueViewers}
                onChange={e => setUniqueViewers(e.target.value)}
              />
            </div>
            <div className="bpf-field">
              <label className="bpf-lbl">Email opens</label>
              <input
                className="bpf-inp"
                type="number"
                min="0"
                step="1"
                placeholder="optional"
                value={emailOpens}
                onChange={e => setEmailOpens(e.target.value)}
              />
            </div>
          </div>

          <div className="bpf-form-row">
            <div className="bpf-field">
              <label className="bpf-lbl">Comments</label>
              <input
                className="bpf-inp"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={comments}
                onChange={e => setComments(e.target.value)}
              />
            </div>
            <div className="bpf-field">
              <label className="bpf-lbl">Shares</label>
              <input
                className="bpf-inp"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={shares}
                onChange={e => setShares(e.target.value)}
              />
            </div>
          </div>

          <div className="bpf-field">
            <label className="bpf-lbl">Top referrer</label>
            <input
              className="bpf-inp"
              type="text"
              placeholder="e.g. Facebook, Search, Newsletter"
              value={topReferrer}
              onChange={e => setTopReferrer(e.target.value)}
              list="bpf-referrers"
            />
            <datalist id="bpf-referrers">
              <option value="Facebook" />
              <option value="Instagram" />
              <option value="Search" />
              <option value="Newsletter" />
              <option value="Direct" />
              <option value="Email" />
              <option value="Twitter/X" />
            </datalist>
          </div>

          <div className="bpf-field">
            <label className="bpf-lbl">Engagement notes</label>
            <textarea
              className="bpf-inp bpf-textarea"
              rows={3}
              placeholder="What worked, what didn't, hot comments…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <footer className="bpf-modal-ft">
          <button type="button" className="bpf-btn bpf-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="bpf-btn bpf-btn-accent">
            {isEdit ? 'Save Changes' : 'Add Entry'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Trend chart (SVG bars) ───────────────────────────────── */
function TrendChart({ data }) {
  // data: [{ key, label, views, notes }] (oldest → newest)
  const W = 720;
  const H = 200;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxV = Math.max(1, ...data.map(d => d.views || 0));
  const barW = data.length > 0 ? (innerW / data.length) * 0.62 : 0;
  const slot = data.length > 0 ? innerW / data.length : 0;

  // Y-axis ticks (0, max/2, max)
  const ticks = [0, maxV / 2, maxV].map(t => ({
    v: Math.round(t),
    y: padT + innerH - (t / maxV) * innerH,
  }));

  return (
    <div className="bpf-chart-wrap">
      <svg
        className="bpf-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Monthly views trend"
      >
        {/* Y gridlines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} x2={W - padR}
              y1={t.y} y2={t.y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray={i === 0 ? '0' : '3,4'}
            />
            <text
              x={padL - 8} y={t.y + 4}
              fontSize="11"
              fill="rgba(255,255,255,0.5)"
              textAnchor="end"
            >
              {formatNumber(t.v)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const h = (d.views / maxV) * innerH;
          const x = padL + slot * i + (slot - barW) / 2;
          const y = padT + innerH - h;
          return (
            <g key={d.key}>
              <title>{`${d.label}: ${formatNumber(d.views)} views${d.notes ? `\n${d.notes}` : ''}`}</title>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, h)}
                rx="4"
                fill="var(--accent-amber, #fbbf24)"
                opacity={d.views > 0 ? 0.9 : 0.25}
              />
              {d.views > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  fontSize="10"
                  fill="rgba(255,255,255,0.7)"
                  textAnchor="middle"
                >
                  {formatNumber(d.views)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H - padB + 18}
                fontSize="11"
                fill="rgba(255,255,255,0.65)"
                textAnchor="middle"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={padL} x2={W - padR}
          y1={padT + innerH} y2={padT + innerH}
          stroke="rgba(255,255,255,0.18)"
        />
      </svg>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────── */
export default function BlogPerformance() {
  const navigate = useNavigate();

  const [entries, setEntries] = useUserStoreKey('blog:performance', []);
  const [allPosts]            = useUserStoreKey('blog:posts',       []);

  /* Month selector */
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());

  /* Modal state */
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [armedDel, setArmedDel] = useState(null);

  /* Leaderboard expansion */
  const [showAllLeaders, setShowAllLeaders] = useState(false);

  /* List filters */
  const [filterPost, setFilterPost] = useState('');
  const [sortBy,     setSortBy]     = useState('views'); // views | comments | recent | title

  /* (No persist or storage listeners — useUserStoreKey handles both
     autosave on setEntries() and live-sync of allPosts via onSnapshot.) */

  /* ── Derived: month entries ──────────────────────────── */
  const monthEntries = useMemo(
    () => entries.filter(e => e.month === selectedMonth),
    [entries, selectedMonth]
  );

  const lastMonthKey = useMemo(() => shiftMonthKey(selectedMonth, -1), [selectedMonth]);
  const lastMonthEntries = useMemo(
    () => entries.filter(e => e.month === lastMonthKey),
    [entries, lastMonthKey]
  );

  /* ── Stats ───────────────────────────────────────────── */
  const stats = useMemo(() => {
    const totalViews = monthEntries.reduce((s, e) => s + (Number(e.views) || 0), 0);
    const lastViews  = lastMonthEntries.reduce((s, e) => s + (Number(e.views) || 0), 0);
    const delta      = totalViews - lastViews;
    const deltaPct   = lastViews > 0
      ? Math.round((delta / lastViews) * 100)
      : (totalViews > 0 ? 100 : 0);

    let topPost = null;
    for (const e of monthEntries) {
      if (!topPost || (Number(e.views) || 0) > (Number(topPost.views) || 0)) {
        topPost = e;
      }
    }

    return {
      totalViews,
      topPost,
      postCount: monthEntries.length,
      delta,
      deltaPct,
      hasLast: lastViews > 0,
    };
  }, [monthEntries, lastMonthEntries]);

  /* ── Leaderboard ─────────────────────────────────────── */
  const leaderboard = useMemo(() => {
    return [...monthEntries].sort((a, b) =>
      (Number(b.views) || 0) - (Number(a.views) || 0)
    );
  }, [monthEntries]);

  const topViews = leaderboard[0]?.views || 0;

  /* ── 6-month trend ───────────────────────────────────── */
  const trendData = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const key = shiftMonthKey(selectedMonth, -i);
      const monthRows = entries.filter(e => e.month === key);
      const views = monthRows.reduce((s, e) => s + (Number(e.views) || 0), 0);
      // Gather notes from this month (first few)
      const notesArr = monthRows
        .map(r => r.engagementNotes)
        .filter(Boolean)
        .slice(0, 3);
      out.push({
        key,
        label: formatMonthShort(key),
        views,
        notes: notesArr.join(' · '),
      });
    }
    return out;
  }, [entries, selectedMonth]);

  /* ── Filtered list ───────────────────────────────────── */
  const filteredList = useMemo(() => {
    const q = filterPost.trim().toLowerCase();
    let rows = entries.filter(e => {
      if (!q) return true;
      return (e.postTitle || '').toLowerCase().includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'views')    return (Number(b.views) || 0)    - (Number(a.views) || 0);
      if (sortBy === 'comments') return (Number(b.comments) || 0) - (Number(a.comments) || 0);
      if (sortBy === 'title')    return (a.postTitle || '').localeCompare(b.postTitle || '');
      // recent
      const ad = a.updatedAt || a.createdAt || 0;
      const bd = b.updatedAt || b.createdAt || 0;
      if (bd !== ad) return bd - ad;
      return (b.month || '').localeCompare(a.month || '');
    });
    return rows;
  }, [entries, filterPost, sortBy]);

  /* ── Post filter autocomplete options ────────────────── */
  const postTitleOptions = useMemo(() => {
    const titles = new Set();
    for (const p of allPosts) if (p.title) titles.add(p.title);
    for (const e of entries)  if (e.postTitle) titles.add(e.postTitle);
    return [...titles].sort((a, b) => a.localeCompare(b));
  }, [allPosts, entries]);

  /* ── Handlers ────────────────────────────────────────── */
  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(entry) {
    setEditing(entry);
    setShowForm(true);
  }

  function handleSave(data) {
    const now = Date.now();
    if (editing && editing.id) {
      setEntries(prev => prev.map(m =>
        m.id === editing.id ? { ...m, ...data, updatedAt: now } : m
      ));
    } else {
      setEntries(prev => [
        { id: uid(), createdAt: now, updatedAt: now, ...data },
        ...prev,
      ]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id) {
    if (armedDel !== id) { setArmedDel(id); return; }
    setEntries(prev => prev.filter(m => m.id !== id));
    setArmedDel(null);
  }

  function handleExport() {
    const filename = `blog-performance-${selectedMonth}.csv`;
    downloadCsv(filename, buildCsv(monthEntries));
  }

  function gotoPost(postId) {
    if (!postId) return;
    navigate(`/blog-posts?id=${encodeURIComponent(postId)}`);
  }

  const visibleLeaders = showAllLeaders ? leaderboard : leaderboard.slice(0, 10);

  return (
    <BlogShell title="Post Performance" icon="📈" subtitle="Views, reads, and engagement for published posts." fullBleed>
    <div className="bpf-root">
      <main className="bpf-main">
        {/* ── Top bar ── */}
        <div className="bpf-topbar">
          <div className="bpf-topbar-left">
            <h1 className="bpf-page-title">Post Performance</h1>
            <p className="bpf-page-sub">
              Manual analytics log — track per-post views, comments, and shares,
              and watch monthly trends emerge.
            </p>
          </div>
          <div className="bpf-topbar-right">
            <div className="bpf-month-nav" role="group" aria-label="Month selector">
              <button
                type="button"
                className="bpf-month-btn"
                onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}
                aria-label="Previous month"
              >◂</button>
              <span className="bpf-month-label">{formatMonth(selectedMonth)}</span>
              <button
                type="button"
                className="bpf-month-btn"
                onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, +1))}
                aria-label="Next month"
              >▸</button>
            </div>
            <button
              type="button"
              className="bpf-btn bpf-btn-ghost"
              onClick={handleExport}
              disabled={monthEntries.length === 0}
              title={monthEntries.length === 0 ? 'No entries to export' : 'Download CSV'}
            >
              <span aria-hidden="true">📥</span> Export CSV
            </button>
            <button
              type="button"
              className="bpf-btn bpf-btn-accent"
              onClick={openNew}
            >
              + Add Entry
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="bpf-stats">
          <div className="bpf-stat">
            <div className="bpf-stat-num">{formatNumber(stats.totalViews)}</div>
            <div className="bpf-stat-lbl">Total views this month</div>
          </div>

          <div className="bpf-stat">
            <div className="bpf-stat-num bpf-stat-num-sm" title={stats.topPost?.postTitle || '—'}>
              {stats.topPost ? truncate(stats.topPost.postTitle, 28) : '—'}
            </div>
            <div className="bpf-stat-lbl">
              Top post {stats.topPost ? `· ${formatNumber(stats.topPost.views)} views` : ''}
            </div>
          </div>

          <div className="bpf-stat">
            <div className="bpf-stat-num">{stats.postCount}</div>
            <div className="bpf-stat-lbl">Posts tracked this month</div>
          </div>

          <div className="bpf-stat">
            <div className={`bpf-stat-num ${stats.delta >= 0 ? 'bpf-up' : 'bpf-down'}`}>
              {stats.delta === 0 && !stats.hasLast
                ? '—'
                : `${stats.delta >= 0 ? '▲' : '▼'} ${formatNumber(Math.abs(stats.delta))}`
              }
              {stats.hasLast && (
                <span className="bpf-stat-suffix"> · {stats.deltaPct >= 0 ? '+' : ''}{stats.deltaPct}%</span>
              )}
            </div>
            <div className="bpf-stat-lbl">vs last month ({formatMonthShort(lastMonthKey)})</div>
          </div>
        </div>

        {/* ── Top performers leaderboard ── */}
        <section className="bpf-section">
          <div className="bpf-section-head">
            <h2 className="bpf-section-title">Top performers — {formatMonth(selectedMonth)}</h2>
            <span className="bpf-section-meta">{leaderboard.length} posts</span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="bpf-empty">
              <div className="bpf-empty-icon" aria-hidden="true">📊</div>
              <div className="bpf-empty-title">No entries logged for this month</div>
              <div className="bpf-empty-sub">
                Click "+ Add Entry" to log views, comments, and shares for a post.
              </div>
              <button className="bpf-btn bpf-btn-accent" onClick={openNew}>+ Add Entry</button>
            </div>
          ) : (
            <>
              <div className="bpf-leaders">
                {visibleLeaders.map((row, i) => {
                  const pct = topViews > 0 ? ((Number(row.views) || 0) / topViews) * 100 : 0;
                  return (
                    <div key={row.id} className="bpf-leader">
                      <div className="bpf-leader-rank">#{i + 1}</div>
                      <div className="bpf-leader-body">
                        <button
                          type="button"
                          className={`bpf-leader-title ${row.postId ? 'bpf-leader-title-link' : ''}`}
                          onClick={() => row.postId && gotoPost(row.postId)}
                          disabled={!row.postId}
                          title={row.postId ? 'Open in Blog Posts' : 'No linked post'}
                        >
                          {row.postTitle || '(untitled)'}
                        </button>
                        <div className="bpf-leader-bar-wrap">
                          <div className="bpf-leader-bar" style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                      <div className="bpf-leader-metrics">
                        <span className="bpf-metric"><strong>{formatNumber(row.views)}</strong> views</span>
                        <span className="bpf-metric">{formatNumber(row.comments || 0)} comments</span>
                        <span className="bpf-metric">{formatNumber(row.shares || 0)} shares</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {leaderboard.length > 10 && (
                <div className="bpf-show-all">
                  <button
                    type="button"
                    className="bpf-btn bpf-btn-ghost bpf-btn-sm"
                    onClick={() => setShowAllLeaders(v => !v)}
                  >
                    {showAllLeaders ? 'Show top 10' : `Show all ${leaderboard.length}`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Trend chart ── */}
        <section className="bpf-section">
          <div className="bpf-section-head">
            <h2 className="bpf-section-title">Engagement trend — last 6 months</h2>
            <span className="bpf-section-meta">Total views per month</span>
          </div>
          <TrendChart data={trendData} />
        </section>

        {/* ── All entries list ── */}
        <section className="bpf-section">
          <div className="bpf-section-head">
            <h2 className="bpf-section-title">All entries</h2>
            <span className="bpf-section-meta">{filteredList.length} of {entries.length}</span>
          </div>

          <div className="bpf-filterbar">
            <div className="bpf-filter-field bpf-filter-field-wide">
              <label className="bpf-lbl">Filter by post</label>
              <input
                className="bpf-inp"
                type="text"
                placeholder="Type a post title…"
                value={filterPost}
                onChange={e => setFilterPost(e.target.value)}
                list="bpf-post-titles"
              />
              <datalist id="bpf-post-titles">
                {postTitleOptions.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="bpf-filter-field">
              <label className="bpf-lbl">Sort by</label>
              <select
                className="bpf-inp"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="views">Views (desc)</option>
                <option value="comments">Comments (desc)</option>
                <option value="recent">Recently edited</option>
                <option value="title">Post title (A–Z)</option>
              </select>
            </div>
            {filterPost && (
              <button
                type="button"
                className="bpf-btn bpf-btn-ghost bpf-btn-sm"
                onClick={() => setFilterPost('')}
              >
                Clear filter
              </button>
            )}
          </div>

          {filteredList.length === 0 ? (
            <div className="bpf-empty">
              <div className="bpf-empty-icon" aria-hidden="true">🔍</div>
              <div className="bpf-empty-title">
                {entries.length === 0 ? 'No performance entries yet' : 'No matches for that filter'}
              </div>
              <div className="bpf-empty-sub">
                {entries.length === 0
                  ? 'Log your first month of views and comments to start building a trend.'
                  : 'Try clearing the post filter or change the sort order.'}
              </div>
              {entries.length === 0 && (
                <button className="bpf-btn bpf-btn-accent" onClick={openNew}>+ Add Entry</button>
              )}
            </div>
          ) : (
            <div className="bpf-table">
              <div className="bpf-thead">
                <div className="bpf-th bpf-th-post">Post</div>
                <div className="bpf-th bpf-th-month">Month</div>
                <div className="bpf-th bpf-th-num">Views</div>
                <div className="bpf-th bpf-th-num">Comments</div>
                <div className="bpf-th bpf-th-num">Shares</div>
                <div className="bpf-th bpf-th-notes">Notes</div>
                <div className="bpf-th bpf-th-actions">Actions</div>
              </div>
              <div className="bpf-tbody">
                {filteredList.map(e => (
                  <div key={e.id} className="bpf-tr">
                    <div className="bpf-td bpf-td-post">
                      <button
                        type="button"
                        className={`bpf-row-title ${e.postId ? 'bpf-row-title-link' : ''}`}
                        onClick={() => e.postId && gotoPost(e.postId)}
                        disabled={!e.postId}
                        title={e.postId ? 'Open in Blog Posts' : 'No linked post'}
                      >
                        {e.postTitle || '(untitled)'}
                      </button>
                      {e.topReferrer && (
                        <div className="bpf-row-sub">via {e.topReferrer}</div>
                      )}
                    </div>
                    <div className="bpf-td bpf-td-month">{formatMonthShort(e.month)}</div>
                    <div className="bpf-td bpf-td-num">{formatNumber(e.views)}</div>
                    <div className="bpf-td bpf-td-num">{formatNumber(e.comments || 0)}</div>
                    <div className="bpf-td bpf-td-num">{formatNumber(e.shares || 0)}</div>
                    <div className="bpf-td bpf-td-notes" title={e.engagementNotes || ''}>
                      {e.engagementNotes ? truncate(e.engagementNotes, 60) : <span className="bpf-muted-sm">—</span>}
                    </div>
                    <div className="bpf-td bpf-td-actions">
                      <button
                        type="button"
                        className="bpf-btn bpf-btn-ghost bpf-btn-sm"
                        onClick={() => openEdit(e)}
                      >Edit</button>
                      <button
                        type="button"
                        className={`bpf-btn bpf-btn-sm ${armedDel === e.id ? 'bpf-btn-danger-armed' : 'bpf-btn-danger'}`}
                        onClick={() => handleDelete(e.id)}
                        onBlur={() => setArmedDel(null)}
                        title={armedDel === e.id ? 'Click again to confirm' : 'Delete entry'}
                      >
                        {armedDel === e.id ? 'Confirm' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="bpf-bottom-spacer" aria-hidden="true" />
      </main>

      {showForm && (
        <EntryModal
          initial={editing}
          allPosts={allPosts}
          defaultMonth={selectedMonth || currentMonthKey()}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
    </BlogShell>
  );
}
