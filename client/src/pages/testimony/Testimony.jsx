import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import { useUserStoreKey } from '../../lib/userStore';
import TestimonyGuide from './TestimonyGuide';
import './Testimony.css';

const WELCOME_TEXT = "Remember that our relationship with God is not based on works. These practices are meant to guide and strengthen us, but ultimately, the Holy Spirit will give us the words to speak. Pray for knowledge, wisdom, and discernment, and let God be your first priority. This is simply a tool to help along the way, but always seek God first.";
const WELCOME_VERSE_REF  = 'James 1:5';
const WELCOME_VERSE_TEXT = 'If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.';

/* ─────────────────────────────────────────────────────────────
   Testimony — structured workspace for a believer's salvation
   story, practice / rehearsal, and gospel sharing methods.

   Tabs:
     • My Story      Before / Encounter / After + key verse,
                     plus an elevator (30s) and a short (2m)
                     condensed version.
     • Practice      Pick a version, run a target-time timer,
                     save the attempt with notes.
     • 3 Circles     Walk through the 3-Circles evangelism
                     method, capturing your own phrasing for
                     each section.
     • More Methods  Bridge to Life + Romans Road reference,
                     to round out your evangelism toolkit.

   Storage: single Firestore doc /users/{uid}/kv/testimony:hub
   ───────────────────────────────────────────────────────────── */

const ACCENT = '#f59e0b';

const DEFAULT_DATA = {
  story: {
    before:   '',
    encounter: '',
    after:    '',
    keyVerse: '',
    elevator: '',
    short:    '',
  },
  circles: {
    design:       '',
    brokenness:   '',
    gospel:       '',
    response:     '',
    pursue:       '',
  },
  practice: [],
};

const TABS = [
  { key: 'story',    label: 'My Story',     icon: '📖', hint: 'Your salvation testimony — Before / Encounter / After.' },
  { key: 'practice', label: 'Practice',     icon: '⏱',  hint: 'Run a target-time timer and save attempts with notes.' },
  { key: 'circles',  label: '3 Circles',    icon: '⭕', hint: 'Walk the 3-Circles gospel diagram in your own words.' },
  { key: 'methods',  label: 'More Methods', icon: '🌉', hint: 'Bridge to Life, Romans Road, and other gospel tools.' },
];

const STORY_FIELDS = [
  {
    key: 'before',
    label: 'Before Christ',
    emoji: '🌑',
    prompt: 'What was your life like before you knew Jesus? What were you searching for? What did you trust in?',
  },
  {
    key: 'encounter',
    label: 'How I Met Jesus',
    emoji: '✨',
    prompt: 'How did you come to know Christ? Who shared the gospel? What moment(s) drew you to repentance and faith?',
  },
  {
    key: 'after',
    label: 'Life with Christ',
    emoji: '🌅',
    prompt: 'What has changed since? How is God still shaping you? What hope do you have today?',
  },
];

const PRACTICE_VERSIONS = [
  { key: 'elevator', label: 'Elevator (30s)',  targetSec: 30,  storyKey: 'elevator', emoji: '⚡' },
  { key: 'short',    label: 'Short (2 min)',   targetSec: 120, storyKey: 'short',    emoji: '☕' },
  { key: 'full',     label: 'Full Story',      targetSec: 300, storyKey: null,       emoji: '📖' },
];

const CIRCLE_STEPS = [
  {
    key: 'design',
    label: "God's Design",
    emoji: '🟢',
    color: '#34d399',
    summary: 'God designed life to flourish in relationship with Him — perfect peace, purpose, and joy.',
    verse: '"In the beginning God created the heavens and the earth." — Genesis 1:1',
    prompt: 'How would you describe God’s good design in your own words?',
  },
  {
    key: 'brokenness',
    label: 'Brokenness',
    emoji: '🔴',
    color: '#fb7185',
    summary: 'We rejected God’s design — and the result is brokenness in us, in others, and in the world.',
    verse: '"For all have sinned and fall short of the glory of God." — Romans 3:23',
    prompt: 'Where do you see brokenness in your own life and in the world?',
  },
  {
    key: 'gospel',
    label: 'Gospel',
    emoji: '✝️',
    color: '#a78bfa',
    summary: 'Jesus lived the life we couldn’t, died the death we deserved, and rose to give us new life.',
    verse: '"For Christ also suffered once for sins, the righteous for the unrighteous, to bring you to God." — 1 Peter 3:18',
    prompt: 'How would you explain the gospel in two or three sentences?',
  },
  {
    key: 'response',
    label: 'Repent & Believe',
    emoji: '🙌',
    color: '#fbbf24',
    summary: 'Turn from sin (repent) and trust Jesus (believe) — this is how we receive the gift.',
    verse: '"Repent and believe the good news!" — Mark 1:15',
    prompt: 'How do you invite someone to respond — to repent and believe?',
  },
  {
    key: 'pursue',
    label: 'Recover & Pursue',
    emoji: '🌱',
    color: '#60a5fa',
    summary: 'We are restored to God’s design and now pursue Him — walking with Jesus, growing daily.',
    verse: '"If anyone is in Christ, he is a new creation." — 2 Corinthians 5:17',
    prompt: 'What does daily pursuit of Jesus look like in your life right now?',
  },
];

const METHOD_REFERENCE = [
  {
    key: 'bridge',
    label: 'Bridge to Life',
    emoji: '🌉',
    intro: 'A simple drawing of a chasm bridged by the cross.',
    steps: [
      { title: 'God Loves You',     body: 'God created and loves you — He wants a relationship with you.', verse: 'John 3:16' },
      { title: 'Our Problem: Sin',   body: 'Our sin separates us from God — a chasm we can’t cross on our own.', verse: 'Romans 6:23a' },
      { title: 'God’s Solution',     body: 'Jesus died on the cross and rose again — the bridge between us and God.', verse: 'Romans 5:8' },
      { title: 'Our Response',       body: 'Turn from sin, trust Jesus, receive eternal life and walk with Him.', verse: 'Romans 10:9' },
    ],
  },
  {
    key: 'romans',
    label: 'Romans Road',
    emoji: '🛣',
    intro: 'A path of verses straight from the book of Romans.',
    steps: [
      { title: 'All have sinned',                body: 'Sin is universal — no one is righteous on their own.', verse: 'Romans 3:23' },
      { title: 'The wages of sin is death',      body: 'Sin earns death; eternal life is God’s gift in Christ.', verse: 'Romans 6:23' },
      { title: 'God demonstrates His love',      body: 'Christ died for us while we were still sinners.', verse: 'Romans 5:8' },
      { title: 'Confess and believe',            body: 'Confess Jesus as Lord and believe God raised Him — you will be saved.', verse: 'Romans 10:9–10' },
      { title: 'Peace with God',                 body: 'Being justified by faith, we have peace with God through Jesus.', verse: 'Romans 5:1' },
    ],
  },
];

const formatClock = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/* ─────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────── */
export default function Testimony() {
  const [data, setData] = useUserStoreKey('testimony:hub', DEFAULT_DATA);
  const [activeTab, setActiveTab] = useState('story');
  const [showWelcome, setShowWelcome] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const { avatarSourceName, initials } = useProfileTopbar();

  useEffect(() => {
    if (!showWelcome) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowWelcome(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showWelcome]);

  /* Normalize stored shape — older docs may be missing nested keys. */
  const safe = useMemo(() => ({
    story:    { ...DEFAULT_DATA.story,    ...(data?.story    || {}) },
    circles:  { ...DEFAULT_DATA.circles,  ...(data?.circles  || {}) },
    practice: Array.isArray(data?.practice) ? data.practice : [],
  }), [data]);

  const updateStory   = (key, value) => setData({ ...safe, story:   { ...safe.story,   [key]: value } });
  const updateCircles = (key, value) => setData({ ...safe, circles: { ...safe.circles, [key]: value } });
  const addPractice   = (entry)      => setData({ ...safe, practice: [entry, ...safe.practice] });
  const deletePractice = (id)        => setData({ ...safe, practice: safe.practice.filter(p => p.id !== id) });

  const storyProgress = useMemo(() => {
    const filled = STORY_FIELDS.filter(f => (safe.story[f.key] || '').trim().length > 0).length;
    return Math.round((filled / STORY_FIELDS.length) * 100);
  }, [safe.story]);

  return (
    <div className="ts-root" style={{ '--ts-accent': ACCENT }}>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}

      <PageTourHost pageId="testimony" />

      {/* TOPBAR */}
      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag ts-tag">Testimony</span>
        </div>
        <div className="app-tb-actions">
          <button
            className="pm-tb-avatar"
            data-tour="tour-settings"
            onClick={() => setShowProfile(true)}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >{initials}</button>
        </div>
      </div>

      {/* BODY */}
      <div className="ts-body">
        <NavRail />

        <main className="ts-main">
          <div className="ts-shell">
            <header className="ts-header">
              <div className="ts-title-row">
                <span className="ts-title-icon" aria-hidden="true">🙌</span>
                <h1 className="ts-title">Testimony</h1>
              </div>
              <p className="ts-description">
                Shape the story of what God has done — rehearse it, sharpen it,
                and be ready to share it. "Always be prepared to give an answer
                to everyone who asks you to give the reason for the hope that
                you have." — 1 Peter 3:15
              </p>
            </header>

            <nav className="ts-tabs" role="tablist">
              {TABS.map(t => (
                <button
                  key={t.key}
                  role="tab"
                  className={`ts-tab ${activeTab === t.key ? 'on' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                  title={t.hint}
                >
                  <span className="ts-tab-icon">{t.icon}</span>
                  <span className="ts-tab-label">{t.label}</span>
                </button>
              ))}
            </nav>

            <div className="ts-tab-hint">
              {TABS.find(t => t.key === activeTab)?.hint}
            </div>

            <div className="ts-tab-body">
              {activeTab === 'story' && (
                <StoryTab
                  story={safe.story}
                  progress={storyProgress}
                  onChange={updateStory}
                />
              )}
              {activeTab === 'practice' && (
                <PracticeTab
                  story={safe.story}
                  practice={safe.practice}
                  onSaveAttempt={addPractice}
                  onDeleteAttempt={deletePractice}
                />
              )}
              {activeTab === 'circles' && (
                <CirclesTab
                  circles={safe.circles}
                  onChange={updateCircles}
                />
              )}
              {activeTab === 'methods' && <MethodsTab />}
            </div>
          </div>
        </main>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<TestimonyPageSettings />}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Testimony Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab. Testimony doesn't have bespoke
   settings yet, so General is a placeholder — but it follows the
   same sub-tab pill pattern as Friends/Prayers/Calendar so the
   How-To guide has a real home instead of a standalone tab. */
function TestimonyPageSettings() {
  const [activeSub, setActiveSub] = useState('general');
  const SUB_TABS = [
    { id: 'general', label: '⚙', name: 'General' },
    { id: 'howto',   label: '❓', name: 'How to Use' },
  ];

  return (
    <div className="ts-ps-root">
      <div className="pm-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id} type="button"
            className={`pm-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="pm-ps-subtab-icon">{t.label}</span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {activeSub === 'general' && (
        <div className="pm-body" style={{ alignItems:'center', textAlign:'center', padding:'28px 22px' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>⚙</div>
          <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,.85)', marginBottom:4 }}>
            No Testimony-specific settings here yet.
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', maxWidth:340, lineHeight:1.55 }}>
            Your story, practice history, and 3 Circles phrasing live on the page tabs above — this
            panel is reserved for future preferences.
          </div>
        </div>
      )}

      {activeSub === 'howto' && <TestimonyGuide />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab — My Story
   ───────────────────────────────────────────────────────────── */
function StoryTab({ story, progress, onChange }) {
  return (
    <div className="ts-story">
      <div className="ts-progress-card">
        <div className="ts-progress-top">
          <span className="ts-progress-label">Your story</span>
          <span className="ts-progress-pct">{progress}% drafted</span>
        </div>
        <div className="ts-progress-track">
          <div className="ts-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="ts-progress-hint">
          Three sections form the backbone: who you were, how Jesus met you,
          and who you’re becoming. Fill each in your own voice — short,
          honest, specific.
        </p>
      </div>

      <div className="ts-story-grid">
        {STORY_FIELDS.map(field => {
          const value = story[field.key] || '';
          const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
          return (
            <section key={field.key} className="ts-story-card">
              <header className="ts-story-card-hd">
                <span className="ts-story-emoji">{field.emoji}</span>
                <div>
                  <h3 className="ts-story-card-title">{field.label}</h3>
                  <div className="ts-story-card-prompt">{field.prompt}</div>
                </div>
              </header>
              <LockedTextarea
                className="ts-textarea"
                rows={6}
                placeholder="Write in your own words…"
                value={value}
                onChange={e => onChange(field.key, e.target.value)}
              />
              <div className="ts-story-card-ft">
                <span>{wordCount} words</span>
              </div>
            </section>
          );
        })}
      </div>

      <section className="ts-story-card ts-story-verse">
        <header className="ts-story-card-hd">
          <span className="ts-story-emoji">📜</span>
          <div>
            <h3 className="ts-story-card-title">Key Verse</h3>
            <div className="ts-story-card-prompt">
              A scripture that anchors your testimony. Use it as a bridge or a closing line.
            </div>
          </div>
        </header>
        <LockedInput
          className="ts-input"
          placeholder='e.g. "He has rescued us from the dominion of darkness…" — Colossians 1:13'
          value={story.keyVerse || ''}
          onChange={e => onChange('keyVerse', e.target.value)}
        />
      </section>

      <div className="ts-versions">
        <h2 className="ts-section-title">Condensed Versions</h2>
        <p className="ts-section-sub">
          Boil your story down. Most people will hear the short version first —
          it should make them want to hear the full one.
        </p>

        <section className="ts-story-card">
          <header className="ts-story-card-hd">
            <span className="ts-story-emoji">⚡</span>
            <div>
              <h3 className="ts-story-card-title">Elevator — 30 seconds</h3>
              <div className="ts-story-card-prompt">
                One sentence each: where you were, what changed, where you are now.
              </div>
            </div>
          </header>
          <LockedTextarea
            className="ts-textarea"
            rows={4}
            placeholder="Three sentences. Just three."
            value={story.elevator || ''}
            onChange={e => onChange('elevator', e.target.value)}
          />
        </section>

        <section className="ts-story-card">
          <header className="ts-story-card-hd">
            <span className="ts-story-emoji">☕</span>
            <div>
              <h3 className="ts-story-card-title">Short — 2 minutes</h3>
              <div className="ts-story-card-prompt">
                Coffee-shop length. Enough to share the gospel through your story.
              </div>
            </div>
          </header>
          <LockedTextarea
            className="ts-textarea"
            rows={8}
            placeholder="A tight, two-minute version of your story…"
            value={story.short || ''}
            onChange={e => onChange('short', e.target.value)}
          />
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab — Practice
   ───────────────────────────────────────────────────────────── */
function PracticeTab({ story, practice, onSaveAttempt, onDeleteAttempt }) {
  const [versionKey, setVersionKey] = useState('elevator');
  const [running, setRunning]       = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [notes, setNotes]           = useState('');
  const startRef = useRef(null);
  const intRef   = useRef(null);

  const version = PRACTICE_VERSIONS.find(v => v.key === versionKey) || PRACTICE_VERSIONS[0];
  const target  = version.targetSec;
  const script  = version.storyKey ? story[version.storyKey] : null;

  useEffect(() => {
    if (!running) return;
    intRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(intRef.current);
  }, [running]);

  const start = () => {
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
  };
  const stop = () => setRunning(false);
  const reset = () => { setRunning(false); setElapsed(0); };

  const saveAttempt = () => {
    if (elapsed === 0) return;
    onSaveAttempt({
      id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      dateISO: new Date().toISOString(),
      version: version.label,
      versionKey: version.key,
      targetSec: target,
      durationSec: elapsed,
      notes: notes.trim(),
    });
    setNotes('');
    setElapsed(0);
    setRunning(false);
  };

  const pct = Math.min(100, Math.round((elapsed / target) * 100));
  const tone = elapsed > target ? 'over' : pct >= 85 ? 'close' : 'on';

  const avgPerVersion = useMemo(() => {
    const buckets = {};
    for (const v of PRACTICE_VERSIONS) buckets[v.key] = { count: 0, total: 0 };
    for (const p of practice) {
      const b = buckets[p.versionKey];
      if (b) { b.count += 1; b.total += p.durationSec; }
    }
    return buckets;
  }, [practice]);

  return (
    <div className="ts-practice">
      <section className="ts-practice-card">
        <header className="ts-practice-hd">
          <div>
            <h3 className="ts-section-title">Pick your version</h3>
            <p className="ts-section-sub">Match your delivery to the moment.</p>
          </div>
        </header>
        <div className="ts-version-row">
          {PRACTICE_VERSIONS.map(v => {
            const avg = avgPerVersion[v.key];
            const avgSec = avg.count ? Math.round(avg.total / avg.count) : 0;
            return (
              <button
                key={v.key}
                className={`ts-version-opt ${versionKey === v.key ? 'on' : ''}`}
                onClick={() => { setVersionKey(v.key); reset(); }}
              >
                <span className="ts-version-emoji">{v.emoji}</span>
                <span className="ts-version-label">{v.label}</span>
                <span className="ts-version-meta">
                  target {formatClock(v.targetSec)}
                  {avg.count > 0 && <> · avg {formatClock(avgSec)}</>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ts-timer-card">
        <div className="ts-timer-display">
          <div className={`ts-timer-clock ts-tone-${tone}`}>
            {formatClock(elapsed)}
          </div>
          <div className="ts-timer-target">
            target {formatClock(target)}
          </div>
        </div>
        <div className="ts-timer-track">
          <div
            className={`ts-timer-fill ts-tone-${tone}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="ts-timer-actions">
          {!running ? (
            <button className="app-btn primary" onClick={start}>
              {elapsed === 0 ? '▶ Start' : '▶ Resume'}
            </button>
          ) : (
            <button className="app-btn primary" onClick={stop}>⏸ Pause</button>
          )}
          <button className="app-btn ghost" onClick={reset} disabled={elapsed === 0 && !running}>
            ↺ Reset
          </button>
          <button className="app-btn ghost" onClick={saveAttempt} disabled={elapsed === 0}>
            💾 Save attempt
          </button>
        </div>

        {script !== null && (
          <details className="ts-script">
            <summary>📜 Show your {version.label.toLowerCase()} script</summary>
            <div className="ts-script-body">
              {script?.trim()
                ? script
                : <span className="ts-muted">You haven’t written this version yet. Head to <b>My Story</b> to draft it.</span>}
            </div>
          </details>
        )}

        <div className="ts-notes-row">
          <LockedInput
            className="ts-input"
            placeholder="Notes for this attempt — what flowed, what felt clunky?"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </section>

      <section className="ts-history">
        <h3 className="ts-section-title">History</h3>
        {practice.length === 0 ? (
          <div className="ts-empty">
            <div className="ts-empty-icon">⏱</div>
            <div className="ts-empty-title">No practice sessions yet</div>
            <div className="ts-empty-sub">Run a timer above and save the attempt to start a history.</div>
          </div>
        ) : (
          <div className="ts-history-list">
            {practice.map(p => {
              const delta = p.durationSec - p.targetSec;
              const sign = delta > 0 ? '+' : '';
              const t = delta > 5 ? 'over' : delta < -5 ? 'under' : 'on';
              return (
                <article key={p.id} className="ts-history-row">
                  <div className="ts-history-time">
                    <div className="ts-history-clock">{formatClock(p.durationSec)}</div>
                    <div className={`ts-history-delta ts-delta-${t}`}>
                      {sign}{delta}s vs target
                    </div>
                  </div>
                  <div className="ts-history-info">
                    <div className="ts-history-version">{p.version}</div>
                    <div className="ts-history-date">
                      {format(parseISO(p.dateISO), 'MMM d, yyyy · h:mm a')}
                    </div>
                    {p.notes && <div className="ts-history-notes">"{p.notes}"</div>}
                  </div>
                  <button
                    className="app-btn ghost icon-only"
                    title="Delete attempt"
                    onClick={() => onDeleteAttempt(p.id)}
                  >🗑</button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab — 3 Circles
   ───────────────────────────────────────────────────────────── */
function CirclesTab({ circles, onChange }) {
  const [activeKey, setActiveKey] = useState('design');
  const step = CIRCLE_STEPS.find(s => s.key === activeKey) || CIRCLE_STEPS[0];

  return (
    <div className="ts-circles">
      <div className="ts-circles-intro">
        <h2 className="ts-section-title">The 3 Circles</h2>
        <p className="ts-section-sub">
          A simple, drawable diagram for sharing the gospel. Walk through each
          piece and capture your own phrasing — so when the moment comes, the
          words are already yours.
        </p>
      </div>

      <Whiteboard />

      <div className="ts-circles-diagram">
        {CIRCLE_STEPS.map((s) => (
          <button
            key={s.key}
            className={`ts-circle-node ${activeKey === s.key ? 'on' : ''}`}
            style={{
              '--node-color': s.color,
              borderColor: activeKey === s.key ? s.color : undefined,
            }}
            onClick={() => setActiveKey(s.key)}
          >
            <span className="ts-circle-node-emoji">{s.emoji}</span>
            <span className="ts-circle-node-label">{s.label}</span>
            {(circles[s.key] || '').trim() && <span className="ts-circle-node-dot" />}
          </button>
        ))}
      </div>

      <section className="ts-circle-detail" style={{ '--node-color': step.color }}>
        <header className="ts-circle-detail-hd">
          <span className="ts-circle-detail-emoji">{step.emoji}</span>
          <div>
            <h3 className="ts-circle-detail-title">{step.label}</h3>
            <div className="ts-circle-detail-summary">{step.summary}</div>
          </div>
        </header>
        <div className="ts-circle-verse">{step.verse}</div>
        <div className="ts-circle-prompt">{step.prompt}</div>
        <LockedTextarea
          className="ts-textarea"
          rows={5}
          placeholder="Write how you’d explain this step…"
          value={circles[step.key] || ''}
          onChange={e => onChange(step.key, e.target.value)}
        />

        <div className="ts-circle-nav">
          {(() => {
            const idx = CIRCLE_STEPS.findIndex(c => c.key === step.key);
            const prev = CIRCLE_STEPS[idx - 1];
            const next = CIRCLE_STEPS[idx + 1];
            return (
              <>
                <button
                  className="app-btn ghost"
                  onClick={() => prev && setActiveKey(prev.key)}
                  disabled={!prev}
                >← {prev ? prev.label : 'Previous'}</button>
                <span className="ts-circle-pos">{idx + 1} of {CIRCLE_STEPS.length}</span>
                <button
                  className="app-btn ghost"
                  onClick={() => next && setActiveKey(next.key)}
                  disabled={!next}
                >{next ? next.label : 'Finish'} →</button>
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tab — More Methods (Bridge to Life + Romans Road)
   ───────────────────────────────────────────────────────────── */
function MethodsTab() {
  return (
    <div className="ts-methods">
      <p className="ts-section-sub">
        Two classic gospel diagrams worth knowing by heart. Keep them in your
        back pocket alongside the 3 Circles — different people connect with
        different pictures.
      </p>

      {METHOD_REFERENCE.map(method => (
        <section key={method.key} className="ts-method-card">
          <header className="ts-method-hd">
            <span className="ts-method-emoji">{method.emoji}</span>
            <div>
              <h3 className="ts-method-title">{method.label}</h3>
              <div className="ts-method-intro">{method.intro}</div>
            </div>
          </header>
          <ol className="ts-method-steps">
            {method.steps.map((s, i) => (
              <li key={i} className="ts-method-step">
                <span className="ts-method-num">{i + 1}</span>
                <div className="ts-method-step-body">
                  <div className="ts-method-step-title">{s.title}</div>
                  <div className="ts-method-step-text">{s.body}</div>
                  <div className="ts-method-step-verse">📖 {s.verse}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Welcome modal — shown on every visit to /testimony.
   Anchors the user before they start "practicing" their faith.
   ───────────────────────────────────────────────────────────── */
function WelcomeModal({ onClose }) {
  return (
    <div
      className="ts-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-modal-title"
      onClick={onClose}
    >
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-modal-emoji" aria-hidden="true">🕊️</div>
        <h2 className="ts-modal-title" id="ts-modal-title">Before you begin</h2>
        <p className="ts-modal-body">{WELCOME_TEXT}</p>
        <div className="ts-modal-verse">
          <div className="ts-modal-verse-ref">{WELCOME_VERSE_REF}</div>
          <div className="ts-modal-verse-text">"{WELCOME_VERSE_TEXT}"</div>
        </div>
        <div className="ts-modal-actions">
          <button className="app-btn primary" onClick={onClose} autoFocus>
            Amen — continue
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Whiteboard — a light-paper canvas for practicing the
   3 Circles diagram. Supports mouse + touch via Pointer events.
   ───────────────────────────────────────────────────────────── */
function Whiteboard() {
  const canvasRef = useRef(null);
  const wrapRef   = useRef(null);
  const drawingRef = useRef(false);

  /* Size the canvas to its container (with DPR scaling) and re-prime
     the 2D context every time the parent resizes. */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(200, Math.floor(rect.width));
    const h = 360;
    canvas.width  = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1f2937';
  }, []);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    /* Dot for a single tap. */
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.stroke();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e) => {
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture?.(e.pointerId);
  };

  const erase = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    /* clearRect uses untransformed pixel space — reset, clear, re-prime. */
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  return (
    <section className="ts-whiteboard">
      <header className="ts-whiteboard-hd">
        <div>
          <h3 className="ts-section-title">Practice drawing</h3>
          <p className="ts-section-sub">
            Sketch the diagram in your own hand — three circles, the cross
            between them, arrows for the journey. Muscle memory makes it
            easier to share on a napkin or whiteboard.
          </p>
        </div>
        <button className="app-btn ghost" onClick={erase} title="Erase the board">
          🧹 Erase
        </button>
      </header>
      <div ref={wrapRef} className="ts-whiteboard-wrap">
        <canvas
          ref={canvasRef}
          className="ts-whiteboard-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div className="ts-whiteboard-hint" aria-hidden="true">
          Draw here · 🟢 Design — 🔴 Brokenness — 🔵 Recover & Pursue · ✝️ in the middle
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Locked-by-default text inputs.

   Why: every editable field on this page is meant to be reflected
   on, not dashed off — accidental clicks during prayer or practice
   shouldn't disturb what's there. A field stays read-only until
   the user double-clicks (or double-taps) to unlock it, then
   re-locks on blur.
   ───────────────────────────────────────────────────────────── */
function LockedTextarea({ className = '', onBlur, onDoubleClick, ...rest }) {
  const [editing, setEditing] = useState(false);
  return (
    <textarea
      {...rest}
      className={`${className} ts-locked-field ${editing ? 'is-editing' : 'is-locked'}`}
      readOnly={!editing}
      title={editing ? '' : 'Double-click to edit'}
      onDoubleClick={(e) => { setEditing(true); onDoubleClick?.(e); }}
      onBlur={(e) => { setEditing(false); onBlur?.(e); }}
    />
  );
}

function LockedInput({ className = '', onBlur, onDoubleClick, ...rest }) {
  const [editing, setEditing] = useState(false);
  return (
    <input
      {...rest}
      className={`${className} ts-locked-field ${editing ? 'is-editing' : 'is-locked'}`}
      readOnly={!editing}
      title={editing ? '' : 'Double-click to edit'}
      onDoubleClick={(e) => { setEditing(true); onDoubleClick?.(e); }}
      onBlur={(e) => { setEditing(false); onBlur?.(e); }}
    />
  );
}
