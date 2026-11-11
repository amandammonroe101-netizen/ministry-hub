import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import {
  ICEBREAKER_IDEAS,
  LARGE_GROUP_IDEAS,
  SMALL_GROUP_IDEAS,
  GET_TO_KNOW_IDEAS,
  ENERGY_BURNER_IDEAS,
} from './gameIdeas';
import './Games.css';

/* Youth → Games & Icebreakers
   Storage: youth:games — array of game objects.
   Generated Ideas tab pulls from a hand-curated pool and lets the
   user save any pick into the catalog. */

const ACCENT = '#a16207';

const TYPES    = ['Icebreaker', 'Large group', 'Small group', 'Get-to-know', 'Energy burner'];
const ENERGIES = ['Low', 'Medium', 'High'];
const PLACES   = ['Indoor', 'Outdoor', 'Either'];

/* One generated card per type, each in its own color. The order
   here is the on-screen order of the 5 slots. */
const TYPE_SLOTS = [
  { key: 'icebreaker',   label: 'Icebreaker',    emoji: '❄️', color: '#a16207' }, // amber
  { key: 'largeGroup',   label: 'Large group',   emoji: '👥', color: '#9f1239' }, // rose
  { key: 'smallGroup',   label: 'Small group',   emoji: '🫶', color: '#0f766e' }, // teal
  { key: 'getToKnow',    label: 'Get-to-know',   emoji: '🤝', color: '#6d28d9' }, // violet
  { key: 'energyBurner', label: 'Energy burner', emoji: '🔥', color: '#16a34a' }, // green
];
const SLOT_BY_TYPE = Object.fromEntries(TYPE_SLOTS.map(s => [s.label, s]));

const DEFAULT_GAME = () => ({
  id:           'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
  name:         '',
  type:         'Icebreaker',
  energy:       'Medium',
  location:     'Indoor',
  minPlayers:   6,
  maxPlayers:   30,
  duration:     10,
  supplies:     '',
  instructions: '',
  notes:        '',
  createdAt:    Date.now(),
});

/* Pool per slot — sourced from gameIdeas.js so the data file
   stays focused on content and this file stays focused on logic.
   100 ideas per type means no repeats for a long time. */
const POOL_FOR = {
  icebreaker:   ICEBREAKER_IDEAS,
  largeGroup:   LARGE_GROUP_IDEAS,
  smallGroup:   SMALL_GROUP_IDEAS,
  getToKnow:    GET_TO_KNOW_IDEAS,
  energyBurner: ENERGY_BURNER_IDEAS,
};

/* Map a game's type → slot config so catalog cards can borrow the
   same color scheme the Generated Ideas use. */
const slotForType = (type) => SLOT_BY_TYPE[type] || TYPE_SLOTS[0];

export default function Games() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [games, setGames, { loading }] = useUserStoreKey('youth:games', []);
  const list = Array.isArray(games) ? games : [];

  const [view, setView] = useState('catalog'); // 'catalog' | 'ideas'

  const [query,   setQuery]   = useState('');
  const [fType,   setFType]   = useState('All');
  const [fEnergy, setFEnergy] = useState('All');
  const [fPlace,  setFPlace]  = useState('All');
  const [openId,  setOpenId]  = useState(null);

  /* Deep-link support: when a Lesson's "linked game" chip navigates
     here with /youth/games?open=<id>, auto-open that game and switch
     to the catalog tab. Strip the param once consumed so reloading
     the page doesn't keep re-opening it. */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const wanted = searchParams.get('open');
    if (!wanted) return;
    /* Wait for the store to hydrate so we don't no-op against an
       empty list on first render. */
    if (loading) return;
    const exists = list.some(g => g.id === wanted);
    if (exists) {
      setView('catalog');
      setOpenId(wanted);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, list.length]);

  /* Each slot tracks names it has already shown this session. Picks
     come only from the unseen subset, guaranteeing no repeats until
     the full pool has been cycled — at which point the seen set
     resets and we start over. Keyed by TYPE_SLOTS[].key. */
  const seenRef = useRef(
    Object.fromEntries(TYPE_SLOTS.map(s => [s.key, new Set()]))
  );

  const nextIdea = (slot) => {
    const pool = POOL_FOR[slot] || [];
    if (pool.length === 0) return null;
    let seen = seenRef.current[slot];
    let unseen = pool.filter(p => !seen.has(p.name));
    if (unseen.length === 0) {
      seen = new Set();
      seenRef.current[slot] = seen;
      unseen = pool;
    }
    const picked = unseen[Math.floor(Math.random() * unseen.length)];
    seen.add(picked.name);
    return picked;
  };

  /* Generated-ideas state — one entry per type slot. Saving a card
     immediately swaps in a fresh unseen pick for that slot. */
  const [ideas, setIdeas] = useState(() =>
    Object.fromEntries(TYPE_SLOTS.map(s => [s.key, nextIdea(s.key)]))
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(g =>
      (!q || (g.name || '').toLowerCase().includes(q) || (g.supplies || '').toLowerCase().includes(q)) &&
      (fType   === 'All' || g.type     === fType)   &&
      (fEnergy === 'All' || g.energy   === fEnergy) &&
      (fPlace  === 'All' || g.location === fPlace)
    );
  }, [list, query, fType, fEnergy, fPlace]);

  const addGame = () => {
    const g = DEFAULT_GAME();
    setGames(prev => [...(prev || []), g]);
    setOpenId(g.id);
  };
  const update = (id, patch) =>
    setGames(prev => (prev || []).map(g => g.id === id ? { ...g, ...patch } : g));
  const remove = (id) => {
    if (!confirm('Remove this game?')) return;
    setGames(prev => (prev || []).filter(g => g.id !== id));
    if (openId === id) setOpenId(null);
  };

  /** Save an idea into the catalog AND immediately swap in a fresh
   *  unseen pick for that slot so there's always one of each kind. */
  const saveIdea = (idea, slot) => {
    if (!idea) return;
    const game = { ...DEFAULT_GAME(), ...idea, id: DEFAULT_GAME().id, createdAt: Date.now() };
    setGames(prev => [...(prev || []), game]);
    setIdeas(prev => ({ ...prev, [slot]: nextIdea(slot) }));
  };

  /** Re-roll one slot only — pulls from the unseen subset. */
  const regenerateSlot = (slot) => {
    setIdeas(prev => ({ ...prev, [slot]: nextIdea(slot) }));
  };

  const open = openId ? list.find(g => g.id === openId) : null;

  return (
    <YouthShell
      groupLabel="Teaching" groupIcon="📖"
      icon="🎲" title="Games & Icebreakers"
      accent={ACCENT}
      subtitle="Catalog your favorites or roll new ideas — one of every type, drawn from 500 hand-curated games."
      actions={
        view === 'catalog'
          ? <button className="yps-add-btn" onClick={addGame}>＋ Add game</button>
          : null
      }
      stats={[
        { n: list.length, label: 'in catalog' },
        { n: list.filter(g => g.energy === 'High').length, label: 'high energy' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yg-view-toggle">
        <button className={`yps-chip ${view === 'catalog' ? 'on' : ''}`} onClick={() => setView('catalog')}>📚 Catalog</button>
        <button className={`yps-chip ${view === 'ideas'   ? 'on' : ''}`} onClick={() => setView('ideas')}>💡 Generated Ideas</button>
      </div>

      {view === 'catalog' && (
        <>
          <div className="yg-filters">
            <input
              className="yps-input yg-search"
              placeholder="Search by name or supplies…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <FilterRow value={fType}   onChange={setFType}   options={TYPES}    label="Type" />
            <FilterRow value={fEnergy} onChange={setFEnergy} options={ENERGIES} label="Energy" />
            <FilterRow value={fPlace}  onChange={setFPlace}  options={PLACES}   label="Place" />
          </div>

          {loading && list.length === 0 ? (
            <div className="yps-empty"><div className="yps-empty-icon">🎲</div><div className="yps-empty-title">Loading…</div></div>
          ) : visible.length === 0 ? (
            <div className="yps-empty">
              <div className="yps-empty-icon">🎲</div>
              <div className="yps-empty-title">
                {list.length === 0 ? 'Your game catalog is empty' : 'No games match those filters'}
              </div>
              <div className="yps-empty-sub">
                {list.length === 0
                  ? 'Tap "＋ Add game" to save your favorites, or check the Generated Ideas tab for inspiration.'
                  : 'Try clearing a filter or broaden the search.'}
              </div>
            </div>
          ) : (
            <div className="yg-ideas-grid">
              {visible.map(g => {
                const slot = slotForType(g.type);
                return (
                  <article
                    key={g.id}
                    className={`yg-idea-card yg-idea-${slot.key} yg-catalog-card`}
                    onDoubleClick={() => setOpenId(g.id)}
                    title="Double-click to open"
                  >
                    <div className="yg-idea-slot">{slot.emoji} {slot.label}</div>
                    <h3 className="yg-idea-name">{g.name || 'Untitled game'}</h3>
                    <div className="yg-idea-meta">
                      <span className={`yps-pill yg-energy yg-energy-${(g.energy || 'medium').toLowerCase()}`}>{g.energy}</span>
                      <span className="yps-pill">{g.location}</span>
                      <span className="yps-pill">{g.minPlayers}–{g.maxPlayers}</span>
                      <span className="yps-pill">{g.duration}m</span>
                    </div>
                    {g.supplies && (
                      <div className="yg-idea-supplies"><b>Need:</b> {g.supplies}</div>
                    )}
                    {g.instructions && (
                      <div className="yg-idea-instructions yg-catalog-clamp">{g.instructions}</div>
                    )}
                    {g.notes && <div className="yg-idea-notes">💡 {g.notes}</div>}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === 'ideas' && (
        <section className="yg-ideas">
          <header className="yg-ideas-hd">
            <div>
              <h2 className="yg-ideas-title">One idea of every type</h2>
              <p className="yg-ideas-sub">
                A pick from each category — icebreaker, large group, small group,
                get-to-know, and energy burner. Hit <b>🎲 Generate new</b> on any
                card to swap that slot, or save a pick into your catalog.
              </p>
            </div>
          </header>
          <div className="yg-ideas-grid">
            {TYPE_SLOTS.map(s => (
              <IdeaCard
                key={s.key}
                slot={s.key}
                label={`${s.emoji} ${s.label}`}
                idea={ideas[s.key]}
                onSave={() => saveIdea(ideas[s.key], s.key)}
                onRegenerate={() => regenerateSlot(s.key)}
              />
            ))}
          </div>
        </section>
      )}

      {open && (
        <GameEditor
          game={open}
          onChange={(p) => update(open.id, p)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

function IdeaCard({ slot, label, idea, onSave, onRegenerate }) {
  /* `saving` gates both buttons, shows the confirmation banner, and
     defers the actual save+swap by 700ms so the user can SEE that
     Save worked (otherwise the instant swap is indistinguishable
     from Generate). Also acts as a guard against accidental
     double-clicks committing two saves of the same idea. */
  const [saving, setSaving] = useState(false);

  /* If the parent swaps in a new idea (e.g. from a Generate-new on
     another card causing a re-render), clear any stale saving state. */
  useEffect(() => { setSaving(false); }, [idea?.name]);

  if (!idea) return null;

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    setTimeout(() => { onSave(); }, 700);
  };

  return (
    <article className={`yg-idea-card yg-idea-${slot} ${saving ? 'yg-idea-saving' : ''}`}>
      {saving && (
        <div className="yg-idea-saved-banner">✓ Saved "{idea.name}" to catalog</div>
      )}
      <div className="yg-idea-slot">{label}</div>
      <h3 className="yg-idea-name">{idea.name}</h3>
      <div className="yg-idea-meta">
        <span className={`yps-pill yg-energy yg-energy-${(idea.energy || 'medium').toLowerCase()}`}>{idea.energy}</span>
        <span className="yps-pill">{idea.type}</span>
        <span className="yps-pill">{idea.minPlayers}–{idea.maxPlayers}</span>
        <span className="yps-pill">{idea.duration}m</span>
      </div>
      {idea.supplies && (
        <div className="yg-idea-supplies"><b>Need:</b> {idea.supplies}</div>
      )}
      <div className="yg-idea-instructions">{idea.instructions}</div>
      {idea.notes && <div className="yg-idea-notes">💡 {idea.notes}</div>}
      <div className="yg-idea-actions">
        <button
          type="button"
          className="yps-btn"
          onClick={onRegenerate}
          disabled={saving}
          title="Roll a new idea for this slot"
        >🎲 Generate new</button>
        <button
          type="button"
          className="yps-add-btn"
          onClick={handleSave}
          disabled={saving}
          title="Save this idea into your catalog"
        >
          {saving ? '✓ Saving…' : '＋ Save to catalog'}
        </button>
      </div>
    </article>
  );
}

function FilterRow({ label, value, onChange, options }) {
  return (
    <div className="yg-filter-row">
      <span className="yg-filter-label">{label}</span>
      <button className={`yps-chip ${value === 'All' ? 'on' : ''}`} onClick={() => onChange('All')}>All</button>
      {options.map(o => (
        <button key={o} className={`yps-chip ${value === o ? 'on' : ''}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

function GameEditor({ game, onChange, onDelete, onClose }) {
  /* Default to view mode (opens read-only like a recipe card), with
     an Edit button at the bottom that flips to the form. Brand-new
     games (still untitled) start in edit mode so the user isn't
     staring at an empty card. */
  const [mode, setMode] = useState(() => (game.name ? 'view' : 'edit'));
  const slot = slotForType(game.type);

  return (
    <div className="yg-modal-backdrop" onClick={onClose}>
      <div className="yg-modal" onClick={e => e.stopPropagation()}>
        <header className="yg-modal-hd">
          <h2>{game.name || 'New game'}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="yps-pill" title={mode === 'view' ? 'Viewing' : 'Editing'}>
              {mode === 'view' ? '👁 Viewing' : '✎ Editing'}
            </span>
            <button className="yps-btn ghost" onClick={onClose}>✕</button>
          </div>
        </header>

        {mode === 'view' ? (
          <div className="yg-modal-grid">
            <div className="yg-field full">
              <div className="yg-idea-slot" style={{ color: slot.color }}>
                {slot.emoji} {slot.label}
              </div>
              <h3 className="yg-idea-name" style={{ marginTop: 4 }}>{game.name || 'Untitled game'}</h3>
              <div className="yg-idea-meta" style={{ marginTop: 6 }}>
                <span className={`yps-pill yg-energy yg-energy-${String(game.energy || 'medium').toLowerCase()}`}>{game.energy}</span>
                <span className="yps-pill">{game.location}</span>
                <span className="yps-pill">{game.minPlayers}–{game.maxPlayers}</span>
                <span className="yps-pill">{game.duration}m</span>
              </div>
            </div>
            {game.supplies && (
              <div className="yg-field full">
                <span className="yg-field-label">Supplies</span>
                <div className="yg-idea-supplies"><b>Need:</b> {game.supplies}</div>
              </div>
            )}
            {game.instructions && (
              <div className="yg-field full">
                <span className="yg-field-label">Instructions</span>
                <div className="yg-idea-instructions" style={{ whiteSpace: 'pre-wrap' }}>{game.instructions}</div>
              </div>
            )}
            {game.notes && (
              <div className="yg-field full">
                <span className="yg-field-label">Leader notes</span>
                <div className="yg-idea-notes">💡 {game.notes}</div>
              </div>
            )}
            {!game.supplies && !game.instructions && !game.notes && (
              <div className="yg-field full">
                <em style={{ color: 'var(--text-muted)' }}>
                  No supplies, instructions, or notes yet. Click <b>✎ Edit</b> below to fill them in.
                </em>
              </div>
            )}
          </div>
        ) : (
          <div className="yg-modal-grid">
            <Field label="Name" full><input className="yps-input" value={game.name} onChange={e => onChange({ name: e.target.value })} /></Field>
            <Field label="Type"><select className="yps-select" value={game.type} onChange={e => onChange({ type: e.target.value })}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select></Field>
            <Field label="Energy"><select className="yps-select" value={game.energy} onChange={e => onChange({ energy: e.target.value })}>
              {ENERGIES.map(t => <option key={t}>{t}</option>)}
            </select></Field>
            <Field label="Location"><select className="yps-select" value={game.location} onChange={e => onChange({ location: e.target.value })}>
              {PLACES.map(t => <option key={t}>{t}</option>)}
            </select></Field>
            <Field label="Duration (min)"><input type="number" className="yps-input" value={game.duration} onChange={e => onChange({ duration: Number(e.target.value) })} /></Field>
            <Field label="Min players"><input type="number" min={1} className="yps-input" value={game.minPlayers} onChange={e => onChange({ minPlayers: Math.max(1, Number(e.target.value) || 1) })} /></Field>
            <Field label="Max players"><input type="number" min={1} className="yps-input" value={game.maxPlayers} onChange={e => onChange({ maxPlayers: Math.max(1, Number(e.target.value) || 1) })} /></Field>
            <Field label="Supplies" full><input className="yps-input" value={game.supplies} onChange={e => onChange({ supplies: e.target.value })} placeholder="e.g. tennis balls, sharpies, name tags" /></Field>
            <Field label="Instructions" full><textarea className="yps-textarea" rows={5} value={game.instructions} onChange={e => onChange({ instructions: e.target.value })} placeholder="How does the game work? Step by step…" /></Field>
            <Field label="Leader notes" full><textarea className="yps-textarea" rows={3} value={game.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="What works, what to avoid, variants…" /></Field>
          </div>
        )}

        <footer className="yg-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="yps-btn" onClick={onClose}>Close</button>
            {mode === 'view' ? (
              <button className="yps-add-btn" onClick={() => setMode('edit')}>✎ Edit</button>
            ) : (
              <button className="yps-add-btn" onClick={() => setMode('view')}>✓ Done editing</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yg-field ${full ? 'full' : ''}`}>
      <span className="yg-field-label">{label}</span>
      {children}
    </label>
  );
}
