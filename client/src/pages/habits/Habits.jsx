import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  format, subDays, parseISO, differenceInCalendarDays,
  startOfWeek, endOfWeek, addDays, subWeeks, isAfter, startOfDay,
} from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { habitService } from '../../services/habitService';
import './Habits.css';

const COLOR_OPTIONS = ['#a78bfa','#f472b6','#fbbf24','#60a5fa','#2dd4bf','#fb7185','#6ee7b7','#fcd34d'];
const EMOJI_OPTIONS = ['✓','📖','🙏','🕯','📚','❤','✍','🏃','💧','🧘','☕','🌱','🌳','⏰','🎯'];

const EMPTY_FORM = {
  name: '', emoji: '✓', color: '#60a5fa', description: '', target_per_week: 7,
  scheduled_days: [], reminder_time: '',
};

const WEEK_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
const getStreak = (completions) => {
  if (!completions || completions.length === 0) return 0;
  // completions is sorted DESC by date
  const set = new Set(completions);
  let streak = 0;
  let check = todayISO();
  while (set.has(check)) {
    streak++;
    check = format(subDays(parseISO(check), 1), 'yyyy-MM-dd');
  }
  return streak;
};

const completedThisWeek = (completions) => {
  if (!completions) return 0;
  const today = new Date();
  const start = subDays(today, 6);
  return completions.filter(d => {
    try {
      const date = parseISO(d);
      return date >= start && date <= today;
    } catch { return false; }
  }).length;
};

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Habits() {
  const [searchParams, setSearchParams]   = useSearchParams();
  const [habits, setHabits]               = useState([]);
  const [selected, setSelected]           = useState(null);
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [error, setError]                 = useState(null);
  const [loading, setLoading]             = useState(true);
  const [leftCollapsed, setLeftCollapsed]   = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  /* ── Cross-tab deep link: ?habit=ID auto-selects that habit ── */
  useEffect(() => {
    if (habits.length === 0) return;
    const habitId = searchParams.get('habit');
    if (!habitId) return;
    const h = habits.find(x => x.id === Number(habitId));
    if (h) {
      setSelected(h);
      setShowForm(false);
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await habitService.getAll();
      setHabits(res.data.data);
      // keep selection by id if possible
      if (selected) {
        const fresh = res.data.data.find(h => h.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch { setError('Could not load habits.'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await habitService.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchAll();
    } catch { setError('Failed to save habit.'); }
  };

  const handleToggle = async (habit, date = todayISO()) => {
    try {
      await habitService.toggle(habit.id, date);
      await fetchAll();
    } catch { setError('Failed to toggle.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this habit and all its history?')) return;
    try {
      await habitService.delete(id);
      if (selected?.id === id) setSelected(null);
      await fetchAll();
    } catch { setError('Failed to delete.'); }
  };

  const handleSeedStarter = async () => {
    try {
      const res = await habitService.seedStarter();
      if (res.data.added === 0) setError('All starter habits already exist.');
      else setError(null);
      await fetchAll();
    } catch { setError('Failed to seed starter pack.'); }
  };

  /* ── derived ─────────────────────────────────────────────── */
  const today = todayISO();
  const completedToday = habits.filter(h => h.completions?.includes(today)).length;
  const totalHabits = habits.length;

  const leftW  = leftCollapsed  ? 'var(--rail-w)' : '320px';
  const rightW = rightCollapsed ? 'var(--rail-w)' : '260px';

  return (
    <div className="hb-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <div className="app-topbar">
        <div className="app-logo">
          <div className="app-logo-gem">✝</div>
          <span className="app-logo-name">Elite Journal Hub</span>
          <span className="app-logo-sep">·</span>
          <span className="app-tab-tag habits">Habits</span>
        </div>
        <div className="app-tb-actions">
          <span className="hb-tb-summary">
            {totalHabits === 0
              ? 'No habits yet'
              : `${completedToday} / ${totalHabits} done today`}
          </span>
          <button className="app-btn primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); setSelected(null); }}>
            ✦ New Habit
          </button>
        </div>
      </div>

      <div className="hb-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* LEFT: today's checklist */}
        <aside className={`hb-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">Today’s Habits</span>}
          </div>
          {!leftCollapsed && (
            <div className="hb-left-scroll">
              {error && (
                <div className="hb-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}

              {loading ? (
                <div className="hb-empty">Loading…</div>
              ) : habits.length === 0 ? (
                <div className="hb-empty-state">
                  <div className="hb-empty-icon">✅</div>
                  <div className="hb-empty-title">No habits yet</div>
                  <div className="hb-empty-sub">
                    Build a daily rhythm. Start with our spiritual disciplines
                    pack or create your own.
                  </div>
                  <button className="app-btn primary" onClick={handleSeedStarter}>
                    ✨ Seed starter pack
                  </button>
                  <button
                    className="app-btn ghost"
                    style={{ marginTop: 8 }}
                    onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
                  >+ Custom habit</button>

                  <div className="hb-start-steps">
                    <div className="hb-start-title">First time? Try this:</div>
                    <ol className="hb-start-list">
                      <li><b>Seed starter pack</b> — Bible, prayer, devotion, scripture memory…</li>
                      <li><b>Tap the circle</b> next to a habit to mark it done for today.</li>
                      <li><b>Open a habit</b> to see your streak and 30-day heatmap.</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="hb-list">
                  {habits.map(h => (
                    <HabitRow
                      key={h.id}
                      habit={h}
                      done={h.completions?.includes(today)}
                      selected={selected?.id === h.id}
                      onToggle={() => handleToggle(h)}
                      onSelect={() => setSelected(h)}
                    />
                  ))}
                  <button
                    className="hb-list-add"
                    onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
                  >+ Add custom habit</button>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* CENTER */}
        <main className="hb-center">
          {showForm ? (
            <NewHabitForm
              form={form}
              setForm={setForm}
              onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              onSave={handleSave}
            />
          ) : habits.length === 0 ? (
            <EmptyState habitsCount={habits.length} />
          ) : (
            <AllHabitsView
              habits={habits}
              selectedId={selected?.id}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onNewHabit={() => { setForm(EMPTY_FORM); setShowForm(true); setSelected(null); }}
            />
          )}
        </main>

        {/* RIGHT: insights */}
        <aside className={`hb-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">Insights</span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>
          {!rightCollapsed && (
            <div className="hb-right-scroll">
              <Section title="Today">
                <div className="hb-stat">
                  <span className="hb-stat-n">{completedToday}</span>
                  <span className="hb-stat-l">of {totalHabits} done</span>
                </div>
                <div className="hb-stat-bar">
                  <div
                    className="hb-stat-bar-fill"
                    style={{ width: totalHabits ? `${(completedToday / totalHabits) * 100}%` : '0%' }}
                  />
                </div>
              </Section>

              {habits.length > 0 && (
                <Section title="Top Streaks">
                  {[...habits]
                    .map(h => ({ ...h, streak: getStreak(h.completions) }))
                    .sort((a, b) => b.streak - a.streak)
                    .slice(0, 5)
                    .map(h => (
                      <div key={h.id} className="hb-streak-row" onClick={() => setSelected(h)}>
                        <span className="hb-streak-emoji">{h.emoji}</span>
                        <span className="hb-streak-name">{h.name}</span>
                        <span className="hb-streak-n" style={{ color: h.color }}>
                          {h.streak > 0 ? `🔥 ${h.streak}` : '—'}
                        </span>
                      </div>
                    ))}
                </Section>
              )}

              <Section title="Tip">
                <div className="hb-tip">
                  💡 Showing up beats perfection. Don’t break the chain — even
                  one small step counts.
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

function HabitRow({ habit, done, selected, onToggle, onSelect }) {
  const streak = getStreak(habit.completions);
  const weekDone = completedThisWeek(habit.completions);
  return (
    <div className={`hb-row ${selected ? 'sel' : ''}`}>
      <button
        className={`hb-row-check ${done ? 'on' : ''}`}
        onClick={onToggle}
        style={done ? { background: habit.color, borderColor: habit.color } : { borderColor: habit.color }}
        title={done ? 'Mark not done' : 'Mark done for today'}
      >
        {done && '✓'}
      </button>
      <button className="hb-row-info" onClick={onSelect}>
        <div className="hb-row-name">
          <span style={{ fontSize: 16 }}>{habit.emoji}</span>
          {habit.name}
        </div>
        <div className="hb-row-meta">
          {streak > 0 && <span className="hb-row-streak">🔥 {streak}</span>}
          <span>{weekDone}/{habit.target_per_week} this week</span>
        </div>
      </button>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="hb-r-section">
      <div className="hb-r-section-title">{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ habitsCount }) {
  return (
    <div className="app-empty hb-empty-center">
      <div className="app-empty-icon">✅</div>
      <div className="app-empty-title">
        {habitsCount === 0 ? 'Build a daily rhythm' : 'Pick a habit'}
      </div>
      <div className="app-empty-sub">
        {habitsCount === 0
          ? 'Spiritual habits compound over time. Add a few and check in daily — even tiny steps move you forward.'
          : 'Select a habit from the sidebar to see your streak and 30-day heatmap.'}
      </div>
    </div>
  );
}

/* ── All habits view — every habit stacked as a card ───────── */
function AllHabitsView({ habits, selectedId, onToggle, onDelete, onNewHabit }) {
  const refs = useRef({});

  // Scroll selected habit's card into view
  useEffect(() => {
    if (!selectedId) return;
    const el = refs.current[selectedId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const todayKey = todayISO();
  const doneToday = habits.filter(h => h.completions?.includes(todayKey)).length;

  return (
    <div className="hb-all">
      <header className="hb-all-hd">
        <div className="hb-all-hd-text">
          <h1 className="hb-all-title">All Habits</h1>
          <div className="hb-all-sub">
            {habits.length} habit{habits.length === 1 ? '' : 's'} · {doneToday} done today.
            Mark this week’s pills as you go, or click any past day to backfill.
          </div>
        </div>
        <div className="hb-all-tabs">
          <button className="hb-all-tab on">📋 All Habits</button>
          <button className="hb-all-tab" onClick={onNewHabit}>✦ New Habit</button>
        </div>
      </header>

      <div className="hb-all-list">
        {habits.map(habit => (
          <HabitCard
            key={habit.id}
            habit={habit}
            selected={selectedId === habit.id}
            onToggle={(date) => onToggle(habit, date)}
            onDelete={() => onDelete(habit.id)}
            innerRef={(el) => { refs.current[habit.id] = el; }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Habit card (streak + this-week pills + recent weeks) ──── */
const DAY_LABELS = ['S','M','T','W','T','F','S'];

function HabitCard({ habit, selected, onToggle, onDelete, innerRef }) {
  const today = startOfDay(new Date());
  const set = new Set(habit.completions || []);

  const thisWeekStart = startOfWeek(today);
  const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(thisWeekStart, i));
  const pastWeeks = [1, 2, 3].map(offset => {
    const start = startOfWeek(subWeeks(today, offset));
    return {
      start,
      days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    };
  });

  const streak    = getStreak(habit.completions);
  const allTime   = (habit.completions || []).length;
  const weekDone  = thisWeek.filter(d => set.has(format(d, 'yyyy-MM-dd'))).length;
  const target    = habit.target_per_week || 7;
  const weekPct   = Math.min(100, Math.round((weekDone / target) * 100));
  const doneToday = set.has(todayISO());

  return (
    <article
      ref={innerRef}
      className={`hb-card ${selected ? 'sel' : ''}`}
      style={selected ? { borderColor: `${habit.color}88`, boxShadow: `0 0 0 1px ${habit.color}55 inset` } : null}
    >
      <header
        className="hb-card-hd"
        style={{ background: `radial-gradient(420px 200px at 50% -30%, ${habit.color}26, transparent 60%)` }}
      >
        <div
          className="hb-card-emoji"
          style={{ background: `${habit.color}22`, color: habit.color, borderColor: `${habit.color}55` }}
        >{habit.emoji}</div>
        <div className="hb-card-name-block">
          <h2 className="hb-card-name">{habit.name}</h2>
          <div className="hb-card-meta">
            <span>🔥 <b>{streak}</b> day{streak === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{weekDone} / {target} this week</span>
            <span>·</span>
            <span>All-time {allTime}</span>
          </div>
          {(habit.scheduled_days || []).length > 0 && (
            <div className="hb-card-schedule">
              <span className="hb-card-schedule-lbl">Schedule</span>
              <span className="hb-card-schedule-days">{habit.scheduled_days.join(' · ')}</span>
              {habit.reminder_time && (
                <span className="hb-card-schedule-time">⏰ {habit.reminder_time}</span>
              )}
            </div>
          )}
        </div>
        <div className="hb-card-actions">
          <button className="app-btn primary" onClick={() => onToggle(todayISO())}>
            {doneToday ? '✓ Done today' : '+ Mark done today'}
          </button>
          <button className="app-btn ghost icon-only" onClick={onDelete} title="Delete habit">🗑</button>
        </div>
      </header>

      {/* This week — big day pills */}
      <section className="hb-week">
        <div className="hb-week-row">
          {thisWeek.map((d, i) => {
            const key       = format(d, 'yyyy-MM-dd');
            const done      = set.has(key);
            const isToday   = key === todayISO();
            const isFuture  = isAfter(d, today);
            return (
              <button
                key={key}
                disabled={isFuture}
                className={`hb-week-cell ${done ? 'on' : ''} ${isToday ? 'today' : ''}`}
                style={done ? { background: habit.color, borderColor: habit.color } : null}
                onClick={() => onToggle(key)}
                title={`${format(d, 'EEEE, MMM d')}${done ? ' · done' : ''}`}
              >
                <span className="hb-week-day">{DAY_LABELS[i]}</span>
                <span className="hb-week-date">{format(d, 'd')}</span>
                {done && <span className="hb-week-check">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="hb-week-bar" title={`${weekDone} of ${target} this week`}>
          <div
            className="hb-week-bar-fill"
            style={{ width: `${weekPct}%`, background: habit.color }}
          />
        </div>
      </section>

      {/* Recent weeks — compact pip strips */}
      <section className="hb-past">
        <div className="hb-past-label">Recent weeks</div>
        <div className="hb-past-rows">
          {pastWeeks.map(week => (
            <div key={format(week.start, 'yyyy-MM-dd')} className="hb-past-row">
              <div className="hb-past-range">
                {format(week.days[0], 'MMM d')}–{format(week.days[6], 'd')}
              </div>
              <div className="hb-past-pips">
                {week.days.map(d => {
                  const key = format(d, 'yyyy-MM-dd');
                  const done = set.has(key);
                  return (
                    <button
                      key={key}
                      className={`hb-past-pip ${done ? 'on' : ''}`}
                      style={done ? { background: habit.color, borderColor: habit.color } : null}
                      onClick={() => onToggle(key)}
                      title={`${format(d, 'EEE, MMM d')}${done ? ' · done' : ''}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function Stat({ n, l, color, suffix }) {
  return (
    <div className="hb-d-stat">
      <span className="hb-d-stat-n" style={color ? { color } : null}>{n} {suffix}</span>
      <span className="hb-d-stat-l">{l}</span>
    </div>
  );
}

/* ── Day-of-week picker (matches the Friends day picker style) ── */
function HabitDayPicker({ days, onChange }) {
  const toggle = (d) => {
    onChange(days.includes(d) ? days.filter(x => x !== d) : [...days, d]);
  };
  return (
    <div className="hb-day-picker">
      <div className="hb-day-row">
        {WEEK_DAYS.map(d => (
          <button
            key={d}
            type="button"
            className={`hb-day-btn ${days.includes(d) ? 'on' : ''}`}
            onClick={() => toggle(d)}
            title={`Toggle ${d}`}
          >{d[0]}</button>
        ))}
      </div>
      <div className="hb-day-presets">
        <button type="button" onClick={() => onChange([...WEEK_DAYS])}>Daily</button>
        <button type="button" onClick={() => onChange(['Mon','Tue','Wed','Thu','Fri'])}>Weekdays</button>
        <button type="button" onClick={() => onChange(['Sat','Sun'])}>Weekends</button>
        <button type="button" onClick={() => onChange(['Mon','Wed','Fri'])}>M / W / F</button>
        <button type="button" className="hb-day-clear" onClick={() => onChange([])}>Clear</button>
      </div>
    </div>
  );
}

/* ── New habit form ─────────────────────────────────────────── */
function NewHabitForm({ form, setForm, onCancel, onSave }) {
  return (
    <div className="hb-form">
      <header className="hb-form-hd">
        <div className="hb-form-title">✦ New Habit</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel">✕</button>
      </header>

      <div className="hb-form-body">
        <div className="hb-form-section">
          <label className="hb-form-lbl">Name *</label>
          <input
            className="hb-inp"
            placeholder="e.g. Bible reading, Morning prayer, Walk outside"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Description (optional)</label>
          <textarea
            className="hb-ta"
            rows={2}
            placeholder="Why this matters to you..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Emoji</label>
          <div className="hb-emoji-row">
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                type="button"
                className={`hb-emoji-btn ${form.emoji === e ? 'on' : ''}`}
                onClick={() => setForm(f => ({ ...f, emoji: e }))}
              >{e}</button>
            ))}
          </div>
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Color</label>
          <div className="hb-color-row">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                className={`hb-color-dot ${form.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))}
              />
            ))}
          </div>
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Target — how many days a week?</label>
          <input
            className="hb-inp"
            type="number"
            min="1"
            max="7"
            value={form.target_per_week}
            onChange={e => setForm(f => ({ ...f, target_per_week: parseInt(e.target.value, 10) || 7 }))}
          />
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Schedule — which days of the week?</label>
          <div className="hb-form-hint">
            Pick the days this habit should appear on. Scheduled days also show
            up on the Calendar tab.
          </div>
          <HabitDayPicker
            days={form.scheduled_days || []}
            onChange={(days) => setForm(f => ({ ...f, scheduled_days: days }))}
          />
        </div>

        <div className="hb-form-section">
          <label className="hb-form-lbl">Reminder time (optional)</label>
          <input
            className="hb-inp"
            type="time"
            value={form.reminder_time || ''}
            onChange={e => setForm(f => ({ ...f, reminder_time: e.target.value }))}
          />
        </div>
      </div>

      <footer className="hb-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={!form.name.trim()}
        >✓ Save Habit</button>
      </footer>
    </div>
  );
}
