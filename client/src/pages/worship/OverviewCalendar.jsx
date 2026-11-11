import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, isToday,
} from 'date-fns';
import { useUserStoreKey } from '../../lib/userStore';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/* Worship pages that write dated records — each becomes one checkbox
   in the sidebar. Mirrors the "Worship Ministry" filter group on the
   main Calendar page (meeting/service/recording_session), reading the
   same underlying stores so a session created on that page shows up
   here too. All three share one dot color (indigo) so the calendar
   grid reads as "worship activity" at a glance; the emoji + agenda
   label are what actually distinguish the page it came from. */
const FILTER_META = {
  meeting:           { label: 'Meetings',       emoji: '🗣', color: '#818cf8' },
  service:           { label: 'Scheduling',     emoji: '🗓', color: '#818cf8' },
  recording_session: { label: 'Scheduling Rec.',emoji: '🎙', color: '#818cf8' },
};

const DEFAULT_FILTERS = { meeting: false, service: false, recording_session: false };

function formatEventTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function WorshipOverviewCalendar() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());

  const [meetings]    = useUserStoreKey('admin:meetings',     []);
  const [services]    = useUserStoreKey('band:schedule',      []);
  const [recSessions] = useUserStoreKey('recording:schedule', []);

  /* Own filter doc (separate from the main Calendar's 'calendar-filters'
     key) so toggling a checkbox here doesn't clobber that page's much
     larger, differently-shaped filter set. */
  const [filtersRaw, setFilters] = useUserStoreKey('worship-overview-calendar-filters', DEFAULT_FILTERS);
  const filters = { ...DEFAULT_FILTERS, ...(filtersRaw || {}) };
  const toggleFilter = (key) => setFilters(f => ({ ...DEFAULT_FILTERS, ...f, [key]: !f[key] }));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsByDate = useMemo(() => {
    const map = {};
    const push = (dateStr, ev) => {
      if (!dateStr) return;
      (map[dateStr] ||= []).push(ev);
    };

    if (filters.meeting) {
      (meetings || []).forEach(m => {
        if (!m?.date || m.status === 'cancelled') return;
        push(m.date, {
          id: `mtg-${m.id}`,
          type: 'meeting',
          title: m.title || 'Untitled meeting',
          time: m.startTime || '',
        });
      });
    }
    if (filters.service) {
      (services || []).forEach(s => {
        if (!s?.date) return;
        push(s.date, {
          id: `svc-${s.id}`,
          type: 'service',
          title: s.name || 'Service',
          time: s.startTime || '',
        });
      });
    }
    if (filters.recording_session) {
      (recSessions || []).forEach(r => {
        if (!r?.date || r.status === 'cancelled') return;
        push(r.date, {
          id: `rec-${r.id}`,
          type: 'recording_session',
          title: r.name || 'Recording session',
          time: r.startTime || '',
        });
      });
    }
    return map;
  }, [meetings, services, recSessions, filters]);

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = eventsByDate[selectedKey] || [];

  return (
    <section className="wov-cal-wrap">
      <aside className="wov-cal-filters">
        <h3 className="wov-cal-filters-title">Show on Calendar</h3>
        {Object.entries(FILTER_META).map(([key, meta]) => (
          <label key={key} className="wov-cal-filter">
            <input
              type="checkbox"
              checked={!!filters[key]}
              onChange={() => toggleFilter(key)}
            />
            <span className="wov-cal-filter-dot" style={{ background: meta.color }} />
            <span className="wov-cal-filter-label">{meta.emoji} {meta.label}</span>
          </label>
        ))}
      </aside>

      <div className="wov-cal">
        <div className="wov-cal-head">
          <h2 className="wov-cal-title">📅 Calendar</h2>
          <div className="wov-cal-nav">
            <button type="button" className="wov-cal-navbtn" onClick={() => setMonth(m => subMonths(m, 1))} aria-label="Previous month">‹</button>
            <span className="wov-cal-month">{format(month, 'MMMM yyyy')}</span>
            <button type="button" className="wov-cal-navbtn" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month">›</button>
            <button
              type="button"
              className="wov-cal-today"
              onClick={() => { const t = new Date(); setMonth(t); setSelected(t); }}
            >
              Today
            </button>
          </div>
        </div>

        <div className="wov-cal-grid">
          {WEEKDAYS.map((d, i) => <div key={i} className="wov-cal-dow">{d}</div>)}
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate[key] || [];
            return (
              <button
                type="button"
                key={key}
                className={[
                  'wov-cal-day',
                  !isSameMonth(day, month) && 'is-outside',
                  isToday(day) && 'is-today',
                  isSameDay(day, selected) && 'is-selected',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(day)}
              >
                <span className="wov-cal-daynum">{format(day, 'd')}</span>
                {dayEvents.length > 0 && (
                  <span className="wov-cal-dots">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <span key={i} className="wov-cal-dot" style={{ background: FILTER_META[ev.type]?.color || 'var(--wov-accent)' }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="wov-cal-agenda">
          <div className="wov-cal-agenda-head">
            <span className="wov-cal-agenda-date">{format(selected, 'EEEE, MMMM d')}</span>
            <button type="button" className="wov-btn wov-btn-ghost wov-cal-open" onClick={() => navigate('/calendar')}>
              Open full calendar →
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="wov-cal-empty">No events on this day.</p>
          ) : (
            <ul className="wov-cal-list">
              {selectedEvents.map(ev => (
                <li key={ev.id} className="wov-cal-item">
                  <span className="wov-cal-item-dot" style={{ background: FILTER_META[ev.type]?.color || 'var(--wov-accent)' }} />
                  <span className="wov-cal-item-title">{FILTER_META[ev.type]?.emoji} {ev.title}</span>
                  {ev.time && <span className="wov-cal-item-time">{formatEventTime(ev.time)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
