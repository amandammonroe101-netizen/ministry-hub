/* FirstRunWizard — the post-signup setup flow.

   Shown once, right after a brand-new account is created (see
   pages/auth/Register.jsx), BEFORE the user lands in the app. It lets
   them tailor their Ministry Hub from the very first launch:

     1. Intro
     2. Personal pages  → which standalone pages show in the sidebar
     3. Ministries      → which ministry groups show in the sidebar
     4. Prayers         → seeds their Prayer wall with a first request
                          (and optional praise)
     5. Friends         → seeds the Friends page with a first person
     6. Finish          → writes everything, then enters the hub

   All choices persist to the same per-user Firestore stores the rest
   of the app reads, so the result is a genuinely customized UI — not a
   throwaway questionnaire. Seeding is best-effort: if a write fails the
   account still works and the user just enters with empty pages. */

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  NAV_VISIBILITY_STORAGE_KEY,
  NAV_STANDALONE_CATEGORIES,
  NAV_MINISTRY_CATEGORIES,
} from '../../pages/settings/navVisibilityConfig';
import { BRIEFING_PAGES_KEY } from '../../lib/dailyBriefing';
import { setValue } from '../../lib/userStore';
import { db } from '../../lib/firebase';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { prayerService } from '../../services/prayerService';
import { friendsService } from '../../services/friendsService';
import './FirstRunWizard.css';

/* Maps a standalone-page id to its Daily Summary page id so a page the
   user turns off here is also dropped from the daily summary. */
const STANDALONE_TO_SUMMARY = {
  journal:        'journal',
  prayers:        'prayers',
  friends:        'friends',
  'day-planner':  'dayPlanner',
};

const FREQUENCIES = [
  { value: 'daily',    label: 'Every day'    },
  { value: 'weekly',   label: 'Weekly'       },
  { value: 'biweekly', label: 'Every 2 weeks'},
  { value: 'monthly',  label: 'Monthly'      },
];

const truncate = (s, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export default function FirstRunWizard({ uid, displayName, onDone }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  /* Personal pages start ALL on; ministries start ALL off so the user
     opts in only to the ones they actually serve in. */
  const [personal, setPersonal] = useState(
    () => Object.fromEntries(NAV_STANDALONE_CATEGORIES.map(c => [c.id, true]))
  );
  const [ministries, setMinistries] = useState(
    () => Object.fromEntries(NAV_MINISTRY_CATEGORIES.map(c => [c.id, false]))
  );

  /* Ministry identity — both optional. If provided they're written to
     the user's profile and surface in the app header. */
  const [ministryName, setMinistryName] = useState('');
  const [logo, setLogo]                 = useState(''); // resized data URL
  const [logoErr, setLogoErr]           = useState('');

  /* Prayer seed */
  const [prayerText, setPrayerText]   = useState('');
  const [prayerDaily, setPrayerDaily] = useState(false);
  const [praiseText, setPraiseText]   = useState('');

  /* Friend seed */
  const [friendName, setFriendName] = useState('');
  const [friendFreq, setFriendFreq] = useState('weekly');
  const [friendNote, setFriendNote] = useState('');

  const togglePersonal  = (id) => setPersonal(p => ({ ...p, [id]: !p[id] }));
  const toggleMinistry  = (id) => setMinistries(m => ({ ...m, [id]: !m[id] }));

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a remove
    if (!file) return;
    setLogoErr('');
    try {
      const url = await fileToResizedDataUrl(file, { maxSize: 256 });
      setLogo(url);
    } catch (ex) {
      setLogoErr(ex?.message || 'Could not use that image.');
    }
  };

  const personalOn  = NAV_STANDALONE_CATEGORIES.filter(c => personal[c.id]).length;
  const ministryOn  = NAV_MINISTRY_CATEGORIES.filter(c => ministries[c.id]).length;

  const firstName = (displayName || '').trim().split(/\s+/)[0] || 'there';

  const STEPS = ['Welcome', 'Ministry', 'Pages', 'Ministries', 'Prayer', 'Friends', 'Done'];
  const lastStep = STEPS.length - 1;

  const next = () => setStep(s => Math.min(lastStep, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  /* Persist everything, then hand control back to Register. */
  const finish = async () => {
    if (saving) return;
    setSaving(true);

    // Sidebar visibility — write an explicit boolean for every category.
    const visibility = {};
    NAV_STANDALONE_CATEGORIES.forEach(c => { visibility[c.id] = !!personal[c.id]; });
    NAV_MINISTRY_CATEGORIES.forEach(c => { visibility[c.id] = !!ministries[c.id]; });

    // Daily summary — drop any personal page the user turned off.
    const briefing = {};
    Object.entries(STANDALONE_TO_SUMMARY).forEach(([sid, summaryId]) => {
      briefing[summaryId] = personal[sid] !== false;
    });

    try {
      await setValue(uid, NAV_VISIBILITY_STORAGE_KEY, visibility);
      await setValue(uid, BRIEFING_PAGES_KEY, briefing);

      /* Ministry identity → profile doc. Only write the fields the user
         actually filled in, so an empty answer never clobbers anything.
         merge:true creates the doc if ensureUserProfile hasn't run yet;
         it later heals the missing identifyingKey on next sign-in. */
      const profilePatch = {};
      if (ministryName.trim()) profilePatch.ministryName = ministryName.trim();
      if (logo)                profilePatch.logo = logo;
      if (Object.keys(profilePatch).length && db) {
        await setDoc(doc(db, 'users', uid), profilePatch, { merge: true });
      }

      const prayer = prayerText.trim();
      if (prayer) {
        await prayerService.create({
          title:      truncate(prayer),
          content:    prayer,
          entry_type: 'request',
          status:     'praying',
          is_daily:   prayerDaily,
        });
      }

      const praise = praiseText.trim();
      if (praise) {
        await prayerService.create({
          title:      truncate(praise),
          content:    praise,
          entry_type: 'praise',
          status:     'praying',
        });
      }

      const fname = friendName.trim();
      if (fname) {
        await friendsService.addFriend({
          name:                    fname,
          communication_frequency: friendFreq,
          how_met:                 friendNote.trim(),
          last_contacted:          new Date().toISOString().slice(0, 10),
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[onboarding] setup save failed:', e?.message || e);
    } finally {
      setSaving(false);
      const landing = NAV_STANDALONE_CATEGORIES.find(c => personal[c.id])?.path || '/journal';
      onDone?.(landing);
    }
  };

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Set up your Ministry Hub">
      <div className="ob-card">
        {/* Progress dots */}
        <div className="ob-progress" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span key={label} className={`ob-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <Section
            eyebrow="Welcome"
            title={`Hi ${firstName}, let's set up your hub`}
            sub="A few quick questions so your Ministry Hub fits how you serve. You can change any of this later in Settings."
          >
            <ul className="ob-intro-list">
              <li><span className="ob-intro-icon">⛪</span> Name your ministry &amp; add a logo</li>
              <li><span className="ob-intro-icon">🧭</span> Choose the pages &amp; ministries you’ll use</li>
              <li><span className="ob-intro-icon">🙏</span> Start your Prayer wall</li>
              <li><span className="ob-intro-icon">🤝</span> Add your first friend to stay connected with</li>
            </ul>
          </Section>
        )}

        {step === 1 && (
          <Section
            eyebrow="Your ministry"
            title="Make it yours"
            sub="Add your ministry’s name and logo to brand your hub. Both are optional — they’ll show in the header and you can change them anytime in your profile."
          >
            <div className="ob-logo-row">
              <div className="ob-logo-preview" aria-hidden={!logo}>
                {logo
                  ? <img src={logo} alt="Ministry logo preview" />
                  : <span className="ob-logo-placeholder">⛪</span>}
              </div>
              <div className="ob-logo-actions">
                <label className="ob-btn ob-btn-ghost ob-logo-btn">
                  {logo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/*" onChange={onLogoPick} hidden />
                </label>
                {logo && (
                  <button type="button" className="ob-logo-remove" onClick={() => { setLogo(''); setLogoErr(''); }}>
                    Remove
                  </button>
                )}
                <span className="ob-logo-hint">PNG, JPG, or SVG. We’ll resize it for you.</span>
              </div>
            </div>
            {logoErr && <div className="ob-logo-err">{logoErr}</div>}

            <label className="ob-field">
              <span className="ob-label">Ministry name</span>
              <input
                className="ob-input"
                value={ministryName}
                onChange={e => setMinistryName(e.target.value)}
                placeholder="e.g. Trinity Church Worship Team"
              />
            </label>
          </Section>
        )}

        {step === 2 && (
          <Section
            eyebrow="Personal pages"
            title="Which pages do you want?"
            sub={`These are your personal, day-to-day pages. ${personalOn} of ${NAV_STANDALONE_CATEGORIES.length} selected — turn off any you won’t use.`}
          >
            <div className="ob-grid">
              {NAV_STANDALONE_CATEGORIES.map(c => (
                <Tile key={c.id} icon={c.icon} label={c.label} on={!!personal[c.id]} onClick={() => togglePersonal(c.id)} />
              ))}
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section
            eyebrow="Ministries"
            title="Which ministries do you serve in?"
            sub={`Pick the ones you’re part of — they’ll appear in your sidebar. ${ministryOn} selected. You can add more anytime in Settings.`}
          >
            <div className="ob-grid">
              {NAV_MINISTRY_CATEGORIES.map(c => (
                <Tile key={c.id} icon={c.icon} label={c.label} on={!!ministries[c.id]} onClick={() => toggleMinistry(c.id)} />
              ))}
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section
            eyebrow="Prayer"
            title="Start your Prayer wall"
            sub="What’s on your heart today? We’ll add it as your first prayer. (Optional — leave blank to skip.)"
          >
            <label className="ob-field">
              <span className="ob-label">Something you’d like prayer for</span>
              <textarea
                className="ob-textarea"
                rows={3}
                value={prayerText}
                onChange={e => setPrayerText(e.target.value)}
                placeholder="e.g. Wisdom for a big decision this week…"
              />
            </label>
            <label className="ob-check-row">
              <input type="checkbox" checked={prayerDaily} onChange={e => setPrayerDaily(e.target.checked)} />
              <span>Add this to my daily prayer list</span>
            </label>
            <label className="ob-field">
              <span className="ob-label">Anything you’re praising God for? <em>(optional)</em></span>
              <textarea
                className="ob-textarea"
                rows={2}
                value={praiseText}
                onChange={e => setPraiseText(e.target.value)}
                placeholder="e.g. Thankful for answered prayer…"
              />
            </label>
          </Section>
        )}

        {step === 5 && (
          <Section
            eyebrow="Friends"
            title="Add someone to stay connected with"
            sub="Friends helps you remember to reach out. Add one person to get started. (Optional — leave blank to skip.)"
          >
            <label className="ob-field">
              <span className="ob-label">Their name</span>
              <input
                className="ob-input"
                value={friendName}
                onChange={e => setFriendName(e.target.value)}
                placeholder="e.g. Sarah Thompson"
              />
            </label>
            <label className="ob-field">
              <span className="ob-label">How often do you want to reach out?</span>
              <div className="ob-freq">
                {FREQUENCIES.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    className={`ob-freq-btn${friendFreq === f.value ? ' on' : ''}`}
                    onClick={() => setFriendFreq(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="ob-field">
              <span className="ob-label">How you met or a quick note <em>(optional)</em></span>
              <input
                className="ob-input"
                value={friendNote}
                onChange={e => setFriendNote(e.target.value)}
                placeholder="e.g. From small group"
              />
            </label>
          </Section>
        )}

        {step === lastStep && (
          <Section
            eyebrow="All set"
            title="Your hub is ready"
            sub="Here’s what we set up — you can fine-tune everything in Settings whenever you like."
          >
            <ul className="ob-summary">
              {(ministryName.trim() || logo) && (
                <li className="ob-summary-brand">
                  {logo && <img className="ob-summary-logo" src={logo} alt="" />}
                  <span>{ministryName.trim() ? ministryName.trim() : 'Logo added'} ⛪</span>
                </li>
              )}
              <li><strong>{personalOn}</strong> personal page{personalOn === 1 ? '' : 's'}</li>
              <li><strong>{ministryOn}</strong> ministr{ministryOn === 1 ? 'y' : 'ies'}</li>
              <li>{prayerText.trim() ? 'First prayer added 🙏' : 'Prayer wall ready'}</li>
              <li>{friendName.trim() ? `${friendName.trim()} added to Friends 🤝` : 'Friends page ready'}</li>
            </ul>
          </Section>
        )}

        {/* Footer controls */}
        <div className="ob-foot">
          {step > 0
            ? <button type="button" className="ob-btn ob-btn-ghost" onClick={back} disabled={saving}>← Back</button>
            : <span />}

          <div className="ob-foot-right">
            {/* Optional steps (ministry identity, prayer, friend) can be skipped. */}
            {[1, 4, 5].includes(step) && (
              <button type="button" className="ob-btn ob-btn-ghost" onClick={next} disabled={saving}>Skip</button>
            )}
            {step < lastStep
              ? <button type="button" className="ob-btn ob-btn-primary" onClick={next}>{step === 0 ? 'Get started' : 'Next →'}</button>
              : <button type="button" className="ob-btn ob-btn-primary" onClick={finish} disabled={saving}>
                  {saving ? 'Setting up…' : 'Enter Ministry Hub'}
                </button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ eyebrow, title, sub, children }) {
  return (
    <div className="ob-section">
      <div className="ob-eyebrow">{eyebrow}</div>
      <h1 className="ob-title">{title}</h1>
      {sub && <p className="ob-sub">{sub}</p>}
      <div className="ob-section-body">{children}</div>
    </div>
  );
}

function Tile({ icon, label, on, onClick }) {
  return (
    <button type="button" className={`ob-tile${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="ob-tile-icon" aria-hidden="true">{icon}</span>
      <span className="ob-tile-label">{label}</span>
      <span className="ob-tile-check" aria-hidden="true">{on ? '✓' : ''}</span>
    </button>
  );
}
