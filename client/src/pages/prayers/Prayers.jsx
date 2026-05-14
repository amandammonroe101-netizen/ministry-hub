import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { prayerService } from '../../services/prayerService';
import { friendsService } from '../../services/friendsService';
import { format, parseISO, differenceInDays } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import './Prayers.css';

/* ─────────────────────────────────────────────────────────────
   Static data
   ───────────────────────────────────────────────────────────── */
const STATUSES = [
  { value: 'praying',  label: 'Praying',  emoji: '🙏', color: 'rgba(167,139,250,0.18)', text: '#c4b5fd' },
  { value: 'waiting',  label: 'Waiting',  emoji: '⏳', color: 'rgba(251,191,36,0.18)',  text: '#fcd34d' },
  { value: 'answered', label: 'Answered', emoji: '✓',  color: 'rgba(52,211,153,0.18)',  text: '#6ee7b7' },
];
const URGENT = { value: 'urgent', label: 'Urgent', emoji: '🔥', color: 'rgba(239,68,68,0.18)', text: '#fca5a5' };
const CATEGORIES = ['General','Health','Family','Church','Provision','Guidance','Relationships','Ministry','Other'];

const TABS = [
  { key: 'updates',  label: 'Updates',     emoji: '🙏', hint: 'Add notes over time as God moves — this is the running story of this prayer.' },
  { key: 'request',  label: 'Request',     emoji: '📖', hint: 'The original prayer, scripture, and quick toggles like status and daily list.' },
  { key: 'people',   label: 'Praying For', emoji: '👥', hint: 'Link friends to this prayer so you remember who you’re lifting up.' },
  { key: 'insights', label: 'Insights',    emoji: '📊', hint: 'See how long this prayer has been on the wall and how often you’ve added updates.' },
];

const EMPTY_FORM = {
  title: '', content: '',
  entry_type: 'request',
  category: 'General', status: 'praying',
  is_urgent: false, is_daily: false,
  scripture: '',
  friend_ids: [],
};

const getStatus = (p) => p.is_urgent ? URGENT : (STATUSES.find(s => s.value === p.status) || STATUSES[0]);
const ageDays = (createdAt) => {
  try { return differenceInDays(new Date(), parseISO(createdAt.replace(' ', 'T'))); }
  catch { return 0; }
};

/* ─────────────────────────────────────────────────────────────
   Smart section definitions
   ───────────────────────────────────────────────────────────── */
const SMART_SECTIONS = [
  {
    key: 'urgent',
    label: 'Urgent',
    emoji: '🔥',
    tone: 'urgent',
    subtitle: 'Prayers that need attention right now.',
    filter: (p) => p.is_urgent && p.status !== 'answered' && p.entry_type !== 'praise',
  },
  {
    key: 'daily',
    label: 'Daily List',
    emoji: '📆',
    tone: 'daily',
    subtitle: 'Prayers you want to lift up every day.',
    filter: (p) => p.is_daily && p.status !== 'answered' && p.entry_type !== 'praise',
  },
  {
    key: 'active',
    label: 'Active',
    emoji: '🙏',
    tone: 'active',
    subtitle: 'Everything you’re currently praying through.',
    filter: (p) => p.status === 'praying' && !p.is_urgent && !p.is_daily && p.entry_type !== 'praise',
  },
  {
    key: 'longstanding',
    label: 'Long-Standing (30+ days)',
    emoji: '⏳',
    tone: 'waiting',
    subtitle: 'Prayers you’ve been carrying for over a month.',
    filter: (p) =>
      (p.status === 'praying' || p.status === 'waiting') &&
      p.entry_type !== 'praise' &&
      ageDays(p.created_at) >= 30,
  },
  {
    key: 'answered',
    label: 'Answered Testimonies',
    emoji: '🎉',
    tone: 'answered',
    subtitle: 'Look back at what God has done.',
    filter: (p) => p.status === 'answered' && p.entry_type !== 'praise',
  },
  {
    key: 'praise',
    label: 'Praise & Thanksgiving',
    emoji: '✨',
    tone: 'praise',
    subtitle: 'Gratitude — celebrating God without a request attached.',
    filter: (p) => p.entry_type === 'praise',
  },
];

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Prayers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [prayers, setPrayers]   = useState([]);
  const [friends, setFriends]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const [search, setSearch]                       = useState('');
  const [activeSection, setActiveSection]         = useState('active');
  const [expandedSections, setExpandedSections]   = useState({ active: true, urgent: true });
  const [categoryExpanded, setCategoryExpanded]   = useState(false);
  const [activeCategory, setActiveCategory]       = useState(null);
  const [activeTab, setActiveTab]                 = useState('updates');
  const [updateText, setUpdateText]               = useState('');
  const [addingUpdate, setAddingUpdate]           = useState(false);
  const [showFriendPicker, setShowFriendPicker]   = useState(false);
  const [leftCollapsed, setLeftCollapsed]         = useState(false);
  const [rightCollapsed, setRightCollapsed]       = useState(false);

  /* ── data loading ────────────────────────────────────────── */
  useEffect(() => { fetchPrayers(); fetchFriends(); }, []);

  /* ── URL query param handling (cross-tab links from Friends) ── */
  useEffect(() => {
    // Wait until data is loaded
    if (prayers.length === 0 && friends.length === 0) return;

    const prayerId = searchParams.get('prayer');
    const isNew    = searchParams.get('new') === '1';
    const friendId = searchParams.get('friend');

    if (isNew) {
      const friendIds = friendId ? [Number(friendId)] : [];
      setShowForm(true);
      setSelected(null);
      setForm({ ...EMPTY_FORM, entry_type: 'request', friend_ids: friendIds });
      setSearchParams({}, { replace: true });
    } else if (prayerId) {
      const p = prayers.find(x => x.id === Number(prayerId));
      if (p) {
        setSelected(p);
        setShowForm(false);
        setActiveTab('updates');
      }
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayers, friends]);

  const fetchPrayers = async () => {
    try {
      const res = await prayerService.getAll();
      setPrayers(res.data.data);
    } catch { setError('Could not load prayers.'); }
  };
  const fetchFriends = async () => {
    try {
      const res = await friendsService.getFriends();
      setFriends(res.data.data);
    } catch { /* friends optional */ }
  };

  /* ── mutations ───────────────────────────────────────────── */
  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const res = await prayerService.create(form);
      const created = res.data.data;
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSelected(created);
      setActiveTab('updates');
      await fetchPrayers();
    } catch { setError('Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this prayer? This cannot be undone.')) return;
    try {
      await prayerService.delete(id);
      setPrayers(prev => prev.filter(p => p.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch { setError('Failed to delete.'); }
  };

  const handleStatusChange = async (p, newStatus) => {
    try {
      const res = await prayerService.update(p.id, {
        status: newStatus,
        is_urgent: newStatus === 'urgent' ? 1 : 0,
      });
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    } catch { setError('Failed to update status.'); }
  };

  const handleToggleDaily = async (p) => {
    try {
      const res = await prayerService.update(p.id, { is_daily: p.is_daily ? 0 : 1 });
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    } catch { setError('Failed to toggle daily.'); }
  };

  const handleAddUpdate = async () => {
    if (!updateText.trim() || !selected) return;
    setAddingUpdate(true);
    try {
      await prayerService.addUpdate(selected.id, { content: updateText });
      setUpdateText('');
      const res = await prayerService.getOne(selected.id);
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
    } catch { setError('Failed to add update.'); }
    finally { setAddingUpdate(false); }
  };

  const handleSetFriends = async (friendIds) => {
    if (!selected) return;
    try {
      const res = await prayerService.setFriends(selected.id, friendIds);
      const updated = res.data.data;
      setPrayers(prev => prev.map(x => x.id === updated.id ? updated : x));
      setSelected(updated);
    } catch { setError('Failed to update friends.'); }
  };

  const toggleFriendLink = (friendId) => {
    if (!selected) return;
    const current = (selected.friends || []).map(f => f.id);
    const next = current.includes(friendId)
      ? current.filter(id => id !== friendId)
      : [...current, friendId];
    handleSetFriends(next);
  };

  /* ── derived ─────────────────────────────────────────────── */
  const filteredBySearch = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return prayers;
    return prayers.filter(p =>
      p.title.toLowerCase().includes(s) ||
      p.content.toLowerCase().includes(s) ||
      (p.category || '').toLowerCase().includes(s)
    );
  }, [prayers, search]);

  const sectionPrayers = useMemo(() => {
    const map = {};
    for (const sec of SMART_SECTIONS) {
      map[sec.key] = filteredBySearch.filter(sec.filter);
    }
    return map;
  }, [filteredBySearch]);

  const categoryGroups = useMemo(() => {
    const map = {};
    for (const c of CATEGORIES) map[c] = [];
    for (const p of filteredBySearch) {
      const c = p.category || 'General';
      if (!map[c]) map[c] = [];
      map[c].push(p);
    }
    return map;
  }, [filteredBySearch]);

  const overall = useMemo(() => ({
    total:     prayers.length,
    answered:  prayers.filter(p => p.status === 'answered').length,
    urgent:    prayers.filter(p => p.is_urgent && p.status !== 'answered').length,
    daily:     prayers.filter(p => p.is_daily && p.status !== 'answered').length,
    praise:    prayers.filter(p => p.entry_type === 'praise').length,
    longstanding: prayers.filter(p =>
      (p.status === 'praying' || p.status === 'waiting') &&
      p.entry_type !== 'praise' &&
      ageDays(p.created_at) >= 30
    ).length,
  }), [prayers]);

  const answerRate = overall.total ? Math.round((overall.answered / overall.total) * 100) : 0;

  /* ── handlers ────────────────────────────────────────────── */
  const openNew = (entryType = 'request') => {
    setShowForm(true);
    setSelected(null);
    setForm({ ...EMPTY_FORM, entry_type: entryType });
  };
  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); };

  const openPrayer = (p) => {
    setSelected(p);
    setShowForm(false);
    setActiveTab('updates');
    setShowFriendPicker(false);
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    setActiveSection(key);
  };

  const leftW  = leftCollapsed  ? 'var(--rail-w)' : '300px';
  const rightW = rightCollapsed ? 'var(--rail-w)' : '240px';

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="p-root">
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
          <span className="app-tab-tag prayers">Prayers</span>
        </div>
        <div className="app-tb-actions">
          <button className="app-btn primary" onClick={() => openNew('request')}>✦ New Prayer</button>
          <button className="app-btn ghost"   onClick={() => openNew('praise')}>✨ Praise</button>
        </div>
      </div>

      {/* BODY */}
      <div className="p-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* ── LEFT: Smart sections sidebar ── */}
        <aside className={`p-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">My Prayer Wall</span>}
          </div>

          {!leftCollapsed && (
            <>
              <div className="app-search">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search prayers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="p-search-clear" onClick={() => setSearch('')}>✕</button>
                )}
              </div>

              {error && (
                <div className="p-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}

              <div className="p-sections-scroll">
                {SMART_SECTIONS.map(sec => {
                  const list = sectionPrayers[sec.key] || [];
                  if (list.length === 0 && sec.key !== 'active') return null;
                  const open = expandedSections[sec.key] ?? false;
                  return (
                    <div key={sec.key} className={`p-sec p-sec-${sec.tone}`}>
                      <button
                        className={`p-sec-header ${activeSection === sec.key ? 'on' : ''}`}
                        onClick={() => toggleSection(sec.key)}
                        title={sec.subtitle}
                      >
                        <span className="p-sec-emoji">{sec.emoji}</span>
                        <span className="p-sec-label">{sec.label}</span>
                        <span className="p-sec-count">{list.length}</span>
                        <span className="p-sec-chevron">{open ? '▾' : '▸'}</span>
                      </button>
                      {open && sec.subtitle && (
                        <div className="p-sec-subtitle">{sec.subtitle}</div>
                      )}
                      {open && (
                        <div className="p-sec-list">
                          {list.length === 0 ? (
                            <div className="p-sec-empty">No prayers here yet.</div>
                          ) : list.map(p => (
                            <PrayerRow
                              key={p.id}
                              prayer={p}
                              selected={selected?.id === p.id}
                              onClick={() => openPrayer(p)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* By category */}
                <div className="p-sec p-sec-category">
                  <button
                    className={`p-sec-header ${categoryExpanded ? 'on' : ''}`}
                    onClick={() => setCategoryExpanded(v => !v)}
                  >
                    <span className="p-sec-emoji">📂</span>
                    <span className="p-sec-label">By Category</span>
                    <span className="p-sec-count">{filteredBySearch.length}</span>
                    <span className="p-sec-chevron">{categoryExpanded ? '▾' : '▸'}</span>
                  </button>
                  {categoryExpanded && (
                    <div className="p-cat-list">
                      {CATEGORIES.map(cat => {
                        const list = categoryGroups[cat] || [];
                        if (list.length === 0) return null;
                        const open = activeCategory === cat;
                        return (
                          <div key={cat} className="p-cat-group">
                            <button
                              className={`p-cat-row ${open ? 'on' : ''}`}
                              onClick={() => setActiveCategory(open ? null : cat)}
                            >
                              <span>{cat}</span>
                              <span className="p-cat-count">{list.length}</span>
                            </button>
                            {open && (
                              <div className="p-cat-prayers">
                                {list.map(p => (
                                  <PrayerRow
                                    key={p.id}
                                    prayer={p}
                                    selected={selected?.id === p.id}
                                    onClick={() => openPrayer(p)}
                                    compact
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* ── CENTER ── */}
        <main className="p-center">
          {showForm ? (
            <NewPrayerForm
              form={form}
              setForm={setForm}
              saving={saving}
              friends={friends}
              onSave={handleSave}
              onCancel={closeForm}
            />
          ) : selected ? (
            <PrayerDetail
              prayer={selected}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              friends={friends}
              showFriendPicker={showFriendPicker}
              setShowFriendPicker={setShowFriendPicker}
              updateText={updateText}
              setUpdateText={setUpdateText}
              addingUpdate={addingUpdate}
              onAddUpdate={handleAddUpdate}
              onStatusChange={handleStatusChange}
              onToggleDaily={handleToggleDaily}
              onToggleFriend={toggleFriendLink}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <EmptyState
              section={SMART_SECTIONS.find(s => s.key === activeSection)}
              count={sectionPrayers[activeSection]?.length ?? 0}
              onNew={() => openNew('request')}
              onNewPraise={() => openNew('praise')}
            />
          )}
        </main>

        {/* ── RIGHT: Analytics ── */}
        <aside className={`p-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">Insights</span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>

          {!rightCollapsed && (
            <div className="p-right-scroll">
              <Section title="Overview">
                <div className="p-stat-grid">
                  <Stat n={overall.total}        l="Total" />
                  <Stat n={overall.answered}     l="Answered" color="#6ee7b7" />
                  <Stat n={overall.urgent}       l="Urgent"   color="#fca5a5" />
                  <Stat n={overall.daily}        l="Daily"    color="#fcd34d" />
                  <Stat n={overall.praise}       l="Praise"   color="#a78bfa" />
                  <Stat n={overall.longstanding} l="30+ days" color="#7dd3fc" />
                </div>
              </Section>

              {overall.total > 0 && (
                <Section title="Answer Rate">
                  <div className="p-rate">
                    <div className="p-rate-n">{answerRate}%</div>
                    <div className="p-rate-sub">of prayers answered</div>
                    <div className="p-rate-track">
                      <div className="p-rate-fill" style={{ width: `${answerRate}%` }}/>
                    </div>
                  </div>
                </Section>
              )}

              <Section title="By Category">
                {CATEGORIES.map(cat => {
                  const count = categoryGroups[cat]?.length || 0;
                  if (count === 0) return null;
                  const pct = overall.total ? Math.round((count / overall.total) * 100) : 0;
                  return (
                    <div key={cat} className="p-cat-bar">
                      <span className="p-cat-bar-lbl">{cat}</span>
                      <div className="p-cat-bar-track">
                        <div className="p-cat-bar-fill" style={{ width: `${pct}%` }}/>
                      </div>
                      <span className="p-cat-bar-n">{count}</span>
                    </div>
                  );
                })}
                {overall.total === 0 && <div className="p-muted">No prayers yet.</div>}
              </Section>

              <Section title="Encouragement">
                <div className="p-verse">
                  "Do not be anxious about anything, but in every situation,
                  by prayer and petition, with thanksgiving, present your requests to God."
                  <span className="p-verse-ref">— Philippians 4:6</span>
                </div>
              </Section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */

function PrayerRow({ prayer, selected, onClick, compact }) {
  const s = getStatus(prayer);
  const age = ageDays(prayer.created_at);
  const isPraise = prayer.entry_type === 'praise';
  return (
    <button
      className={`p-row ${selected ? 'sel' : ''} ${compact ? 'compact' : ''}`}
      onClick={onClick}
    >
      <span className="p-row-emoji">{isPraise ? '✨' : s.emoji}</span>
      <div className="p-row-info">
        <div className="p-row-title">{prayer.title}</div>
        <div className="p-row-meta">
          {!!prayer.is_daily && <span className="p-row-daily">📆</span>}
          <span className="p-row-cat">{prayer.category || 'General'}</span>
          <span className="p-row-age">{age === 0 ? 'today' : `${age}d`}</span>
        </div>
      </div>
      {(prayer.friends?.length || 0) > 0 && (
        <span className="p-row-friends">👥 {prayer.friends.length}</span>
      )}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="p-r-section">
      <div className="p-r-section-title">{title}</div>
      {children}
    </div>
  );
}

function Stat({ n, l, color }) {
  return (
    <div className="p-stat">
      <span className="p-stat-n" style={color ? { color } : null}>{n}</span>
      <span className="p-stat-l">{l}</span>
    </div>
  );
}

function EmptyState({ section, count, onNew, onNewPraise }) {
  const isFirstTime = !section || count === 0;
  return (
    <div className="app-empty p-empty">
      <div className="app-empty-icon">{section?.emoji || '🙏'}</div>
      <div className="app-empty-title">
        {section ? section.label : 'Your prayer wall'}
      </div>
      <div className="app-empty-sub">
        {section
          ? section.subtitle || `${count} prayer${count === 1 ? '' : 's'} in this section.`
          : 'Bring every request before God — nothing is too small or too large.'}
      </div>

      {isFirstTime && (
        <div className="p-start-steps">
          <div className="p-start-title">First time? Try this:</div>
          <ol className="p-start-list">
            <li><b>Tap “New Prayer”</b> and add a title + a few lines about what’s on your heart.</li>
            <li><b>Pick a section</b> on the left — Urgent, Daily, or just Active.</li>
            <li><b>Come back later</b> and add updates in the Updates tab as God moves.</li>
          </ol>
        </div>
      )}

      <div className="p-empty-actions">
        <button className="app-btn primary" onClick={onNew}>✦ New Prayer</button>
        <button className="app-btn ghost"   onClick={onNewPraise}>✨ Add Praise</button>
      </div>
      <div className="p-verse" style={{ marginTop: 28, maxWidth: 420 }}>
        "Rejoice always, pray continually, give thanks in all circumstances;
        for this is God's will for you in Christ Jesus."
        <span className="p-verse-ref">— 1 Thessalonians 5:16-18</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Detail (tabbed)
   ───────────────────────────────────────────────────────────── */
function PrayerDetail({
  prayer, activeTab, setActiveTab,
  friends, showFriendPicker, setShowFriendPicker,
  updateText, setUpdateText, addingUpdate, onAddUpdate,
  onStatusChange, onToggleDaily, onToggleFriend, onDelete,
}) {
  const s = getStatus(prayer);
  const isPraise = prayer.entry_type === 'praise';
  const age = ageDays(prayer.created_at);
  const updates = prayer.updates || [];
  const linkedFriends = prayer.friends || [];

  return (
    <div className="p-detail">
      {/* Header */}
      <header className="p-detail-hd">
        <div className="p-detail-hd-top">
          <div className="p-detail-pills">
            <span className="p-mood-pill" style={{ background: s.color, color: s.text }}>
              {isPraise ? '✨ Praise' : `${s.emoji} ${s.label}`}
            </span>
            {!!prayer.is_daily && <span className="p-pill-daily">📆 Daily</span>}
            <span className="p-pill-cat">{prayer.category || 'General'}</span>
          </div>
          <div className="p-detail-actions">
            <button className="app-btn ghost icon-only" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        </div>
        <h1 className="p-detail-title">{prayer.title}</h1>
        <div className="p-detail-meta">
          <span>📅 {format(parseISO(prayer.created_at.replace(' ', 'T')), 'MMMM d, yyyy')}</span>
          <span>·</span>
          <span>{age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'} on the wall`}</span>
          {updates.length > 0 && <>
            <span>·</span>
            <span>{updates.length} update{updates.length === 1 ? '' : 's'}</span>
          </>}
        </div>
      </header>

      {/* Tabs */}
      <nav className="p-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`p-tab ${activeTab === t.key ? 'on' : ''}`}
            onClick={() => setActiveTab(t.key)}
            title={t.hint}
          >
            <span>{t.emoji}</span> {t.label}
            {t.key === 'updates'  && updates.length > 0      && <span className="p-tab-badge">{updates.length}</span>}
            {t.key === 'people'   && linkedFriends.length > 0 && <span className="p-tab-badge">{linkedFriends.length}</span>}
          </button>
        ))}
      </nav>

      {/* Tab hint — explains what this tab shows */}
      <div className="p-tab-hint">
        {TABS.find(t => t.key === activeTab)?.hint}
      </div>

      {/* Tab content */}
      <div className="p-tab-body">
        {activeTab === 'updates' && (
          <UpdatesTab
            updates={updates}
            text={updateText}
            setText={setUpdateText}
            adding={addingUpdate}
            onAdd={onAddUpdate}
          />
        )}
        {activeTab === 'request' && (
          <RequestTab
            prayer={prayer}
            onStatusChange={onStatusChange}
            onToggleDaily={onToggleDaily}
          />
        )}
        {activeTab === 'people' && (
          <PeopleTab
            prayer={prayer}
            friends={friends}
            linked={linkedFriends}
            showPicker={showFriendPicker}
            setShowPicker={setShowFriendPicker}
            onToggle={onToggleFriend}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab prayer={prayer} updates={updates} age={age} />
        )}
      </div>
    </div>
  );
}

function UpdatesTab({ updates, text, setText, adding, onAdd }) {
  return (
    <div className="p-updates">
      <div className="p-up-composer">
        <textarea
          className="p-up-textarea"
          rows={3}
          placeholder="How is God moving? Share an update, a sense of peace, a Scripture, a step forward…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAdd(); }}
        />
        <div className="p-up-composer-ft">
          <span className="p-up-hint">⌘+Enter to post</span>
          <button
            className="app-btn primary"
            onClick={onAdd}
            disabled={adding || !text.trim()}
          >
            {adding ? 'Posting…' : '+ Add Update'}
          </button>
        </div>
      </div>

      {updates.length === 0 ? (
        <div className="p-up-empty">
          <div className="p-up-empty-icon">🙏</div>
          <div className="p-up-empty-title">No updates yet</div>
          <div className="p-up-empty-sub">
            This is the running journal of how God is moving in this prayer.
            Add your first reflection above.
          </div>
        </div>
      ) : (
        <div className="p-up-timeline">
          {updates.map((u, idx) => (
            <article key={u.id} className="p-up-item">
              <div className="p-up-dot" data-idx={idx} />
              <div className="p-up-body">
                <div className="p-up-text">{u.content}</div>
                <div className="p-up-date">
                  {format(parseISO(u.created_at.replace(' ', 'T')), 'MMM d, yyyy · h:mm a')}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestTab({ prayer, onStatusChange, onToggleDaily }) {
  return (
    <div className="p-request">
      <div className="p-req-content">
        {prayer.content || <span className="p-muted">No description.</span>}
      </div>

      {prayer.scripture && (
        <div className="p-req-scripture">
          <span className="p-req-scripture-label">📖 Scripture</span>
          <span className="p-req-scripture-text">{prayer.scripture}</span>
        </div>
      )}

      <div className="p-req-section">
        <div className="p-req-label">Update Status</div>
        <div className="p-status-btns">
          {STATUSES.map(st => (
            <button
              key={st.value}
              className={`p-status-btn ${prayer.status === st.value && !prayer.is_urgent ? 'on' : ''}`}
              style={prayer.status === st.value && !prayer.is_urgent
                ? { background: st.color, color: st.text, borderColor: st.text }
                : null}
              onClick={() => onStatusChange(prayer, st.value)}
            >
              {st.emoji} {st.label}
            </button>
          ))}
          <button
            className={`p-status-btn ${prayer.is_urgent ? 'on' : ''}`}
            style={prayer.is_urgent
              ? { background: URGENT.color, color: URGENT.text, borderColor: URGENT.text }
              : null}
            onClick={() => onStatusChange(prayer, prayer.is_urgent ? 'praying' : 'urgent')}
          >
            {URGENT.emoji} {URGENT.label}
          </button>
        </div>
      </div>

      <div className="p-req-section">
        <div className="p-req-label">Quick toggles</div>
        <label className="p-toggle">
          <input
            type="checkbox"
            checked={!!prayer.is_daily}
            onChange={() => onToggleDaily(prayer)}
          />
          <span>📆 Include in my daily prayer list</span>
        </label>
      </div>
    </div>
  );
}

function PeopleTab({ prayer, friends, linked, showPicker, setShowPicker, onToggle }) {
  const linkedIds = new Set(linked.map(f => f.id));
  const available = friends.filter(f => !linkedIds.has(f.id));

  return (
    <div className="p-people">
      <div className="p-people-section">
        <div className="p-req-label">Praying For</div>
        {linked.length === 0 ? (
          <div className="p-people-empty">
            No one linked yet. Add friends from your contacts to keep them
            close to this prayer.
          </div>
        ) : (
          <div className="p-friend-chips">
            {linked.map(f => (
              <button
                key={f.id}
                className="p-friend-chip"
                onClick={() => onToggle(f.id)}
                title="Remove"
              >
                <span
                  className="p-friend-av"
                  style={{
                    background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                  }}
                >{f.initials || f.name?.[0] || '?'}</span>
                <span className="p-friend-name">{f.name}</span>
                <span className="p-friend-x">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-people-section">
        <div className="p-people-add">
          <button
            className="app-btn ghost"
            onClick={() => setShowPicker(v => !v)}
          >
            {showPicker ? 'Hide friend list' : '+ Add a friend to this prayer'}
          </button>
        </div>
        {showPicker && (
          <div className="p-friend-picker">
            {friends.length === 0 ? (
              <div className="p-people-empty">
                No friends in your hub yet. Add them in the Friends tab first.
              </div>
            ) : available.length === 0 ? (
              <div className="p-people-empty">
                Every friend is already linked to this prayer.
              </div>
            ) : (
              available.map(f => (
                <button
                  key={f.id}
                  className="p-picker-row"
                  onClick={() => onToggle(f.id)}
                >
                  <span
                    className="p-friend-av"
                    style={{
                      background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                    }}
                  >{f.initials || f.name?.[0] || '?'}</span>
                  <div className="p-picker-info">
                    <div className="p-picker-name">{f.name}</div>
                    <div className="p-picker-role">{f.role || f.church || 'Friend'}</div>
                  </div>
                  <span className="p-picker-add">+</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsTab({ prayer, updates, age }) {
  const lastUpdate = updates[0];
  const daysSinceLast = lastUpdate
    ? ageDays(lastUpdate.created_at)
    : age;
  const updateFreq = updates.length > 0 && age > 0
    ? (updates.length / Math.max(1, Math.floor(age / 7))).toFixed(1)
    : updates.length;

  return (
    <div className="p-insights">
      <div className="p-ins-grid">
        <InsightCard label="Days on the wall"        value={age || 'Today'} />
        <InsightCard label="Total updates"           value={updates.length} />
        <InsightCard label="Days since last update"  value={lastUpdate ? daysSinceLast : '—'} />
        <InsightCard label="Updates per week"        value={updates.length === 0 ? '—' : updateFreq} />
      </div>

      <div className="p-ins-tip">
        💡 {updates.length === 0
          ? 'Adding regular updates turns a prayer into a story of how God moves.'
          : daysSinceLast > 14
          ? 'It has been a while since you added an update. Reflect on where God has met you.'
          : 'Keep noting the small movements — they often reveal the bigger picture later.'}
      </div>
    </div>
  );
}

function InsightCard({ label, value }) {
  return (
    <div className="p-ins-card">
      <div className="p-ins-value">{value}</div>
      <div className="p-ins-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   New Prayer Form
   ───────────────────────────────────────────────────────────── */
function NewPrayerForm({ form, setForm, saving, friends, onSave, onCancel }) {
  const isPraise = form.entry_type === 'praise';
  const toggleFriend = (id) => {
    setForm(f => ({
      ...f,
      friend_ids: f.friend_ids.includes(id)
        ? f.friend_ids.filter(x => x !== id)
        : [...f.friend_ids, id]
    }));
  };

  return (
    <div className="p-form">
      <header className="p-form-hd">
        <div className="p-form-title">
          {isPraise ? '✨ New Praise' : '✦ New Prayer Request'}
        </div>
        <button className="app-btn ghost icon-only" onClick={onCancel}>✕</button>
      </header>

      {/* Type toggle */}
      <div className="p-type-toggle">
        <button
          className={`p-type-opt ${!isPraise ? 'on' : ''}`}
          onClick={() => setForm(f => ({ ...f, entry_type: 'request' }))}
        >🙏 Prayer Request</button>
        <button
          className={`p-type-opt ${isPraise ? 'on' : ''}`}
          onClick={() => setForm(f => ({ ...f, entry_type: 'praise' }))}
        >✨ Praise & Thanksgiving</button>
      </div>

      <div className="p-form-body">
        <input
          className="p-form-title-input"
          placeholder={isPraise ? 'What are you giving thanks for?' : 'What are you lifting up to God?'}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        />

        <textarea
          className="p-form-body-input"
          rows={5}
          placeholder={isPraise
            ? 'Tell the story — what did God do, and what does it stir in you?'
            : 'Share your heart — be specific, He hears every word…'}
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
        />

        <input
          className="p-form-scripture"
          placeholder="📖 Scripture to stand on (optional)"
          value={form.scripture}
          onChange={e => setForm(f => ({ ...f, scripture: e.target.value }))}
        />

        <div className="p-form-row">
          <div className="p-form-field">
            <label className="p-form-lbl">Category</label>
            <select
              className="p-form-select"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!isPraise && (
            <div className="p-form-field">
              <label className="p-form-lbl">Status</label>
              <select
                className="p-form-select"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="praying">🙏 Praying</option>
                <option value="waiting">⏳ Waiting</option>
                <option value="answered">✓ Answered</option>
              </select>
            </div>
          )}
        </div>

        {!isPraise && (
          <div className="p-form-checks">
            <label className="p-toggle">
              <input
                type="checkbox"
                checked={form.is_urgent}
                onChange={e => setForm(f => ({ ...f, is_urgent: e.target.checked }))}
              />
              <span>🔥 Urgent — needs immediate intercession</span>
            </label>
            <label className="p-toggle">
              <input
                type="checkbox"
                checked={form.is_daily}
                onChange={e => setForm(f => ({ ...f, is_daily: e.target.checked }))}
              />
              <span>📆 Add to my daily prayer list</span>
            </label>
          </div>
        )}

        {friends.length > 0 && (
          <div className="p-form-field">
            <label className="p-form-lbl">Praying for (optional)</label>
            <div className="p-form-friends">
              {friends.map(f => (
                <button
                  key={f.id}
                  className={`p-form-friend ${form.friend_ids.includes(f.id) ? 'on' : ''}`}
                  onClick={() => toggleFriend(f.id)}
                >
                  <span
                    className="p-friend-av sm"
                    style={{
                      background: `linear-gradient(135deg, ${f.color_from || '#3730a3'}, ${f.color_to || '#6c3fc9'})`
                    }}
                  >{f.initials || f.name?.[0] || '?'}</span>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="p-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={saving || !form.title.trim() || !form.content.trim()}
        >
          {saving ? 'Saving…' : (isPraise ? '✨ Save Praise' : '🙏 Submit Prayer')}
        </button>
      </footer>
    </div>
  );
}
