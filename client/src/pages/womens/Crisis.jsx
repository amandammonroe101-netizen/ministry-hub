import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
/* Reuses the .ys-* form primitives from the Youth roster for
   field/row structure. Everything else — banner, stats, quicklinks,
   search/filters, card grid, and the Level 2 case drill-in (tabs,
   dash row) — is the rose-gold embossed system (.wcc-*) matching
   Retreats' RetreatView pattern, see Crisis.css. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Crisis.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Care → Crisis & Counseling

   Confidential case log for care requests — intake, urgency,
   pastor/counselor referral, resources given, and follow-up.
   Deliberately kept separate from Prayer Groups / Support Groups:
   this is per-woman case tracking with a status lifecycle, not a
   standing group roster.

   Every case's name and situation summary render blurred until
   tapped, same "tap to reveal" convention as sensitive prayer
   requests — this data is more sensitive than anything else in
   Women's Ministry, so it defaults closed everywhere it appears.

   Storage: useUserStoreKey('womens:crisis-cases', [])
   Reads (read-only, cross-links to their own pages):
     'womens:women'          — link a case to a directory profile
     'womens:care-resources' — checklist of resources given,
                                 managed on the Referral Directory page

   Follow-up → Calendar: same opt-in sync pattern as New Mom
   Support's check-ins — when a next-follow-up date is set and sync
   is on, a single reminder event is (re)written to the shared
   calendar (source 'women-crisis-followup').
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  new:         { label: 'New',        icon: '🆕' },
  'in-care':   { label: 'In Care',    icon: '💗' },
  referred:    { label: 'Referred',   icon: '📨' },
  'follow-up': { label: 'Follow-up',  icon: '📅' },
  closed:      { label: 'Closed',     icon: '✅' },
};
const STATUS_ORDER = ['new', 'in-care', 'referred', 'follow-up', 'closed'];

const URGENCY_META = {
  routine:   { label: 'Routine',   icon: '🟢' },
  urgent:    { label: 'Urgent',    icon: '🟠' },
  emergency: { label: 'Emergency', icon: '🔴' },
};
const URGENCY_ORDER = ['routine', 'urgent', 'emergency'];

const TABS = [
  { key: 'intake',    label: 'Intake',    icon: 'ℹ️' },
  { key: 'referral',  label: 'Referral',  icon: '📨' },
  { key: 'resources', label: 'Resources', icon: '📇' },
  { key: 'followup',  label: 'Follow-up', icon: '📅' },
  { key: 'close',     label: 'Close out', icon: '✅' },
];

const CAL_SOURCE_FOLLOWUP = 'women-crisis-followup';
const CAL_COLOR_FOLLOWUP  = '#f472b6';

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_CASE = () => ({
  id:                makeId('cc'),
  name:              '',
  womanId:           null,
  contactPhone:      '',
  urgency:           'routine',
  status:            'new',
  intakeDate:        today(),
  requestedBy:       '',
  situationSummary:  '',
  assignedTo:        '',
  referralTo:        '',
  referralResourceId: null,
  referralDate:      '',
  referralNotes:     '',
  resourcesGiven:    [], // [resourceId]
  followUps:         [], // [{ id, date, notes, createdAt }]
  nextFollowUp:      '',
  syncFollowUpToCalendar: false,
  closedNote:        '',
  closedDate:        '',
  createdAt:         Date.now(),
});

export default function Crisis() {
  const [cases, setCases, { loading }] = useUserStoreKey('womens:crisis-cases', []);
  const [women] = useUserStoreKey('womens:women', []);
  const [resources] = useUserStoreKey('womens:care-resources', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);
  const list = Array.isArray(cases) ? cases : [];
  const womenList = Array.isArray(women) ? women : [];
  const resourceList = Array.isArray(resources) ? resources.filter(r => r.active !== false) : [];
  const navigate = useNavigate();

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [revealed, setRevealed] = useState(() => new Set());

  const toggleReveal = (id) => {
    setRevealed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const syncFollowUpCalendarFor = (c) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const others = evList.filter(e => !(e.source === CAL_SOURCE_FOLLOWUP && e.source_id === c.id));
      if (!c.syncFollowUpToCalendar || c.status === 'closed' || !c.nextFollowUp) return others;
      return [{
        id: 'ce_' + Date.now().toString(36) + '_cc_' + Math.random().toString(36).slice(2, 6),
        created_at:  new Date().toISOString(),
        title:       '🆘 Care follow-up',
        description: 'Confidential — see Crisis & Counseling for details.',
        event_date:  c.nextFollowUp,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR_FOLLOWUP,
        category:    'womens',
        source:      CAL_SOURCE_FOLLOWUP,
        source_id:   c.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...others];
    });
  };
  const removeFollowUpCalendarFor = (caseId) => {
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE_FOLLOWUP && e.source_id === caseId)));
  };

  const addCase = () => {
    const c = DEFAULT_CASE();
    setCases(prev => [...(prev || []), c]);
    setOpenId(c.id);
  };

  const updateCase = (id, patch) => {
    const current = list.find(c => c.id === id);
    setCases(prev => (prev || []).map(c => c.id === id ? { ...c, ...patch } : c));
    if (!current) return;
    const merged = { ...current, ...patch };
    if (patch.nextFollowUp !== undefined || patch.syncFollowUpToCalendar !== undefined || patch.status !== undefined) {
      syncFollowUpCalendarFor(merged);
    }
  };

  const closeCase = (id, { closedNote }) => {
    updateCase(id, { status: 'closed', closedNote: (closedNote || '').trim(), closedDate: today() });
  };
  const reopenCase = (id) => {
    updateCase(id, { status: 'follow-up', closedNote: '', closedDate: '' });
  };

  const logFollowUp = (id, { date, notes }) => {
    if (!date) return;
    const current = list.find(c => c.id === id);
    if (!current) return;
    const entry = { id: makeId('fu'), date, notes: (notes || '').trim(), createdAt: new Date().toISOString() };
    updateCase(id, { followUps: [entry, ...(Array.isArray(current.followUps) ? current.followUps : [])] });
  };
  const removeFollowUp = (id, followUpId) => {
    const current = list.find(c => c.id === id);
    if (!current) return;
    updateCase(id, { followUps: (current.followUps || []).filter(f => f.id !== followUpId) });
  };

  const toggleResourceGiven = (id, resourceId) => {
    const current = list.find(c => c.id === id);
    if (!current) return;
    const given = Array.isArray(current.resourcesGiven) ? current.resourcesGiven : [];
    const next = given.includes(resourceId) ? given.filter(r => r !== resourceId) : [...given, resourceId];
    updateCase(id, { resourcesGiven: next });
  };

  const removeCase = (id) => {
    setCases(prev => (prev || []).filter(c => c.id !== id));
    removeFollowUpCalendarFor(id);
    if (openId === id) setOpenId(null);
  };

  const openWoman = (womanId) => navigate(`/womens/all?woman=${womanId}`);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.assignedTo || '').toLowerCase().includes(q) ||
          (c.referralTo || '').toLowerCase().includes(q))
      : list;
    if (statusFilter === 'active') out = out.filter(c => c.status !== 'closed');
    else if (statusFilter === 'overdue') out = out.filter(c => c.status !== 'closed' && !!c.nextFollowUp && c.nextFollowUp < today());
    else if (statusFilter !== 'all') out = out.filter(c => (c.status || 'new') === statusFilter);
    return [...out].sort((a, b) => (b.intakeDate || '').localeCompare(a.intakeDate || ''));
  }, [list, query, statusFilter]);

  const openCase = useMemo(() => list.find(c => c.id === openId) || null, [list, openId]);

  const stats = useMemo(() => ({
    active:   list.filter(c => c.status !== 'closed').length,
    referred: list.filter(c => c.status === 'referred').length,
    overdue:  list.filter(c => c.status !== 'closed' && !!c.nextFollowUp && c.nextFollowUp < today()).length,
    closed:   list.filter(c => c.status === 'closed').length,
  }), [list]);

  return (
    <WomensShell
      title="Crisis & Counseling"
      icon="🆘"
      subtitle="Confidential care case log — intake, urgency, pastor/counselor referrals, resources given, and follow-up. Access restricted to care team."
      actions={
        !openCase && (
          <button type="button" className="wms-btn primary" onClick={addCase}>
            ✦ New case
          </button>
        )
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wcc-root wcc-page">
          {openCase ? (
            <CaseView
              caseItem={openCase}
              women={womenList}
              resources={resourceList}
              onChange={(patch) => updateCase(openCase.id, patch)}
              onClose={(payload) => closeCase(openCase.id, payload)}
              onReopen={() => reopenCase(openCase.id)}
              onLogFollowUp={(entry) => logFollowUp(openCase.id, entry)}
              onRemoveFollowUp={(fid) => removeFollowUp(openCase.id, fid)}
              onToggleResource={(rid) => toggleResourceGiven(openCase.id, rid)}
              onDelete={() => removeCase(openCase.id)}
              onOpenWoman={openWoman}
              onBack={() => setOpenId(null)}
            />
          ) : (
            <>
              <div className="wcc-banner">
                🔒 Confidential — case names and details are blurred by default. Tap a case to reveal it.
              </div>

              {loading && list.length === 0 ? (
                <div className="wa-directory-empty" style={{ flex: 1 }}>Loading…</div>
              ) : list.length === 0 ? (
                <div className="wa-empty app-empty">
                  <div className="app-empty-icon">🆘</div>
                  <div className="app-empty-title">No cases yet</div>
                  <div className="app-empty-sub">
                    Log a care request — intake details, urgency, referral, and
                    follow-up all live on her case here.
                  </div>
                  <button type="button" className="app-btn primary" onClick={addCase}>
                    ✦ Log your first case
                  </button>
                </div>
              ) : (
                <div className="wa-directory">
                  <div className="wcc-stat-row">
                    <div className="wcc-stat">
                      <span className="wcc-stat-n">{stats.active}</span>
                      <span className="wcc-stat-lbl">Active cases</span>
                    </div>
                    <div className="wcc-stat">
                      <span className="wcc-stat-n">{stats.referred}</span>
                      <span className="wcc-stat-lbl">Referred</span>
                    </div>
                    <div className={stats.overdue > 0 ? 'wcc-stat is-warn has-value' : 'wcc-stat'}>
                      <span className="wcc-stat-n">{stats.overdue}</span>
                      <span className="wcc-stat-lbl">Follow-ups overdue</span>
                    </div>
                    <div className="wcc-stat">
                      <span className="wcc-stat-n">{stats.closed}</span>
                      <span className="wcc-stat-lbl">Closed</span>
                    </div>
                  </div>

                  <div className="wcc-quicklinks">
                    <button type="button" className="wcc-btn-ghost" onClick={() => navigate('/womens/referrals')}>
                      📇 Referral Directory →
                    </button>
                    <button type="button" className="wcc-btn-ghost" onClick={() => navigate('/womens/support-groups')}>
                      🫂 Support Groups →
                    </button>
                  </div>

                  <div className="wcc-controls">
                    <div className="wcc-search-wrap">
                      <span>🔍</span>
                      <input
                        type="text"
                        placeholder="Search by name, care team, referral…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                      />
                      {query && <button className="wcc-search-clear" onClick={() => setQuery('')}>✕</button>}
                    </div>
                  </div>

                  <div className="wcc-filter-row">
                    {[
                      { id: 'active',  label: 'Active' },
                      { id: 'all',     label: 'All' },
                      ...STATUS_ORDER.map(id => ({ id, label: `${STATUS_META[id].icon} ${STATUS_META[id].label}` })),
                      { id: 'overdue', label: '⚡ Follow-up overdue' },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        className={`wcc-filter-chip ${statusFilter === f.id ? 'on' : ''}`}
                        onClick={() => setStatusFilter(f.id)}
                      >{f.label}</button>
                    ))}
                  </div>

                  {visible.length === 0 ? (
                    <div className="wa-directory-empty">
                      {query ? `No cases match "${query}".` : 'No cases match this filter.'}
                    </div>
                  ) : (
                    <div className="wcc-card-grid">
                      {visible.map((c, i) => (
                        <CaseCard
                          key={c.id}
                          caseItem={c}
                          index={i}
                          revealed={revealed.has(c.id)}
                          onToggleReveal={() => toggleReveal(c.id)}
                          onOpen={() => setOpenId(c.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}

/* ── Directory card — blurred until revealed ────────────────── */
function CaseCard({ caseItem: c, index, revealed, onToggleReveal, onOpen }) {
  const status = STATUS_META[c.status || 'new'] || STATUS_META.new;
  const urgency = URGENCY_META[c.urgency || 'routine'] || URGENCY_META.routine;
  const overdue = c.status !== 'closed' && !!c.nextFollowUp && c.nextFollowUp < today();
  const label = c.name || `Case #${index + 1}`;

  return (
    <div className="wcc-card">
      <div className="wcc-card-top">
        <button
          type="button"
          className={`wcc-card-name${!revealed ? ' is-blurred' : ''}`}
          onClick={onToggleReveal}
          title={revealed ? 'Tap to blur' : 'Tap to reveal'}
        >
          {revealed ? label : '●●●●● (tap to reveal)'}
        </button>
        <span className={`wcc-badge urgency-${c.urgency || 'routine'}`}>{urgency.icon} {urgency.label}</span>
      </div>

      <div className="wcc-card-status">
        <span className={`wcc-status-pill status-${c.status || 'new'}`}>{status.icon} {status.label}</span>
        {overdue && <span className="wcc-status-pill status-overdue">⚡ Follow-up overdue</span>}
      </div>

      <div
        className={`wcc-card-summary${!revealed ? ' is-blurred' : ''}`}
        onClick={onToggleReveal}
      >
        {revealed ? (c.situationSummary || 'No summary yet.') : 'Tap name to reveal details'}
      </div>

      <div className="wcc-card-foot">
        <span>Intake {c.intakeDate || '—'}</span>
        <button type="button" className="wcc-open-btn" onClick={onOpen}>Open case →</button>
      </div>
    </div>
  );
}

/* ── Level 2: dedicated case drill-in ───────────────────────── */
function CaseView({ caseItem: c, women, resources, onChange, onClose, onReopen, onLogFollowUp, onRemoveFollowUp, onToggleResource, onDelete, onOpenWoman, onBack }) {
  const [tab, setTab] = useState('intake');
  const [confirmDel, setConfirmDel] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const linkedWoman = women.find(w => w.id === c.womanId);
  const resourcesGiven = Array.isArray(c.resourcesGiven) ? c.resourcesGiven : [];
  const followUps = Array.isArray(c.followUps) ? c.followUps : [];

  const status = STATUS_META[c.status || 'new'] || STATUS_META.new;
  const urgency = URGENCY_META[c.urgency || 'routine'] || URGENCY_META.routine;
  const overdue = c.status !== 'closed' && !!c.nextFollowUp && c.nextFollowUp < today();

  const daysSinceIntake = c.intakeDate
    ? Math.round((new Date(today()) - new Date(c.intakeDate)) / 86400000)
    : null;
  const daysUntilFollowUp = c.nextFollowUp
    ? Math.round((new Date(c.nextFollowUp) - new Date(today())) / 86400000)
    : null;
  const followUpTier = c.status === 'closed' || daysUntilFollowUp == null
    ? 'none'
    : daysUntilFollowUp < 0 ? 'bad' : daysUntilFollowUp <= 3 ? 'warn' : 'good';

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const pickWoman = (e) => {
    const id = e.target.value || null;
    const w = women.find(x => x.id === id);
    onChange({ womanId: id, name: w ? w.name : c.name });
  };

  const submitClose = () => {
    onClose({ closedNote: closeNote });
    setClosing(false);
    setCloseNote('');
  };

  return (
    <div className="wcc-view">
      <button type="button" className="wcc-view-back" onClick={onBack}>← All Cases</button>

      <div className="wcc-view-head">
        <span className="wcc-view-icon">🆘</span>
        <input
          type="text"
          className="ys-inp wcc-title-inp wcc-view-title-inp"
          value={c.name || ''}
          onChange={set('name')}
          placeholder="Name (or leave blank for anonymous)"
        />
        <select className="ys-inp wcc-view-status-sel" value={c.status || 'new'} onChange={set('status')} disabled={c.status === 'closed'}>
          {STATUS_ORDER.filter(id => id !== 'closed').map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
          {c.status === 'closed' && <option value="closed">✅ Closed</option>}
        </select>
        <button
          type="button"
          className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete' : '🗑 Delete'}
        </button>
      </div>

      <div className="wcc-view-meta">
        <span className={`wcc-chip urgency-${c.urgency || 'routine'}`}>{urgency.icon} {urgency.label}</span>
        {c.intakeDate && <span className="wcc-chip">📅 Intake {c.intakeDate}</span>}
        {c.assignedTo && <span className="wcc-chip">🙋 {c.assignedTo}</span>}
        {overdue && <span className="wcc-chip is-over">⚡ Follow-up overdue</span>}
        {linkedWoman && (
          <button type="button" className="wcc-open-woman" onClick={() => onOpenWoman(linkedWoman.id)}>
            Open her profile →
          </button>
        )}
      </div>

      <div className="wcc-dash-row">
        <div className="wcc-dash-stat">
          <span className="wcc-dash-n">{status.icon}</span>
          <span className="wcc-dash-lbl">{status.label}</span>
        </div>
        <div className="wcc-dash-stat">
          <span className="wcc-dash-n">{daysSinceIntake == null ? '—' : daysSinceIntake}</span>
          <span className="wcc-dash-lbl">Days since intake</span>
        </div>
        <div className="wcc-dash-stat">
          <span className="wcc-dash-n">{followUps.length}</span>
          <span className="wcc-dash-lbl">Follow-ups logged</span>
        </div>
        <div className={`wcc-dash-stat is-days tier-${followUpTier}`}>
          <span className="wcc-dash-n">{daysUntilFollowUp == null ? '—' : Math.abs(daysUntilFollowUp)}</span>
          <span className="wcc-dash-lbl">
            {daysUntilFollowUp == null ? 'No follow-up set' : daysUntilFollowUp < 0 ? 'Days overdue' : 'Days until follow-up'}
          </span>
        </div>
      </div>

      <nav className="wcc-tabs" role="tablist" aria-label="Case views">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`wcc-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'resources' && resourcesGiven.length > 0 && <span className="wcc-tab-badge">{resourcesGiven.length}</span>}
            {t.key === 'followup' && followUps.length > 0 && <span className="wcc-tab-badge">{followUps.length}</span>}
          </button>
        ))}
      </nav>

      <div className="wcc-view-body">
        {tab === 'intake' && (
          <Section title="Intake">
            <Row>
              <Field label="Link to All Women (optional)">
                <select className="ys-inp" value={c.womanId || ''} onChange={pickWoman}>
                  <option value="">— not linked —</option>
                  {women.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              <Field label="Contact phone">
                <input type="text" className="ys-inp" value={c.contactPhone || ''} onChange={set('contactPhone')} placeholder="Optional" />
              </Field>
            </Row>
            <Row>
              <Field label="Intake date">
                <input type="date" className="ys-inp" value={c.intakeDate || ''} onChange={set('intakeDate')} />
              </Field>
              <Field label="Requested by">
                <input type="text" className="ys-inp" value={c.requestedBy || ''} onChange={set('requestedBy')} placeholder="Self, spouse, friend, staff…" />
              </Field>
            </Row>
            <Row>
              <Field label="Urgency">
                <select className="ys-inp" value={c.urgency || 'routine'} onChange={set('urgency')}>
                  {URGENCY_ORDER.map(id => <option key={id} value={id}>{URGENCY_META[id].icon} {URGENCY_META[id].label}</option>)}
                </select>
              </Field>
              <Field label="Assigned care team member">
                <input type="text" className="ys-inp" value={c.assignedTo || ''} onChange={set('assignedTo')} placeholder="Who is walking with her" />
              </Field>
            </Row>
            <Field label="Situation summary">
              <textarea
                className="ys-inp ys-textarea"
                rows={4}
                value={c.situationSummary || ''}
                onChange={set('situationSummary')}
                placeholder="What's going on — kept confidential, visible only when this case is opened"
              />
            </Field>
          </Section>
        )}

        {tab === 'referral' && (
          <Section title="Referral">
            <Row>
              <Field label="Referred to">
                <input type="text" className="ys-inp" value={c.referralTo || ''} onChange={set('referralTo')} placeholder="Pastor or counselor name" />
              </Field>
              <Field label="Referral date">
                <input type="date" className="ys-inp" value={c.referralDate || ''} onChange={set('referralDate')} />
              </Field>
            </Row>
            <Field label="Linked resource (optional)">
              <select className="ys-inp" value={c.referralResourceId || ''} onChange={e => onChange({ referralResourceId: e.target.value || null })}>
                <option value="">— none —</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Referral notes">
              <textarea className="ys-inp ys-textarea" rows={2} value={c.referralNotes || ''} onChange={set('referralNotes')} placeholder="What was discussed, next steps…" />
            </Field>
          </Section>
        )}

        {tab === 'resources' && (
          <Section title="Resources given">
            {resources.length === 0 ? (
              <div className="wcc-empty-note">
                No resources in the directory yet — add counselors, hotlines, and organizations
                on the Referral Directory page to check them off here.
              </div>
            ) : (
              <div className="wcc-resource-list">
                {resources.map(r => (
                  <label key={r.id} className="wcc-resource-row">
                    <input type="checkbox" checked={resourcesGiven.includes(r.id)} onChange={() => onToggleResource(r.id)} />
                    <span>{r.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Section>
        )}

        {tab === 'followup' && (
          <Section title="Follow-up">
            <Row>
              <Field label="Next follow-up">
                <input type="date" className="ys-inp" value={c.nextFollowUp || ''} onChange={set('nextFollowUp')} disabled={c.status === 'closed'} />
              </Field>
              <Field label="Sync to Calendar">
                <label className={`wcc-sync-check${c.nextFollowUp ? '' : ' is-disabled'}`}>
                  <input type="checkbox" checked={!!c.syncFollowUpToCalendar} disabled={!c.nextFollowUp || c.status === 'closed'} onChange={set('syncFollowUpToCalendar')} />
                  <span>📆 Add reminder</span>
                </label>
              </Field>
            </Row>
            <FollowUpLog followUps={c.followUps} onLog={onLogFollowUp} onRemove={onRemoveFollowUp} disabled={c.status === 'closed'} />
          </Section>
        )}

        {tab === 'close' && (
          <Section title="Close out">
            {c.status === 'closed' ? (
              <>
                <div className="wcc-closed-note">Closed {c.closedDate}{c.closedNote ? ` — ${c.closedNote}` : ''}</div>
                <button type="button" className="wcc-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onReopen}>↺ Reopen case</button>
              </>
            ) : closing ? (
              <>
                <Field label="Resolution note">
                  <textarea
                    className="ys-inp ys-textarea"
                    rows={2}
                    autoFocus
                    value={closeNote}
                    onChange={e => setCloseNote(e.target.value)}
                    placeholder="How this was resolved…"
                  />
                </Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="wcc-btn-confirm" onClick={submitClose}>✓ Close case</button>
                  <button type="button" className="wcc-btn-ghost" onClick={() => setClosing(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <button type="button" className="wcc-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setClosing(true)}>✓ Close this case</button>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

/* ── Follow-up log ──────────────────────────────────────────── */
function FollowUpLog({ followUps, onLog, onRemove, disabled }) {
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const list = Array.isArray(followUps) ? followUps : [];

  const log = () => {
    if (!date) return;
    onLog({ date, notes });
    setDate(today());
    setNotes('');
  };

  return (
    <>
      {!disabled && (
        <>
          <Row>
            <Field label="Date">
              <input type="date" className="ys-inp" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Notes">
              <input type="text" className="ys-inp" value={notes} onChange={e => setNotes(e.target.value)} placeholder="How the check-in went…" />
            </Field>
          </Row>
          <button
            type="button"
            className="ys-add-btn"
            style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }}
            disabled={!date}
            onClick={log}
          >
            ＋ Log follow-up
          </button>
        </>
      )}

      {list.length === 0 ? (
        <div className="wcc-empty-note" style={{ marginTop: 4 }}>
          No follow-ups logged yet.
        </div>
      ) : (
        <ul className="wcc-followup-list">
          {list.map(f => (
            <li key={f.id} className="wcc-followup-row">
              <span className="wcc-followup-icon" aria-hidden="true">📅</span>
              <span className="wcc-followup-body">
                <span className="wcc-followup-date">{f.date}</span>
                <span className="wcc-followup-note">{f.notes || 'Checked in'}</span>
              </span>
              <button type="button" className="wcc-followup-del" onClick={() => onRemove(f.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="wcc-panel">
      <h3 className="wcc-panel-title">{title}</h3>
      <div className="wcc-panel-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
