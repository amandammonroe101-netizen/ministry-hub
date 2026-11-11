import { Fragment, useMemo, useRef, useState } from 'react';
import WomensShell from './WomensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import WomensMenuSettings from './WomensMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { useLifeStages } from './womensListsConfig';
/* Reuse the shared page shell (.wa-root/.wa-body/.wa-center/.wa-slide,
   .wa-directory-empty) from AllWomen.css and the .ys-* form primitives
   from the Youth roster — same pattern the rest of Women's already
   follows. The corkboard frame/wall/toolbar are page-specific, in
   Stories.css. */
import '../youth/AllStudents.css';
import './AllWomen.css';
import './Stories.css';

/* ─────────────────────────────────────────────────────────────
   Women's → Stories & Testimonies

   Written and photo stories of life change, collected with
   permission to share with the congregation. Distinct from Care →
   Referral Directory (outside resources) and Resource Library
   (teaching content) — this is first-person testimony content.

   Organized primarily by life stage (reusing the same fixed
   LIFE_STAGES list as All Women / Life Stages so a story tagged
   "Mom" shows up consistently across the ministry). Theme tags
   (salvation, healing, recovery, grief, etc.) and status are
   secondary filters, mirroring the Resource Library pattern.

   Sharing permission is tracked as an explicit status workflow
   (Submitted → Approved to Share → Published) plus a multi-select
   "shared in" list of where a published story has actually been
   used (bulletin, newsletter, social, testimony night, sermon,
   website) — an audit trail, not just a yes/no checkbox.

   Storage: useUserStoreKey('womens:stories', [])
   Photos: inline base64 (fileToResizedDataUrl), capped at 3 per
   story and a modest max dimension to keep the doc small — same
   inline-storage convention as the rest of the app.
   ───────────────────────────────────────────────────────────── */

const STATUS_META = {
  submitted: { label: 'Submitted',        icon: '📥' },
  approved:  { label: 'Approved to Share', icon: '✅' },
  published: { label: 'Published',        icon: '📣' },
};
const STATUS_ORDER = ['submitted', 'approved', 'published'];

const CHANNELS = ['Bulletin', 'Newsletter', 'Social Media', 'Testimony Night', 'Sermon', 'Website'];

const MAX_PHOTOS = 3;

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_STORY = () => ({
  id:            makeId('story'),
  title:         '',
  lifeStage:     '',
  tags:          [],
  submittedBy:   '',
  submittedDate: todayISO(),
  summary:       '',
  storyText:     '',
  photos:        [],
  videoUrl:      '',
  anonymous:     false,
  status:        'submitted',
  sharedIn:      [],
  featured:      false,
  createdAt:     Date.now(),
});

/* Recognize a YouTube or Vimeo link and return an embeddable iframe src.
   Unrecognized links still get saved — they just show as a plain "watch" link
   instead of an inline preview. */
function getVideoEmbed(url) {
  const u = (url || '').trim();
  if (!u) return null;
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i);
  if (yt) return { kind: 'youtube', src: `https://www.youtube.com/embed/${yt[1]}` };
  const vim = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vim) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vim[1]}` };
  return null;
}

export default function Stories() {
  const lifeStages = useLifeStages();
  const [stories, setStories, { loading }] = useUserStoreKey('womens:stories', []);
  const list = Array.isArray(stories) ? stories : [];

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const addStory = () => {
    const s = DEFAULT_STORY();
    setStories(prev => [...(prev || []), s]);
    setSelectedId(s.id);
    setMode('edit');
  };

  const updateStory = (id, patch) => {
    setStories(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s));
  };

  const removeStory = (id) => {
    setStories(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /* Spotlight: the most recently featured story, pulled out as a
     standalone "Story of the Month" banner — independent of the
     filters below so it always anchors the page. */
  const spotlight = useMemo(() => {
    const featured = list.filter(s => s.featured);
    if (!featured.length) return null;
    return [...featured].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  }, [list]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = list;
    if (stageFilter === 'unspecified') out = out.filter(s => !s.lifeStage);
    else if (stageFilter !== 'all') out = out.filter(s => s.lifeStage === stageFilter);
    if (statusFilter !== 'all') out = out.filter(s => (s.status || 'submitted') === statusFilter);
    if (featuredOnly) out = out.filter(s => s.featured);
    if (q) {
      out = out.filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.submittedBy || '').toLowerCase().includes(q) ||
        (s.summary || '').toLowerCase().includes(q) ||
        (s.storyText || '').toLowerCase().includes(q) ||
        (Array.isArray(s.tags) ? s.tags : []).some(t => t.toLowerCase().includes(q)));
    }
    // The spotlight banner already covers this story — don't duplicate it in the wall below.
    if (spotlight && !q && stageFilter === 'all' && statusFilter === 'all') {
      out = out.filter(s => s.id !== spotlight.id);
    }
    return [...out].sort((a, b) => {
      if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [list, query, stageFilter, statusFilter, featuredOnly, spotlight]);

  const selected = useMemo(() => list.find(s => s.id === selectedId) || null, [list, selectedId]);
  const selectedIsSpotlight = !!(selected && spotlight && selected.id === spotlight.id);
  const selectedInWall = !!(selected && !selectedIsSpotlight && visible.some(s => s.id === selected.id));
  const selectedOrphan = !!(selected && !selectedIsSpotlight && !selectedInWall);

  const toggleSelect = (id) => {
    if (selectedId === id) { setSelectedId(null); return; }
    setSelectedId(id);
    setMode('view');
  };

  return (
    <WomensShell
      title="Stories & Testimonies"
      icon="📷"
      subtitle="Written, photo, and video stories of life change — collected with permission to share with the congregation."
      actions={
        <button type="button" className="wms-btn primary" onClick={addStory}>
          ✦ New story
        </button>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="wa-root st-page-root">
      <div className="st-board">
        <span className="st-board-label">📌 Testimony Wall</span>
        <div className="st-board-inner">
          {loading && list.length === 0 ? (
            <div className="wa-directory-empty" style={{ flex: 1 }}>Loading…</div>
          ) : list.length === 0 ? (
            <div className="wa-empty app-empty">
              <div className="app-empty-icon">📷</div>
              <div className="app-empty-title">No stories yet</div>
              <div className="app-empty-sub">
                Collect written and photo testimonies of life change — organized by
                life stage, tracked through a permission-to-share workflow, and
                ready to spotlight with the congregation.
              </div>
              <button type="button" className="app-btn primary" onClick={addStory}>
                ✦ Add your first story
              </button>
            </div>
          ) : (
            <div className="wa-directory">
              <div className="st-toolbar">
                <select
                  className="st-select"
                  value={stageFilter}
                  onChange={e => setStageFilter(e.target.value)}
                  aria-label="Filter by life stage"
                >
                  <option value="all">All stages</option>
                  {lifeStages.stages.map(stage => (
                    <option key={stage} value={stage}>{lifeStages.getStageMeta(stage)?.icon || '🌸'} {stage}</option>
                  ))}
                  <option value="unspecified">— Unspecified stage</option>
                </select>

                <div className="wa-search-wrap st-search-sm">
                  <span>🔍</span>
                  <input
                    type="text"
                    placeholder="Search stories…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {query && <button className="wa-search-clear" onClick={() => setQuery('')}>✕</button>}
                </div>

                <select
                  className="st-select"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  {STATUS_ORDER.map(id => (
                    <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>
                  ))}
                </select>

                <label className="st-featured-toggle">
                  <input type="checkbox" checked={featuredOnly} onChange={e => setFeaturedOnly(e.target.checked)} />
                  <span>⭐ Featured only</span>
                </label>
              </div>

              {spotlight && (
                <button
                  type="button"
                  className="st-spotlight"
                  onClick={() => toggleSelect(spotlight.id)}
                >
                  {spotlight.photos?.[0] && (
                    <img className="st-spotlight-photo" src={spotlight.photos[0]} alt="" />
                  )}
                  <div className="st-spotlight-content">
                    <span className="st-spotlight-badge">⭐ Story of the Moment</span>
                    <h2 className="st-spotlight-title">{spotlight.title || '(untitled story)'}</h2>
                    {spotlight.summary && <p className="st-spotlight-quote">&ldquo;{spotlight.summary}&rdquo;</p>}
                    <div className="st-spotlight-meta">
                      {spotlight.anonymous
                        ? <span>Shared anonymously</span>
                        : spotlight.submittedBy && <span>{spotlight.submittedBy}</span>}
                      {spotlight.lifeStage && (
                        <span>{lifeStages.getStageMeta(spotlight.lifeStage)?.icon || '🌸'} {spotlight.lifeStage}</span>
                      )}
                      {spotlight.videoUrl && <span>🎥 Includes video</span>}
                    </div>
                    <span className="st-spotlight-cta">Read the full story →</span>
                  </div>
                </button>
              )}

              {selectedIsSpotlight && (
                <StoryPanel
                  story={selected}
                  lifeStages={lifeStages}
                  mode={mode}
                  onEdit={() => setMode('edit')}
                  onDone={() => setMode('view')}
                  onChange={(patch) => updateStory(selected.id, patch)}
                  onDelete={() => removeStory(selected.id)}
                  onClose={() => setSelectedId(null)}
                />
              )}

              {selectedOrphan && (
                <StoryPanel
                  story={selected}
                  lifeStages={lifeStages}
                  mode={mode}
                  onEdit={() => setMode('edit')}
                  onDone={() => setMode('view')}
                  onChange={(patch) => updateStory(selected.id, patch)}
                  onDelete={() => removeStory(selected.id)}
                  onClose={() => setSelectedId(null)}
                />
              )}

              {visible.length === 0 ? (
                <div className="wa-directory-empty">
                  {query ? `No stories match "${query}".` : 'No stories match this filter.'}
                </div>
              ) : (
                <div className="st-wall">
                  {visible.map(s => (
                    <Fragment key={s.id}>
                      <StoryCard story={s} lifeStages={lifeStages} onClick={() => toggleSelect(s.id)} />
                      {selectedId === s.id && (
                        <StoryPanel
                          story={s}
                          lifeStages={lifeStages}
                          mode={mode}
                          onEdit={() => setMode('edit')}
                          onDone={() => setMode('view')}
                          onChange={(patch) => updateStory(s.id, patch)}
                          onDelete={() => removeStory(s.id)}
                          onClose={() => setSelectedId(null)}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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

/* ── Directory card ─────────────────────────────────────────── */
function StoryCard({ story, lifeStages, onClick }) {
  const status = STATUS_META[story.status || 'submitted'] || STATUS_META.submitted;
  const stageMeta = story.lifeStage ? lifeStages.getStageMeta(story.lifeStage) : null;
  const tags = Array.isArray(story.tags) ? story.tags : [];
  const photos = Array.isArray(story.photos) ? story.photos : [];
  // Bulletin-board "material": what a card is made of hints at its content —
  // a polaroid for photo stories, a punch-card ticket for video, plain ruled
  // index card for text-only.
  const material = story.videoUrl ? 'type-video' : photos.length > 0 ? 'type-photo' : 'type-text';
  return (
    <button type="button" className={`st-card ${material}`} onClick={onClick}>
      {photos[0] && <img className="st-card-photo" src={photos[0]} alt="" />}
      <div className="st-card-top">
        <span className="st-card-title">{story.title || '(untitled story)'}</span>
        {story.featured && <span className="st-badge is-featured">⭐ Featured</span>}
      </div>
      <div className="st-card-meta">
        {stageMeta ? `${stageMeta.icon || '🌸'} ${story.lifeStage}` : '— Unspecified stage'}
        {' · '}
        <span className={`st-badge status-${story.status || 'submitted'}`}>{status.icon} {status.label}</span>
        {story.videoUrl && <span className="st-badge is-video">🎥 Video</span>}
      </div>
      {story.submittedBy && (
        <div className="st-card-quote">
          Submitted by {story.submittedBy}
          {story.anonymous && <span className="st-badge is-anon">🔒 Anonymous when shared</span>}
        </div>
      )}
      {story.summary && <div className="st-card-quote">"{story.summary}"</div>}
      {tags.length > 0 && (
        <div className="st-tag-row">
          {tags.slice(0, 4).map(t => <span key={t} className="st-tag-chip">{t}</span>)}
        </div>
      )}
    </button>
  );
}

/* ── Inline detail panel — opens directly below the clicked card
   (or the spotlight banner), pushing the rest of the wall down,
   Google-Images-style, instead of a fixed side panel. ──────── */
function StoryPanel({ story, lifeStages, mode, onEdit, onDone, onChange, onDelete, onClose }) {
  return (
    <div className="st-inline-panel">
      <div className="st-inline-panel-bar">
        <button type="button" className="st-inline-close" onClick={onClose}>✕ Close</button>
      </div>
      {mode === 'view' ? (
        <StoryView story={story} lifeStages={lifeStages} onEdit={onEdit} />
      ) : (
        <StoryDetail story={story} lifeStages={lifeStages} onChange={onChange} onDelete={onDelete} onDone={onDone} />
      )}
    </div>
  );
}

/* ── Detail / edit slide-over ───────────────────────────────── */
function StoryDetail({ story, lifeStages, onChange, onDelete, onDone }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef(null);

  const set = (field) => (e) => {
    const val = e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e);
    onChange({ [field]: val });
  };

  const tags = Array.isArray(story.tags) ? story.tags : [];
  const photos = Array.isArray(story.photos) ? story.photos : [];
  const sharedIn = Array.isArray(story.sharedIn) ? story.sharedIn : [];
  const videoEmbed = useMemo(() => getVideoEmbed(story.videoUrl), [story.videoUrl]);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) { setTagDraft(''); return; }
    onChange({ tags: [...tags, t] });
    setTagDraft('');
  };
  const removeTag = (t) => onChange({ tags: tags.filter(x => x !== t) });

  const toggleChannel = (c) => {
    onChange({ sharedIn: sharedIn.includes(c) ? sharedIn.filter(x => x !== c) : [...sharedIn, c] });
  };

  const pickPhoto = () => fileInputRef.current?.click();

  const onPhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSize: 640, quality: 0.82 });
      onChange({ photos: [...photos, dataUrl].slice(0, MAX_PHOTOS) });
    } catch (err) {
      setPhotoError(err?.message || 'Could not add that photo.');
    }
  };

  const removePhoto = (idx) => onChange({ photos: photos.filter((_, i) => i !== idx) });

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="st-detail-icon">📷</span>
          <input
            type="text"
            className="ys-inp st-title-inp"
            value={story.title || ''}
            onChange={set('title')}
            placeholder="Story title"
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="app-btn ghost"
            style={{ padding: '7px 12px', fontSize: 12 }}
            onClick={onDone}
            title="Back to view"
          >
            ✓ Done
          </button>
          <button
            type="button"
            className={`ys-del-btn${confirmDel ? ' armed' : ''}`}
            onClick={() => {
              if (confirmDel) { onDelete(); return; }
              setConfirmDel(true);
              setTimeout(() => setConfirmDel(false), 3500);
            }}
          >
            {confirmDel ? 'Click again to delete' : '🗑 Delete'}
          </button>
        </div>
      </div>

      <Section title="Story">
        <Row>
          <Field label="Life stage">
            <select className="ys-inp" value={story.lifeStage || ''} onChange={set('lifeStage')}>
              <option value="">— Unspecified</option>
              {lifeStages.stages.map(stage => <option key={stage} value={stage}>{lifeStages.getStageMeta(stage)?.icon || ''} {stage}</option>)}
            </select>
          </Field>
          <Field label="Submitted by">
            <input type="text" className="ys-inp" value={story.submittedBy || ''} onChange={set('submittedBy')} placeholder="Name" />
          </Field>
        </Row>
        <Row>
          <Field label="Date submitted">
            <input type="date" className="ys-inp" value={story.submittedDate || ''} onChange={set('submittedDate')} />
          </Field>
          <Field label="Featured">
            <label className="st-check-field">
              <input type="checkbox" checked={!!story.featured} onChange={set('featured')} />
              <span>Pin to top / spotlight</span>
            </label>
          </Field>
        </Row>
        <Field label="Privacy">
          <label className="st-check-field">
            <input type="checkbox" checked={!!story.anonymous} onChange={set('anonymous')} />
            <span>Keep submitter anonymous when shared publicly (name stays visible here for staff/follow-up)</span>
          </label>
        </Field>
        <Field label="Theme tags">
          <div className="st-tag-editor">
            {tags.map(t => (
              <span key={t} className="st-tag-chip removable">
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Remove tag ${t}`}>✕</button>
              </span>
            ))}
            <input
              type="text"
              className="ys-inp st-tag-input"
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder="e.g. salvation, healing, recovery, grief, baptism…"
            />
          </div>
        </Field>
        <Field label="Pull-quote / summary">
          <textarea
            className="ys-inp ys-textarea"
            rows={2}
            value={story.summary || ''}
            onChange={set('summary')}
            placeholder="A short line to feature on the card and in the bulletin…"
          />
        </Field>
        <Field label="Full story">
          <textarea
            className="ys-inp ys-textarea"
            rows={8}
            value={story.storyText || ''}
            onChange={set('storyText')}
            placeholder="The full written testimony…"
          />
        </Field>
      </Section>

      <Section title="Photos & Video">
        <div className="st-photo-grid">
          {photos.map((src, idx) => (
            <div key={idx} className="st-photo-thumb">
              <img src={src} alt="" />
              <button type="button" className="st-photo-remove" onClick={() => removePhoto(idx)} aria-label="Remove photo">✕</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" className="st-photo-add" onClick={pickPhoto}>
              <span style={{ fontSize: 18 }}>＋</span>
              <span>Add photo</span>
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoChosen} />
        <div className="st-photo-hint">Up to {MAX_PHOTOS} photos.</div>
        {photoError && <div className="st-photo-hint" style={{ color: '#fca5a5' }}>{photoError}</div>}

        <Field label="Video link (YouTube or Vimeo)">
          <input
            type="url"
            className="ys-inp"
            value={story.videoUrl || ''}
            onChange={set('videoUrl')}
            placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…"
          />
        </Field>
        {story.videoUrl && (
          videoEmbed ? (
            <div className="st-video-embed">
              <iframe
                src={videoEmbed.src}
                title="Story video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <a className="st-video-link" href={story.videoUrl} target="_blank" rel="noopener noreferrer">
              ▶ Watch video
            </a>
          )
        )}
      </Section>

      <Section title="Permission & Sharing">
        <Row>
          <Field label="Status">
            <select className="ys-inp" value={story.status || 'submitted'} onChange={set('status')}>
              {STATUS_ORDER.map(id => <option key={id} value={id}>{STATUS_META[id].icon} {STATUS_META[id].label}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="Where it's been shared">
          <div className="st-channel-row">
            {CHANNELS.map(c => (
              <button
                key={c}
                type="button"
                className={`st-channel-chip ${sharedIn.includes(c) ? 'on' : ''}`}
                onClick={() => toggleChannel(c)}
              >{c}</button>
            ))}
          </div>
        </Field>
      </Section>
    </form>
  );
}

/* ── Read-only detail view (opened on card click) ──────────── */
function StoryView({ story, lifeStages, onEdit }) {
  const status = STATUS_META[story.status || 'submitted'] || STATUS_META.submitted;
  const stageMeta = story.lifeStage ? lifeStages.getStageMeta(story.lifeStage) : null;
  const tags = Array.isArray(story.tags) ? story.tags : [];
  const photos = Array.isArray(story.photos) ? story.photos : [];
  const sharedIn = Array.isArray(story.sharedIn) ? story.sharedIn : [];
  const videoEmbed = useMemo(() => getVideoEmbed(story.videoUrl), [story.videoUrl]);

  return (
    <div className="ys-form">
      <div className="ys-form-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span className="st-detail-icon">📷</span>
          <div>
            <h2 className="ys-form-title">{story.title || '(untitled story)'}</h2>
            <div className="st-view-sub">
              {stageMeta ? `${stageMeta.icon || '🌸'} ${story.lifeStage}` : '— Unspecified stage'}
              {' · '}
              <span className={`st-badge status-${story.status || 'submitted'}`}>{status.icon} {status.label}</span>
              {story.featured && <span className="st-badge is-featured">⭐ Featured</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="app-btn primary"
          style={{ padding: '7px 14px', fontSize: 12 }}
          onClick={onEdit}
        >
          ✎ Edit
        </button>
      </div>

      <Section title="Story">
        <ViewRow label="Submitted by" value={story.submittedBy} />
        <ViewRow label="Date submitted" value={story.submittedDate} />
        {story.anonymous && <ViewRow label="Privacy" value="🔒 Kept anonymous when shared publicly" />}
        {tags.length > 0 && (
          <div className="st-tag-row" style={{ marginTop: 8 }}>
            {tags.map(t => <span key={t} className="st-tag-chip">{t}</span>)}
          </div>
        )}
        {story.summary && <div className="st-view-quote">"{story.summary}"</div>}
        {story.storyText && <div className="st-view-body">{story.storyText}</div>}
      </Section>

      {(photos.length > 0 || story.videoUrl) && (
        <Section title="Photos & Video">
          {photos.length > 0 && (
            <div className="st-photo-grid">
              {photos.map((src, idx) => (
                <div key={idx} className="st-photo-thumb">
                  <img src={src} alt="" />
                </div>
              ))}
            </div>
          )}
          {story.videoUrl && (
            videoEmbed ? (
              <div className="st-video-embed">
                <iframe
                  src={videoEmbed.src}
                  title="Story video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <a className="st-video-link" href={story.videoUrl} target="_blank" rel="noopener noreferrer">
                ▶ Watch video
              </a>
            )
          )}
        </Section>
      )}

      {(story.status || sharedIn.length > 0) && (
        <Section title="Permission & Sharing">
          <ViewRow label="Status" value={`${status.icon} ${status.label}`} />
          {sharedIn.length > 0 && (
            <div className="st-channel-row" style={{ marginTop: 8 }}>
              {sharedIn.map(c => <span key={c} className="st-channel-chip on">{c}</span>)}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="wa-view-row">
      <span className="wa-view-lbl">{label}</span>
      <span className="wa-view-val">{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="ys-section">
      <h3 className="ys-section-title">{title}</h3>
      <div className="ys-section-body">{children}</div>
    </section>
  );
}
function Row({ children }) {
  return <div className="ys-row-fields">{children}</div>;
}
function Field({ label, children }) {
  return (
    <label className="ys-field">
      <span className="ys-field-lbl">{label}</span>
      {children}
    </label>
  );
}
