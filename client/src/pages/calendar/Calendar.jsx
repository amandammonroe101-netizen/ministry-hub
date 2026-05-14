import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, isToday,
  addDays, addYears, isBefore, differenceInDays, startOfDay,
} from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import { calendarService } from '../../services/calendarService';
import { friendsService }  from '../../services/friendsService';
import { prayerService }   from '../../services/prayerService';
import { journalService }  from '../../services/journalService';
import { journalReminderService } from '../../services/journalReminderService';
import { habitService }    from '../../services/habitService';
import './Calendar.css';

/* ─────────────────────────────────────────────────────────────
   Event types — each has a color, emoji, label, and source.
   ───────────────────────────────────────────────────────────── */
const EVENT_TYPES = {
  custom:           { label: 'Custom event',     emoji: '⭐', color: '#a78bfa' },
  birthday:         { label: 'Birthday',         emoji: '🎂', color: '#f472b6' },
  reach_out:        { label: 'Reach-out due',    emoji: '⚡', color: '#fbbf24' },
  prayer:           { label: 'Daily prayer',     emoji: '🙏', color: '#c4b5fd' },
  journal:          { label: 'Journal entry',    emoji: '📖', color: '#60a5fa' },
  friend_event:     { label: 'Friend event',     emoji: '📅', color: '#2dd4bf' },
  journal_reminder: { label: 'Journal reminder', emoji: '🔔', color: '#a78bfa' },
  habit:            { label: 'Habit scheduled',  emoji: '✅', color: '#60a5fa' },
};

const COLOR_OPTIONS = ['#a78bfa','#f472b6','#fbbf24','#60a5fa','#2dd4bf','#fb7185','#6ee7b7','#fcd34d'];

const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const EMPTY_FORM = {
  title: '', description: '', event_date: '', event_time: '', color: '#a78bfa',
};

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export default function Calendar() {
  const navigate = useNavigate();
  const [cursor, setCursor]                       = useState(new Date());
  const [view, setView]                           = useState('month'); // month | week
  const [selectedDate, setSelectedDate]           = useState(new Date());
  const [showForm, setShowForm]                   = useState(false);
  const [form, setForm]                           = useState(EMPTY_FORM);

  const [customEvents, setCustomEvents] = useState([]);
  const [friends, setFriends]           = useState([]);
  const [prayers, setPrayers]           = useState([]);
  const [journal, setJournal]           = useState([]);
  const [reminders, setReminders]       = useState([]);
  const [habits, setHabits]             = useState([]);
  const [error, setError]               = useState(null);
  const [loading, setLoading]           = useState(true);

  const [filters, setFilters] = useState({
    custom: true, birthday: true, reach_out: true, prayer: true, journal: true,
    friend_event: true, journal_reminder: true, habit: true,
  });
  const [leftCollapsed, setLeftCollapsed]   = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  /* ── load data ───────────────────────────────────────────── */
  useEffect(() => { fetchAll(); }, []);
  const fetchAll = async () => {
    try {
      setLoading(true);
      const [ce, fr, pr, jr, jrm, hb] = await Promise.all([
        calendarService.getAll(),
        friendsService.getFriends(),
        prayerService.getAll(),
        journalService.getAll(),
        journalReminderService.getAll(),
        habitService.getAll(),
      ]);
      setCustomEvents(ce.data.data);
      setFriends(fr.data.data);
      setPrayers(pr.data.data);
      setJournal(jr.data.data);
      setReminders(jrm.data.data);
      setHabits(hb.data.data);
    } catch { setError('Could not load calendar data.'); }
    finally { setLoading(false); }
  };

  /* ── build aggregated events for a date range ────────────── */
  const eventsByDay = useMemo(() => {
    // map "YYYY-MM-DD" -> [{ id, type, title, color, emoji, ... }]
    const map = {};
    const push = (key, ev) => {
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    };

    // 1. Custom events
    if (filters.custom) {
      customEvents.forEach(e => push(e.event_date, {
        id: `c-${e.id}`,
        type: 'custom',
        title: e.title,
        description: e.description,
        color: e.color || EVENT_TYPES.custom.color,
        emoji: EVENT_TYPES.custom.emoji,
        time: e.event_time,
        sourceId: e.id,
      }));
    }

    // 2. Friend birthdays (this year + next year)
    if (filters.birthday) {
      const year = cursor.getFullYear();
      friends.forEach(f => {
        if (!f.birthday) return;
        try {
          const bday = parseISO(f.birthday);
          [year, year + 1].forEach(y => {
            const key = format(new Date(y, bday.getMonth(), bday.getDate()), 'yyyy-MM-dd');
            push(key, {
              id: `b-${f.id}-${y}`,
              type: 'birthday',
              title: `${f.name}'s birthday`,
              color: EVENT_TYPES.birthday.color,
              emoji: EVENT_TYPES.birthday.emoji,
              sourceId: f.id,
            });
          });
        } catch {}
      });
    }

    // 3. Reach-out due dates (compute for visible month range)
    if (filters.reach_out) {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      friends.forEach(f => {
        const days = (f.reach_out_days || []).map(d => DAY_INDEX[d]).filter(n => n !== undefined);
        if (days.length === 0) return;
        // Iterate days in current month and mark matches
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
          if (days.includes(d.getDay())) {
            const key = format(d, 'yyyy-MM-dd');
            push(key, {
              id: `r-${f.id}-${key}`,
              type: 'reach_out',
              title: `Check in with ${f.name}`,
              color: EVENT_TYPES.reach_out.color,
              emoji: EVENT_TYPES.reach_out.emoji,
              sourceId: f.id,
            });
          }
        });
      });
    }

    // 4. Daily prayer reminders (every day in visible month, one entry per day if any daily prayers)
    if (filters.prayer) {
      const dailyPrayers = prayers.filter(p => p.is_daily && p.status !== 'answered');
      if (dailyPrayers.length > 0) {
        const monthStart = startOfMonth(cursor);
        const monthEnd = endOfMonth(cursor);
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
          const key = format(d, 'yyyy-MM-dd');
          push(key, {
            id: `p-${key}`,
            type: 'prayer',
            title: `${dailyPrayers.length} daily prayer${dailyPrayers.length === 1 ? '' : 's'}`,
            color: EVENT_TYPES.prayer.color,
            emoji: EVENT_TYPES.prayer.emoji,
            meta: dailyPrayers.map(p => p.title),
          });
        });
      }
    }

    // 5. Journal entries (one indicator per day with entries)
    if (filters.journal) {
      const dayCounts = {};
      journal.forEach(e => {
        try {
          const key = format(parseISO(e.created_at), 'yyyy-MM-dd');
          dayCounts[key] = (dayCounts[key] || 0) + 1;
        } catch {}
      });
      Object.entries(dayCounts).forEach(([key, count]) => {
        push(key, {
          id: `j-${key}`,
          type: 'journal',
          title: `${count} journal entr${count === 1 ? 'y' : 'ies'}`,
          color: EVENT_TYPES.journal.color,
          emoji: EVENT_TYPES.journal.emoji,
        });
      });
    }

    // 6. Journal reminders (recurring weekday alarms set in Journal)
    if (filters.journal_reminder && reminders.length > 0) {
      const monthStart = startOfMonth(cursor);
      const monthEnd   = endOfMonth(cursor);
      const remDayIdx = (d) => DAY_INDEX[d];
      reminders.forEach(rem => {
        const idxs = (rem.days || []).map(remDayIdx).filter(n => n !== undefined);
        if (idxs.length === 0) return;
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
          if (idxs.includes(d.getDay())) {
            const key = format(d, 'yyyy-MM-dd');
            push(key, {
              id: `jr-${rem.id}-${key}`,
              type: 'journal_reminder',
              title: rem.label || 'Journal reminder',
              color: EVENT_TYPES.journal_reminder.color,
              emoji: EVENT_TYPES.journal_reminder.emoji,
              time: rem.time,
            });
          }
        });
      });
    }

    // 7. Habit schedules (each habit's scheduled days)
    if (filters.habit && habits.length > 0) {
      const monthStart = startOfMonth(cursor);
      const monthEnd   = endOfMonth(cursor);
      habits.forEach(h => {
        const idxs = (h.scheduled_days || []).map(d => DAY_INDEX[d]).filter(n => n !== undefined);
        if (idxs.length === 0) return;
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
          if (idxs.includes(d.getDay())) {
            const key = format(d, 'yyyy-MM-dd');
            const done = (h.completions || []).includes(key);
            push(key, {
              id: `hb-${h.id}-${key}`,
              type: 'habit',
              title: `${done ? '✓ ' : ''}${h.name}`,
              color: h.color || EVENT_TYPES.habit.color,
              emoji: h.emoji || EVENT_TYPES.habit.emoji,
              time: h.reminder_time,
              meta: done ? ['Already done today'] : null,
              sourceId: h.id,
            });
          }
        });
      });
    }

    return map;
  }, [customEvents, friends, prayers, journal, reminders, habits, filters, cursor]);

  /* ── derived for current view ────────────────────────────── */
  const gridDays = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(cursor));
      const end   = endOfWeek(endOfMonth(cursor));
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfWeek(cursor);
      const end   = endOfWeek(cursor);
      return eachDayOfInterval({ start, end });
    }
  }, [cursor, view]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDay[format(selectedDate, 'yyyy-MM-dd')] || [];
  }, [eventsByDay, selectedDate]);

  /* ── handlers ────────────────────────────────────────────── */
  const handleNewEvent = (date) => {
    const dateStr = date ? format(date, 'yyyy-MM-dd') : todayISO();
    setForm({ ...EMPTY_FORM, event_date: dateStr });
    setShowForm(true);
  };

  const handleSaveEvent = async () => {
    if (!form.title.trim() || !form.event_date) return;
    try {
      await calendarService.create(form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchAll();
    } catch { setError('Failed to save event.'); }
  };

  const handleDeleteCustom = async (id) => {
    if (!confirm('Delete this event?')) return;
    try {
      await calendarService.delete(id);
      await fetchAll();
    } catch { setError('Failed to delete.'); }
  };

  const handleDayClick = (day) => {
    setSelectedDate(day);
  };

  const handleEventLink = (ev) => {
    switch (ev.type) {
      case 'journal':
      case 'journal_reminder':
        navigate('/journal');
        break;
      case 'prayer':
        navigate('/prayers');
        break;
      case 'birthday':
      case 'reach_out':
      case 'friend_event':
        navigate(ev.sourceId ? `/friends?friend=${ev.sourceId}` : '/friends');
        break;
      case 'habit':
        navigate(ev.sourceId ? `/habits?habit=${ev.sourceId}` : '/habits');
        break;
      default:
        break;
    }
  };

  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }));

  const leftW  = leftCollapsed  ? 'var(--rail-w)' : '240px';
  const rightW = rightCollapsed ? 'var(--rail-w)' : '280px';

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="cal-root">
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
          <span className="app-tab-tag calendar">Calendar</span>
        </div>
        <div className="app-tb-actions">
          <button className="app-btn ghost" onClick={() => { setCursor(new Date()); setSelectedDate(new Date()); }}>
            Today
          </button>
          <button className="app-btn ghost icon-only" onClick={() => setCursor(c => subMonths(c, 1))} title="Previous month">‹</button>
          <button className="app-btn ghost icon-only" onClick={() => setCursor(c => addMonths(c, 1))} title="Next month">›</button>
          <button className="app-btn primary" onClick={() => handleNewEvent(selectedDate)}>✦ New Event</button>
        </div>
      </div>

      <div className="cal-body" style={{ gridTemplateColumns: `var(--rail-w) ${leftW} 1fr ${rightW}` }}>
        <NavRail />

        {/* LEFT: filters + mini summary */}
        <aside className={`cal-left ${leftCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            <button className="app-collapse-btn" onClick={() => setLeftCollapsed(v => !v)}>
              {leftCollapsed ? '›' : '‹'}
            </button>
            {!leftCollapsed && <span className="app-panel-title">Filters</span>}
          </div>
          {!leftCollapsed && (
            <div className="cal-left-scroll">
              <div className="cal-section">
                <div className="cal-section-title">View</div>
                <div className="cal-view-toggle">
                  <button
                    className={`cal-view-btn ${view === 'month' ? 'on' : ''}`}
                    onClick={() => setView('month')}
                  >Month</button>
                  <button
                    className={`cal-view-btn ${view === 'week' ? 'on' : ''}`}
                    onClick={() => setView('week')}
                  >Week</button>
                </div>
              </div>

              <div className="cal-section">
                <div className="cal-section-title">Show</div>
                <div className="cal-section-hint">Toggle event types on the calendar.</div>
                {Object.entries(EVENT_TYPES).map(([key, t]) => (
                  <label key={key} className="cal-filter">
                    <input
                      type="checkbox"
                      checked={!!filters[key]}
                      onChange={() => toggleFilter(key)}
                    />
                    <span className="cal-filter-dot" style={{ background: t.color }} />
                    <span className="cal-filter-label">{t.emoji} {t.label}</span>
                  </label>
                ))}
              </div>

              {error && (
                <div className="cal-error">{error}<button onClick={() => setError(null)}>✕</button></div>
              )}
            </div>
          )}
        </aside>

        {/* CENTER: month grid (or week strip) */}
        <main className="cal-center">
          {showForm ? (
            <NewEventForm
              form={form}
              setForm={setForm}
              onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              onSave={handleSaveEvent}
            />
          ) : (
            <CalendarGrid
              cursor={cursor}
              view={view}
              gridDays={gridDays}
              eventsByDay={eventsByDay}
              selectedDate={selectedDate}
              onDayClick={handleDayClick}
              onDoubleClick={(day) => handleNewEvent(day)}
              loading={loading}
            />
          )}
        </main>

        {/* RIGHT: selected day details */}
        <aside className={`cal-right ${rightCollapsed ? 'collapsed' : ''}`}>
          <div className="app-panel-header">
            {!rightCollapsed && <span className="app-panel-title">
              {selectedDate ? format(selectedDate, 'EEE, MMM d') : 'Day'}
            </span>}
            <button
              className="app-collapse-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => setRightCollapsed(v => !v)}
            >{rightCollapsed ? '‹' : '›'}</button>
          </div>
          {!rightCollapsed && (
            <div className="cal-right-scroll">
              {selectedDate && (
                <>
                  <button
                    className="app-btn primary cal-add-day-btn"
                    onClick={() => handleNewEvent(selectedDate)}
                  >+ Add event on this day</button>
                  {selectedDayEvents.length === 0 ? (
                    <div className="cal-day-empty">No events on this day yet.</div>
                  ) : (
                    <div className="cal-day-events">
                      {selectedDayEvents.map(ev => (
                        <DayEventCard
                          key={ev.id}
                          ev={ev}
                          onOpen={() => handleEventLink(ev)}
                          onDelete={ev.type === 'custom' ? () => handleDeleteCustom(ev.sourceId) : null}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
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
function CalendarGrid({ cursor, view, gridDays, eventsByDay, selectedDate, onDayClick, onDoubleClick, loading }) {
  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div className="cal-grid-wrap">
      <header className="cal-month-hd">
        <div className="cal-month-title">
          {format(cursor, view === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
        </div>
        <div className="cal-tab-hint">
          Click a day to see what’s on it · double-click to add an event.
        </div>
      </header>

      <div className="cal-weekday-row">
        {WEEKDAYS.map(d => <div key={d} className="cal-weekday">{d}</div>)}
      </div>

      <div className={`cal-grid ${view === 'week' ? 'week' : 'month'}`}>
        {loading && <div className="cal-loading">Loading…</div>}
        {gridDays.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const events = eventsByDay[key] || [];
          const isOff = view === 'month' && !isSameMonth(day, cursor);
          const isSel = selectedDate && isSameDay(day, selectedDate);
          return (
            <div
              key={key}
              className={`cal-day ${isOff ? 'off' : ''} ${isToday(day) ? 'today' : ''} ${isSel ? 'sel' : ''}`}
              onClick={() => onDayClick(day)}
              onDoubleClick={() => onDoubleClick(day)}
            >
              <div className="cal-day-num">{format(day, 'd')}</div>
              <div className="cal-day-events-mini">
                {events.slice(0, 3).map(ev => (
                  <div
                    key={ev.id}
                    className="cal-event-chip"
                    style={{ background: `${ev.color}22`, color: ev.color, borderColor: `${ev.color}55` }}
                    title={ev.title}
                  >
                    <span className="cal-event-chip-emoji">{ev.emoji}</span>
                    <span className="cal-event-chip-title">{ev.title}</span>
                  </div>
                ))}
                {events.length > 3 && (
                  <div className="cal-event-more">+{events.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayEventCard({ ev, onOpen, onDelete }) {
  return (
    <article
      className="cal-day-event"
      style={{ borderColor: `${ev.color}55`, background: `${ev.color}10` }}
    >
      <div className="cal-day-event-hd">
        <span className="cal-day-event-emoji" style={{ color: ev.color }}>{ev.emoji}</span>
        <span className="cal-day-event-title">{ev.title}</span>
        {ev.time && <span className="cal-day-event-time">{ev.time}</span>}
      </div>
      {ev.description && <div className="cal-day-event-desc">{ev.description}</div>}
      {ev.meta && ev.meta.length > 0 && (
        <ul className="cal-day-event-meta">
          {ev.meta.slice(0, 4).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
      <div className="cal-day-event-actions">
        {ev.type !== 'custom' && (
          <button className="app-btn ghost" onClick={onOpen}>🔗 Open</button>
        )}
        {onDelete && (
          <button className="app-btn ghost" onClick={onDelete} title="Delete">🗑</button>
        )}
      </div>
    </article>
  );
}

function NewEventForm({ form, setForm, onCancel, onSave }) {
  return (
    <div className="cal-form">
      <header className="cal-form-hd">
        <div className="cal-form-title">✦ New Event</div>
        <button className="app-btn ghost icon-only" onClick={onCancel} title="Cancel">✕</button>
      </header>

      <div className="cal-form-body">
        <div className="cal-form-section">
          <label className="cal-form-lbl">Title *</label>
          <input
            className="cal-inp"
            placeholder="What is this event?"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            autoFocus
          />
        </div>

        <div className="cal-form-section">
          <label className="cal-form-lbl">Description (optional)</label>
          <textarea
            className="cal-ta"
            rows={2}
            placeholder="Notes about this event..."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="cal-form-row">
          <div className="cal-form-section">
            <label className="cal-form-lbl">Date *</label>
            <input
              className="cal-inp"
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
            />
          </div>
          <div className="cal-form-section">
            <label className="cal-form-lbl">Time (optional)</label>
            <input
              className="cal-inp"
              type="time"
              value={form.event_time}
              onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
            />
          </div>
        </div>

        <div className="cal-form-section">
          <label className="cal-form-lbl">Color</label>
          <div className="cal-color-row">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                className={`cal-color-dot ${form.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="cal-form-ft">
        <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
        <button
          className="app-btn primary"
          onClick={onSave}
          disabled={!form.title.trim() || !form.event_date}
        >✓ Save Event</button>
      </footer>
    </div>
  );
}
