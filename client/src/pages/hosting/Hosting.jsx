import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsiteShell from '../website/WebsiteShell';
import { useUserStoreKey } from '../../lib/userStore';
import './Hosting.css';

/* ─────────────────────────────────────────────────────────────
   Hosting & Domain — the "don't lose the website" document
   Naming: .ho-*
   Persistence: localStorage key "web:hosting"  (single object)
   Accent: var(--accent-amber, #fbbf24)
   ───────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'web:hosting';

const SECTIONS = [
  { key: 'domain',   icon: '🌐', label: 'Domain'              },
  { key: 'dns',      icon: '🔌', label: 'DNS'                 },
  { key: 'hosting',  icon: '🖥',  label: 'Hosting'             },
  { key: 'ssl',      icon: '🔒', label: 'SSL Certificate'     },
  { key: 'backups',  icon: '💾', label: 'Backups'             },
  { key: 'contacts', icon: '👥', label: 'Tech Contacts'       },
  { key: 'admin',    icon: '🔐', label: 'Admin & Emergency'   },
  { key: 'notes',    icon: '📝', label: 'General Notes'       },
];

const SSL_PROVIDERS = [
  { key: 'letsencrypt', label: "Let's Encrypt" },
  { key: 'cloudflare',  label: 'Cloudflare'    },
  { key: 'custom',      label: 'Custom CA'     },
  { key: 'other',       label: 'Other'         },
];

const COST_PERIODS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly'  },
];

const BACKUP_SCHEDULES = [
  { key: 'daily',   label: 'Daily',   stale: 2  },
  { key: 'weekly',  label: 'Weekly',  stale: 10 },
  { key: 'monthly', label: 'Monthly', stale: 40 },
  { key: 'manual',  label: 'Manual',  stale: 90 },
];

const SCHEDULE_BY_KEY = BACKUP_SCHEDULES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

const CONTACT_ROLES = [
  { key: 'webmaster',  label: 'Webmaster',   color: '#fbbf24' },
  { key: 'agency',     label: 'Agency',      color: '#a78bfa' },
  { key: 'developer',  label: 'Developer',   color: '#60a5fa' },
  { key: 'support',    label: 'Support',     color: '#2dd4bf' },
  { key: 'emergency',  label: 'Emergency',   color: '#ef4444' },
  { key: 'other',      label: 'Other',       color: 'rgba(255,255,255,0.4)' },
];

const ROLE_BY_KEY = CONTACT_ROLES.reduce((acc, r) => {
  acc[r.key] = r;
  return acc;
}, {});

function makeId(prefix = 'ho') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDoc() {
  return {
    // Domain
    domainName: '',
    domainRegistrar: '',
    domainRegistrarUrl: '',
    domainExpiryDate: '',
    domainAutoRenew: false,
    domainNotes: '',

    // DNS
    dnsProvider: '',
    dnsProviderUrl: '',
    dnsKeyRecords: '',

    // Hosting
    hostingProvider: '',
    hostingProviderUrl: '',
    hostingPlan: '',
    hostingRenewalDate: '',
    hostingCost: '',
    hostingCostPeriod: 'monthly',
    hostingNotes: '',

    // SSL
    sslProvider: 'letsencrypt',
    sslExpiryDate: '',
    sslAutoRenew: true,
    sslNotes: '',

    // Backups
    backupProvider: '',
    backupSchedule: 'weekly',
    backupRetention: '',
    backupLocation: '',
    lastBackupConfirmed: '',
    backupNotes: '',

    // Tech Contacts
    contacts: [],

    // Admin
    adminAccessNotes: '',
    emergencyProcedure: '',

    generalNotes: '',

    updatedAt: Date.now(),
  };
}

function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDoc();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultDoc();
    const d = defaultDoc();
    return {
      ...d,
      ...parsed,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    };
  } catch {
    return defaultDoc();
  }
}

function saveDoc(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* quota ignored */
  }
}

/* ─── Date helpers ──────────────────────────────────────────── */
function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysSince(iso) {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = today.getTime() - target.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatDateLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Return tone for a "days until expiry" value: critical/warning/ok/none */
function expiryTone(days) {
  if (days === null || days === undefined) return 'none';
  if (days < 0)        return 'critical';
  if (days <= 14)      return 'critical';
  if (days <= 30)      return 'warning';
  return 'ok';
}

function daysUntilLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0)   return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/* ─── Pills & toggles ───────────────────────────────────────── */
function DaysPill({ iso }) {
  const days = daysUntil(iso);
  if (days === null) return null;
  const tone = expiryTone(days);
  return (
    <span className={`ho-pill ho-pill-${tone}`} title={formatDateLong(iso)}>
      {daysUntilLabel(days)}
    </span>
  );
}

function SinceBackupPill({ iso, schedule }) {
  const since = daysSince(iso);
  if (since === null) return null;
  const stale = (SCHEDULE_BY_KEY[schedule] || SCHEDULE_BY_KEY.weekly).stale;
  let tone = 'ok';
  if (since > stale * 1.5)      tone = 'critical';
  else if (since > stale)       tone = 'warning';
  const label = since === 0
    ? 'Today'
    : since === 1
      ? '1 day ago'
      : `${since} days ago`;
  return (
    <span className={`ho-pill ho-pill-${tone}`} title={formatDateLong(iso)}>
      {label}
    </span>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      className={`ho-toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ho-toggle-track">
        <span className="ho-toggle-thumb" />
      </span>
      <span className="ho-toggle-label">{label}</span>
    </button>
  );
}

/* ─── Collapsible Section wrapper ───────────────────────────── */
function Section({ icon, label, sectionKey, expanded, onToggle, badge, children }) {
  return (
    <section className={`ho-sec${expanded ? ' open' : ' closed'}`} data-section={sectionKey}>
      <button
        type="button"
        className="ho-sec-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="ho-sec-icon" aria-hidden="true">{icon}</span>
        <span className="ho-sec-label">{label}</span>
        {badge && (
          <span className={`ho-pill ho-pill-${badge.tone}`}>{badge.label}</span>
        )}
        <span className="ho-sec-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div className="ho-sec-body">{children}</div>}
    </section>
  );
}

/* ─── Toast ─────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return <div className="ho-toast" role="status">{message}</div>;
}

/* ─── Click-to-copy helper component ────────────────────────── */
function CopyText({ value, type, placeholder, onCopy }) {
  if (!value) {
    return <span className="ho-copy ho-copy-empty">{placeholder || '—'}</span>;
  }
  const href = type === 'email' ? `mailto:${value}` : type === 'phone' ? `tel:${value}` : null;
  return (
    <span className="ho-copy">
      {href ? (
        <a href={href} className="ho-copy-link" onClick={(e) => e.stopPropagation()}>
          {value}
        </a>
      ) : (
        <span className="ho-copy-text">{value}</span>
      )}
      <button
        type="button"
        className="ho-copy-btn"
        title={`Copy ${type || 'text'}`}
        onClick={(e) => { e.stopPropagation(); onCopy(value); }}
      >
        ⧉
      </button>
    </span>
  );
}

/* ─── Main component ────────────────────────────────────────── */
export default function Hosting() {
  /* Single-object doc (not array). Falls back to defaultDoc() until the
     user's first save creates a Firestore doc. */
  const [rawDoc, setRawDoc] = useUserStoreKey('web:hosting', null);
  const doc = useMemo(() => rawDoc || defaultDoc(), [rawDoc]);
  const setDoc = useCallback((next) => {
    if (typeof next === 'function') {
      setRawDoc((prev) => next(prev || defaultDoc()));
    } else {
      setRawDoc(next);
    }
  }, [setRawDoc]);

  const [expanded, setExpanded] = useState(() => ({
    domain:   true,
    dns:      true,
    hosting:  true,
    ssl:      true,
    backups:  false,
    contacts: false,
    admin:    false,
    notes:    false,
  }));
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  /* ── Deep-link from Calendar: ?section=domain|hosting|ssl|...
     expand that section, scroll to it, then strip the param so a
     refresh doesn't keep re-scrolling. */
  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_SECTIONS = ['domain', 'dns', 'hosting', 'ssl', 'backups', 'contacts', 'admin', 'notes'];

  useEffect(() => {
    const wanted = searchParams.get('section');
    if (!wanted || !VALID_SECTIONS.includes(wanted)) return;

    // Expand it (idempotent — does nothing if already open)
    setExpanded(e => (e[wanted] ? e : { ...e, [wanted]: true }));

    // Strip the param immediately so refreshes are clean
    const next = new URLSearchParams(searchParams);
    next.delete('section');
    setSearchParams(next, { replace: true });

    // Scroll the section into view on the next frame so it's already
    // expanded by the time we measure its position. Two RAFs is enough
    // for React commit + browser layout flush.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-section="${wanted}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Brief highlight pulse
          el.classList.add('ho-sec-flash');
          setTimeout(() => el.classList.remove('ho-sec-flash'), 1800);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 1800);
  }, []);

  /* ── Mutators ────────────────────────────────────────────── */
  const update = useCallback((patch) => {
    setDoc(d => ({ ...d, ...patch, updatedAt: Date.now() }));
  }, []);

  const toggleSection = useCallback((key) => {
    setExpanded(e => ({ ...e, [key]: !e[key] }));
  }, []);

  /* ── Contact helpers ────────────────────────────────────── */
  const addContact = useCallback(() => {
    setDoc(d => ({
      ...d,
      contacts: [
        ...(d.contacts || []),
        { id: makeId('c'), name: '', role: 'webmaster', email: '', phone: '', notes: '' },
      ],
      updatedAt: Date.now(),
    }));
  }, []);

  const updateContact = useCallback((id, patch) => {
    setDoc(d => ({
      ...d,
      contacts: (d.contacts || []).map(c => (c.id === id ? { ...c, ...patch } : c)),
      updatedAt: Date.now(),
    }));
  }, []);

  const removeContact = useCallback((id) => {
    setDoc(d => ({
      ...d,
      contacts: (d.contacts || []).filter(c => c.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  /* ── Clipboard ──────────────────────────────────────────── */
  const copyToClipboard = useCallback((text) => {
    if (!text) return;
    const finalize = () => showToast(`Copied "${text}"`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(finalize).catch(() => {
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

  /* ── Export ─────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hosting-info-${todayStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported hosting info');
  }, [doc, showToast]);

  /* ── Print ──────────────────────────────────────────────── */
  const handlePrint = useCallback(() => {
    setExpanded({
      domain: true, dns: true, hosting: true, ssl: true,
      backups: true, contacts: true, admin: true, notes: true,
    });
    setTimeout(() => window.print(), 100);
  }, []);

  /* ── Status banner derivation ────────────────────────────── */
  const alerts = useMemo(() => {
    const items = [];
    const push = (label, iso) => {
      const days = daysUntil(iso);
      if (days === null) return;
      const tone = expiryTone(days);
      if (tone === 'critical' || tone === 'warning') {
        items.push({ label, iso, days, tone });
      }
    };
    push(`Domain expires: ${doc.domainName || '(unnamed)'}`, doc.domainExpiryDate);
    push(`Hosting renewal: ${doc.hostingProvider || '(unnamed)'}`, doc.hostingRenewalDate);
    push('SSL certificate expires', doc.sslExpiryDate);

    items.sort((a, b) => a.days - b.days);
    return items;
  }, [doc.domainName, doc.domainExpiryDate, doc.hostingProvider, doc.hostingRenewalDate, doc.sslExpiryDate]);

  const overallTone = useMemo(() => {
    if (alerts.some(a => a.tone === 'critical')) return 'critical';
    if (alerts.some(a => a.tone === 'warning'))  return 'warning';
    return 'ok';
  }, [alerts]);

  const bannerCopy = useMemo(() => {
    if (overallTone === 'critical') {
      return { icon: '🚨', title: 'Critical — needs attention soon' };
    }
    if (overallTone === 'warning') {
      return { icon: '⚠', title: 'Upcoming renewals to review' };
    }
    return { icon: '✓', title: 'All clear — no upcoming expiries' };
  }, [overallTone]);

  /* ── Section badges ─────────────────────────────────────── */
  const domainBadge = useMemo(() => {
    const days = daysUntil(doc.domainExpiryDate);
    if (days === null) return null;
    return { label: daysUntilLabel(days), tone: expiryTone(days) };
  }, [doc.domainExpiryDate]);

  const hostingBadge = useMemo(() => {
    const days = daysUntil(doc.hostingRenewalDate);
    if (days === null) return null;
    return { label: daysUntilLabel(days), tone: expiryTone(days) };
  }, [doc.hostingRenewalDate]);

  const sslBadge = useMemo(() => {
    const days = daysUntil(doc.sslExpiryDate);
    if (days === null) return null;
    return { label: daysUntilLabel(days), tone: expiryTone(days) };
  }, [doc.sslExpiryDate]);

  const contactsBadge = useMemo(() => {
    const n = (doc.contacts || []).length;
    if (!n) return null;
    return { label: `${n}`, tone: 'neutral' };
  }, [doc.contacts]);

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <WebsiteShell
      title="Hosting & Domain"
      icon="🖥"
      subtitle={'"Don\'t lose the website" reference — domain, DNS, hosting, SSL, backups, and emergency tech contacts.'}
      fullBleed
    >
    <div className="ho-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <main className="ho-main">
        {/* Page header */}
        <header className="ho-page-head">
          <div className="ho-page-head-left">
            <div className="ho-eyebrow">Website Ministry · Operations</div>
            <h1 className="ho-page-title">Hosting &amp; Domain</h1>
            <div className="ho-page-sub">
              The reference document for keeping the church website online — domain, hosting,
              SSL, backups, contacts, and emergency procedure.
            </div>
          </div>
          <div className="ho-page-head-actions">
            <span className="ho-muted ho-last-updated">
              Last updated {formatTimestamp(doc.updatedAt)}
            </span>
            <button className="ho-btn ho-btn-ghost" onClick={handleExport} title="Download JSON">
              📥 Export JSON
            </button>
            <button className="ho-btn ho-btn-accent" onClick={handlePrint} title="Print / Save PDF">
              🖨 Print
            </button>
          </div>
        </header>

        {/* Status banner */}
        <section className={`ho-banner ho-banner-${overallTone}`}>
          <div className="ho-banner-head">
            <span className="ho-banner-icon" aria-hidden="true">{bannerCopy.icon}</span>
            <span className="ho-banner-title">{bannerCopy.title}</span>
          </div>
          {alerts.length > 0 && (
            <ul className="ho-banner-list">
              {alerts.map((a, i) => (
                <li key={i} className={`ho-banner-item ho-banner-item-${a.tone}`}>
                  <span className="ho-banner-item-label">{a.label}</span>
                  <span className={`ho-pill ho-pill-${a.tone}`}>
                    {daysUntilLabel(a.days)}
                  </span>
                  <span className="ho-banner-item-date">{formatDateLong(a.iso)}</span>
                </li>
              ))}
            </ul>
          )}
          {alerts.length === 0 && (
            <div className="ho-banner-empty">
              No expiry dates within 30 days. Keep this document up to date as renewal
              dates change.
            </div>
          )}
        </section>

        {/* ── Domain ─────────────────────────────────────── */}
        <Section
          icon="🌐"
          label="Domain"
          sectionKey="domain"
          expanded={expanded.domain}
          onToggle={() => toggleSection('domain')}
          badge={domainBadge}
        >
          <label className="ho-field">
            <span className="ho-label">Domain name</span>
            <input
              className="ho-inp ho-inp-lg ho-mono"
              placeholder="e.g. firstcommunity.church"
              value={doc.domainName}
              onChange={e => update({ domainName: e.target.value })}
              spellCheck={false}
            />
          </label>

          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">Registrar</span>
              <input
                className="ho-inp"
                placeholder="e.g. Cloudflare, Namecheap, GoDaddy"
                value={doc.domainRegistrar}
                onChange={e => update({ domainRegistrar: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">Registrar admin URL</span>
              <input
                className="ho-inp ho-mono"
                placeholder="https://… (where to log in)"
                value={doc.domainRegistrarUrl}
                onChange={e => update({ domainRegistrarUrl: e.target.value })}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">Expiry date</span>
              <div className="ho-date-row">
                <input
                  className="ho-inp"
                  type="date"
                  value={doc.domainExpiryDate}
                  onChange={e => update({ domainExpiryDate: e.target.value })}
                />
                <DaysPill iso={doc.domainExpiryDate} />
              </div>
            </label>
            <div className="ho-field">
              <span className="ho-label">Auto-renew</span>
              <Toggle
                checked={doc.domainAutoRenew}
                onChange={(v) => update({ domainAutoRenew: v })}
                label={doc.domainAutoRenew ? 'On' : 'Off'}
              />
            </div>
          </div>

          <label className="ho-field">
            <span className="ho-label">Notes</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={3}
              placeholder="WHOIS contact, transfer codes location, anything worth recording…"
              value={doc.domainNotes}
              onChange={e => update({ domainNotes: e.target.value })}
            />
          </label>
        </Section>

        {/* ── DNS ────────────────────────────────────────── */}
        <Section
          icon="🔌"
          label="DNS"
          sectionKey="dns"
          expanded={expanded.dns}
          onToggle={() => toggleSection('dns')}
        >
          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">DNS provider</span>
              <input
                className="ho-inp"
                placeholder="e.g. Cloudflare"
                value={doc.dnsProvider}
                onChange={e => update({ dnsProvider: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">DNS admin URL</span>
              <input
                className="ho-inp ho-mono"
                placeholder="https://…"
                value={doc.dnsProviderUrl}
                onChange={e => update({ dnsProviderUrl: e.target.value })}
                spellCheck={false}
              />
            </label>
          </div>

          <label className="ho-field">
            <span className="ho-label">Key records</span>
            <textarea
              className="ho-inp ho-textarea ho-mono ho-records"
              rows={6}
              placeholder={'A      @       1.2.3.4\nA      www     1.2.3.4\nMX     @       10 mx.mailgun.org\nTXT    @       "v=spf1 include:mailgun.org ~all"\nCNAME  blog    targets.example.com'}
              value={doc.dnsKeyRecords}
              onChange={e => update({ dnsKeyRecords: e.target.value })}
              spellCheck={false}
            />
            <span className="ho-hint">
              Free-form. Recommend listing record type → host → value, one per line.
            </span>
          </label>
        </Section>

        {/* ── Hosting ────────────────────────────────────── */}
        <Section
          icon="🖥"
          label="Hosting"
          sectionKey="hosting"
          expanded={expanded.hosting}
          onToggle={() => toggleSection('hosting')}
          badge={hostingBadge}
        >
          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">Hosting provider</span>
              <input
                className="ho-inp"
                placeholder="e.g. WP Engine, Squarespace, Netlify"
                value={doc.hostingProvider}
                onChange={e => update({ hostingProvider: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">Provider admin URL</span>
              <input
                className="ho-inp ho-mono"
                placeholder="https://…"
                value={doc.hostingProviderUrl}
                onChange={e => update({ hostingProviderUrl: e.target.value })}
                spellCheck={false}
              />
            </label>
          </div>

          <div className="ho-grid-3">
            <label className="ho-field">
              <span className="ho-label">Plan</span>
              <input
                className="ho-inp"
                placeholder="e.g. Growth Plan"
                value={doc.hostingPlan}
                onChange={e => update({ hostingPlan: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">Renewal date</span>
              <div className="ho-date-row">
                <input
                  className="ho-inp"
                  type="date"
                  value={doc.hostingRenewalDate}
                  onChange={e => update({ hostingRenewalDate: e.target.value })}
                />
                <DaysPill iso={doc.hostingRenewalDate} />
              </div>
            </label>
            <label className="ho-field">
              <span className="ho-label">Cost</span>
              <div className="ho-cost-row">
                <span className="ho-cost-prefix">$</span>
                <input
                  className="ho-inp ho-cost-inp"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={doc.hostingCost}
                  onChange={e => update({ hostingCost: e.target.value })}
                />
                <select
                  className="ho-inp ho-cost-period"
                  value={doc.hostingCostPeriod}
                  onChange={e => update({ hostingCostPeriod: e.target.value })}
                >
                  {COST_PERIODS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <label className="ho-field">
            <span className="ho-label">Notes</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={3}
              placeholder="Account number, billing email, server region, anything worth recording…"
              value={doc.hostingNotes}
              onChange={e => update({ hostingNotes: e.target.value })}
            />
          </label>
        </Section>

        {/* ── SSL ────────────────────────────────────────── */}
        <Section
          icon="🔒"
          label="SSL Certificate"
          sectionKey="ssl"
          expanded={expanded.ssl}
          onToggle={() => toggleSection('ssl')}
          badge={sslBadge}
        >
          <div className="ho-grid-3">
            <label className="ho-field">
              <span className="ho-label">Provider</span>
              <select
                className="ho-inp"
                value={doc.sslProvider}
                onChange={e => update({ sslProvider: e.target.value })}
              >
                {SSL_PROVIDERS.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="ho-field">
              <span className="ho-label">Expiry date</span>
              <div className="ho-date-row">
                <input
                  className="ho-inp"
                  type="date"
                  value={doc.sslExpiryDate}
                  onChange={e => update({ sslExpiryDate: e.target.value })}
                />
                <DaysPill iso={doc.sslExpiryDate} />
              </div>
            </label>
            <div className="ho-field">
              <span className="ho-label">Auto-renew</span>
              <Toggle
                checked={doc.sslAutoRenew}
                onChange={(v) => update({ sslAutoRenew: v })}
                label={doc.sslAutoRenew ? 'On' : 'Off'}
              />
            </div>
          </div>

          <label className="ho-field">
            <span className="ho-label">Notes</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={3}
              placeholder="Certificate authority, wildcard scope, renewal process…"
              value={doc.sslNotes}
              onChange={e => update({ sslNotes: e.target.value })}
            />
          </label>
        </Section>

        {/* ── Backups ────────────────────────────────────── */}
        <Section
          icon="💾"
          label="Backups"
          sectionKey="backups"
          expanded={expanded.backups}
          onToggle={() => toggleSection('backups')}
        >
          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">Backup provider</span>
              <input
                className="ho-inp"
                placeholder="e.g. UpdraftPlus, BackBlaze, host-built-in"
                value={doc.backupProvider}
                onChange={e => update({ backupProvider: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">Schedule</span>
              <select
                className="ho-inp"
                value={doc.backupSchedule}
                onChange={e => update({ backupSchedule: e.target.value })}
              >
                {BACKUP_SCHEDULES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="ho-grid-2">
            <label className="ho-field">
              <span className="ho-label">Retention</span>
              <input
                className="ho-inp"
                placeholder="e.g. 30 days, 12 weeks, 6 months"
                value={doc.backupRetention}
                onChange={e => update({ backupRetention: e.target.value })}
              />
            </label>
            <label className="ho-field">
              <span className="ho-label">Location</span>
              <input
                className="ho-inp"
                placeholder="Where backups are stored (S3 bucket, Dropbox folder, etc.)"
                value={doc.backupLocation}
                onChange={e => update({ backupLocation: e.target.value })}
              />
            </label>
          </div>

          <label className="ho-field">
            <span className="ho-label">Last backup confirmed</span>
            <div className="ho-date-row">
              <input
                className="ho-inp"
                type="date"
                value={doc.lastBackupConfirmed}
                onChange={e => update({ lastBackupConfirmed: e.target.value })}
              />
              <SinceBackupPill
                iso={doc.lastBackupConfirmed}
                schedule={doc.backupSchedule}
              />
            </div>
          </label>

          <label className="ho-field">
            <span className="ho-label">Notes</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={3}
              placeholder="Restore procedure, who confirms, what's included (DB, media, themes)…"
              value={doc.backupNotes}
              onChange={e => update({ backupNotes: e.target.value })}
            />
          </label>
        </Section>

        {/* ── Tech Contacts ─────────────────────────────── */}
        <Section
          icon="👥"
          label="Tech Contacts"
          sectionKey="contacts"
          expanded={expanded.contacts}
          onToggle={() => toggleSection('contacts')}
          badge={contactsBadge}
        >
          <div className="ho-contact-list">
            {(doc.contacts || []).length === 0 && (
              <div className="ho-empty">
                No contacts yet. Add at least a webmaster and an emergency contact.
              </div>
            )}
            {(doc.contacts || []).map(c => {
              const roleInfo = ROLE_BY_KEY[c.role] || ROLE_BY_KEY.other;
              return (
                <div key={c.id} className="ho-contact">
                  <div className="ho-contact-head">
                    <input
                      className="ho-inp ho-contact-name"
                      placeholder="Name"
                      value={c.name}
                      onChange={e => updateContact(c.id, { name: e.target.value })}
                    />
                    <select
                      className="ho-inp ho-contact-role"
                      value={c.role}
                      onChange={e => updateContact(c.id, { role: e.target.value })}
                      style={{
                        borderColor: roleInfo.color,
                        color: roleInfo.color,
                      }}
                    >
                      {CONTACT_ROLES.map(r => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ho-btn ho-btn-ghost ho-btn-sm"
                      onClick={() => removeContact(c.id)}
                      title="Remove contact"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="ho-grid-2">
                    <div className="ho-field">
                      <span className="ho-label">Email</span>
                      <div className="ho-contact-line">
                        <input
                          className="ho-inp"
                          type="email"
                          placeholder="name@example.com"
                          value={c.email}
                          onChange={e => updateContact(c.id, { email: e.target.value })}
                          spellCheck={false}
                        />
                        <CopyText
                          value={c.email}
                          type="email"
                          placeholder=""
                          onCopy={copyToClipboard}
                        />
                      </div>
                    </div>
                    <div className="ho-field">
                      <span className="ho-label">Phone</span>
                      <div className="ho-contact-line">
                        <input
                          className="ho-inp"
                          type="tel"
                          placeholder="(555) 123-4567"
                          value={c.phone}
                          onChange={e => updateContact(c.id, { phone: e.target.value })}
                        />
                        <CopyText
                          value={c.phone}
                          type="phone"
                          placeholder=""
                          onCopy={copyToClipboard}
                        />
                      </div>
                    </div>
                  </div>

                  <label className="ho-field">
                    <span className="ho-label">Notes</span>
                    <textarea
                      className="ho-inp ho-textarea"
                      rows={2}
                      placeholder="Availability, what they handle, after-hours number, etc."
                      value={c.notes}
                      onChange={e => updateContact(c.id, { notes: e.target.value })}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="ho-btn ho-btn-ghost ho-btn-add"
            onClick={addContact}
          >
            + Add contact
          </button>
        </Section>

        {/* ── Admin & Emergency ─────────────────────────── */}
        <Section
          icon="🔐"
          label="Admin & Emergency"
          sectionKey="admin"
          expanded={expanded.admin}
          onToggle={() => toggleSection('admin')}
        >
          <div className="ho-callout ho-callout-warning">
            <strong>Do not store passwords here.</strong>{' '}
            This document is for pointing to where credentials live — e.g. a 1Password
            vault or LastPass folder name — not the credentials themselves.
          </div>
          <label className="ho-field">
            <span className="ho-label">Admin access notes</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={4}
              placeholder="Where credentials are stored. e.g. '1Password vault: Church Tech — items: Domain, Hosting, DNS, SSL.'"
              value={doc.adminAccessNotes}
              onChange={e => update({ adminAccessNotes: e.target.value })}
            />
          </label>

          <label className="ho-field">
            <span className="ho-label">Emergency procedure</span>
            <textarea
              className="ho-inp ho-textarea"
              rows={6}
              placeholder={'What to do if the site goes down:\n1. Check hosting status page\n2. Call/email webmaster\n3. If unreachable after 30 min, contact emergency contact\n4. …'}
              value={doc.emergencyProcedure}
              onChange={e => update({ emergencyProcedure: e.target.value })}
            />
          </label>
        </Section>

        {/* ── General notes ─────────────────────────────── */}
        <Section
          icon="📝"
          label="General Notes"
          sectionKey="notes"
          expanded={expanded.notes}
          onToggle={() => toggleSection('notes')}
        >
          <textarea
            className="ho-inp ho-textarea ho-notes"
            rows={6}
            placeholder="Anything else worth recording for the next person who has to touch this…"
            value={doc.generalNotes}
            onChange={e => update({ generalNotes: e.target.value })}
          />
        </Section>

        <footer className="ho-foot">
          <span className="ho-muted">
            Last updated {formatTimestamp(doc.updatedAt)} · stored locally as <code>web:hosting</code>
          </span>
        </footer>
      </main>

      <Toast message={toast} />
    </div>
    </WebsiteShell>
  );
}
