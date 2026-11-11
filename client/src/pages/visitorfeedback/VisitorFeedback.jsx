import { useState, useEffect, useMemo, useRef } from 'react';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './VisitorFeedback.css';

/* ─────────────────────────────────────────────────────────────
   Visitor Feedback — inbox-style queue for website feedback
   Naming: .vf-*
   Persistence: localStorage key 'web:feedback'
   Also reads (optional): 'band:roster'
   Accent: var(--accent-pink, #f472b6)
   ───────────────────────────────────────────────────────────── */

const LS_KEY     = 'web:feedback';
const ROSTER_KEY = 'band:roster';

/* ─── Status tabs ──────────────────────────────────────────────── */
const TABS = [
  { key: 'all',          label: 'All' },
  { key: 'new',          label: 'New' },
  { key: 'in-progress',  label: 'In Progress' },
  { key: 'responded',    label: 'Responded' },
  { key: 'archived',     label: 'Archived' },
  { key: 'spam',         label: 'Spam' },
];

const STATUS_META = {
  'new':         { label: 'New',         color: '#2dd4bf', bg: 'rgba(45,212,191,0.16)',  border: 'rgba(45,212,191,0.45)' },
  'in-progress': { label: 'In Progress', color: '#60a5fa', bg: 'rgba(96,165,250,0.16)',  border: 'rgba(96,165,250,0.40)' },
  'responded':   { label: 'Responded',   color: '#34d399', bg: 'rgba(52,211,153,0.16)',  border: 'rgba(52,211,153,0.40)' },
  'archived':    { label: 'Archived',    color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)' },
  'spam':        { label: 'Spam',        color: '#ef4444', bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.45)' },
};

/* ─── Feedback types ───────────────────────────────────────────── */
const TYPES = [
  { key: 'compliment',      label: 'Compliment',      icon: '💖' },
  { key: 'complaint',       label: 'Complaint',       icon: '😠' },
  { key: 'suggestion',      label: 'Suggestion',      icon: '💡' },
  { key: 'question',        label: 'Question',        icon: '❓' },
  { key: 'bug',             label: 'Bug',             icon: '🐛' },
  { key: 'prayer-request',  label: 'Prayer Request',  icon: '🙏' },
  { key: 'other',           label: 'Other',           icon: '💬' },
];

const TYPE_BY_KEY = TYPES.reduce((acc, t) => { acc[t.key] = t; return acc; }, {});

/* ─── Priority ─────────────────────────────────────────────────── */
const PRIORITIES = ['low', 'medium', 'high'];

const PRIORITY_META = {
  low:    { label: 'Low',    color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.20)', stripe: 'rgba(255,255,255,0.25)' },
  medium: { label: 'Medium', color: '#fbbf24', bg: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.45)', stripe: '#fbbf24' },
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.45)',  stripe: '#ef4444' },
};

/* ─── Sources ──────────────────────────────────────────────────── */
const SOURCES = [
  { key: 'contact-form', label: 'Contact Form', icon: '📝' },
  { key: 'email',        label: 'Email',        icon: '✉' },
  { key: 'phone',        label: 'Phone',        icon: '📞' },
  { key: 'in-person',    label: 'In Person',    icon: '👋' },
  { key: 'social-media', label: 'Social Media', icon: '📱' },
  { key: 'other',        label: 'Other',        icon: '📨' },
];

const SOURCE_BY_KEY = SOURCES.reduce((acc, s) => { acc[s.key] = s; return acc; }, {});

/* ─── Date / time helpers ──────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeFromISO(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return relativeTime(d.getTime());
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)     return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)     return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)      return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30)    return `${days} day${days === 1 ? '' : 's'} ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12)      return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

function daysBetweenISO(fromISO, toTs) {
  if (!fromISO || !toTs) return null;
  const from = new Date(fromISO + 'T00:00:00');
  if (Number.isNaN(from.getTime())) return null;
  const diff = toTs - from.getTime();
  return diff / (1000 * 60 * 60 * 24);
}

/* ─── Storage helpers ──────────────────────────────────────────── */
function loadFeedback() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map(i => ({
      ...i,
      followUps: Array.isArray(i.followUps) ? i.followUps : [],
      tags:      Array.isArray(i.tags) ? i.tags : [],
      pinned:    !!i.pinned,
    }));
  } catch { return []; }
}

function saveFeedback(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map(r => typeof r === 'string' ? r : (r && r.name) ? r.name : null)
      .filter(Boolean);
  } catch { return []; }
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Status Pill ──────────────────────────────────────────────── */
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return (
    <span
      className={`vf-pill ${status === 'new' ? 'vf-pill-pulse' : ''}`}
      style={{ background: m.bg, color: m.color, borderColor: m.border }}
    >
      {status === 'new' && <span className="vf-pill-dot" style={{ background: m.color }} />}
      {m.label}
    </span>
  );
}

/* ─── Type Chip ────────────────────────────────────────────────── */
function TypeChip({ type }) {
  const t = TYPE_BY_KEY[type] || TYPE_BY_KEY.other;
  return (
    <span className="vf-type-chip" title={`Type: ${t.label}`}>
      <span aria-hidden="true">{t.icon}</span> {t.label}
    </span>
  );
}

/* ─── Roster Autocomplete ──────────────────────────────────────── */
function RosterInput({ value, onChange, placeholder, roster, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const q = (value || '').toLowerCase().trim();
  const matches = roster
    .filter(n => n && (!q || n.toLowerCase().includes(q)) && n.toLowerCase() !== q)
    .slice(0, 6);

  return (
    <div className="vf-ac" ref={wrapRef}>
      <input
        className="vf-inp"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && matches.length > 0 && (
        <div className="vf-ac-list">
          {matches.map(name => (
            <button
              key={name}
              type="button"
              className="vf-ac-item"
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Click-to-copy helper ─────────────────────────────────────── */
function CopyText({ text, label }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  function doCopy() {
    try {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <button
      type="button"
      className="vf-copy-btn"
      onClick={doCopy}
      title={`Copy ${label}`}
    >
      <span className="vf-copy-text">{text}</span>
      <span className="vf-copy-icon" aria-hidden="true">{copied ? '✓' : '⧉'}</span>
    </button>
  );
}

/* ─── New Feedback Modal ───────────────────────────────────────── */
function NewFeedbackModal({ onSave, onCancel }) {
  const [type,           setType]           = useState('other');
  const [subject,        setSubject]        = useState('');
  const [message,        setMessage]        = useState('');
  const [senderName,     setSenderName]     = useState('');
  const [senderEmail,    setSenderEmail]    = useState('');
  const [senderPhone,    setSenderPhone]    = useState('');
  const [pageUrl,        setPageUrl]        = useState('');
  const [receivedDate,   setReceivedDate]   = useState(todayISO());
  const [receivedSource, setReceivedSource] = useState('contact-form');
  const [priority,       setPriority]       = useState('medium');
  const [error,          setError]          = useState('');

  function submit(e) {
    e.preventDefault();
    if (!subject.trim()) { setError('Subject is required.'); return; }
    if (!message.trim()) { setError('Message is required.'); return; }
    onSave({
      type,
      subject:        subject.trim(),
      message:        message.trim(),
      senderName:     senderName.trim(),
      senderEmail:    senderEmail.trim(),
      senderPhone:    senderPhone.trim(),
      pageUrl:        pageUrl.trim(),
      receivedDate,
      receivedSource,
      priority,
    });
  }

  return (
    <div className="vf-modal-overlay" onClick={onCancel}>
      <form className="vf-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <header className="vf-modal-head">
          <span>Log Visitor Feedback</span>
          <button type="button" className="vf-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="vf-modal-body">
          {error && <div className="vf-error">{error}</div>}

          <div className="vf-form-row">
            <div className="vf-field">
              <label className="vf-lbl">Type</label>
              <select
                className="vf-inp"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                {TYPES.map(t => (
                  <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div className="vf-field">
              <label className="vf-lbl">Priority</label>
              <select
                className="vf-inp"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="vf-field">
            <label className="vf-lbl">Subject</label>
            <input
              className="vf-inp"
              type="text"
              placeholder="Short summary of the feedback"
              value={subject}
              autoFocus
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          <div className="vf-field">
            <label className="vf-lbl">Message</label>
            <textarea
              className="vf-inp vf-textarea"
              rows={5}
              placeholder="Full message body…"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div className="vf-form-row">
            <div className="vf-field">
              <label className="vf-lbl">Sender name <span className="vf-lbl-hint">(optional)</span></label>
              <input
                className="vf-inp"
                type="text"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
              />
            </div>
            <div className="vf-field">
              <label className="vf-lbl">Sender email <span className="vf-lbl-hint">(optional)</span></label>
              <input
                className="vf-inp"
                type="email"
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="vf-form-row">
            <div className="vf-field">
              <label className="vf-lbl">Sender phone <span className="vf-lbl-hint">(optional)</span></label>
              <input
                className="vf-inp"
                type="tel"
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
              />
            </div>
            <div className="vf-field">
              <label className="vf-lbl">Page URL <span className="vf-lbl-hint">(optional)</span></label>
              <input
                className="vf-inp"
                type="text"
                placeholder="/about, /sermons/…"
                value={pageUrl}
                onChange={e => setPageUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="vf-form-row">
            <div className="vf-field">
              <label className="vf-lbl">Received date</label>
              <input
                className="vf-inp"
                type="date"
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
              />
            </div>
            <div className="vf-field">
              <label className="vf-lbl">Source</label>
              <select
                className="vf-inp"
                value={receivedSource}
                onChange={e => setReceivedSource(e.target.value)}
              >
                {SOURCES.map(s => (
                  <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <footer className="vf-modal-ft">
          <button type="button" className="vf-btn vf-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="vf-btn vf-btn-accent">Save Feedback</button>
        </footer>
      </form>
    </div>
  );
}

/* ─── Inline Add Follow-up Form ────────────────────────────────── */
function AddFollowUpForm({ roster, onSubmit }) {
  const [author, setAuthor] = useState('');
  const [action, setAction] = useState('');
  const [err,    setErr]    = useState('');

  function submit(e) {
    e.preventDefault();
    if (!action.trim()) { setErr('Action is required.'); return; }
    onSubmit({
      author: author.trim() || 'Anonymous',
      action: action.trim(),
    });
    setAuthor('');
    setAction('');
    setErr('');
  }

  return (
    <form className="vf-fu-form" onSubmit={submit}>
      <div className="vf-fu-row">
        <RosterInput
          value={author}
          onChange={(v) => { setAuthor(v); if (err) setErr(''); }}
          placeholder="Your name (optional)"
          roster={roster}
        />
      </div>
      <textarea
        className="vf-inp vf-textarea vf-fu-textarea"
        rows={2}
        placeholder="What happened? (e.g. Called back at 10am, emailed pastor, logged in CRM…)"
        value={action}
        onChange={e => { setAction(e.target.value); if (err) setErr(''); }}
      />
      {err && <div className="vf-error vf-error-sm">{err}</div>}
      <div className="vf-fu-btns">
        <button type="submit" className="vf-btn vf-btn-accent vf-btn-sm">+ Add Follow-up</button>
      </div>
    </form>
  );
}

/* ─── Respond Form (inline prompt for replyNotes) ──────────────── */
function RespondForm({ initial, onSubmit, onCancel }) {
  const [notes, setNotes] = useState(initial || '');
  return (
    <form
      className="vf-respond-form"
      onSubmit={(e) => { e.preventDefault(); onSubmit(notes.trim()); }}
    >
      <label className="vf-lbl">Reply notes</label>
      <textarea
        className="vf-inp vf-textarea"
        rows={3}
        autoFocus
        placeholder="How and when did you respond?"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="vf-respond-btns">
        <button type="button" className="vf-btn vf-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="vf-btn vf-btn-accent">Mark Responded</button>
      </div>
    </form>
  );
}

/* ─── Feedback Card ────────────────────────────────────────────── */
function FeedbackCard({
  item, expanded, onToggle,
  roster,
  onUpdate, onDelete, armedDelete, setArmedDelete,
  onAddFollowUp,
}) {
  const [msgExpanded,  setMsgExpanded]  = useState(false);
  const [respondOpen,  setRespondOpen]  = useState(false);

  function patch(p) { onUpdate(item.id, p); }

  const t = TYPE_BY_KEY[item.type] || TYPE_BY_KEY.other;
  const src = SOURCE_BY_KEY[item.receivedSource] || SOURCE_BY_KEY.other;
  const terminalStatus = ['responded', 'archived', 'spam'].includes(item.status);

  const msgShort = (item.message || '').length > 240
    ? item.message.slice(0, 240).trimEnd() + '…'
    : item.message;

  function handleMarkResponded() {
    if (!item.replyNotes || item.replyNotes.trim() === '') {
      setRespondOpen(true);
    } else {
      patch({ status: 'responded', repliedAt: Date.now() });
    }
  }

  function commitRespond(notes) {
    patch({
      status: 'responded',
      repliedAt: Date.now(),
      replyNotes: notes || item.replyNotes || '',
    });
    setRespondOpen(false);
  }

  function composeReply() {
    if (!item.senderEmail) return;
    const subject = encodeURIComponent(`Re: ${item.subject || 'Your feedback'}`);
    const body = encodeURIComponent(
      `Hi ${item.senderName || 'there'},\n\nThank you for reaching out.\n\n— Quoting your message —\n${item.message || ''}\n`
    );
    window.location.href = `mailto:${item.senderEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <article
      className={[
        'vf-card',
        expanded ? 'expanded' : '',
        item.status === 'new' ? 'is-new' : '',
        item.pinned ? 'pinned' : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        className={`vf-prio-stripe vf-prio-stripe-${item.priority}`}
        aria-hidden="true"
      />

      <div className="vf-card-body">
        {/* Top row */}
        <div className="vf-card-top">
          <div className="vf-card-lhs">
            {item.pinned && <span className="vf-pin" title="Pinned">📌</span>}
            <StatusPill status={item.status} />
            <TypeChip type={item.type} />
          </div>
          <div className="vf-card-rhs">
            <span
              className="vf-prio-chip"
              style={{
                background: PRIORITY_META[item.priority]?.bg,
                color:      PRIORITY_META[item.priority]?.color,
                borderColor: PRIORITY_META[item.priority]?.border,
              }}
              title={`Priority: ${PRIORITY_META[item.priority]?.label}`}
            >
              <span className="vf-prio-dot" style={{ background: PRIORITY_META[item.priority]?.stripe }} />
              {PRIORITY_META[item.priority]?.label}
            </span>
          </div>
        </div>

        {/* Subject */}
        <button
          type="button"
          className="vf-card-title-btn"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <h3 className="vf-card-title">{item.subject || '(no subject)'}</h3>
        </button>

        {/* Sender + date line */}
        <div className="vf-card-meta-line">
          <span className="vf-meta-label">From:</span>
          <span className="vf-meta-value">
            {item.senderName || 'Anonymous'}
            {item.senderEmail && (
              <span className="vf-meta-email"> &lt;{item.senderEmail}&gt;</span>
            )}
          </span>
          {item.receivedDate && (
            <>
              <span className="vf-meta-sep">·</span>
              <span className="vf-meta-muted" title={formatDate(item.receivedDate)}>
                {relativeFromISO(item.receivedDate)}
              </span>
            </>
          )}
        </div>

        {/* Message preview (collapsed) */}
        {item.message && !expanded && (
          <div className="vf-card-msg">
            <p className={`vf-card-msg-text ${msgExpanded ? 'full' : 'clamp'}`}>
              {msgExpanded ? item.message : msgShort}
            </p>
            {item.message.length > 240 && (
              <button
                type="button"
                className="vf-link-btn"
                onClick={() => setMsgExpanded(v => !v)}
              >
                {msgExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {/* pageUrl chip */}
        {item.pageUrl && !expanded && (
          <div className="vf-page-row">
            <a
              href={item.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vf-page-chip"
              title="Open page"
              onClick={(e) => e.stopPropagation()}
            >
              🔗 {item.pageUrl}
            </a>
          </div>
        )}

        {/* Footer (collapsed) */}
        {!expanded && (
          <div className="vf-card-foot">
            <span className="vf-source-chip" title={`Source: ${src.label}`}>
              <span aria-hidden="true">{src.icon}</span> {src.label}
            </span>
            {item.followUps.length > 0 && (
              <span className="vf-fu-badge" title={`${item.followUps.length} follow-up${item.followUps.length === 1 ? '' : 's'}`}>
                💬 {item.followUps.length}
              </span>
            )}
            {item.assignedTo && (
              <>
                <span className="vf-meta-sep">·</span>
                <span className="vf-meta-muted">Assigned to {item.assignedTo}</span>
              </>
            )}
            {item.status === 'responded' && item.repliedAt && (
              <>
                <span className="vf-meta-sep">·</span>
                <span className="vf-meta-muted">Responded {relativeTime(item.repliedAt)}</span>
              </>
            )}
          </div>
        )}

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="vf-detail">
            {/* Subject */}
            <div className="vf-detail-section">
              <label className="vf-lbl">Subject</label>
              <input
                className="vf-inp"
                type="text"
                value={item.subject}
                onChange={e => patch({ subject: e.target.value })}
              />
            </div>

            {/* Message (editable) */}
            <div className="vf-detail-section">
              <label className="vf-lbl">Message</label>
              <textarea
                className="vf-inp vf-textarea"
                rows={5}
                value={item.message}
                onChange={e => patch({ message: e.target.value })}
              />
            </div>

            {/* Type / Status / Priority */}
            <div className="vf-form-row">
              <div className="vf-field">
                <label className="vf-lbl">Type</label>
                <select
                  className="vf-inp"
                  value={item.type}
                  onChange={e => patch({ type: e.target.value })}
                >
                  {TYPES.map(tt => (
                    <option key={tt.key} value={tt.key}>{tt.icon} {tt.label}</option>
                  ))}
                </select>
              </div>
              <div className="vf-field">
                <label className="vf-lbl">Status</label>
                <select
                  className="vf-inp"
                  value={item.status}
                  onChange={e => {
                    const next = e.target.value;
                    if (next === 'responded' && item.status !== 'responded') {
                      patch({ status: 'responded', repliedAt: Date.now() });
                    } else if (item.status === 'responded' && next !== 'responded') {
                      patch({ status: next, repliedAt: 0 });
                    } else {
                      patch({ status: next });
                    }
                  }}
                >
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div className="vf-field">
                <label className="vf-lbl">Priority</label>
                <select
                  className="vf-inp"
                  value={item.priority}
                  onChange={e => patch({ priority: e.target.value })}
                >
                  {PRIORITIES.map(p => (
                    <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Page URL + assignee */}
            <div className="vf-form-row">
              <div className="vf-field">
                <label className="vf-lbl">Page URL</label>
                <input
                  className="vf-inp"
                  type="text"
                  placeholder="/about, /sermons/…"
                  value={item.pageUrl || ''}
                  onChange={e => patch({ pageUrl: e.target.value })}
                />
              </div>
              <div className="vf-field">
                <label className="vf-lbl">Assigned to</label>
                <RosterInput
                  value={item.assignedTo || ''}
                  onChange={(v) => patch({ assignedTo: v })}
                  placeholder="Team member"
                  roster={roster}
                />
              </div>
            </div>

            {/* Sender info */}
            <div className="vf-detail-section">
              <label className="vf-lbl">Sender info</label>
              <div className="vf-sender-block">
                <div className="vf-sender-row">
                  <span className="vf-sender-key">Name</span>
                  <input
                    className="vf-inp vf-sender-inp"
                    type="text"
                    value={item.senderName || ''}
                    onChange={e => patch({ senderName: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <div className="vf-sender-row">
                  <span className="vf-sender-key">Email</span>
                  <input
                    className="vf-inp vf-sender-inp"
                    type="email"
                    value={item.senderEmail || ''}
                    onChange={e => patch({ senderEmail: e.target.value })}
                    placeholder="—"
                  />
                  {item.senderEmail && <CopyText text={item.senderEmail} label="email" />}
                </div>
                <div className="vf-sender-row">
                  <span className="vf-sender-key">Phone</span>
                  <input
                    className="vf-inp vf-sender-inp"
                    type="tel"
                    value={item.senderPhone || ''}
                    onChange={e => patch({ senderPhone: e.target.value })}
                    placeholder="—"
                  />
                  {item.senderPhone && <CopyText text={item.senderPhone} label="phone" />}
                </div>
              </div>
            </div>

            {/* Source + received date */}
            <div className="vf-form-row">
              <div className="vf-field">
                <label className="vf-lbl">Source</label>
                <select
                  className="vf-inp"
                  value={item.receivedSource}
                  onChange={e => patch({ receivedSource: e.target.value })}
                >
                  {SOURCES.map(s => (
                    <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                  ))}
                </select>
              </div>
              <div className="vf-field">
                <label className="vf-lbl">Received date</label>
                <input
                  className="vf-inp"
                  type="date"
                  value={item.receivedDate || ''}
                  onChange={e => patch({ receivedDate: e.target.value })}
                />
              </div>
            </div>

            {/* Reply notes */}
            <div className="vf-detail-section">
              <label className="vf-lbl">Reply notes</label>
              <textarea
                className="vf-inp vf-textarea"
                rows={3}
                placeholder="How and when did the team respond?"
                value={item.replyNotes || ''}
                onChange={e => patch({ replyNotes: e.target.value })}
              />
            </div>

            {/* Follow-ups */}
            <div className="vf-detail-section">
              <label className="vf-lbl">
                Follow-ups ({item.followUps.length})
              </label>

              {item.followUps.length === 0 ? (
                <div className="vf-fu-empty">No follow-ups yet — log the first action below.</div>
              ) : (
                <div className="vf-fu-list">
                  {[...item.followUps]
                    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
                    .map(f => (
                      <div key={f.id} className="vf-fu">
                        <div className="vf-fu-head">
                          <span className="vf-fu-author">{f.author || 'Anonymous'}</span>
                          <span className="vf-meta-sep">·</span>
                          <span className="vf-meta-muted">{relativeTime(f.createdAt)}</span>
                          {f.date && (
                            <>
                              <span className="vf-meta-sep">·</span>
                              <span className="vf-meta-muted">{formatDate(f.date)}</span>
                            </>
                          )}
                        </div>
                        <div className="vf-fu-action">{f.action}</div>
                      </div>
                    ))}
                </div>
              )}

              <AddFollowUpForm
                roster={roster}
                onSubmit={(fu) => onAddFollowUp(item.id, fu)}
              />
            </div>

            {/* Quick actions */}
            <div className="vf-detail-section vf-detail-actions">
              <label className="vf-lbl">Quick actions</label>

              {respondOpen ? (
                <RespondForm
                  initial={item.replyNotes}
                  onSubmit={commitRespond}
                  onCancel={() => setRespondOpen(false)}
                />
              ) : (
                <div className="vf-quick-row">
                  {item.status !== 'responded' && (
                    <button
                      className="vf-btn vf-btn-success"
                      onClick={handleMarkResponded}
                    >
                      📧 Mark Responded
                    </button>
                  )}
                  {item.senderEmail && (
                    <button
                      className="vf-btn vf-btn-accent"
                      onClick={composeReply}
                    >
                      ✉ Compose Reply
                    </button>
                  )}
                  {item.status !== 'in-progress' && item.status !== 'responded' && (
                    <button
                      className="vf-btn vf-btn-ghost"
                      onClick={() => patch({ status: 'in-progress' })}
                    >
                      ▶ Start Work
                    </button>
                  )}
                  {item.status !== 'archived' && (
                    <button
                      className="vf-btn vf-btn-ghost"
                      onClick={() => patch({ status: 'archived' })}
                    >
                      📁 Archive
                    </button>
                  )}
                  {item.status !== 'spam' && (
                    <button
                      className="vf-btn vf-btn-ghost"
                      onClick={() => patch({ status: 'spam' })}
                    >
                      🚫 Mark Spam
                    </button>
                  )}
                  <button
                    className="vf-btn vf-btn-ghost"
                    onClick={() => patch({ pinned: !item.pinned })}
                    title={item.pinned ? 'Unpin' : 'Pin to top'}
                  >
                    {item.pinned ? '📌 Unpin' : '📌 Pin'}
                  </button>

                  {terminalStatus && (
                    <button
                      className={`vf-btn ${armedDelete === item.id ? 'vf-btn-danger-armed' : 'vf-btn-danger'}`}
                      onClick={() => onDelete(item.id)}
                      onBlur={() => setArmedDelete(null)}
                      title={armedDelete === item.id ? 'Click again to confirm' : 'Delete this feedback'}
                    >
                      {armedDelete === item.id ? 'Confirm Delete' : '🗑 Delete'}
                    </button>
                  )}
                </div>
              )}

              {!terminalStatus && (
                <div className="vf-delete-hint">
                  Delete is only available for responded / archived / spam items.
                </div>
              )}
            </div>

            <div className="vf-collapse-row">
              <button
                type="button"
                className="vf-btn vf-btn-ghost vf-btn-sm"
                onClick={onToggle}
              >
                ▲ Collapse
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─── Main component ───────────────────────────────────────────── */
export default function VisitorFeedback() {
  const [items,  setItems]  = useUserStoreKey('web:feedback',  []);
  const [roster]            = useUserStoreKey('band:roster',   []);

  const [tab,         setTab]         = useState('all');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [prioFilter,  setPrioFilter]  = useState('all');
  const [search,      setSearch]      = useState('');

  const [showForm,    setShowForm]    = useState(false);
  const [expandedId,  setExpandedId]  = useState(null);
  const [armedDelete, setArmedDelete] = useState(null);

  /* ── Status counts (for tab badges) ────────────────────────── */
  const statusCounts = useMemo(() => ({
    all:           items.length,
    'new':         items.filter(i => i.status === 'new').length,
    'in-progress': items.filter(i => i.status === 'in-progress').length,
    'responded':   items.filter(i => i.status === 'responded').length,
    'archived':    items.filter(i => i.status === 'archived').length,
    'spam':        items.filter(i => i.status === 'spam').length,
  }), [items]);

  /* ── Stats ─────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const newCount = items.filter(i => i.status === 'new').length;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = items.filter(i => {
      if (!i.receivedDate) return false;
      const d = new Date(i.receivedDate + 'T00:00:00').getTime();
      return !Number.isNaN(d) && d >= weekAgo;
    }).length;

    const nonSpam = items.filter(i => i.status !== 'spam');
    const handled = nonSpam.filter(i => i.status === 'responded' || i.status === 'archived').length;
    const responseRate = nonSpam.length > 0
      ? Math.round((handled / nonSpam.length) * 100)
      : null;

    const respondedWithTimes = items.filter(i =>
      i.status === 'responded' && i.repliedAt && i.receivedDate
    );
    let avgDays = null;
    if (respondedWithTimes.length > 0) {
      const total = respondedWithTimes.reduce(
        (sum, i) => sum + (daysBetweenISO(i.receivedDate, i.repliedAt) || 0), 0,
      );
      avgDays = total / respondedWithTimes.length;
    }

    return { newCount, thisWeek, responseRate, avgDays };
  }, [items]);

  /* ── Filter + sort ─────────────────────────────────────────── */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;

    if (tab !== 'all')        list = list.filter(i => i.status === tab);
    if (typeFilter !== 'all') list = list.filter(i => i.type === typeFilter);
    if (prioFilter !== 'all') list = list.filter(i => i.priority === prioFilter);

    if (q) {
      list = list.filter(i =>
        (i.subject     || '').toLowerCase().includes(q) ||
        (i.message     || '').toLowerCase().includes(q) ||
        (i.senderName  || '').toLowerCase().includes(q) ||
        (i.senderEmail || '').toLowerCase().includes(q) ||
        (i.tags || []).some(t => (t || '').toLowerCase().includes(q))
      );
    }

    // Sort: pinned first, then status priority (new > in-progress > rest), then receivedDate desc
    const statusOrder = { 'new': 0, 'in-progress': 1, 'responded': 2, 'archived': 3, 'spam': 4 };
    return [...list].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      // receivedDate desc (newer first)
      const ad = a.receivedDate || '';
      const bd = b.receivedDate || '';
      if (ad !== bd) return ad < bd ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [items, tab, typeFilter, prioFilter, search]);

  /* ── CRUD ──────────────────────────────────────────────────── */
  function handleSave(data) {
    const now = Date.now();
    const newItem = {
      id:              uid(),
      type:            data.type,
      subject:         data.subject,
      message:         data.message,
      senderName:      data.senderName,
      senderEmail:     data.senderEmail,
      senderPhone:     data.senderPhone,
      pageUrl:         data.pageUrl,
      receivedDate:    data.receivedDate,
      receivedSource:  data.receivedSource,
      status:          'new',
      priority:        data.priority,
      assignedTo:      '',
      replyNotes:      '',
      repliedAt:       0,
      followUps:       [],
      tags:            [],
      pinned:          false,
      createdAt:       now,
      updatedAt:       now,
    };
    setItems(prev => [newItem, ...prev]);
    setShowForm(false);
    setExpandedId(newItem.id);
  }

  function handleUpdate(id, patch) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i,
    ));
  }

  function handleAddFollowUp(id, fu) {
    const entry = {
      id:        uid(),
      date:      todayISO(),
      author:    fu.author,
      action:    fu.action,
      createdAt: Date.now(),
    };
    setItems(prev => prev.map(i =>
      i.id === id
        ? { ...i, followUps: [...i.followUps, entry], updatedAt: Date.now() }
        : i,
    ));
  }

  function handleDelete(id) {
    if (armedDelete !== id) { setArmedDelete(id); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    setArmedDelete(null);
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  const truelyEmpty = items.length === 0;

  return (
    <WebsiteShell
      title="Visitor Feedback"
      icon="💬"
      subtitle="Inbox for feedback submitted through the site — compliments, complaints, suggestions, and questions."
      fullBleed
    >
    <div className="vf-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="vf-main">
        {/* ── Top bar ── */}
        <div className="vf-topbar">
          <div className="vf-topbar-left">
            <h1 className="vf-page-title">Visitor Feedback</h1>
            <p className="vf-page-sub">
              Inbox for visitor comments, questions, and reports submitted through
              the website or logged from other channels.
            </p>
          </div>
          <div className="vf-topbar-right">
            <button
              className="vf-btn vf-btn-accent vf-btn-lg"
              onClick={() => setShowForm(true)}
            >
              + Add Feedback
            </button>
          </div>
        </div>

        {/* ── Stats card row ── */}
        <div className="vf-stats">
          <div className={`vf-stat ${stats.newCount > 0 ? 'alert' : ''}`}>
            <div className="vf-stat-num">{stats.newCount}</div>
            <div className="vf-stat-lbl">New</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-num">{stats.thisWeek}</div>
            <div className="vf-stat-lbl">This week</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-num vf-stat-num-sm">
              {stats.responseRate == null ? '—' : `${stats.responseRate}%`}
            </div>
            <div className="vf-stat-lbl">Response rate</div>
          </div>
          <div className="vf-stat">
            <div className="vf-stat-num vf-stat-num-sm">
              {stats.avgDays == null
                ? '—'
                : stats.avgDays < 1
                  ? `${Math.round(stats.avgDays * 24)}h`
                  : `${stats.avgDays.toFixed(1)}d`}
            </div>
            <div className="vf-stat-lbl">Avg response time</div>
          </div>
        </div>

        {/* ── Status tabs ── */}
        <div className="vf-tabs">
          {TABS.map(t => {
            const count = statusCounts[t.key];
            const isNew = t.key === 'new' && count > 0;
            return (
              <button
                key={t.key}
                className={`vf-tab ${tab === t.key ? 'on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="vf-tab-label-wrap">
                  {t.label}
                  {isNew && <span className="vf-tab-redot" aria-hidden="true" />}
                </span>
                <span className="vf-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Sub-filter row ── */}
        <div className="vf-filters">
          <div className="vf-filter-group">
            <span className="vf-filter-lbl">Type:</span>
            <div className="vf-type-pills">
              <button
                className={`vf-type-pill ${typeFilter === 'all' ? 'on' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              {TYPES.map(t => {
                const on = typeFilter === t.key;
                return (
                  <button
                    key={t.key}
                    className={`vf-type-pill ${on ? 'on' : ''}`}
                    onClick={() => setTypeFilter(t.key)}
                  >
                    <span aria-hidden="true">{t.icon}</span> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="vf-filter-group">
            <span className="vf-filter-lbl">Priority:</span>
            <select
              className="vf-inp vf-filter-select"
              value={prioFilter}
              onChange={e => setPrioFilter(e.target.value)}
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{PRIORITY_META[p].label}</option>
              ))}
            </select>
          </div>

          <div className="vf-filter-group vf-filter-search">
            <input
              className="vf-inp"
              type="text"
              placeholder="🔍 Search subject, message, sender, tags…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── List ── */}
        <div className="vf-list-wrap">
          {visible.length === 0 ? (
            <div className="vf-empty">
              {truelyEmpty ? (
                <>
                  <div className="vf-empty-icon" aria-hidden="true">📬</div>
                  <div className="vf-empty-title">Inbox zero</div>
                  <div className="vf-empty-sub">
                    No feedback yet. When visitors submit comments, questions, or bug
                    reports through the site, they'll land here. You can also log
                    phone calls or in-person feedback manually.
                  </div>
                  <button
                    className="vf-btn vf-btn-accent vf-empty-cta"
                    onClick={() => setShowForm(true)}
                  >
                    + Log your first feedback
                  </button>
                </>
              ) : (
                <>
                  <div className="vf-empty-icon" aria-hidden="true">🔎</div>
                  <div className="vf-empty-title">No feedback matches these filters</div>
                  <div className="vf-empty-sub">
                    Try clearing search, type, or priority filters.
                  </div>
                  <button
                    className="vf-btn vf-btn-ghost vf-empty-cta"
                    onClick={() => {
                      setTab('all'); setTypeFilter('all');
                      setPrioFilter('all'); setSearch('');
                    }}
                  >
                    Clear all filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="vf-list">
              {visible.map(item => (
                <FeedbackCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item.id)}
                  roster={roster}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  armedDelete={armedDelete}
                  setArmedDelete={setArmedDelete}
                  onAddFollowUp={handleAddFollowUp}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <NewFeedbackModal
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
    </WebsiteShell>
  );
}
