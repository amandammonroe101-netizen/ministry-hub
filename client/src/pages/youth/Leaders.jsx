import { useMemo, useState, useEffect, useRef } from 'react';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Leaders.css';

/* Youth → Leaders
   Storage:
     youth:leaders    — array of leader objects (see DEFAULT_LEADER)
     youth:leaderDocs — array of uploaded files keyed by leaderId,
                        same shape as youth:tripDocs (base64 dataUrl
                        inline so the file shows up across devices)
     calendar-events  — when syncRenewalsToCalendar is on, leader
                        background-check + training renewal reminders
                        get pushed here 30 days before expiry. */

const ACCENT     = '#854d0e';
const CAL_SOURCE = 'youth-leader';
const CAL_COLOR  = '#854d0e';

const ROLE_SUGGESTIONS = [
  'Lead Pastor', 'Coordinator', 'Small Group Leader', 'Worship',
  'Tech / Media', 'Greeter', 'Driver', 'Mentor', 'Game Leader',
  'Camp Counselor', 'Drama Team',
];
const SERVE_AREA_SUGGESTIONS = [
  'Sunday Morning', 'Wednesday Night', 'Friday Youth Group',
  'Camp / Retreats', 'Outreach Events', 'Special Events',
];
const TRAINING_SUGGESTIONS = [
  'Safe-from-Harm', 'CPR / First Aid', 'Driver Training',
  'Lesson Style', 'Boundaries / Code of Conduct',
];

const BG_STATUSES = [
  { id: 'cleared', label: '✅ Cleared',   tone: 'good' },
  { id: 'pending', label: '⏳ Pending',   tone: 'wait' },
  { id: 'expired', label: '⚠️ Expired',   tone: 'warn' },
  { id: 'missing', label: '❌ Missing',   tone: 'bad'  },
];

const SERVICE_STATUSES = [
  { id: 'active',   label: '✅ Active',   tone: 'good' },
  { id: 'on_break', label: '⏸ On break', tone: 'wait' },
  { id: 'inactive', label: '💤 Inactive', tone: 'bad'  },
];

/* Thresholds. SOON_DAYS controls both the bg "expires soon" pill and
   the auto-scheduled renewal reminder lead time. BIRTHDAY_WINDOW
   bounds how far ahead birthdays/anniversaries are surfaced. */
const EXPIRY_SOON_DAYS  = 30;
const BIRTHDAY_WINDOW   = 30;

/* Photo max dimension when uploaded. Resized via <canvas> to keep
   the Firestore payload small — at 256×256 JPEG-0.85 a typical
   portrait lands under 30KB, well below Firestore's 1MB doc cap
   even with dozens of leaders. */
const PHOTO_MAX_DIM = 256;

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const DEFAULT_LEADER = () => ({
  id:           makeId('l'),
  name:         '',
  photoDataUrl: '',
  roles:        ['Small Group Leader'],   // multi-select (Tier 2)
  servesAt:     [],
  phone:        '',
  email:        '',
  bgStatus:     'missing',
  bgExpires:    '',
  trainings:    [],                       // [{ id, name, completedDate, expiryDate }]
  notes:        '',
  status:       'active',                 // 'active' | 'on_break' | 'inactive'
  breakReturnDate: '',                    // only meaningful when status === 'on_break'
  dob:          '',                       // YYYY-MM-DD (year optional but stored)
  joinedAt:     '',                       // when they started serving
  syncRenewalsToCalendar: true,           // auto-push bg + training renewals
  syncBirthdayToCalendar:    false,       // 🎂 birthday event each year
  syncAnniversaryToCalendar: false,       // 🎉 joined-anniversary event each year
  createdAt:    Date.now(),
});

/* Lazy migration on read. Promotes:
     role (string)        → roles[]
     trainingDone (bool)  → trainings[]
     active (bool)        → status enum
   New Tier-3 fields get sensible defaults so legacy data renders. */
function normalizeLeader(l) {
  if (!l) return l;
  const next = { ...l };
  if (!Array.isArray(next.roles))     next.roles    = next.role ? [next.role] : [];
  if (!Array.isArray(next.servesAt))  next.servesAt = [];
  if (!Array.isArray(next.trainings)) {
    next.trainings = next.trainingDone
      ? [{ id: makeId('tr'), name: 'Leader training', completedDate: '', expiryDate: '' }]
      : [];
  }
  if (typeof next.status !== 'string') {
    next.status = (next.active === false) ? 'inactive' : 'active';
  }
  if (typeof next.breakReturnDate !== 'string') next.breakReturnDate = '';
  if (typeof next.dob          !== 'string') next.dob          = '';
  if (typeof next.joinedAt     !== 'string') next.joinedAt     = '';
  if (typeof next.photoDataUrl !== 'string') next.photoDataUrl = '';
  if (typeof next.syncRenewalsToCalendar    !== 'boolean') next.syncRenewalsToCalendar    = true;
  if (typeof next.syncBirthdayToCalendar    !== 'boolean') next.syncBirthdayToCalendar    = false;
  if (typeof next.syncAnniversaryToCalendar !== 'boolean') next.syncAnniversaryToCalendar = false;
  return next;
}

/** Compute days from today until `iso` (negative = past). Returns null
 *  on empty / invalid input so callers can short-circuit cleanly. */
const daysUntil = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
};

/** Read the leader's effective background-check status. */
const effectiveBgStatus = (l) => {
  const days = daysUntil(l.bgExpires);
  if (days !== null && days < 0) return 'expired';
  return l.bgStatus || 'missing';
};

const expirySoonLabel = (l) => {
  if (l.bgStatus !== 'cleared') return null;
  const days = daysUntil(l.bgExpires);
  if (days === null || days < 0 || days > EXPIRY_SOON_DAYS) return null;
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  return `expires in ${days}d`;
};

const trainingStatus = (t) => {
  if (!t.completedDate) return 'incomplete';
  const days = daysUntil(t.expiryDate);
  if (days === null) return 'current';
  if (days < 0) return 'expired';
  if (days <= EXPIRY_SOON_DAYS) return 'soon';
  return 'current';
};

/** Days until the next occurrence of a YYYY-MM-DD anniversary date.
 *  Year is ignored — only month/day matter. Returns 0 if today.
 *  Null on missing/invalid input. */
function daysUntilAnniversary(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  /* Build the next anniversary date in the local TZ. If it already
     passed this year, roll to next year. */
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  const dayMs = 86400000;
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next.getTime() < todayMidnight.getTime()) {
    next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  }
  return Math.round((next.getTime() - todayMidnight.getTime()) / dayMs);
}

/** Pretty label for an anniversary count ("3rd anniversary"). */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Years between a YYYY-MM-DD date and the next anniversary occurrence. */
function nextAnniversaryYears(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const passedThisYear =
    now.getMonth() > d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
  if (!passedThisYear) years -= 1;
  /* Years to the NEXT anniversary — the count above is years already
     completed; add 1 if today isn't the day. */
  const days = daysUntilAnniversary(iso);
  return days === 0 ? years : years + 1;
}

/* Lightweight URL-safety helpers for tel: / mailto: */
const telHref = (phone) => {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
};
const mailHref = (email) => {
  const e = (email || '').trim();
  return e ? `mailto:${e}` : null;
};

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

/** Resize an uploaded image to PHOTO_MAX_DIM on the longest edge and
 *  return a JPEG dataURL. Keeps avatar storage tiny so a roster of
 *  50 leaders doesn't bloat a single Firestore document past its
 *  1MB limit. */
async function resizePhotoToDataURL(file) {
  const dataUrl = await readFileAsDataURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** ISO YYYY-MM-DD for the next occurrence of a stored month/day,
 *  rolled forward to next year if this year's date is already past. */
function nextAnniversaryISO(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next.getTime() < todayMidnight.getTime()) {
    next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  }
  /* Build YYYY-MM-DD in local time so the date doesn't drift across
     timezones (`toISOString()` would shift it for negative-UTC users). */
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Compute the desired set of calendar events for this leader —
 *  renewal reminders + (when opted-in) birthday + anniversary events.
 *  Each source has its own toggle so the user can mix and match.
 *  Inactive leaders generate nothing — no point pestering about a
 *  person who isn't serving. */
function desiredRenewalEvents(leader) {
  if (leader.status === 'inactive') return [];

  const out = [];
  const reminderDate = (expiryIso) => {
    const t = new Date(expiryIso).getTime();
    if (Number.isNaN(t)) return '';
    const d = new Date(t - EXPIRY_SOON_DAYS * 86400000);
    return d.toISOString().slice(0, 10);
  };

  /* ── Background-check + training renewal reminders ──────────── */
  if (leader.syncRenewalsToCalendar) {
    if (leader.bgExpires) {
      const date = reminderDate(leader.bgExpires);
      if (date) {
        out.push({
          id: 'ce_' + Date.now().toString(36) + '_bg_' + Math.random().toString(36).slice(2, 6),
          created_at: new Date().toISOString(),
          title:       `Renew ${leader.name || 'leader'}'s background check`,
          description: `Background check expires ${leader.bgExpires}. ${EXPIRY_SOON_DAYS}-day heads-up.`,
          event_date:  date,
          end_date:    '',
          event_time:  '',
          color:       CAL_COLOR,
          category:    'youth',
          source:      CAL_SOURCE,
          source_id:   `${leader.id}__bg`,
          reminder_offset: 'none',
          reminder_time:   '',
          reminder_note:   '',
        });
      }
    }

    (leader.trainings || []).forEach(t => {
      if (!t.expiryDate) return;
      const date = reminderDate(t.expiryDate);
      if (!date) return;
      out.push({
        id: 'ce_' + Date.now().toString(36) + '_tr_' + Math.random().toString(36).slice(2, 6),
        created_at: new Date().toISOString(),
        title:       `Renew ${leader.name || 'leader'} — ${t.name || 'training'}`,
        description: `${t.name || 'Training'} expires ${t.expiryDate}. ${EXPIRY_SOON_DAYS}-day heads-up.`,
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR,
        category:    'youth',
        source:      CAL_SOURCE,
        source_id:   `${leader.id}__tr_${t.id}`,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      });
    });
  }

  /* ── Birthday — fires on the day, not before. ──────────────── */
  if (leader.syncBirthdayToCalendar && leader.dob) {
    const date = nextAnniversaryISO(leader.dob);
    if (date) {
      out.push({
        id: 'ce_' + Date.now().toString(36) + '_bday_' + Math.random().toString(36).slice(2, 6),
        created_at: new Date().toISOString(),
        title:       `🎂 ${leader.name || 'Leader'}'s birthday`,
        description: leader.dob ? `Birthday on ${leader.dob}.` : 'Leader birthday',
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR,
        category:    'youth',
        source:      CAL_SOURCE,
        source_id:   `${leader.id}__bday`,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      });
    }
  }

  /* ── Volunteer anniversary — fires on the day. ─────────────── */
  if (leader.syncAnniversaryToCalendar && leader.joinedAt) {
    const date = nextAnniversaryISO(leader.joinedAt);
    if (date) {
      const yrs = nextAnniversaryYears(leader.joinedAt);
      out.push({
        id: 'ce_' + Date.now().toString(36) + '_ann_' + Math.random().toString(36).slice(2, 6),
        created_at: new Date().toISOString(),
        title:       `🎉 ${leader.name || 'Leader'} — ${yrs ? ordinal(yrs) + ' ' : ''}volunteer anniversary`,
        description: `Joined ${leader.joinedAt}.`,
        event_date:  date,
        end_date:    '',
        event_time:  '',
        color:       CAL_COLOR,
        category:    'youth',
        source:      CAL_SOURCE,
        source_id:   `${leader.id}__ann`,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      });
    }
  }

  return out;
}

export default function Leaders() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [leadersRaw, setLeaders, { loading }] = useUserStoreKey('youth:leaders', []);
  const [docs, setDocs] = useUserStoreKey('youth:leaderDocs', []);
  const [outreach] = useUserStoreKey('youth:outreach', []);
  const [trips]    = useUserStoreKey('youth:trips', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);

  const list = useMemo(
    () => (Array.isArray(leadersRaw) ? leadersRaw : []).map(normalizeLeader),
    [leadersRaw]
  );
  const docList = useMemo(() => Array.isArray(docs) ? docs : [], [docs]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'on_break' | 'inactive' | 'all'
  const [bgFilter,   setBgFilter]   = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  const roleOptions = useMemo(() => {
    const set = new Set(ROLE_SUGGESTIONS);
    list.forEach(l => (l.roles || []).forEach(r => set.add(r)));
    return [...set];
  }, [list]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(l => statusFilter === 'all' ? true : l.status === statusFilter)
      .filter(l => bgFilter   === 'all' ? true : effectiveBgStatus(l) === bgFilter)
      .filter(l => roleFilter === 'all' ? true : (l.roles || []).includes(roleFilter))
      .filter(l => !q ||
        (l.name || '').toLowerCase().includes(q) ||
        (l.roles || []).join(' ').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [list, query, statusFilter, bgFilter, roleFilter]);

  const open = openId ? list.find(l => l.id === openId) : null;

  /** Drop every renewal event tied to this leader, then write the
   *  desired set. Same rebuild-strategy Lessons uses. */
  const syncRenewalsFor = (leader) => {
    setCalendarEvents(prev => {
      const evList = Array.isArray(prev) ? prev : [];
      const prefix = `${leader.id}__`;
      const others = evList.filter(e => {
        if (e.source !== CAL_SOURCE) return true;
        const sid = e.source_id || '';
        return !sid.startsWith(prefix);
      });
      return [...desiredRenewalEvents(leader), ...others];
    });
  };
  const removeRenewalsFor = (leaderId) => {
    setCalendarEvents(prev => (prev || []).filter(e => {
      if (e.source !== CAL_SOURCE) return true;
      const sid = e.source_id || '';
      return !sid.startsWith(`${leaderId}__`);
    }));
  };

  const add = () => {
    const l = DEFAULT_LEADER();
    setLeaders(prev => [...(prev || []), l]);
    setOpenId(l.id);
  };
  const update = (id, patch) => {
    setLeaders(prev => {
      const next = (prev || []).map(l => l.id === id ? { ...normalizeLeader(l), ...patch } : l);
      const updated = next.find(l => l.id === id);
      if (updated) syncRenewalsFor(updated);
      return next;
    });
  };
  const remove = (id) => {
    if (!confirm('Remove this leader? Their uploaded documents and calendar reminders will also be deleted.')) return;
    setLeaders(prev => (prev || []).filter(l => l.id !== id));
    setDocs(prev => (prev || []).filter(d => d.leaderId !== id));
    removeRenewalsFor(id);
    if (openId === id) setOpenId(null);
  };

  const addDoc = async (leaderId, file) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      const entry = {
        id:         makeId('ld'),
        leaderId,
        name:       file.name,
        dataUrl,
        size:       file.size,
        type:       file.type,
        uploadedAt: new Date().toISOString(),
      };
      setDocs(prev => [...(prev || []), entry]);
    } catch {
      alert('Could not upload that file. Try a smaller image or PDF.');
    }
  };
  const removeDoc = (docId) => {
    setDocs(prev => (prev || []).filter(d => d.id !== docId));
  };

  /** Resize + persist a profile photo. Passing `null` clears it. */
  const setPhoto = async (leaderId, file) => {
    if (!file) {
      update(leaderId, { photoDataUrl: '' });
      return;
    }
    try {
      const dataUrl = await resizePhotoToDataURL(file);
      update(leaderId, { photoDataUrl: dataUrl });
    } catch {
      alert('Could not load that photo. Try a JPG or PNG under 5MB.');
    }
  };

  /* Stats — Tier 3 adds the upcoming birthdays/anniversaries count. */
  const stats = useMemo(() => {
    const activeList = list.filter(l => l.status === 'active');
    const cleared = activeList.filter(l => effectiveBgStatus(l) === 'cleared').length;
    const flagged = activeList.filter(l => {
      const s = effectiveBgStatus(l);
      return s !== 'cleared' || expirySoonLabel(l);
    }).length;
    const celebrations = list.filter(l => {
      if (l.status === 'inactive') return false;
      const b = daysUntilAnniversary(l.dob);
      const a = daysUntilAnniversary(l.joinedAt);
      return (b !== null && b <= BIRTHDAY_WINDOW) || (a !== null && a <= BIRTHDAY_WINDOW);
    }).length;
    return { total: list.length, active: activeList.length, cleared, flagged, celebrations };
  }, [list]);

  const findActivitiesForLeader = (leader) => {
    const needle = (leader.name || '').trim().toLowerCase();
    if (!needle) return { trips: [], outreach: [] };
    const tripMatches = (Array.isArray(trips) ? trips : []).filter(t =>
      (t.roster || []).some(r => typeof r === 'string' && r.trim().toLowerCase() === needle)
    );
    const outreachMatches = (Array.isArray(outreach) ? outreach : []).filter(o =>
      (o.signups || []).some(s => (s.name || '').trim().toLowerCase() === needle)
    );
    return { trips: tripMatches, outreach: outreachMatches };
  };

  return (
    <YouthShell
      groupLabel="Team" groupIcon="🙋"
      icon="🧑‍🏫" title="Leaders"
      accent={ACCENT}
      subtitle="Your volunteer roster — roles, training, background checks, photos, and milestones."
      actions={<button className="yps-add-btn" onClick={add}>＋ Add leader</button>}
      stats={[
        { n: stats.active,       label: 'active' },
        { n: stats.cleared,      label: 'background cleared' },
        { n: stats.flagged,      label: 'need attention' },
        { n: stats.celebrations, label: '🎂 milestones soon' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yl-tools">
        <input
          className="yps-input"
          placeholder="Search by name, role, email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="yl-tools-chips">
          {SERVICE_STATUSES.map(s => (
            <button
              key={s.id}
              className={`yps-chip ${statusFilter === s.id ? 'on' : ''}`}
              onClick={() => setStatusFilter(s.id)}
            >{s.label}</button>
          ))}
          <button className={`yps-chip ${statusFilter === 'all' ? 'on' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
        </div>
      </div>

      <div className="yl-filter-row">
        <span className="yl-filter-label">Background:</span>
        <button className={`yps-chip ${bgFilter === 'all' ? 'on' : ''}`} onClick={() => setBgFilter('all')}>All</button>
        {BG_STATUSES.map(s => (
          <button
            key={s.id}
            className={`yps-chip ${bgFilter === s.id ? 'on' : ''}`}
            onClick={() => setBgFilter(s.id)}
          >{s.label}</button>
        ))}
      </div>
      <div className="yl-filter-row">
        <span className="yl-filter-label">Role:</span>
        <button className={`yps-chip ${roleFilter === 'all' ? 'on' : ''}`} onClick={() => setRoleFilter('all')}>All</button>
        {roleOptions.map(r => (
          <button
            key={r}
            className={`yps-chip ${roleFilter === r ? 'on' : ''}`}
            onClick={() => setRoleFilter(r)}
          >{r}</button>
        ))}
      </div>

      <CelebrationsBanner leaders={list} />

      {loading && list.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">🧑‍🏫</div><div className="yps-empty-title">Loading…</div></div>
      ) : visible.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">🧑‍🏫</div>
          <div className="yps-empty-title">{list.length === 0 ? 'No leaders yet' : 'No matches'}</div>
          <div className="yps-empty-sub">
            {list.length === 0
              ? 'Add your first volunteer — their role, contact info, and background-check status.'
              : 'Try clearing the search or switching filter.'}
          </div>
        </div>
      ) : (
        <div className="yl-table">
          <header className="yl-row yl-row-hd">
            <span>Name</span>
            <span>Roles</span>
            <span>Background</span>
            <span>Training</span>
            <span>Contact</span>
            <span></span>
          </header>
          {visible.map(l => {
            const effective = effectiveBgStatus(l);
            const bg = BG_STATUSES.find(s => s.id === effective) || BG_STATUSES[3];
            const soon = expirySoonLabel(l);
            const tel  = telHref(l.phone);
            const mail = mailHref(l.email);
            const roleSummary = (l.roles || []).length === 0
              ? '—'
              : (l.roles || []).slice(0, 2).join(', ') + ((l.roles || []).length > 2 ? ` +${l.roles.length - 2}` : '');
            const trainingsDone = (l.trainings || []).filter(t => trainingStatus(t) !== 'incomplete').length;
            const dobDays = daysUntilAnniversary(l.dob);
            const annDays = daysUntilAnniversary(l.joinedAt);
            return (
              <button
                key={l.id}
                className="yl-row"
                onDoubleClick={() => setOpenId(l.id)}
                title="Double-click to open"
              >
                <span className="yl-name">
                  <Avatar leader={l} />
                  <span>{l.name || '(unnamed)'}</span>
                  {l.status === 'on_break' && (
                    <span className="yps-pill yl-bg-wait" title={l.breakReturnDate ? `Returns ${l.breakReturnDate}` : ''}>
                      ⏸ On break{l.breakReturnDate ? ` · returns ${l.breakReturnDate}` : ''}
                    </span>
                  )}
                  {l.status === 'inactive' && <span className="yps-pill">inactive</span>}
                  {dobDays !== null && dobDays <= 14 && l.status !== 'inactive' && (
                    <span className="yps-pill yl-celebrate" title={l.dob}>
                      🎂 {dobDays === 0 ? 'today!' : `${dobDays}d`}
                    </span>
                  )}
                  {annDays !== null && annDays <= 14 && l.status !== 'inactive' && nextAnniversaryYears(l.joinedAt) > 0 && (
                    <span className="yps-pill yl-celebrate" title={l.joinedAt}>
                      🎉 {nextAnniversaryYears(l.joinedAt)}yr
                    </span>
                  )}
                </span>
                <span className="yl-role" title={(l.roles || []).join(', ')}>{roleSummary}</span>
                <span className="yl-bg-cell">
                  <span className={`yps-pill yl-bg-${bg.tone}`}>{bg.label}</span>
                  {soon && <span className="yps-pill yl-bg-warn yl-bg-soon">⏰ {soon}</span>}
                </span>
                <span className="yl-training">
                  {trainingsDone > 0
                    ? `✓ ${trainingsDone}${(l.trainings || []).length > trainingsDone ? `/${l.trainings.length}` : ''}`
                    : '—'}
                </span>
                <span className="yl-contact yl-contact-actions">
                  {tel && (
                    <a
                      href={tel}
                      className="yl-contact-link"
                      title={`Call ${l.phone}`}
                      onClick={(e) => e.stopPropagation()}
                    >📞 {l.phone}</a>
                  )}
                  {mail && (
                    <a
                      href={mail}
                      className="yl-contact-link"
                      title={`Email ${l.email}`}
                      onClick={(e) => e.stopPropagation()}
                    >✉️ {l.email}</a>
                  )}
                  {!tel && !mail && <span>—</span>}
                </span>
                <span className="yl-go">›</span>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <LeaderEditor
          leader={open}
          docs={docList.filter(d => d.leaderId === open.id)}
          activities={findActivitiesForLeader(open)}
          onChange={(p) => update(open.id, p)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
          onAddDoc={(file) => addDoc(open.id, file)}
          onRemoveDoc={(docId) => removeDoc(docId)}
          onSetPhoto={(file) => setPhoto(open.id, file)}
        />
      )}

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

/* ─────────────────────────────────────────────────────────────
   Avatar — photo if set, initial-circle fallback. Used in the row
   AND the view/edit-mode modal so it stays visually consistent.
   ───────────────────────────────────────────────────────────── */
function Avatar({ leader, size = 'sm' }) {
  const cls = `yl-avatar ${size === 'lg' ? 'yl-avatar-lg' : ''}`;
  if (leader.photoDataUrl) {
    return (
      <span className={`${cls} yl-avatar-photo`} aria-hidden="true">
        <img src={leader.photoDataUrl} alt="" />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {(leader.name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Celebrations banner — small "🎂 3 birthdays / 🎉 2 anniversaries
   in the next 30 days" strip at the top of the list so the youth
   pastor sees milestones without opening every card.
   ───────────────────────────────────────────────────────────── */
function CelebrationsBanner({ leaders }) {
  const items = useMemo(() => {
    const out = [];
    for (const l of leaders) {
      if (l.status === 'inactive') continue;
      const bDays = daysUntilAnniversary(l.dob);
      const aDays = daysUntilAnniversary(l.joinedAt);
      if (bDays !== null && bDays <= BIRTHDAY_WINDOW) {
        out.push({ kind: 'bday', leader: l, days: bDays });
      }
      if (aDays !== null && aDays <= BIRTHDAY_WINDOW) {
        const yrs = nextAnniversaryYears(l.joinedAt);
        if (yrs > 0) out.push({ kind: 'ann', leader: l, days: aDays, years: yrs });
      }
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [leaders]);

  if (items.length === 0) return null;

  return (
    <div className="yl-celebrate-banner">
      <div className="yl-celebrate-banner-hd">🎉 Coming up</div>
      <div className="yl-celebrate-banner-items">
        {items.map((it, i) => (
          <span key={i} className="yps-pill yl-celebrate">
            {it.kind === 'bday'
              ? `🎂 ${it.leader.name || 'Leader'} — ${it.days === 0 ? 'today!' : it.days === 1 ? 'tomorrow' : `in ${it.days}d`}`
              : `🎉 ${it.leader.name || 'Leader'} ${ordinal(it.years)} anniversary — ${it.days === 0 ? 'today!' : it.days === 1 ? 'tomorrow' : `in ${it.days}d`}`}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Leader editor — view/edit toggle. Brand-new leaders open in
   edit, named leaders open in view so the modal reads as a
   contact card.
   ───────────────────────────────────────────────────────────── */
function LeaderEditor({ leader, docs, activities, onChange, onDelete, onClose, onAddDoc, onRemoveDoc, onSetPhoto }) {
  const [mode, setMode] = useState(() => (leader.name ? 'view' : 'edit'));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="yl-modal-backdrop" onClick={onClose}>
      <div className="yl-modal" onClick={e => e.stopPropagation()}>
        <header className="yl-modal-hd">
          <h2>{leader.name || 'New leader'}</h2>
          <div className="yl-modal-hd-right">
            <span className="yps-pill">{mode === 'view' ? '👁 Viewing' : '✎ Editing'}</span>
            <button className="yps-btn ghost" onClick={onClose}>✕</button>
          </div>
        </header>

        {mode === 'view'
          ? <LeaderViewMode leader={leader} docs={docs} activities={activities} />
          : <LeaderEditForm leader={leader} docs={docs} onChange={onChange} onAddDoc={onAddDoc} onRemoveDoc={onRemoveDoc} onSetPhoto={onSetPhoto} />}

        <footer className="yl-modal-ft">
          <button className="yps-btn danger" onClick={onDelete}>🗑 Delete</button>
          <div className="yl-modal-ft-right">
            <button className="yps-btn" onClick={onClose}>Close</button>
            {mode === 'view' ? (
              <button className="yps-add-btn" onClick={() => setMode('edit')}>✎ Edit</button>
            ) : (
              <button className="yps-add-btn" onClick={() => setMode('view')}>✓ Done editing</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function LeaderViewMode({ leader, docs, activities }) {
  const effective = effectiveBgStatus(leader);
  const bg = BG_STATUSES.find(s => s.id === effective) || BG_STATUSES[3];
  const soon = expirySoonLabel(leader);
  const tel  = telHref(leader.phone);
  const mail = mailHref(leader.email);
  const trainings = leader.trainings || [];
  const upcomingTrips = (activities?.trips || []).filter(t => {
    if (!t.start_date) return true;
    return new Date(t.start_date).getTime() >= Date.now() - 86400000;
  });
  const dobDays = daysUntilAnniversary(leader.dob);
  const annDays = daysUntilAnniversary(leader.joinedAt);
  const annYears = nextAnniversaryYears(leader.joinedAt);

  return (
    <div className="yl-grid yl-view">
      <div className="yl-field full yl-view-hd">
        <Avatar leader={leader} size="lg" />
        <div className="yl-view-hd-text">
          <div className="yl-view-name">{leader.name || '(unnamed)'}</div>
          <div className="yl-view-meta">
            {(leader.roles || []).map(r => <span key={r} className="yps-pill">{r}</span>)}
            {(leader.roles || []).length === 0 && <span className="yl-view-muted">No role set</span>}
            {leader.status === 'on_break' && <span className="yps-pill yl-bg-wait">⏸ On break</span>}
            {leader.status === 'inactive' && <span className="yps-pill">inactive</span>}
          </div>
        </div>
      </div>

      {leader.status === 'on_break' && leader.breakReturnDate && (
        <div className="yl-field full yl-break-banner">
          ⏸ <b>On break</b> — expected back <b>{leader.breakReturnDate}</b>. Skip from rotation until then.
        </div>
      )}

      <div className="yl-field full">
        <span className="yl-field-label">Background check</span>
        <div className="yl-view-bgrow">
          <span className={`yps-pill yl-bg-${bg.tone}`}>{bg.label}</span>
          {leader.bgExpires && (
            <span className="yl-view-muted">expires {leader.bgExpires}</span>
          )}
          {soon && <span className="yps-pill yl-bg-warn yl-bg-soon">⏰ {soon}</span>}
        </div>
      </div>

      <div className="yl-field">
        <span className="yl-field-label">Phone</span>
        {tel
          ? <a className="yl-view-link" href={tel}>📞 {leader.phone}</a>
          : <span className="yl-view-muted">—</span>}
      </div>
      <div className="yl-field">
        <span className="yl-field-label">Email</span>
        {mail
          ? <a className="yl-view-link" href={mail}>✉️ {leader.email}</a>
          : <span className="yl-view-muted">—</span>}
      </div>

      {(leader.dob || leader.joinedAt) && (
        <div className="yl-field full">
          <span className="yl-field-label">Milestones</span>
          <div className="yl-view-meta">
            {leader.dob && (
              <span className="yps-pill yl-celebrate" title={leader.dob}>
                🎂 Birthday {leader.dob}
                {dobDays !== null && (
                  dobDays === 0 ? ' — today!' :
                  dobDays === 1 ? ' — tomorrow' :
                  dobDays <= BIRTHDAY_WINDOW ? ` — in ${dobDays}d` : ''
                )}
                {leader.syncBirthdayToCalendar && <span className="yl-sync-mark" title="Synced to Calendar"> · 📆</span>}
              </span>
            )}
            {leader.joinedAt && (
              <span className="yps-pill yl-celebrate" title={leader.joinedAt}>
                🎉 Joined {leader.joinedAt}
                {annDays !== null && annYears > 0 && (
                  annDays === 0 ? ` — ${ordinal(annYears)} today!` :
                  annDays <= BIRTHDAY_WINDOW ? ` — ${ordinal(annYears)} in ${annDays}d` : ''
                )}
                {leader.syncAnniversaryToCalendar && <span className="yl-sync-mark" title="Synced to Calendar"> · 📆</span>}
              </span>
            )}
          </div>
        </div>
      )}

      {(leader.servesAt || []).length > 0 && (
        <div className="yl-field full">
          <span className="yl-field-label">Serves at</span>
          <div className="yl-view-meta">
            {leader.servesAt.map(s => <span key={s} className="yps-pill">{s}</span>)}
          </div>
        </div>
      )}

      {trainings.length > 0 && (
        <div className="yl-field full">
          <span className="yl-field-label">Training ({trainings.length})</span>
          <ul className="yl-training-list">
            {trainings.map(t => {
              const status = trainingStatus(t);
              return (
                <li key={t.id} className={`yl-training-row yl-tr-${status}`}>
                  <span className="yl-training-name">{t.name || '(unnamed)'}</span>
                  <span className="yl-training-meta">
                    {t.completedDate && <span>completed {t.completedDate}</span>}
                    {t.expiryDate && <span>· expires {t.expiryDate}</span>}
                  </span>
                  <span className={`yps-pill yl-tr-pill-${status}`}>
                    {status === 'expired'    && '⚠️ Expired'}
                    {status === 'soon'       && '⏰ Expires soon'}
                    {status === 'current'    && '✓ Current'}
                    {status === 'incomplete' && '… Incomplete'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {docs.length > 0 && (
        <div className="yl-field full">
          <span className="yl-field-label">Documents ({docs.length})</span>
          <div className="yl-doc-list">
            {docs.map(d => (
              <a
                key={d.id}
                className="yl-doc-pill yl-doc-pill-view"
                href={d.dataUrl}
                target="_blank"
                rel="noreferrer"
                title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
              >📎 {d.name}</a>
            ))}
          </div>
        </div>
      )}

      {(upcomingTrips.length > 0 || (activities?.outreach || []).length > 0) && (
        <div className="yl-field full">
          <span className="yl-field-label">Also serving on</span>
          <div className="yl-view-meta">
            {upcomingTrips.map(t => (
              <span key={t.id} className="yps-pill" title={t.start_date || ''}>
                🧳 {t.name || 'Trip'}
              </span>
            ))}
            {(activities?.outreach || []).map(o => (
              <span key={o.id} className="yps-pill" title={o.event_date || ''}>
                🤝 {o.title || 'Outreach event'}
              </span>
            ))}
          </div>
        </div>
      )}

      {leader.notes && (
        <div className="yl-field full">
          <span className="yl-field-label">Notes</span>
          <div className="yl-view-notes">{leader.notes}</div>
        </div>
      )}
    </div>
  );
}

function LeaderEditForm({ leader, docs, onChange, onAddDoc, onRemoveDoc, onSetPhoto }) {
  return (
    <div className="yl-grid">
      <div className="yl-field full yl-photo-edit-row">
        <PhotoUploader leader={leader} onSetPhoto={onSetPhoto} />
        <div className="yl-photo-edit-meta">
          <label className="yl-field">
            <span className="yl-field-label">Name</span>
            <input className="yps-input" value={leader.name} onChange={e => onChange({ name: e.target.value })} />
          </label>
        </div>
      </div>

      <Field label="Roles" full>
        <ChipMultiPick
          value={leader.roles || []}
          suggestions={ROLE_SUGGESTIONS}
          allowCustom
          placeholder="Add a custom role…"
          onChange={(roles) => onChange({ roles })}
        />
      </Field>

      <Field label="Serves at" full>
        <ChipMultiPick
          value={leader.servesAt || []}
          suggestions={SERVE_AREA_SUGGESTIONS}
          allowCustom
          placeholder="Add a custom program…"
          onChange={(servesAt) => onChange({ servesAt })}
        />
      </Field>

      <Field label="Service status" full>
        <div className="yl-status-chips">
          {SERVICE_STATUSES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`yps-chip ${leader.status === s.id ? 'on' : ''}`}
              onClick={() => onChange({ status: s.id })}
            >{s.label}</button>
          ))}
        </div>
        {leader.status === 'on_break' && (
          <label className="yl-field yl-break-date-field">
            <span className="yl-field-label">Expected return</span>
            <input
              type="date"
              className="yps-input"
              value={leader.breakReturnDate}
              onChange={e => onChange({ breakReturnDate: e.target.value })}
            />
          </label>
        )}
      </Field>

      <Field label="Phone"><input className="yps-input" type="tel" value={leader.phone} onChange={e => onChange({ phone: e.target.value })} /></Field>
      <Field label="Email"><input className="yps-input" type="email" value={leader.email} onChange={e => onChange({ email: e.target.value })} /></Field>

      <Field label="Birthday">
        <input
          type="date"
          className="yps-input"
          value={leader.dob}
          onChange={e => onChange({ dob: e.target.value })}
        />
        <label
          className="yl-inline-sync"
          title={leader.dob ? 'Add this birthday as a yearly Calendar event' : 'Pick a birthday first'}
        >
          <input
            type="checkbox"
            checked={!!leader.syncBirthdayToCalendar}
            disabled={!leader.dob}
            onChange={e => onChange({ syncBirthdayToCalendar: e.target.checked })}
          />
          <span>📆 Sync to Calendar</span>
        </label>
      </Field>
      <Field label="Joined team">
        <input
          type="date"
          className="yps-input"
          value={leader.joinedAt}
          onChange={e => onChange({ joinedAt: e.target.value })}
        />
        <label
          className="yl-inline-sync"
          title={leader.joinedAt ? 'Add this anniversary as a yearly Calendar event' : 'Pick a join date first'}
        >
          <input
            type="checkbox"
            checked={!!leader.syncAnniversaryToCalendar}
            disabled={!leader.joinedAt}
            onChange={e => onChange({ syncAnniversaryToCalendar: e.target.checked })}
          />
          <span>📆 Sync to Calendar</span>
        </label>
      </Field>

      <Field label="Background check">
        <select className="yps-select" value={leader.bgStatus} onChange={e => onChange({ bgStatus: e.target.value })}>
          {BG_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Background expires">
        <input type="date" className="yps-input" value={leader.bgExpires} onChange={e => onChange({ bgExpires: e.target.value })} />
      </Field>

      <Field label="Calendar reminders" full>
        <label className="yl-toggle">
          <input
            type="checkbox"
            checked={leader.syncRenewalsToCalendar}
            onChange={e => onChange({ syncRenewalsToCalendar: e.target.checked })}
          />
          <span>📆 Auto-add renewal reminders to my Calendar ({EXPIRY_SOON_DAYS} days before each expiry)</span>
        </label>
      </Field>

      <Field label="Training" full>
        <TrainingsEditor
          value={leader.trainings || []}
          onChange={(trainings) => onChange({ trainings })}
        />
      </Field>

      <Field label="Documents" full>
        <DocsEditor docs={docs} onAddDoc={onAddDoc} onRemoveDoc={onRemoveDoc} />
      </Field>

      <Field label="Notes" full>
        <textarea className="yps-textarea" rows={4} value={leader.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Strengths, schedule preferences, anything to remember…" />
      </Field>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Photo uploader — click the big avatar to change. Resizes to
   PHOTO_MAX_DIM before saving so Firestore stays slim.
   ───────────────────────────────────────────────────────────── */
function PhotoUploader({ leader, onSetPhoto }) {
  const inputRef = useRef(null);
  const onPick = async (e) => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    await onSetPhoto(f);
    if (inputRef.current) inputRef.current.value = '';
  };
  const onClear = (e) => { e.stopPropagation(); onSetPhoto(null); };
  return (
    <div className="yl-photo-uploader">
      <label className="yl-photo-uploader-btn" title="Click to upload a photo">
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} />
        <Avatar leader={leader} size="lg" />
        <span className="yl-photo-uploader-overlay">📷</span>
      </label>
      {leader.photoDataUrl && (
        <button type="button" className="yps-btn ghost" onClick={onClear} title="Remove photo">
          Remove photo
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Chip multi-pick — preset chips + free-text input for custom.
   ───────────────────────────────────────────────────────────── */
function ChipMultiPick({ value, suggestions, allowCustom, placeholder, onChange }) {
  const [input, setInput] = useState('');
  const set = useMemo(() => new Set(value || []), [value]);

  const toggle = (v) => {
    if (set.has(v)) onChange(value.filter(x => x !== v));
    else onChange([...(value || []), v]);
  };
  const addCustom = () => {
    const v = input.trim();
    if (!v) return;
    if (!set.has(v)) onChange([...(value || []), v]);
    setInput('');
  };

  const allChips = [...new Set([...(suggestions || []), ...(value || [])])];

  return (
    <div className="yl-chipmulti">
      <div className="yl-chipmulti-chips">
        {allChips.map(s => (
          <button
            key={s}
            type="button"
            className={`yps-chip ${set.has(s) ? 'on' : ''}`}
            onClick={() => toggle(s)}
          >{set.has(s) ? '✓ ' : ''}{s}</button>
        ))}
      </div>
      {allowCustom && (
        <div className="yl-chipmulti-add">
          <input
            className="yps-input"
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          />
          <button type="button" className="yps-btn" onClick={addCustom} disabled={!input.trim()}>＋ Add</button>
        </div>
      )}
    </div>
  );
}

function TrainingsEditor({ value, onChange }) {
  const rows = value || [];
  const used = useMemo(() => new Set(rows.map(r => r.name)), [rows]);
  const addRow = (name) => {
    onChange([...rows, { id: makeId('tr'), name: name || '', completedDate: '', expiryDate: '' }]);
  };
  const patch = (id, p) => onChange(rows.map(r => r.id === id ? { ...r, ...p } : r));
  const removeRow = (id) => onChange(rows.filter(r => r.id !== id));

  const unused = TRAINING_SUGGESTIONS.filter(s => !used.has(s));

  return (
    <div className="yl-trainings-edit">
      {rows.length === 0 && (
        <div className="yl-view-muted" style={{ padding: '4px 0' }}>
          No training items yet. Add common ones below or use <b>＋ Custom</b>.
        </div>
      )}
      {rows.length > 0 && (
        <ul className="yl-trainings-edit-list">
          {rows.map(r => {
            const status = trainingStatus(r);
            return (
              <li key={r.id} className={`yl-trainings-edit-row yl-tr-${status}`}>
                <input
                  className="yps-input yl-trainings-name"
                  value={r.name}
                  onChange={e => patch(r.id, { name: e.target.value })}
                  placeholder="Training name"
                />
                <label className="yl-trainings-date-wrap">
                  <span className="yl-trainings-date-label">Completed</span>
                  <input
                    type="date"
                    className="yps-input"
                    value={r.completedDate}
                    onChange={e => patch(r.id, { completedDate: e.target.value })}
                  />
                </label>
                <label className="yl-trainings-date-wrap">
                  <span className="yl-trainings-date-label">Expires</span>
                  <input
                    type="date"
                    className="yps-input"
                    value={r.expiryDate}
                    onChange={e => patch(r.id, { expiryDate: e.target.value })}
                  />
                </label>
                <span className={`yps-pill yl-tr-pill-${status}`}>
                  {status === 'expired'    && '⚠️ Expired'}
                  {status === 'soon'       && '⏰ Soon'}
                  {status === 'current'    && '✓ Current'}
                  {status === 'incomplete' && '… Incomplete'}
                </span>
                <button type="button" className="yps-btn ghost" onClick={() => removeRow(r.id)} title="Remove">✕</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="yl-trainings-add">
        {unused.map(s => (
          <button key={s} type="button" className="yps-chip" onClick={() => addRow(s)}>＋ {s}</button>
        ))}
        <button type="button" className="yps-btn" onClick={() => addRow('')}>＋ Custom training</button>
      </div>
    </div>
  );
}

function DocsEditor({ docs, onAddDoc, onRemoveDoc }) {
  const inputRef = useRef(null);
  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await onAddDoc(f);
    }
    if (inputRef.current) inputRef.current.value = '';
  };
  return (
    <div className="yl-docs-edit">
      <label className="yl-doc-upload">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={onPick}
        />
        <span>📎 Upload documents (background check, training cert, code of conduct…)</span>
      </label>
      {docs.length > 0 ? (
        <div className="yl-doc-list">
          {docs.map(d => (
            <div key={d.id} className="yl-doc-pill">
              <a
                className="yl-doc-pill-link"
                href={d.dataUrl}
                target="_blank"
                rel="noreferrer"
                title={`${d.name} — ${(d.size / 1024).toFixed(0)} KB`}
              >📎 {d.name}</a>
              <button
                type="button"
                className="yl-doc-pill-x"
                onClick={() => onRemoveDoc(d.id)}
                title="Remove this file"
              >✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="yl-view-muted" style={{ padding: '4px 0' }}>
          No documents uploaded yet.
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`yl-field ${full ? 'full' : ''}`}>
      <span className="yl-field-label">{label}</span>
      {children}
    </label>
  );
}
