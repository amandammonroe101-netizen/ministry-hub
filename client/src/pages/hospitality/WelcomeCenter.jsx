import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import { useHosts, useGuests } from './hospitalityListsConfig';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Sunday Hosting → Welcome Center

   Info / welcome desk — an FAQ library, brochure inventory, and
   visitor-card capture. Capturing a card creates a real record on
   the shared guest directory (hospitality:guests) at the "Card
   Received" pipeline stage, so it shows up immediately on the
   Follow-Up Pipeline page without re-entering anything.

   Storage:
     faqs:       useUserStoreKey('hospitality:welcome-faqs', [])
     brochures:  useUserStoreKey('hospitality:welcome-brochures', [])
     guests:     useGuests() — shared with Follow-Up Pipeline / Gifts / Connect Events
     hosts:      useHosts() (read only, role="welcome")
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function WelcomeCenter() {
  const [hosts] = useHosts();
  const [faqs, setFaqs, { loading }] = useUserStoreKey('hospitality:welcome-faqs', []);
  const [brochures, setBrochures] = useUserStoreKey('hospitality:welcome-brochures', []);
  const [guests, setGuests] = useGuests();
  const navigate = useNavigate();

  const welcomeHosts = useMemo(() => (Array.isArray(hosts) ? hosts : []).filter(h => (h.roles || []).includes('welcome')), [hosts]);
  const faqList = Array.isArray(faqs) ? faqs : [];
  const brochureList = Array.isArray(brochures) ? brochures : [];
  const guestList = Array.isArray(guests) ? guests : [];
  const capturedToday = guestList.filter(g => g.visitDate === today() && g.source === 'welcome-center').length;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [faqDraft, setFaqDraft] = useState({ q: '', a: '' });
  const [brochureDraft, setBrochureDraft] = useState('');
  const [cardDraft, setCardDraft] = useState({ name: '', phone: '', email: '', notes: '' });

  const addFaq = () => {
    if (!faqDraft.q.trim()) return;
    setFaqs(prev => [...(prev || []), { id: makeId('faq'), q: faqDraft.q.trim(), a: faqDraft.a.trim() }]);
    setFaqDraft({ q: '', a: '' });
  };
  const removeFaq = (id) => setFaqs(prev => (prev || []).filter(f => f.id !== id));

  const addBrochure = () => {
    const name = brochureDraft.trim();
    if (!name) return;
    setBrochures(prev => [...(prev || []), { id: makeId('br'), name, count: 0, lowThreshold: 10 }]);
    setBrochureDraft('');
  };
  const setBrochureCount = (id, count) => setBrochures(prev => (prev || []).map(b => b.id === id ? { ...b, count } : b));
  const removeBrochure = (id) => setBrochures(prev => (prev || []).filter(b => b.id !== id));

  const captureCard = () => {
    if (!cardDraft.name.trim()) return;
    const guest = {
      id: makeId('gu'),
      name: cardDraft.name.trim(),
      phone: cardDraft.phone.trim(),
      email: cardDraft.email.trim(),
      notes: cardDraft.notes.trim(),
      visitDate: today(),
      stage: 'card',
      source: 'welcome-center',
      assignedHostId: null,
      createdAt: Date.now(),
    };
    setGuests(prev => [guest, ...(Array.isArray(prev) ? prev : [])]);
    setCardDraft({ name: '', phone: '', email: '', notes: '' });
  };

  return (
    <HospitalityShell
      title="Welcome Center"
      icon="ℹ"
      subtitle="Info / welcome desk — answers to FAQs, ministry brochures, kids check-in pointers, and visitor card capture."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{welcomeHosts.length}</span><span className="ha-stat-lbl">Desk hosts</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{capturedToday}</span><span className="ha-stat-lbl">Cards captured today</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{brochureList.filter(b => b.count <= b.lowThreshold).length}</span><span className="ha-stat-lbl">Brochures low</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">ℹ️ Welcome desk hosts</h3>
                <div className="ys-section-body">
                  {welcomeHosts.length === 0 ? (
                    <div className="ha-directory-empty">No hosts assigned to Welcome Desk yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {welcomeHosts.map(h => (
                        <div key={h.id} className="ha-list-row" style={{ cursor: 'default' }}>
                          <span className="ha-list-row-title">{h.name || 'Unnamed host'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/all')}>Manage on All Hosts →</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🎟️ Visitor card capture</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Guest name" value={cardDraft.name} onChange={e => setCardDraft(d => ({ ...d, name: e.target.value }))} />
                    <input type="tel" className="ys-inp" placeholder="Phone" value={cardDraft.phone} onChange={e => setCardDraft(d => ({ ...d, phone: e.target.value }))} />
                  </div>
                  <div className="ys-row-fields">
                    <input type="email" className="ys-inp" placeholder="Email" value={cardDraft.email} onChange={e => setCardDraft(d => ({ ...d, email: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Notes (how they found us, prayer request…)" value={cardDraft.notes} onChange={e => setCardDraft(d => ({ ...d, notes: e.target.value }))} />
                  </div>
                  <button type="button" className="app-btn primary" style={{ width: 'fit-content' }} onClick={captureCard} disabled={!cardDraft.name.trim()}>
                    ＋ Capture card
                  </button>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                    Captured cards land on the Follow-Up Pipeline at "Card Received" automatically.
                  </div>
                  <button type="button" className="app-btn ghost" style={{ width: 'fit-content' }} onClick={() => navigate('/hospitality/guests/follow-up')}>
                    Open Follow-Up Pipeline →
                  </button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">❓ FAQ library</h3>
                <div className="ys-section-body">
                  {faqList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No FAQs yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {faqList.map(f => (
                        <div key={f.id} className="ha-archive-section" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13 }}>{f.q}</b>
                            <button type="button" className="app-btn ghost" onClick={() => removeFaq(f.id)}>✕</button>
                          </div>
                          {f.a && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{f.a}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <input type="text" className="ys-inp" placeholder="Question" value={faqDraft.q} onChange={e => setFaqDraft(d => ({ ...d, q: e.target.value }))} />
                  <textarea className="ys-inp ys-textarea" rows={2} placeholder="Answer" value={faqDraft.a} onChange={e => setFaqDraft(d => ({ ...d, a: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addFaq}>＋ Add FAQ</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📚 Brochure inventory</h3>
                <div className="ys-section-body">
                  {brochureList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No brochures tracked yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {brochureList.map(b => (
                        <div key={b.id} className="ys-row-fields" style={{ alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: b.count <= b.lowThreshold ? '#fdba74' : undefined }}>
                            {b.count <= b.lowThreshold ? '⚡ ' : ''}{b.name}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" min="0" className="ys-inp" value={b.count} onChange={e => setBrochureCount(b.id, Number(e.target.value) || 0)} />
                            <button type="button" className="app-btn ghost" onClick={() => removeBrochure(b.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" className="ys-inp" placeholder="Brochure name (e.g. 'Kids Ministry')" value={brochureDraft} onChange={e => setBrochureDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBrochure(); } }} />
                    <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={addBrochure}>＋ Add</button>
                  </div>
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
