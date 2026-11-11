import { useMemo, useState } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import './_shared.css';

/* Children's → Allergies & Medical
   Read-only derived view from childrens:kids. Surfaces every kid
   with any allergy / medication / medical note so volunteers can
   scan at the start of a shift. Printable. */

const ACCENT = 'var(--accent-blue, #60a5fa)';

export default function ChildrensMedical() {
  const [kids] = useUserStoreKey('childrens:kids', []);
  const list = Array.isArray(kids) ? kids : [];

  const [query, setQuery] = useState('');
  const [showOnly, setShowOnly] = useState('any');  // 'any' | 'allergy' | 'meds' | 'notes'

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const flagged = useMemo(() => {
    return list.filter(k => {
      if (!k.active) return false;
      const hasAllergy = !!(k.allergies || '').trim();
      const hasMeds    = !!(k.medications || '').trim();
      const hasNotes   = !!(k.medicalNotes || '').trim();
      if (showOnly === 'allergy') return hasAllergy;
      if (showOnly === 'meds')    return hasMeds;
      if (showOnly === 'notes')   return hasNotes;
      return hasAllergy || hasMeds || hasNotes;
    });
  }, [list, showOnly]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flagged
      .filter(k => !q ||
        (k.name || '').toLowerCase().includes(q) ||
        (k.allergies || '').toLowerCase().includes(q) ||
        (k.medications || '').toLowerCase().includes(q) ||
        (k.medicalNotes || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [flagged, query]);

  const printPage = () => window.print();

  return (
    <ChildrensShell
      groupLabel="Kids" groupIcon="👶"
      icon="🩺" title="Allergies & Medical"
      accent={ACCENT}
      subtitle="Read-only view auto-generated from the All Kids page. Print before a shift so volunteers always have a paper copy in their pocket."
      actions={<button className="yps-btn" onClick={printPage}>🖨 Print</button>}
      stats={[
        { n: flagged.length, label: 'flagged kids' },
        { n: list.filter(k => k.active && (k.allergies || '').trim()).length, label: 'have allergies' },
        { n: list.filter(k => k.active && (k.medications || '').trim()).length, label: 'on medication' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cm-toolbar">
        <input
          className="yps-input"
          placeholder="Search by name or note…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="cm-chips">
        <span className="cm-chip-label">Show:</span>
        <button className={`yps-chip ${showOnly === 'any' ? 'on' : ''}`}     onClick={() => setShowOnly('any')}>Any flag</button>
        <button className={`yps-chip ${showOnly === 'allergy' ? 'on' : ''}`} onClick={() => setShowOnly('allergy')}>Allergies</button>
        <button className={`yps-chip ${showOnly === 'meds' ? 'on' : ''}`}    onClick={() => setShowOnly('meds')}>Medications</button>
        <button className={`yps-chip ${showOnly === 'notes' ? 'on' : ''}`}   onClick={() => setShowOnly('notes')}>Other notes</button>
      </div>

      {visible.length === 0 ? (
        <div className="cm-empty">
          <div className="cm-empty-icon">🩺</div>
          <div className="cm-empty-title">{list.length === 0 ? 'No kids yet' : 'No medical flags'}</div>
          <div className="cm-empty-sub">
            {list.length === 0
              ? 'Add kids on the All Kids page; this view auto-updates.'
              : 'Either your roster has no allergies / medications, or none match the current filter.'}
          </div>
        </div>
      ) : (
        <div className="cm-rows">
          {visible.map(k => (
            <div key={k.id} className="cm-row" style={{ alignItems: 'flex-start', flexDirection: 'column', cursor: 'default', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <span className="cm-row-name">{k.name}</span>
                <span className="yps-pill">{k.ageBand}</span>
                {k.parentPhone && (
                  <span className="cm-row-sub" style={{ marginLeft: 'auto' }}>
                    👨‍👩‍👧 <a href={`tel:${k.parentPhone.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--yps-accent)', textDecoration: 'none' }}>
                      {k.parentPhone}
                    </a>
                  </span>
                )}
              </div>
              {(k.allergies || '').trim() && (
                <div className="cm-row-sub" style={{ width: '100%' }}>
                  <span className="yps-pill cm-bad">⚠ Allergies</span> {k.allergies}
                </div>
              )}
              {(k.medications || '').trim() && (
                <div className="cm-row-sub" style={{ width: '100%' }}>
                  <span className="yps-pill cm-warn">💊 Medications</span> {k.medications}
                </div>
              )}
              {(k.medicalNotes || '').trim() && (
                <div className="cm-row-sub" style={{ width: '100%' }}>
                  <span className="yps-pill cm-info">📝 Notes</span> {k.medicalNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}
