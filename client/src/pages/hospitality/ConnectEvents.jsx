import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useGuests } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → New Guests → Newcomer Connect Events

   Newcomer lunch / orientation event planning + RSVP tracking
   against the SAME shared guest records as Welcome Center / Gifts
   / Follow-Up Pipeline. RSVPing a guest to an event advances their
   pipeline stage to 'invited'; marking them attended advances to
   'attending'.

   Storage:
     events:  useUserStoreKey('hospitality:connect-events', [])
     guests:  useGuests() — shared with Welcome Center / Gifts / Follow-Up Pipeline
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export default function ConnectEvents() {
  const [events, setEvents, { loading }] = useUserStoreKey('hospitality:connect-events', []);
  const [guests, setGuests] = useGuests();
  const navigate = useNavigate();

  const eventList = Array.isArray(events) ? events : [];
  const guestList = Array.isArray(guests) ? guests : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [eventDraft, setEventDraft] = useState({ title: '', date: '', location: '' });
  const [selectedEventId, setSelectedEventId] = useState(null);

  const selectedEvent = eventList.find(e => e.id === selectedEventId) || null;
  const upcomingCount = eventList.filter(e => !e.date || e.date >= new Date().toISOString().slice(0, 10)).length;
  const totalRsvps = eventList.reduce((sum, e) => sum + (e.rsvpIds || []).length, 0);

  const addEvent = () => {
    if (!eventDraft.title.trim()) return;
    setEvents(prev => [...(prev || []), { id: makeId('ce'), title: eventDraft.title.trim(), date: eventDraft.date, location: eventDraft.location.trim(), rsvpIds: [], attendedIds: [] }]);
    setEventDraft({ title: '', date: '', location: '' });
  };
  const removeEvent = (id) => {
    setEvents(prev => (prev || []).filter(e => e.id !== id));
    if (selectedEventId === id) setSelectedEventId(null);
  };

  const toggleRsvp = (event, guestId) => {
    const has = (event.rsvpIds || []).includes(guestId);
    setEvents(prev => (prev || []).map(e => e.id === event.id ? { ...e, rsvpIds: has ? e.rsvpIds.filter(id => id !== guestId) : [...(e.rsvpIds || []), guestId] } : e));
    if (!has) {
      setGuests(prev => (prev || []).map(g => g.id === guestId && (g.stage === 'card' || g.stage === 'gift' || g.stage === 'thank-you' || g.stage === 'called') ? { ...g, stage: 'invited' } : g));
    }
  };

  const toggleAttended = (event, guestId) => {
    const has = (event.attendedIds || []).includes(guestId);
    setEvents(prev => (prev || []).map(e => e.id === event.id ? { ...e, attendedIds: has ? e.attendedIds.filter(id => id !== guestId) : [...(e.attendedIds || []), guestId] } : e));
    if (!has) {
      setGuests(prev => (prev || []).map(g => g.id === guestId ? { ...g, stage: 'attending' } : g));
    }
  };

  return (
    <HospitalityShell
      title="Newcomer Connect Events"
      icon="🎉"
      subtitle="Connect-style events — newcomer lunch, pastor meet-and-greet, membership class — RSVPs, host home, schedule, and follow-up."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{upcomingCount}</span><span className="ha-stat-lbl">Upcoming events</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{totalRsvps}</span><span className="ha-stat-lbl">Total RSVPs</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{guestList.filter(g => g.stage === 'attending').length}</span><span className="ha-stat-lbl">Attending a group</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">📨 Plan a connect event</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Event title (e.g. 'Newcomer Lunch')" value={eventDraft.title} onChange={e => setEventDraft(d => ({ ...d, title: e.target.value }))} />
                    <input type="date" className="ys-inp" value={eventDraft.date} onChange={e => setEventDraft(d => ({ ...d, date: e.target.value }))} />
                  </div>
                  <input type="text" className="ys-inp" placeholder="Location" value={eventDraft.location} onChange={e => setEventDraft(d => ({ ...d, location: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addEvent}>＋ Add event</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📅 Events</h3>
                <div className="ys-section-body">
                  {eventList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No connect events planned yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {eventList.map(e => (
                        <div key={e.id} className="ha-list-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedEventId(e.id)}>
                          <div className="ha-list-row-body">
                            <span className="ha-list-row-title">{e.title}</span>
                            <span className="ha-list-row-meta">{e.date || 'No date set'}{e.location ? ` · ${e.location}` : ''} · {(e.rsvpIds || []).length} RSVPs</span>
                          </div>
                          <button type="button" className="app-btn ghost" onClick={(ev) => { ev.stopPropagation(); removeEvent(e.id); }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/guests/follow-up')}>Open Follow-Up Pipeline →</button>
                </div>
              </section>
            </div>
          )}

          {selectedEvent && (
            <div className="ha-slide-overlay" onClick={() => setSelectedEventId(null)}>
              <div className="ha-slide" onClick={e => e.stopPropagation()}>
                <button type="button" className="ha-slide-close" onClick={() => setSelectedEventId(null)}>✕</button>
                <div className="ha-slide-body">
                  <h2 style={{ margin: 0 }}>{selectedEvent.title}</h2>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{selectedEvent.date || 'No date set'}{selectedEvent.location ? ` · ${selectedEvent.location}` : ''}</div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Guests — RSVP / attended</div>
                    {guestList.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No guests tracked yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {guestList.map(g => {
                          const rsvped = (selectedEvent.rsvpIds || []).includes(g.id);
                          const attended = (selectedEvent.attendedIds || []).includes(g.id);
                          return (
                            <div key={g.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                              <span style={{ fontSize: 13 }}>{g.name}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" className={`app-btn ${rsvped ? 'primary' : 'ghost'}`} style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => toggleRsvp(selectedEvent, g.id)}>{rsvped ? '✓ RSVP\'d' : 'RSVP'}</button>
                                <button type="button" className={`app-btn ${attended ? 'primary' : 'ghost'}`} style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => toggleAttended(selectedEvent, g.id)}>{attended ? '✓ Attended' : 'Mark attended'}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
