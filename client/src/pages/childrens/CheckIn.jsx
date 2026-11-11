import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useBands } from './bandsConfig';
import './_shared.css';

/* Children's → Check-In Station
   Storage: childrens:checkIns — log of each check-in/out session.
   Each entry { id, kidId, kidName, ageBand, date, checkedInAt,
                checkedOutAt, claimCode, allergiesSnapshot,
                roomName, byVolunteer } */

const ACCENT = 'var(--accent-rose, #fb7185)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* 4-digit code per check-in. Parent shows it at pickup. Random,
   short, and easy to read off a label. */
const makeClaimCode = () => String(Math.floor(1000 + Math.random() * 9000));

export default function ChildrensCheckIn() {
  const [kids]               = useUserStoreKey('childrens:kids', []);
  const [rooms]              = useUserStoreKey('childrens:rooms', []);
  const [checkIns, setCheckIns] = useUserStoreKey('childrens:checkIns', []);
  const [bandsConfig]        = useBands();

  const kidList    = Array.isArray(kids) ? kids : [];
  const roomList   = Array.isArray(rooms) ? rooms : [];
  const checkList  = Array.isArray(checkIns) ? checkIns : [];

  const today = new Date().toISOString().slice(0, 10);
  const todayCheckIns = checkList.filter(c => c.date === today);
  const stillIn = todayCheckIns.filter(c => !c.checkedOutAt);

  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState('All');

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const visibleKids = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kidList
      .filter(k => k.active)
      .filter(k => bandFilter === 'All' ? true : k.ageBand === bandFilter)
      .filter(k => !q || (k.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [kidList, bandFilter, query]);

  /* Filter chips come from the configured bands (single source of
     truth) plus any orphaned bands actually present on kids — so a
     stray label still appears as a filter option until it's
     reassigned. */
  const bands = useMemo(() => {
    const configured = bandsConfig.map(b => b.label);
    const fromKids = new Set();
    kidList.forEach(k => k.ageBand && fromKids.add(k.ageBand));
    const orphans = [...fromKids].filter(l => !configured.includes(l));
    return ['All', ...configured, ...orphans];
  }, [bandsConfig, kidList]);

  const isCheckedIn = (kidId) =>
    todayCheckIns.some(c => c.kidId === kidId && !c.checkedOutAt);

  const checkIn = (kid) => {
    if (isCheckedIn(kid.id)) return;
    const room = roomList.find(r => r.band === kid.ageBand);
    const entry = {
      id: makeId('ci'),
      kidId: kid.id,
      kidName: kid.name,
      ageBand: kid.ageBand,
      date: today,
      checkedInAt: new Date().toISOString(),
      checkedOutAt: '',
      claimCode: makeClaimCode(),
      allergiesSnapshot: kid.allergies || '',
      medicationsSnapshot: kid.medications || '',
      roomName: room?.roomName || '',
      parentName: kid.parentName || '',
      parentPhone: kid.parentPhone || '',
    };
    setCheckIns(prev => [entry, ...(prev || [])]);
    /* Print-friendly receipt: open a tiny window with the claim code
       so the parent has something to show at pickup. */
    showClaimReceipt(entry);
  };

  const checkOut = (entryId, requireCode = false) => {
    const entry = checkList.find(c => c.id === entryId);
    if (!entry) return;
    if (requireCode) {
      const code = prompt(`Enter the 4-digit claim code for ${entry.kidName}:`);
      if (code == null) return;
      if (code !== entry.claimCode) {
        alert(`❌ Code doesn't match. The parent's code is the one printed at check-in.\n\n(Override is intentionally not available — find an authorized adult instead.)`);
        return;
      }
    }
    setCheckIns(prev => (prev || []).map(c => c.id === entryId ? { ...c, checkedOutAt: new Date().toISOString() } : c));
  };

  return (
    <ChildrensShell
      groupLabel="Check-In & Safety" groupIcon="🛡"
      icon="🏷" title="Check-In Station"
      accent={ACCENT}
      subtitle="Tap a kid to check them in — generates a 4-digit claim code parents show at pickup. Allergy + medication flags follow the kid all session."
      stats={[
        { n: todayCheckIns.length, label: 'check-ins today' },
        { n: stillIn.length, label: 'still in the building' },
        { n: visibleKids.length, label: 'kids available' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input
          className="yps-input"
          placeholder="🔍 Search a kid by name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="cm-chips">
        {bands.map(b => (
          <button key={b} className={`yps-chip ${bandFilter === b ? 'on' : ''}`} onClick={() => setBandFilter(b)}>{b}</button>
        ))}
      </div>

      {stillIn.length > 0 && (
        <section style={{ background: 'var(--bg-glass)', border: '0.5px solid color-mix(in srgb, var(--yps-accent) 30%, var(--border))', borderRadius: 'var(--radius-lg)', padding: 12 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>👀 Currently in the building ({stillIn.length})</h3>
          <div className="cm-grid">
            {stillIn.map(c => (
              <article key={c.id} className="cm-card" style={{ cursor: 'default' }}>
                <div className="cm-card-hd">
                  <h3 className="cm-card-title">{c.kidName}</h3>
                  <span className="yps-pill cm-good">Code {c.claimCode}</span>
                </div>
                <div className="cm-card-meta">
                  <span className="yps-pill">{c.ageBand}</span>
                  {c.roomName && <span className="yps-pill">🚪 {c.roomName}</span>}
                  <span className="yps-pill">In since {new Date(c.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {(c.allergiesSnapshot || c.medicationsSnapshot) && (
                  <div className="cm-card-sub">
                    {c.allergiesSnapshot && <><span className="yps-pill cm-bad">⚠ Allergy</span> {c.allergiesSnapshot}<br/></>}
                    {c.medicationsSnapshot && <><span className="yps-pill cm-warn">💊 Meds</span> {c.medicationsSnapshot}</>}
                  </div>
                )}
                {c.parentPhone && (
                  <div className="cm-card-sub">📞 {c.parentName} · {c.parentPhone}</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="yps-btn" onClick={() => checkOut(c.id, true)}>🔐 Check out (verify code)</button>
                  <button className="yps-btn ghost" onClick={() => checkOut(c.id, false)} title="Use only for direct hand-off to an authorized adult you recognize">Quick check out</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 style={{ margin: '14px 0 8px', fontSize: 14, fontWeight: 700 }}>Available kids — tap to check in</h3>
        {visibleKids.length === 0 ? (
          <div className="cm-empty">
            <div className="cm-empty-icon">🧒</div>
            <div className="cm-empty-title">No kids match this view</div>
            <div className="cm-empty-sub">Try clearing the search or picking a different age band.</div>
          </div>
        ) : (
          <div className="cm-grid">
            {visibleKids.map(k => {
              const checkedIn = isCheckedIn(k.id);
              return (
                <button
                  key={k.id}
                  className="cm-card"
                  onClick={() => !checkedIn && checkIn(k)}
                  disabled={checkedIn}
                  style={{ opacity: checkedIn ? 0.6 : 1, cursor: checkedIn ? 'default' : 'pointer', textAlign: 'left' }}
                >
                  <div className="cm-card-hd">
                    <h3 className="cm-card-title">{k.name || '(unnamed)'}</h3>
                    {checkedIn && <span className="yps-pill cm-good">✓ In</span>}
                  </div>
                  <div className="cm-card-meta">
                    <span className="yps-pill">{k.ageBand}</span>
                    {k.allergies && <span className="yps-pill cm-bad">⚠ Allergy</span>}
                    {k.medications && <span className="yps-pill cm-warn">💊 Meds</span>}
                  </div>
                  {k.parentName && (
                    <div className="cm-card-sub">👨‍👩‍👧 {k.parentName}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

/* Open a small popup with the claim code so parents can grab a
   screenshot or take a photo. Browsers may block popups; if so we
   fall back to an alert. */
function showClaimReceipt(entry) {
  const time = new Date(entry.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${entry.kidName} — check-in</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; text-align: center; }
  .code { font-size: 96px; font-weight: 800; letter-spacing: 8px; margin: 18px 0; color: #fb7185; }
  .meta { color: #555; font-size: 14px; line-height: 1.5; }
  .warn { background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 6px; margin: 12px auto; display: inline-block; }
</style></head><body>
  <h1>${entry.kidName}</h1>
  <div class="meta">${entry.ageBand}${entry.roomName ? ` · ${entry.roomName}` : ''}</div>
  <div class="code">${entry.claimCode}</div>
  <div class="meta"><b>Show this code at pickup.</b><br/>Checked in ${time} on ${entry.date}</div>
  ${entry.allergiesSnapshot ? `<div class="warn">⚠ Allergies: ${entry.allergiesSnapshot}</div>` : ''}
  ${entry.medicationsSnapshot ? `<div class="warn">💊 Meds: ${entry.medicationsSnapshot}</div>` : ''}
  <p style="margin-top:24px;"><button onclick="window.print()" style="padding:8px 16px;font-size:14px;">🖨 Print</button></p>
</body></html>`;
  const w = window.open('', '_blank', 'width=420,height=560');
  if (w) { w.document.write(html); w.document.close(); }
  else alert(`✓ Checked in ${entry.kidName}\n\nClaim code: ${entry.claimCode}\n\n(Popup blocked — please enable popups to print the claim ticket.)`);
}
