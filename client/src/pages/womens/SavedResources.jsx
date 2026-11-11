import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { getWorkTypeMeta } from './suggestedAuthors';
import './ResourceLibrary.css';

/* ─────────────────────────────────────────────────────────────
   Women's → My Saved

   Personal collection of devotionals, books, and Bible study
   walkthroughs saved from Resource Library. Entries are stored
   denormalized (author name/work title snapshot at save time) so
   this page never has to look the work back up in the suggested
   catalog — it just lists what was saved and lets you remove it.

   Styled to match Life Stages / Resource Library — see the token
   block at the top of ResourceLibrary.css.

   Storage: useUserStoreKey('womens:saved-resources', [])
   ───────────────────────────────────────────────────────────── */

export default function SavedResources() {
  const navigate = useNavigate();
  const [saved, setSaved, { loading }] = useUserStoreKey('womens:saved-resources', []);
  const list = Array.isArray(saved) ? saved : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [query, setQuery] = useState('');

  const unsave = (key) => {
    setSaved((prev) => (Array.isArray(prev) ? prev : []).filter((s) => s.key !== key));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (q) {
      out = out.filter((s) =>
        (s.authorName || '').toLowerCase().includes(q) ||
        (s.workTitle || '').toLowerCase().includes(q) ||
        (s.workDescription || '').toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }, [list, query]);

  return (
    <WomensShell
      title="My Saved"
      icon="❤️"
      subtitle="Devotionals, books, and Bible study walkthroughs you've saved from the Resource Library."
      actions={
        <button type="button" className="wms-btn primary" onClick={() => navigate('/womens/resources')}>
          📚 Browse Resource Library
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="rl-root">
        {loading && list.length === 0 ? (
          <div className="rl-empty-note">Loading…</div>
        ) : list.length === 0 ? (
          <div className="app-empty">
            <div className="app-empty-icon">❤️</div>
            <div className="app-empty-title">Nothing saved yet</div>
            <div className="app-empty-sub">
              Browse the Resource Library, open an author, and save the
              devotionals, books, or Bible study walkthroughs you want to
              come back to later.
            </div>
            <button type="button" className="app-btn primary" onClick={() => navigate('/womens/resources')}>
              📚 Browse Resource Library
            </button>
          </div>
        ) : (
          <>
            <div className="rl-panel">
              <div className="rl-stat-row" style={{ gridTemplateColumns: '1fr' }}>
                <div className="rl-stat">
                  <span className="rl-stat-n">{list.length}</span>
                  <span className="rl-stat-lbl">Saved</span>
                </div>
              </div>

              <div className="rl-controls">
                <div className="rl-search-wrap">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search saved by author or title…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && <button type="button" className="rl-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>
              </div>
            </div>

            <div className="rl-panel">
              <h3 className="rl-panel-subtitle">Saved works</h3>
              {visible.length === 0 ? (
                <div className="rl-empty-note">No saved items match "{query}".</div>
              ) : (
                <div className="rl-work-list">
                  {visible.map((s) => {
                    const meta = getWorkTypeMeta(s.workType);
                    return (
                      <div className="rl-work-card" key={s.key}>
                        <div className="rl-work-top">
                          <span className="rl-work-type">{meta.icon} {meta.label}</span>
                          <button
                            type="button"
                            className="rl-save-btn is-saved"
                            onClick={() => unsave(s.key)}
                          >
                            ★ Saved — remove
                          </button>
                        </div>
                        <div className="rl-work-title">{s.workTitle}</div>
                        <div className="rl-work-author">by {s.authorName}</div>
                        {s.workDescription && <div className="rl-work-desc">{s.workDescription}</div>}
                        {s.workUrl && (
                          <a className="rl-work-link" href={s.workUrl} target="_blank" rel="noreferrer">Open link ↗</a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🌷 Customize Menu"
        pageSettings={<WomensMenuSettings />}
      />
    </WomensShell>
  );
}
