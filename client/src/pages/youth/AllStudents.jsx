import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import { useUserStoreKey } from '../../lib/userStore';
import './AllStudents.css';

/* ─────────────────────────────────────────────────────────────
   Youth → All Students

   Source of truth for the Youth roster. Bible Studies pulls
   members from this list and the Visitors pipeline filters
   it down to people whose visitorStatus is not empty / 'connected'.

   Storage: useUserStoreKey('youth:students', []) → Firestore.
   Each student is a plain object — see DEFAULT_STUDENT below
   for the field shape.
   ───────────────────────────────────────────────────────────── */

/* Matches the Youth Ministry students-group accent (see youthConfig.js). */
const ACCENT = '#b45309';

const GRADES = [
  '6th', '7th', '8th', '9th', '10th', '11th', '12th', 'College', 'Other',
];

const VISITOR_STATUSES = [
  { id: '',          label: 'Not a visitor'    },
  { id: 'new',       label: '🆕 New'           },
  { id: 'contacted', label: '☎️ Contacted'     },
  { id: 'returned',  label: '🔁 Returned'      },
  { id: 'connected', label: '🤝 Connected'     },
];

const DEFAULT_STUDENT = () => ({
  id:                'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
  name:              '',
  grade:             '',
  school:            '',
  birthday:          '',
  phone:             '',
  email:             '',
  parentName:        '',
  parentPhone:       '',
  parentEmail:       '',
  preferredLanguage: '',           // 'English' | 'Spanish' | '' — drives Parents-page multilingual swap
  emergencyContact:  '',
  allergies:         '',
  notes:             '',
  joinedDate:        new Date().toISOString().slice(0, 10),
  salvationDate:     '',
  baptismDate:       '',
  visitorStatus:     '',
  visitorAssignedTo: '',
  visitorNotes:      '',
  /* Attendance tracking — populated by the WeeklyNights attendance
     checklist; powers the Parent-page pastoral nudges (first-time
     welcome, "we missed you" 4+ weeks). */
  firstAttended:     '',
  lastAttended:      '',
  /* Pastoral status — when 'flagged', this family gets gentler
     comms (excluded from auto-pastoral nudges) and surfaces under
     a dedicated "needs care" nudge instead. */
  crisisStatus:      '',           // '' | 'flagged'
  crisisNote:        '',           // private note (divorce, illness…)
  createdAt:         Date.now(),
});

export default function AllStudents() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [students, setStudents, { loading }] = useUserStoreKey('youth:students', []);
  const list = Array.isArray(students) ? students : [];

  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'grade' | 'joined'

  /* Derived: filtered + sorted list shown in the left column. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? list.filter(s =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.school || '').toLowerCase().includes(q) ||
          (s.parentName || '').toLowerCase().includes(q))
      : list;
    out = [...out];
    if (sortBy === 'name')   out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (sortBy === 'grade')  out.sort((a, b) => GRADES.indexOf(a.grade || '') - GRADES.indexOf(b.grade || ''));
    if (sortBy === 'joined') out.sort((a, b) => (b.joinedDate || '').localeCompare(a.joinedDate || ''));
    return out;
  }, [list, query, sortBy]);

  const selected = useMemo(
    () => list.find(s => s.id === selectedId) || null,
    [list, selectedId]
  );

  /* ── Actions ────────────────────────────────────────────── */
  const addStudent = () => {
    const stu = DEFAULT_STUDENT();
    setStudents(prev => [...(prev || []), stu]);
    setSelectedId(stu.id);
  };

  const updateStudent = (id, patch) => {
    setStudents(prev => (prev || []).map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeStudent = (id) => {
    setStudents(prev => (prev || []).filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /* Quick stats for the header. */
  const stats = useMemo(() => ({
    total:    list.length,
    visitors: list.filter(s => s.visitorStatus && s.visitorStatus !== 'connected').length,
  }), [list]);

  return (
    <YouthShell
      groupLabel="Students" groupIcon="👥"
      icon="🧒" title="All Students"
      accent={ACCENT}
      actions={
        <button type="button" className="ys-add-btn" onClick={addStudent}>
          ＋ Add student
        </button>
      }
      stats={[
        { n: stats.total, label: 'total' },
        { n: stats.visitors, label: 'in visitor pipeline' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="ys-shell">

          {/* Two-pane body: list on the left, detail on the right */}
          <section className="ys-body">

            {/* Left: list */}
            <aside className="ys-list-pane">
              <div className="ys-list-tools">
                <input
                  type="text"
                  className="ys-search"
                  placeholder="Search by name, school, parent…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <select
                  className="ys-sort"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  title="Sort"
                >
                  <option value="name">Name (A–Z)</option>
                  <option value="grade">Grade</option>
                  <option value="joined">Recently joined</option>
                </select>
              </div>

              <div className="ys-list">
                {loading && list.length === 0 && (
                  <div className="ys-list-empty">Loading…</div>
                )}
                {!loading && visible.length === 0 && (
                  <div className="ys-list-empty">
                    {list.length === 0
                      ? 'No students yet. Click "＋ Add student" to start your roster.'
                      : 'No matches for your search.'}
                  </div>
                )}
                {visible.map(s => {
                  const isOn = selectedId === s.id;
                  const isVisitor = s.visitorStatus && s.visitorStatus !== 'connected';
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`ys-row${isOn ? ' on' : ''}`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <span className="ys-row-avatar" aria-hidden="true">
                        {(s.name || '?').trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span className="ys-row-info">
                        <span className="ys-row-name">{s.name || '(no name)'}</span>
                        <span className="ys-row-sub">
                          {s.grade ? `${s.grade}${s.school ? ' · ' + s.school : ''}` : (s.school || '—')}
                        </span>
                      </span>
                      {isVisitor && (
                        <span className="ys-row-tag">VISITOR</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right: detail / editor */}
            <section className="ys-detail">
              {!selected ? (
                <div className="ys-empty">
                  <div className="ys-empty-icon" aria-hidden="true">🧒</div>
                  <h2 className="ys-empty-title">Pick a student</h2>
                  <p className="ys-empty-copy">
                    Select someone from the list to view + edit their info, or
                    click <b>＋ Add student</b> above to create a new entry.
                  </p>
                </div>
              ) : (
                <StudentForm
                  key={selected.id}
                  student={selected}
                  onChange={(patch) => updateStudent(selected.id, patch)}
                  onDelete={() => removeStudent(selected.id)}
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

/* ── Detail / edit form for one student ────────────────────── */
function StudentForm({ student, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (field) => (e) => {
    const val = e?.target ? e.target.value : e;
    onChange({ [field]: val });
  };

  return (
    <form className="ys-form" onSubmit={(e) => e.preventDefault()}>
      <div className="ys-form-head">
        <h2 className="ys-form-title">{student.name || '(unnamed)'}</h2>
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

      <Section title="Basics">
        <Row>
          <Field label="Name">
            <input type="text" className="ys-inp" value={student.name || ''} onChange={set('name')} />
          </Field>
          <Field label="Grade">
            <select className="ys-inp" value={student.grade || ''} onChange={set('grade')}>
              <option value="">—</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="School">
            <input type="text" className="ys-inp" value={student.school || ''} onChange={set('school')} />
          </Field>
          <Field label="Birthday">
            <input type="date" className="ys-inp" value={student.birthday || ''} onChange={set('birthday')} />
          </Field>
        </Row>
      </Section>

      <Section title="Contact">
        <Row>
          <Field label="Phone">
            <input type="tel" className="ys-inp" value={student.phone || ''} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <input type="email" className="ys-inp" value={student.email || ''} onChange={set('email')} />
          </Field>
        </Row>
      </Section>

      <Section title="Parent / Guardian">
        <Row>
          <Field label="Name">
            <input type="text" className="ys-inp" value={student.parentName || ''} onChange={set('parentName')} />
          </Field>
        </Row>
        <Row>
          <Field label="Phone">
            <input type="tel" className="ys-inp" value={student.parentPhone || ''} onChange={set('parentPhone')} />
          </Field>
          <Field label="Email">
            <input type="email" className="ys-inp" value={student.parentEmail || ''} onChange={set('parentEmail')} />
          </Field>
        </Row>
        <Row>
          <Field label="Preferred language">
            <select
              className="ys-inp"
              value={student.preferredLanguage || ''}
              onChange={set('preferredLanguage')}
              title="When set + a matching translation exists, personalized parent broadcasts use that language version"
            >
              <option value="">— (default)</option>
              <option value="English">🇺🇸 English</option>
              <option value="Spanish">🇪🇸 Español</option>
            </select>
          </Field>
        </Row>
        {/* Quick jump to the Parent Communication page with this
            student's household pre-locked as the recipient. Disabled
            when there's no contact info to message. */}
        <MessageParentButton student={student} />
        <Row>
          <Field label="Emergency contact">
            <input type="text" className="ys-inp" value={student.emergencyContact || ''} onChange={set('emergencyContact')} placeholder="Name + phone" />
          </Field>
        </Row>
      </Section>

      <Section title="Medical">
        <Field label="Allergies & medical notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={student.allergies || ''} onChange={set('allergies')} />
        </Field>
      </Section>

      <Section title="Milestones">
        <Row>
          <Field label="Joined">
            <input type="date" className="ys-inp" value={student.joinedDate || ''} onChange={set('joinedDate')} />
          </Field>
          <Field label="Salvation">
            <input type="date" className="ys-inp" value={student.salvationDate || ''} onChange={set('salvationDate')} />
          </Field>
          <Field label="Baptism">
            <input type="date" className="ys-inp" value={student.baptismDate || ''} onChange={set('baptismDate')} />
          </Field>
        </Row>
      </Section>

      <Section title="Attendance">
        <Row>
          <Field label="First attended">
            <input type="date" className="ys-inp" value={student.firstAttended || ''} onChange={set('firstAttended')} />
          </Field>
          <Field label="Last attended">
            <input type="date" className="ys-inp" value={student.lastAttended || ''} onChange={set('lastAttended')} />
          </Field>
        </Row>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6b5d47)', fontStyle: 'italic', marginTop: 6 }}>
          Auto-updated when you mark attendance on a Weekly Night. Powers the Parent-page "newcomer" and "we missed you" pastoral nudges.
        </div>
      </Section>

      <Section title="Pastoral care">
        <Row>
          <Field label="Care status">
            <select
              className="ys-inp"
              value={student.crisisStatus || ''}
              onChange={set('crisisStatus')}
              title="Flag families going through a hard season — they're excluded from auto-pastoral nudges and surface under a dedicated 'needs care' nudge instead"
            >
              <option value="">Normal</option>
              <option value="flagged">⚠️ Needs extra care</option>
            </select>
          </Field>
        </Row>
        {student.crisisStatus === 'flagged' && (
          <Field label="Private note (only visible here)">
            <textarea
              className="ys-inp ys-textarea"
              rows={2}
              value={student.crisisNote || ''}
              onChange={set('crisisNote')}
              placeholder="Divorce, illness, job loss — context for follow-ups."
            />
          </Field>
        )}
      </Section>

      <Section title="Visitor pipeline">
        <Row>
          <Field label="Status">
            <select className="ys-inp" value={student.visitorStatus || ''} onChange={set('visitorStatus')}>
              {VISITOR_STATUSES.map(v => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned to">
            <input type="text" className="ys-inp" value={student.visitorAssignedTo || ''} onChange={set('visitorAssignedTo')} placeholder="Host or leader" />
          </Field>
        </Row>
        <Field label="Follow-up notes">
          <textarea className="ys-inp ys-textarea" rows={2} value={student.visitorNotes || ''} onChange={set('visitorNotes')} />
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="General notes">
          <textarea className="ys-inp ys-textarea" rows={3} value={student.notes || ''} onChange={set('notes')} />
        </Field>
      </Section>
    </form>
  );
}

/* Quick jump to the Parent Communication page with this student's
   household pre-locked as the recipient. The Parents page reads
   ?studentId=<id> on mount and clears the param after consuming it. */
function MessageParentButton({ student }) {
  const navigate = useNavigate();
  const hasContact = !!(student.parentEmail || student.email || student.parentPhone || student.phone);
  const hasEmail   = !!(student.parentEmail || student.email);
  const isNewVisitor = student.visitorStatus === 'new';
  return (
    <div className="ys-row-fields ys-msg-parent-row">
      <div className="ys-msg-parent-btn-wrap">
        <button
          type="button"
          className="ys-msg-parent-btn"
          disabled={!hasContact}
          onClick={() => navigate(`/youth/parents?studentId=${encodeURIComponent(student.id)}`)}
          title={hasContact
            ? `Open the Parent Communication composer pre-filled for ${student.parentName || (student.name + "'s parent")}`
            : 'Add a parent email or phone first'}
        >
          📧 Message this parent
        </button>
        {/* Tier-3 #1: auto-schedule the 4-step new-visitor welcome
            sequence (Day 0 / 3 / 14 / 30). Only shows for visitors
            with email since the sequence is email-only by default. */}
        {isNewVisitor && hasEmail && (
          <button
            type="button"
            className="ys-msg-parent-btn ys-welcome-btn"
            onClick={() => navigate(`/youth/parents?welcomeFor=${encodeURIComponent(student.id)}`)}
            title="Auto-schedule a 4-message onboarding series (Today → +3d → +14d → +30d) for this new visitor"
          >
            🚀 Start welcome sequence
          </button>
        )}
      </div>
      {!hasContact && (
        <span className="ys-msg-parent-hint">Add a parent email or phone to enable.</span>
      )}
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
