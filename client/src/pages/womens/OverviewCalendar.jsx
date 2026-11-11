import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameDay, isSameMonth, isToday,
} from 'date-fns';
import { calendarService } from '../../services/calendarService';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — Overview calendar widget.

   A compact month view surfaced right on the Overview page so a
   leader can see what's coming up without leaving the ministry —
   reads from the same shared calendarService as the main /calendar
   page. Clicking a day shows its events below the grid; "Open full
   calendar" jumps to the real thing for editing.
   ───────────────────────────────────────────────────────────── */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatEventTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function WomensOverviewCalendar() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let alive = true;
    calendarService.getAll()
      .then(list => { if (alive) setEvents(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      if (!ev.event_date) return;
      (map[ev.event_date] ||= []).push(ev);
    });
    return map;
  }, [events]);

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = eventsByDate[selectedKey] || [];

  return (
    <section className="wmc-cal">
      <div className="wmc-cal-head">
        <h2 className="wmc-cal-title">📅 Calendar</h2>
        <div className="wmc-cal-nav">
          <button type="button" className="wmc-cal-navbtn" onClick={() => setMonth(m => subMonths(m, 1))} aria-label="Previous month">‹</button>
          <span className="wmc-cal-month">{format(month, 'MMMM yyyy')}</span>
          <button type="button" className="wmc-cal-navbtn" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month">›</button>
          <button
            type="button"
            className="wmc-cal-today"
            onClick={() => { const t = new Date(); setMonth(t); setSelected(t); }}
          >
            Today
          </button>
        </div>
      </div>

      <div className="wmc-cal-grid">
        {WEEKDAYS.map((d, i) => <div key={i} className="wmc-cal-dow">{d}</div>)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[key] || [];
          return (
            <button
              type="button"
              key={key}
              className={[
                'wmc-cal-day',
                !isSameMonth(day, month) && 'is-outside',
                isToday(day) && 'is-today',
                isSameDay(day, selected) && 'is-selected',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelected(day)}
            >
              <span className="wmc-cal-daynum">{format(day, 'd')}</span>
              {dayEvents.length > 0 && (
                <span className="wmc-cal-dots">
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <span key={i} className="wmc-cal-dot" style={{ background: ev.color || 'var(--wmc-accent)' }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="wmc-cal-agenda">
        <div className="wmc-cal-agenda-head">
          <span className="wmc-cal-agenda-date">{format(selected, 'EEEE, MMMM d')}</span>
          <button type="button" className="wmc-btn wmc-btn-ghost wmc-cal-open" onClick={() => navigate('/calendar')}>
            Open full calendar →
          </button>
        </div>
        {selectedEvents.length === 0 ? (
          <p className="wmc-cal-empty">No events on this day.</p>
        ) : (
          <ul className="wmc-cal-list">
            {selectedEvents.map(ev => (
              <li key={ev.id} className="wmc-cal-item">
                <span className="wmc-cal-item-dot" style={{ background: ev.color || 'var(--wmc-accent)' }} />
                <span className="wmc-cal-item-title">{ev.title || 'Untitled event'}</span>
                {ev.event_time && <span className="wmc-cal-item-time">{formatEventTime(ev.event_time)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
