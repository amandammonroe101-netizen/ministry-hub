import { useState } from 'react';
import HospitalityShell from './HospitalityShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useUserStoreKey } from '../../lib/userStore';
import '../youth/AllStudents.css';
import './AllHosts.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality → Records → Stories & Photos

   A lightweight scrapbook — photo links (URLs) from events, and
   short written stories/thank-you notes from guests describing
   how a welcome became a real connection.

   Storage:
     photos:  useUserStoreKey('hospitality:story-photos', [])
     stories: useUserStoreKey('hospitality:stories', [])
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);

export default function Stories() {
  const [photos, setPhotos, { loading }] = useUserStoreKey('hospitality:story-photos', []);
  const [stories, setStories] = useUserStoreKey('hospitality:stories', []);

  const photoList = Array.isArray(photos) ? photos : [];
  const storyList = Array.isArray(stories) ? stories : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [photoDraft, setPhotoDraft] = useState({ url: '', caption: '', event: '' });
  const [storyDraft, setStoryDraft] = useState({ title: '', body: '', from: '' });

  const addPhoto = () => {
    if (!photoDraft.url.trim()) return;
    setPhotos(prev => [{ id: makeId('ph'), url: photoDraft.url.trim(), caption: photoDraft.caption.trim(), event: photoDraft.event.trim(), date: today() }, ...(prev || [])]);
    setPhotoDraft({ url: '', caption: '', event: '' });
  };
  const removePhoto = (id) => setPhotos(prev => (prev || []).filter(p => p.id !== id));

  const addStory = () => {
    if (!storyDraft.title.trim() || !storyDraft.body.trim()) return;
    setStories(prev => [{ id: makeId('st'), title: storyDraft.title.trim(), body: storyDraft.body.trim(), from: storyDraft.from.trim(), date: today() }, ...(prev || [])]);
    setStoryDraft({ title: '', body: '', from: '' });
  };
  const removeStory = (id) => setStories(prev => (prev || []).filter(s => s.id !== id));

  return (
    <HospitalityShell
      title="Stories & Photos"
      icon="📷"
      subtitle="Photos from events, thank-you notes from guests, and stories of welcome that became real connection."
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {loading ? (
            <div className="ha-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : (
            <div className="ha-directory">
              <div className="ha-stats-bar">
                <div className="ha-stat"><span className="ha-stat-n">{photoList.length}</span><span className="ha-stat-lbl">Photos saved</span></div>
                <div className="ha-stat"><span className="ha-stat-n">{storyList.length}</span><span className="ha-stat-lbl">Stories collected</span></div>
              </div>

              <section className="ys-section">
                <h3 className="ys-section-title">📷 Add a photo</h3>
                <div className="ys-section-body">
                  <input type="url" className="ys-inp" placeholder="Photo URL" value={photoDraft.url} onChange={e => setPhotoDraft(d => ({ ...d, url: e.target.value }))} />
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Caption" value={photoDraft.caption} onChange={e => setPhotoDraft(d => ({ ...d, caption: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="Event (e.g. 'Christmas Eve 2025')" value={photoDraft.event} onChange={e => setPhotoDraft(d => ({ ...d, event: e.target.value }))} />
                  </div>
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addPhoto}>＋ Add photo</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">🖼️ Photo gallery</h3>
                <div className="ys-section-body">
                  {photoList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No photos saved yet.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                      {photoList.map(p => (
                        <div key={p.id} className="ha-archive-section" style={{ padding: 8 }}>
                          <img src={p.url} alt={p.caption || 'Hospitality photo'} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                          {p.caption && <div style={{ fontSize: 12, marginTop: 4 }}>{p.caption}</div>}
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{p.event}{p.event ? ' · ' : ''}{p.date}</div>
                          <button type="button" className="app-btn ghost" style={{ marginTop: 4 }} onClick={() => removePhoto(p.id)}>✕ Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">💌 Add a story</h3>
                <div className="ys-section-body">
                  <div className="ys-row-fields">
                    <input type="text" className="ys-inp" placeholder="Title" value={storyDraft.title} onChange={e => setStoryDraft(d => ({ ...d, title: e.target.value }))} />
                    <input type="text" className="ys-inp" placeholder="From (guest/host name, optional)" value={storyDraft.from} onChange={e => setStoryDraft(d => ({ ...d, from: e.target.value }))} />
                  </div>
                  <textarea className="ys-inp ys-textarea" rows={3} placeholder="How a welcome became a real connection…" value={storyDraft.body} onChange={e => setStoryDraft(d => ({ ...d, body: e.target.value }))} />
                  <button type="button" className="ys-add-btn" style={{ padding: '7px 12px', fontSize: 13, width: 'fit-content' }} onClick={addStory}>＋ Add story</button>
                </div>
              </section>

              <section className="ys-section">
                <h3 className="ys-section-title">📖 Stories &amp; thank-you notes</h3>
                <div className="ys-section-body">
                  {storyList.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No stories collected yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {storyList.map(s => (
                        <div key={s.id} className="ha-archive-section" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13 }}>{s.title}</b>
                            <button type="button" className="app-btn ghost" onClick={() => removeStory(s.id)}>✕</button>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap' }}>{s.body}</p>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{s.from ? `— ${s.from} · ` : ''}{s.date}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </HospitalityShell>
  );
}
