import { useMemo, useRef, useState } from 'react';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import { useAuth } from '../../context/AuthContext';
import { useUserStoreKey } from '../../lib/userStore';
import { uploadBlob, deleteBlobAtPath } from '../../lib/userStorage';
import { calendarService } from '../../services/calendarService';
import { REMINDER_OPTIONS, isDayLevel } from '../../lib/reminders';
import './BibleStudies.css';

/* Color used for Bible-Study events on the global Calendar.
   Matches the Youth Ministry accent in the NavRail. */
const CAL_COLOR = '#b45309';
const CAL_SOURCE = 'youth-bible-study';
/* Hard cap on auto-generated events per study, just in case
   someone enters a 10-year span with weekly cadence. */
const MAX_EVENTS_PER_STUDY = 200;

/* ─────────────────────────────────────────────────────────────
   Youth → Bible Studies

   Each study is a small group with a leader, day/time, location,
   current book/series, a roster (drawn from the shared
   `youth:students` list), and a per-meeting log (date,
   attendance, discussion notes).

   Storage:
     youth:bible-studies  — array of study objects
     youth:students       — read-only here (members picked from)
   ───────────────────────────────────────────────────────────── */

/* Matches the Youth Ministry students-group accent (see youthConfig.js). */
const ACCENT = '#b45309';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Pre-set cadences shown in the Schedule dropdown. 'custom' lets
   the leader describe an irregular schedule in free text. */
const SCHEDULES = [
  { id: 'weekly',   label: 'Every week'        },
  { id: 'biweekly', label: 'Every other week'  },
  { id: 'monthly',  label: 'Once a month'      },
  { id: 'custom',   label: 'Custom…'           },
];

/* Quick lookup: schedule id → readable label, used for the
   short row sub-label in the left list. */
const SCHEDULE_LABEL = SCHEDULES.reduce((acc, s) => {
  acc[s.id] = s.label; return acc;
}, {});

/* Default end date is 3 months out — keeps the auto-generated
   event count reasonable for the most common case (a quarter-long
   weekly study). The user can extend or shorten on the form. */
function defaultEndDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/* Parse YYYY-MM-DD into a local-midnight Date (no timezone drift). */
function parseDate(yyyymmdd) {
  if (!yyyymmdd) return null;
  const [y, m, d] = yyyymmdd.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/* Compute every meeting date for a study, capped at
   MAX_EVENTS_PER_STUDY entries.
   - weekly / biweekly / monthly walk start→end on a fixed cadence
   - custom returns the explicit dates the user added on the form
     (de-duped, sorted, valid-format-only). */
function computeMeetingDates(startDate, endDate, schedule, customDates) {
  if (schedule === 'custom') {
    const list = Array.isArray(customDates) ? customDates : [];
    const cleaned = list
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort();
    return cleaned.slice(0, MAX_EVENTS_PER_STUDY);
  }
  if (!startDate || !schedule) return [];
  const start = parseDate(startDate);
  if (!start) return [];
  const end = parseDate(endDate);
  if (!end || end < start) return [];
  const out = [];
  const cur = new Date(start);
  while (cur <= end && out.length < MAX_EVENTS_PER_STUDY) {
    out.push(toIsoDate(cur));
    if (schedule === 'weekly')        cur.setDate(cur.getDate() + 7);
    else if (schedule === 'biweekly') cur.setDate(cur.getDate() + 14);
    else if (schedule === 'monthly')  cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  return out;
}

const DEFAULT_STUDY = () => ({
  id:                'bs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
  name:              '',
  leader:            '',
  day:               'Wednesday',
  time:              '19:00',
  location:          '',
  startDate:         new Date().toISOString().slice(0, 10),
  endDate:           defaultEndDate(),
  schedule:          'weekly',
  customDates:       [], // ['YYYY-MM-DD', ...] — only used when schedule === 'custom'
  reminderOffset:    'none',  // 'none' | 'at' | '5m' | '15m' | '30m' | '1h' | '2h' | '1d' | '2d' | '1w'
  reminderTime:      '09:00', // HH:MM — only used when offset is in days/weeks
  reminderNote:      '',      // free-text note attached to each fired notification
  files:             [], // attached files: [{ id, name, url, storagePath, size, type, uploadedAt }]
  currentBook:       '',
  currentSeries:     '',
  memberIds:         [],
  notes:             '',
  meetings:          [], // [{ id, date, attendedIds, notes }]
  calendarEventIds:  [], // ids of events this study has pushed into the Calendar
  createdAt:         Date.now(),
});

const DEFAULT_MEETING = () => ({
  id:            'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
  date:          new Date().toISOString().slice(0, 10),
  attendedIds:   [],
  notes:         '',
});

export default function BibleStudies() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const { user } = useAuth();
  const [studies, setStudies, { loading }] = useUserStoreKey('youth:bible-studies', []);
  const [students] = useUserStoreKey('youth:students', []);
  const list   = Array.isArray(studies)  ? studies  : [];
  const roster = Array.isArray(students) ? students : [];

  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => list.find(s => s.id === selectedId) || null, [list, selectedId]);

  /* Inline status for the most-recent Calendar sync action — drives
     the "Synced N meetings" / error / "Removed" banner under the
     buttons. Keyed by study id so switching studies clears it. */
  const [syncMsg, setSyncMsg] = useState(null); // { id, kind: 'ok'|'busy'|'err', text }

  /* ── Study CRUD ─────────────────────────────────────────── */
  const addStudy = () => {
    const s = DEFAULT_STUDY();
    setStudies(prev => [...(prev || []), s]);
    setSelectedId(s.id);
  };
  const updateStudy = (id, patch) => {
    setStudies(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const removeStudy = async (id) => {
    /* Best-effort: drop any calendar events this study had pushed
       BEFORE removing the study itself, so we don't leave orphans
       on the Calendar. Also delete uploaded file blobs from Storage
       (fire-and-forget — the study delete shouldn't be blocked by
       a missing file). */
    const target = list.find(s => s.id === id);
    const evIds  = Array.isArray(target?.calendarEventIds) ? target.calendarEventIds : [];
    if (evIds.length) {
      try { await calendarService.bulkDelete(evIds); } catch { /* noop */ }
    }
    const files = Array.isArray(target?.files) ? target.files : [];
    files.forEach(f => {
      if (f?.storagePath) deleteBlobAtPath(f.storagePath).catch(() => {});
    });
    setStudies(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /* Upload one or more files and append to study.files. Each file
     goes through uploadBlob which uses Firebase Storage when
     available and falls back to an inline data URL for small
     blobs when Storage is unreachable — same behavior the rest
     of the app already uses. */
  const uploadFiles = async (id, fileList) => {
    if (!user?.uid || !fileList || fileList.length === 0) return null;
    const next = [];
    let err = null;
    for (const file of Array.from(fileList)) {
      try {
        const { url, path, size, contentType } = await uploadBlob(
          user.uid,
          'youth-bible-studies',
          file,
          { filename: file.name }
        );
        next.push({
          id:           'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
          name:         file.name,
          url,
          storagePath:  path,
          size:         size || file.size,
          type:         contentType || file.type,
          uploadedAt:   Date.now(),
        });
      } catch (e) {
        // Keep going — partial uploads still get attached.
        err = e?.message || 'Upload failed.';
      }
    }
    if (next.length) {
      setStudies(prev => (prev || []).map(s => {
        if (s.id !== id) return s;
        const existing = Array.isArray(s.files) ? s.files : [];
        return { ...s, files: [...existing, ...next] };
      }));
    }
    return err;
  };

  const removeFile = async (id, fileId) => {
    const study = list.find(s => s.id === id);
    const file  = (study?.files || []).find(f => f.id === fileId);
    if (file?.storagePath) deleteBlobAtPath(file.storagePath).catch(() => {});
    setStudies(prev => (prev || []).map(s => {
      if (s.id !== id) return s;
      return { ...s, files: (s.files || []).filter(f => f.id !== fileId) };
    }));
  };

  /* Push (or re-push) this study's recurring meetings to the
     global Calendar:
       1. Delete any events we previously created for this study
       2. Generate fresh events from current start/end/schedule
       3. Save the new event ids back onto the study so future
          syncs know what to clean up. */
  const pushToCalendar = async (id) => {
    const study = list.find(s => s.id === id);
    if (!study) return;
    const dates = computeMeetingDates(study.startDate, study.endDate, study.schedule, study.customDates);
    if (dates.length === 0) {
      setSyncMsg({ id, kind: 'err',
        text: study.schedule === 'custom'
          ? 'Add at least one custom date below before pushing to the Calendar.'
          : 'Pick a start date and an end date first.',
      });
      return;
    }
    setSyncMsg({ id, kind: 'busy', text: `Syncing ${dates.length} meeting${dates.length === 1 ? '' : 's'}…` });
    try {
      /* Step 1: remove the previous batch. */
      const oldIds = Array.isArray(study.calendarEventIds) ? study.calendarEventIds : [];
      if (oldIds.length) await calendarService.bulkDelete(oldIds);
      /* Step 2: create the new batch in one round-trip. */
      const payloads = dates.map(date => ({
        title:           study.name || 'Bible Study',
        description:     [study.leader && `Led by ${study.leader}`, study.location, study.currentBook]
                         .filter(Boolean).join(' · '),
        event_date:      date,
        event_time:      study.time || '',
        end_date:        '',
        color:           CAL_COLOR,
        category:        CAL_SOURCE,
        source:          CAL_SOURCE,
        source_id:       study.id,
        reminder_offset: study.reminderOffset || 'none',
        reminder_time:   study.reminderTime   || '',
        reminder_note:   study.reminderNote   || '',
      }));
      const res = await calendarService.bulkCreate(payloads);
      const created = res?.data?.data || [];
      const newIds = created.map(e => e.id);
      updateStudy(id, { calendarEventIds: newIds });
      setSyncMsg({ id, kind: 'ok',
        text: `Synced ${newIds.length} meeting${newIds.length === 1 ? '' : 's'} to your Calendar.`,
      });
    } catch (err) {
      setSyncMsg({ id, kind: 'err', text: 'Sync failed: ' + (err?.message || 'unknown error') });
    }
  };

  /* Remove every Calendar event this study created — leaves the
     study itself in place. */
  const removeFromCalendar = async (id) => {
    const study = list.find(s => s.id === id);
    if (!study) return;
    const ids = Array.isArray(study.calendarEventIds) ? study.calendarEventIds : [];
    if (ids.length === 0) {
      setSyncMsg({ id, kind: 'ok', text: 'No Calendar events to remove.' });
      return;
    }
    setSyncMsg({ id, kind: 'busy', text: `Removing ${ids.length} event${ids.length === 1 ? '' : 's'}…` });
    try {
      await calendarService.bulkDelete(ids);
      updateStudy(id, { calendarEventIds: [] });
      setSyncMsg({ id, kind: 'ok', text: 'Removed from Calendar.' });
    } catch (err) {
      setSyncMsg({ id, kind: 'err', text: 'Removal failed: ' + (err?.message || 'unknown error') });
    }
  };

  /* ── Member toggle ──────────────────────────────────────── */
  const toggleMember = (id, studentId) => {
    setStudies(prev => (prev || []).map(s => {
      if (s.id !== id) return s;
      const members = Array.isArray(s.memberIds) ? s.memberIds : [];
      const has = members.includes(studentId);
      return { ...s, memberIds: has ? members.filter(x => x !== studentId) : [...members, studentId] };
    }));
  };

  /* ── Meeting CRUD ───────────────────────────────────────── */
  const addMeeting = (id) => {
    const m = DEFAULT_MEETING();
    setStudies(prev => (prev || []).map(s =>
      s.id === id ? { ...s, meetings: [...(s.meetings || []), m] } : s
    ));
  };
  const updateMeeting = (studyId, meetingId, patch) => {
    setStudies(prev => (prev || []).map(s => {
      if (s.id !== studyId) return s;
      return {
        ...s,
        meetings: (s.meetings || []).map(m => m.id === meetingId ? { ...m, ...patch } : m),
      };
    }));
  };
  const removeMeeting = (studyId, meetingId) => {
    setStudies(prev => (prev || []).map(s => {
      if (s.id !== studyId) return s;
      return { ...s, meetings: (s.meetings || []).filter(m => m.id !== meetingId) };
    }));
  };
  const toggleAttendance = (studyId, meetingId, studentId) => {
    setStudies(prev => (prev || []).map(s => {
      if (s.id !== studyId) return s;
      return {
        ...s,
        meetings: (s.meetings || []).map(m => {
          if (m.id !== meetingId) return m;
          const attended = Array.isArray(m.attendedIds) ? m.attendedIds : [];
          const has = attended.includes(studentId);
          return { ...m, attendedIds: has ? attended.filter(x => x !== studentId) : [...attended, studentId] };
        }),
      };
    }));
  };

  /* Map of studentId → name for quick lookups. */
  const studentName = useMemo(() => {
    const m = {};
    roster.forEach(s => { m[s.id] = s.name || '(unnamed)'; });
    return m;
  }, [roster]);

  return (
    <YouthShell
      groupLabel="Students" groupIcon="👥"
      icon="📖" title="Bible Studies"
      subtitle="Members are picked from the roster on the All Students page."
      accent={ACCENT}
      actions={
        <button type="button" className="yb-add-btn" onClick={addStudy}>
          ＋ Add study
        </button>
      }
      stats={[
        { n: list.length, label: list.length === 1 ? 'study' : 'studies' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yb-shell">

          <section className="yb-body">

            {/* Left: study list */}
            <aside className="yb-list-pane">
              {loading && list.length === 0 && <div className="yb-list-empty">Loading…</div>}
              {!loading && list.length === 0 && (
                <div className="yb-list-empty">
                  No studies yet. Click <b>＋ Add study</b> to create one.
                </div>
              )}
              {list.map(s => {
                const isOn = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`yb-row${isOn ? ' on' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="yb-row-icon" aria-hidden="true">📖</span>
                    <span className="yb-row-info">
                      <span className="yb-row-name">{s.name || '(untitled study)'}</span>
                      <span className="yb-row-sub">
                        {s.day} {s.time ? `· ${s.time}` : ''}
                        {s.leader ? ` · ${s.leader}` : ''}
                      </span>
                      {(s.schedule || s.startDate) && (
                        <span className="yb-row-sub yb-row-sched">
                          {s.schedule === 'custom'
                            ? (s.scheduleCustom || 'Custom')
                            : (SCHEDULE_LABEL[s.schedule] || 'Every week')}
                          {s.startDate ? ` · starts ${s.startDate}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="yb-row-count" title="Members">
                      {(s.memberIds || []).length}
                    </span>
                  </button>
                );
              })}
            </aside>

            {/* Right: study detail */}
            <section className="yb-detail">
              {!selected ? (
                <div className="yb-empty">
                  <div className="yb-empty-icon" aria-hidden="true">📖</div>
                  <h2 className="yb-empty-title">Pick a Bible study</h2>
                  <p className="yb-empty-copy">
                    Select one from the list or click <b>＋ Add study</b> to start a new one.
                  </p>
                </div>
              ) : (
                <StudyDetail
                  key={selected.id}
                  study={selected}
                  roster={roster}
                  studentName={studentName}
                  syncMsg={syncMsg?.id === selected.id ? syncMsg : null}
                  onChange={(patch) => { updateStudy(selected.id, patch); setSyncMsg(null); }}
                  onDelete={() => removeStudy(selected.id)}
                  onToggleMember={(sid) => toggleMember(selected.id, sid)}
                  onAddMeeting={() => addMeeting(selected.id)}
                  onUpdateMeeting={(mid, patch) => updateMeeting(selected.id, mid, patch)}
                  onRemoveMeeting={(mid) => removeMeeting(selected.id, mid)}
                  onToggleAttendance={(mid, sid) => toggleAttendance(selected.id, mid, sid)}
                  onPushToCalendar={() => pushToCalendar(selected.id)}
                  onRemoveFromCalendar={() => removeFromCalendar(selected.id)}
                  onUploadFiles={(fileList) => uploadFiles(selected.id, fileList)}
                  onRemoveFile={(fileId) => removeFile(selected.id, fileId)}
                />
              )}
            </section>
          </section>

      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}

/* ── Study detail (form + members + meetings) ──────────────── */
function StudyDetail({
  study, roster, studentName, syncMsg,
  onChange, onDelete,
  onToggleMember,
  onAddMeeting, onUpdateMeeting, onRemoveMeeting, onToggleAttendance,
  onPushToCalendar, onRemoveFromCalendar,
  onUploadFiles, onRemoveFile,
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [tab, setTab] = useState('info');  // 'info' | 'members' | 'meetings'

  const set = (field) => (e) => onChange({ [field]: e?.target ? e.target.value : e });
  const members = Array.isArray(study.memberIds) ? study.memberIds : [];
  const meetings = Array.isArray(study.meetings) ? study.meetings : [];
  const sortedRoster = [...roster].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedMeetings = [...meetings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  /* Preview how many calendar events the current schedule would
     create. Used to label the Push button + warn when the
     schedule is custom (which can't be auto-generated). */
  const previewDates = useMemo(
    () => computeMeetingDates(study.startDate, study.endDate, study.schedule, study.customDates),
    [study.startDate, study.endDate, study.schedule, study.customDates]
  );
  const calEventIds = Array.isArray(study.calendarEventIds) ? study.calendarEventIds : [];

  return (
    <form className="yb-form" onSubmit={(e) => e.preventDefault()}>
      <div className="yb-form-head">
        <h2 className="yb-form-title">{study.name || '(untitled)'}</h2>
        <button
          type="button"
          className={`yb-del-btn${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onDelete(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >
          {confirmDel ? 'Click again to delete' : '🗑 Delete'}
        </button>
      </div>

      <div className="yb-tabs">
        <button type="button" className={`yb-tab${tab === 'info' ? ' on' : ''}`} onClick={() => setTab('info')}>Info</button>
        <button type="button" className={`yb-tab${tab === 'members' ? ' on' : ''}`} onClick={() => setTab('members')}>
          Members <span className="yb-tab-count">{members.length}</span>
        </button>
        <button type="button" className={`yb-tab${tab === 'meetings' ? ' on' : ''}`} onClick={() => setTab('meetings')}>
          Meetings <span className="yb-tab-count">{meetings.length}</span>
        </button>
      </div>

      {tab === 'info' && (
        <div className="yb-fields">
          <Row>
            <Field label="Name">
              <input type="text" className="yb-inp" value={study.name || ''} onChange={set('name')} placeholder="e.g. Wednesday Night Study" />
            </Field>
            <Field label="Leader">
              <input type="text" className="yb-inp" value={study.leader || ''} onChange={set('leader')} />
            </Field>
          </Row>
          <Row>
            <Field label="Day">
              <select className="yb-inp" value={study.day || ''} onChange={set('day')}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Time">
              <input type="time" className="yb-inp" value={study.time || ''} onChange={set('time')} />
            </Field>
            <Field label="Location">
              <input type="text" className="yb-inp" value={study.location || ''} onChange={set('location')} placeholder="Room / address" />
            </Field>
          </Row>
          <Row>
            <Field label="Start date">
              <input
                type="date"
                className="yb-inp"
                value={study.startDate || ''}
                onChange={set('startDate')}
                title="When the study (or current series) kicked off"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className="yb-inp"
                value={study.endDate || ''}
                onChange={set('endDate')}
                title="When the study (or current series) wraps up"
              />
            </Field>
            <Field label="Schedule">
              <select
                className="yb-inp"
                value={study.schedule || 'weekly'}
                onChange={set('schedule')}
              >
                {SCHEDULES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </Row>
          {study.schedule === 'custom' && (
            <CustomDatesPicker
              dates={Array.isArray(study.customDates) ? study.customDates : []}
              onChange={(next) => onChange({ customDates: next })}
            />
          )}

          {/* Notify Reminder — fires a notification before each
              meeting. Stored on every Calendar event this study
              pushes, so the Notification Bell (and the NavRail
              badge) can surface them at the right time. */}
          <div className="yb-remind">
            <div className="yb-remind-head">
              <span className="yb-remind-title">🔔 Notify Reminder</span>
            </div>
            <p className="yb-remind-hint">
              Pick when to be reminded before each meeting. The reminder
              syncs to your Calendar and shows up on the 🔔 Notification
              Bell when it's time.
            </p>
            <Row>
              <Field label="When">
                <select
                  className="yb-inp"
                  value={study.reminderOffset || 'none'}
                  onChange={set('reminderOffset')}
                >
                  {REMINDER_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              {isDayLevel(study.reminderOffset) && (
                <Field label="At time">
                  <input
                    type="time"
                    className="yb-inp"
                    value={study.reminderTime || '09:00'}
                    onChange={set('reminderTime')}
                    title="What time of day the reminder fires"
                  />
                </Field>
              )}
            </Row>
            <Field label="Reminder note (optional)">
              <textarea
                className="yb-inp yb-textarea"
                rows={2}
                value={study.reminderNote || ''}
                onChange={set('reminderNote')}
                placeholder="e.g. Bring extra Bibles · Remind kids to RSVP · Pray for hosts"
                disabled={!study.reminderOffset || study.reminderOffset === 'none'}
              />
            </Field>
            {study.reminderOffset && study.reminderOffset !== 'none' && (
              <p className="yb-remind-foot">
                Note: reminders on existing Calendar events stay frozen.
                Re-sync below to push your latest reminder choice (and
                this note) to every meeting.
              </p>
            )}
          </div>

          {/* Calendar sync panel — pushes the study's recurring
              meetings into the global Calendar with one click. */}
          <div className="yb-calsync">
            <div className="yb-calsync-head">
              <span className="yb-calsync-title">📅 Calendar sync</span>
              {calEventIds.length > 0 && (
                <span className="yb-calsync-badge">
                  {calEventIds.length} event{calEventIds.length === 1 ? '' : 's'} on Calendar
                </span>
              )}
            </div>
            <p className="yb-calsync-hint">
              {previewDates.length === 0
                ? (study.schedule === 'custom'
                    ? 'Add at least one custom date below to enable Calendar sync.'
                    : 'Pick a start date AND an end date to enable Calendar sync.')
                : `This will create ${previewDates.length} event${previewDates.length === 1 ? '' : 's'} on your Calendar from ${previewDates[0]} through ${previewDates[previewDates.length - 1]}.`
              }
            </p>
            <div className="yb-calsync-actions">
              <button
                type="button"
                className="yb-calsync-push"
                onClick={onPushToCalendar}
                disabled={previewDates.length === 0}
              >
                {calEventIds.length > 0 ? '🔄 Re-sync to Calendar' : '📅 Push to Calendar'}
              </button>
              {calEventIds.length > 0 && (
                <button
                  type="button"
                  className="yb-calsync-remove"
                  onClick={onRemoveFromCalendar}
                >🗑 Remove from Calendar</button>
              )}
            </div>
            {syncMsg && (
              <div className={`yb-calsync-msg yb-calsync-msg-${syncMsg.kind}`}>
                {syncMsg.text}
              </div>
            )}
          </div>
          <Row>
            <Field label="Current book">
              <input type="text" className="yb-inp" value={study.currentBook || ''} onChange={set('currentBook')} placeholder="e.g. Romans" />
            </Field>
            <Field label="Current series">
              <input type="text" className="yb-inp" value={study.currentSeries || ''} onChange={set('currentSeries')} placeholder="e.g. Walking in Faith" />
            </Field>
          </Row>
          <Field label="Notes">
            <textarea className="yb-inp yb-textarea" rows={4} value={study.notes || ''} onChange={set('notes')} />
          </Field>

          <FilesUploader
            files={Array.isArray(study.files) ? study.files : []}
            onUpload={onUploadFiles}
            onRemove={onRemoveFile}
          />
        </div>
      )}

      {tab === 'members' && (
        <div className="yb-members">
          {sortedRoster.length === 0 ? (
            <div className="yb-empty-mini">
              No students in your roster yet. Add students on the
              All Students page first, then come back here to assign them.
            </div>
          ) : (
            <>
              <p className="yb-helper">Tap a student to toggle their membership.</p>
              <div className="yb-member-grid">
                {sortedRoster.map(s => {
                  const on = members.includes(s.id);
                  return (
                    <label key={s.id} className={`yb-member${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        className="yb-check"
                        checked={on}
                        onChange={() => onToggleMember(s.id)}
                      />
                      <span className="yb-member-avatar">{(s.name || '?').charAt(0).toUpperCase()}</span>
                      <span className="yb-member-name">{s.name || '(unnamed)'}</span>
                      {s.grade && <span className="yb-member-grade">{s.grade}</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'meetings' && (
        <div className="yb-meetings">
          <div className="yb-meetings-head">
            <p className="yb-helper">Log a meeting, take attendance, save discussion notes.</p>
            <button type="button" className="yb-mini-add" onClick={onAddMeeting}>＋ Log meeting</button>
          </div>
          {sortedMeetings.length === 0 ? (
            <div className="yb-empty-mini">No meetings logged yet.</div>
          ) : (
            <div className="yb-meeting-list">
              {sortedMeetings.map(m => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  members={members}
                  studentName={studentName}
                  onUpdate={(patch) => onUpdateMeeting(m.id, patch)}
                  onRemove={() => onRemoveMeeting(m.id)}
                  onToggleAttendance={(sid) => onToggleAttendance(m.id, sid)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function MeetingCard({ meeting, members, studentName, onUpdate, onRemove, onToggleAttendance }) {
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const attended = Array.isArray(meeting.attendedIds) ? meeting.attendedIds : [];
  return (
    <div className={`yb-meeting${open ? ' open' : ''}`}>
      <header className="yb-meeting-head">
        <input
          type="date"
          className="yb-inp yb-meeting-date"
          value={meeting.date || ''}
          onChange={(e) => onUpdate({ date: e.target.value })}
        />
        <span className="yb-meeting-att">
          {attended.length} / {members.length} attended
        </span>
        <button type="button" className="yb-mini-btn" onClick={() => setOpen(o => !o)}>
          {open ? 'Collapse' : 'Expand'}
        </button>
        <button
          type="button"
          className={`yb-mini-del${confirmDel ? ' armed' : ''}`}
          onClick={() => {
            if (confirmDel) { onRemove(); return; }
            setConfirmDel(true);
            setTimeout(() => setConfirmDel(false), 3500);
          }}
        >{confirmDel ? '×?' : '×'}</button>
      </header>

      {open && (
        <div className="yb-meeting-body">
          <div className="yb-att-grid">
            {members.length === 0 ? (
              <div className="yb-empty-mini">Add members on the Members tab first.</div>
            ) : members.map(sid => {
              const on = attended.includes(sid);
              return (
                <label key={sid} className={`yb-att${on ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    className="yb-check"
                    checked={on}
                    onChange={() => onToggleAttendance(sid)}
                  />
                  <span>{studentName[sid] || '(removed)'}</span>
                </label>
              );
            })}
          </div>
          <label className="yb-field-stack">
            <span className="yb-field-lbl">Discussion notes</span>
            <textarea
              className="yb-inp yb-textarea"
              rows={4}
              value={meeting.notes || ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Row({ children })  { return <div className="yb-row-fields">{children}</div>; }
function Field({ label, children }) {
  return (
    <label className="yb-field">
      <span className="yb-field-lbl">{label}</span>
      {children}
    </label>
  );
}

/* ── File uploader ─────────────────────────────────────────
   Multi-file upload + list at the bottom of the Bible Study
   form. Uploads route through lib/userStorage.uploadBlob, which
   transparently falls back to inline data URLs for small files
   when Firebase Storage is unreachable. */
function FilesUploader({ files, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const list = Array.isArray(files) ? files : [];

  const pick = () => inputRef.current?.click();

  const handle = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const errMsg = await onUpload(fileList);
      if (errMsg) setErr(errMsg);
    } catch (uploadErr) {
      setErr(uploadErr?.message || 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';   // allow re-selecting same file
    }
  };

  return (
    <div className="yb-files">
      <div className="yb-files-head">
        <span className="yb-files-title">📎 Files</span>
        <span className="yb-files-count">
          {list.length} {list.length === 1 ? 'file' : 'files'}
        </span>
      </div>
      <p className="yb-files-hint">
        Upload handouts, study guides, slides, audio, anything you want
        attached to this Bible Study. Multiple files can be picked at once.
      </p>

      <div className="yb-files-add">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={handle}
        />
        <button
          type="button"
          className="yb-files-btn"
          onClick={pick}
          disabled={busy}
        >
          {busy ? 'Uploading…' : '⬆ Upload files'}
        </button>
        {err && <span className="yb-files-err">{err}</span>}
      </div>

      {list.length > 0 && (
        <ul className="yb-files-list">
          {list.map(f => (
            <li key={f.id} className="yb-file">
              <span className="yb-file-icon" aria-hidden="true">{fileIcon(f.type, f.name)}</span>
              <a
                className="yb-file-name"
                href={f.url}
                download={f.name}
                target="_blank"
                rel="noreferrer"
                title="Open / download"
              >
                {f.name || '(unnamed file)'}
              </a>
              <span className="yb-file-size">{prettySize(f.size)}</span>
              <button
                type="button"
                className="yb-file-x"
                onClick={() => onRemove(f.id)}
                title="Remove this file"
              >×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fileIcon(type, name) {
  const t = (type || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (t.startsWith('image/')) return '🖼';
  if (t.startsWith('audio/')) return '🎵';
  if (t.startsWith('video/')) return '🎬';
  if (/pdf/.test(t) || /\.pdf$/.test(n)) return '📕';
  if (/word|docx?/.test(t) || /\.docx?$/.test(n)) return '📘';
  if (/excel|sheet|xlsx?|csv/.test(t) || /\.(xlsx?|csv)$/.test(n)) return '📗';
  if (/powerpoint|presentation|pptx?/.test(t) || /\.pptx?$/.test(n)) return '📙';
  if (/zip|compressed/.test(t) || /\.zip$/.test(n)) return '🗜';
  if (/text/.test(t) || /\.(txt|md)$/.test(n)) return '📝';
  return '📄';
}
function prettySize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/* ── Custom dates picker ───────────────────────────────────
   Used when schedule === 'custom'. The user picks individual
   dates here; those exact dates become the meeting list that
   gets pushed to the Calendar. */
function CustomDatesPicker({ dates, onChange }) {
  const [draft, setDraft] = useState('');
  const list = Array.isArray(dates) ? dates : [];
  const sorted = useMemo(
    () => [...list].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort(),
    [list]
  );

  const addDraft = () => {
    if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft)) return;
    if (list.includes(draft)) { setDraft(''); return; }
    onChange([...list, draft]);
    setDraft('');
  };
  const removeDate = (d) => onChange(list.filter(x => x !== d));
  const clearAll   = () => onChange([]);

  return (
    <div className="yb-cdates">
      <div className="yb-cdates-head">
        <span className="yb-cdates-title">Custom meeting dates</span>
        <span className="yb-cdates-count">
          {sorted.length} date{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="yb-cdates-hint">
        Add each meeting date individually. These exact dates are what
        gets pushed to the Calendar when you sync.
      </p>
      <div className="yb-cdates-add">
        <input
          type="date"
          className="yb-inp"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }}
        />
        <button
          type="button"
          className="yb-cdates-add-btn"
          onClick={addDraft}
          disabled={!draft}
        >＋ Add</button>
        {sorted.length > 0 && (
          <button
            type="button"
            className="yb-cdates-clear"
            onClick={clearAll}
            title="Remove every custom date"
          >Clear</button>
        )}
      </div>
      {sorted.length > 0 && (
        <div className="yb-cdates-list">
          {sorted.map(d => (
            <span key={d} className="yb-cdates-chip">
              <span className="yb-cdates-chip-date">{d}</span>
              <button
                type="button"
                className="yb-cdates-chip-x"
                onClick={() => removeDate(d)}
                title="Remove this date"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
