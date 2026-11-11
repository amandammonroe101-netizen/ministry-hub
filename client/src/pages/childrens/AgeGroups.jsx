import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import { useBands, COMMON_RATIOS, makeBand } from './bandsConfig';
import './_shared.css';
import './AgeGroups.css';

/* Children's → Age Groups
   Derived view from childrens:kids + childrens:rooms.
   Each age band gets a card with a clear at-a-glance status,
   capacity + ratio bars, allergy/med callouts, and a collapsed
   "Room setup" section that opens only when you need to edit it. */

const ACCENT = 'var(--accent-blue, #60a5fa)';
const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* DEFAULT_ROOM accepts a full BAND object so it can pick up the
   band-specific default ratio (and any future band-driven defaults
   like target capacity). Falls back to safe values for unknown
   bands (e.g. orphaned rooms during a rename). */
const DEFAULT_ROOM = (band) => ({
  id:               makeId('rm'),
  band:             band?.label || '',
  roomName:         '',
  capacity:         20,
  ratio:            band?.defaultRatio || '1:10',
  leadName:         '',
  leadPhone:        '',
  helperCount:      0,
  currentLessonId:  '',                  // links to childrens:lessons (optional)
  notes:            '',
});

/* Split a free-text list ("peanut, dairy; gluten") on the common
   separators and trim. Lower-cased before dedupe so "Peanut" and
   "peanut" collapse into one. */
const splitList = (str) =>
  (str || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
const splitListLC = (str) =>
  splitList(str).map(s => s.toLowerCase());

/* Local YYYY-MM-DD helpers (avoiding the UTC drift trap). */
const pad2 = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayLocal = () => isoLocal(new Date());

/** The last N Sundays as YYYY-MM-DD strings, oldest first. */
function lastNSundays(n, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  /* Walk back to the most-recent Sunday on or before today. */
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(isoLocal(d));
    d.setDate(d.getDate() - 7);
  }
  return out;
}

/** Compute age in years on a target date (or today). Parses
 *  YYYY-MM-DD as local midnight to dodge the UTC drift bug. */
function ageOn(birthdayIso, atDate = new Date()) {
  if (!birthdayIso) return null;
  const m = String(birthdayIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const dob = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dob.getTime())) return null;
  let age = atDate.getFullYear() - dob.getFullYear();
  const passed = atDate.getMonth() > dob.getMonth() ||
    (atDate.getMonth() === dob.getMonth() && atDate.getDate() >= dob.getDate());
  if (!passed) age--;
  return age;
}

/** Default promotion target = next September 1 (US school-year
 *  rollover). If we're already past September, use the following
 *  year so the "by [date]" framing always reads as forward-looking. */
function nextPromotionTarget(today = new Date()) {
  const sep1ThisYear = new Date(today.getFullYear(), 8, 1);
  if (today.getTime() < sep1ThisYear.getTime()) return sep1ThisYear;
  return new Date(today.getFullYear() + 1, 8, 1);
}

/* Build the next-occurrence-of-Sunday ISO date (the Sunday on or
   immediately after today). Used by the snack-rotation lookup. */
function nextSundayIso(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  /* Walk forward to the next Sunday (or today if today IS Sunday). */
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return isoLocal(d);
}

/* CSV-escape a single cell. Wraps in quotes when the cell contains
   anything that would break the column separator. */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* Build + trigger a CSV download for a kids roster. The browser
   handles the actual download via a temporary anchor element. */
function downloadKidsCsv(filename, kids) {
  const headers = [
    'Name', 'Age band', 'Grade', 'Birthday',
    'Parent name', 'Parent phone', 'Parent email',
    'Emergency contact', 'Allergies', 'Medications', 'Medical notes',
  ];
  const rows = kids.map(k => [
    k.name, k.ageBand, k.grade, k.birthday,
    k.parentName, k.parentPhone, k.parentEmail,
    k.emergencyContact, k.allergies, k.medications, k.medicalNotes,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* HTML-escape helper for the print templates below — keeps user
   data from breaking the markup if a kid's name has an "&" or "<". */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

/* Shared print stylesheet — applied to every printable so the
   look stays consistent. Letter-size, 0.5" margins, B&W-printer-
   friendly. */
const PRINT_CSS = `
  @page { size: Letter; margin: 0.5in; }
  body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; color: #111; line-height: 1.4; }
  h1 { font-size: 22pt; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 14pt; color: #4338ca; margin: 22px 0 8px;
       border-bottom: 2px solid #c7d2fe; padding-bottom: 4px; }
  .meta { color: #6b7280; font-size: 10pt; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px;
           text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 700; }
  .warn { color: #b91c1c; font-weight: 700; }
  .med  { color: #b45309; font-weight: 700; }
  .footer { margin-top: 28px; padding-top: 10px;
            border-top: 1px solid #e5e7eb;
            color: #9ca3af; font-size: 9pt; }
  .sign-line { display: inline-block; min-width: 240px;
               border-bottom: 1px solid #6b7280;
               padding: 0 6px; }
  .print-button { margin-bottom: 14px; padding: 8px 16px;
                  background: #4338ca; color: white; border: 0;
                  border-radius: 6px; font-size: 13pt; cursor: pointer; }
  @media print { .print-button { display: none; } }
`;

/* Open a new browser window with a fully-formed HTML doc, then
   auto-trigger the print dialog. The print preview includes a
   visible "Print" button at the top in case the auto-trigger is
   blocked, so the user always has a path forward. */
function openPrintWindow(title, bodyHtml) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><button class="print-button" onclick="window.print()">🖨 Print this sheet</button>${bodyHtml}</body></html>`;
  const w = window.open('', '_blank', 'width=920,height=720');
  if (!w) {
    alert('Popup blocked — please allow popups for this site so the printable can open.');
    return;
  }
  w.document.write(html);
  w.document.close();
  /* Small delay so the doc fully renders before triggering print
     (some browsers print a blank page if you call it immediately). */
  setTimeout(() => { try { w.print(); } catch { /* user can use the button */ } }, 350);
}

/* ── Printable: per-band emergency roster ────────────────────
   Single letter sheet a volunteer carries in their bag. Allergies
   + meds get colored callouts so they jump out at a glance. Empty
   columns get an em-dash so a missing field doesn't look like a
   layout error. */
function printBandSheet(band, kids, room) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const rows = kids.length === 0
    ? `<tr><td colspan="7" style="text-align:center;color:#9ca3af;font-style:italic;">No kids in this band.</td></tr>`
    : kids.map(k => `
        <tr>
          <td><b>${esc(k.name || '(unnamed)')}</b></td>
          <td>${esc(k.birthday || '—')}</td>
          <td class="warn">${esc(k.allergies) || '—'}</td>
          <td class="med">${esc(k.medications) || '—'}</td>
          <td>${esc(k.parentName) || '—'}</td>
          <td>${esc(k.parentPhone) || '—'}</td>
          <td>${esc(k.emergencyContact) || '—'}</td>
        </tr>`).join('');
  const body = `
    <h1>${esc(band.label)} · Emergency Roster</h1>
    <div class="meta">
      Room: <b>${esc(room.roomName) || 'TBD'}</b>
      · Lead: <b>${esc(room.leadName) || 'unassigned'}</b>
      · Capacity: ${room.capacity || '?'}
      · Ratio: ${esc(room.ratio || '—')}
      <br>Printed ${today}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:18%">Kid</th>
          <th style="width:10%">DOB</th>
          <th style="width:16%">Allergies</th>
          <th style="width:14%">Meds</th>
          <th style="width:14%">Parent</th>
          <th style="width:14%">Phone</th>
          <th style="width:14%">Emergency contact</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      Carry this sheet during the session. Update kid info on the All Kids page when anything changes.
    </div>
  `;
  openPrintWindow(`${band.label} — Roster`, body);
}

/* ── Printable: fire-drill / emergency roll call ──────────────
   Lists every kid currently checked in (today, not yet checked out)
   grouped by band/room, with a headcount + lead-signature line at
   the bottom of each section. Use during an evacuation. */
function printFireDrill(breakdown, todayDate, checkInList) {
  const now = new Date();
  const totalHere = breakdown.reduce((n, b) => n + b.stillHere, 0);
  const sections = breakdown
    .filter(b => b.stillHere > 0)
    .map(b => {
      const here = checkInList.filter(c =>
        c.date === todayDate && c.ageBand === b.band.label && !c.checkedOutAt
      );
      const rows = here.map(c => `
        <tr>
          <td>☐</td>
          <td><b>${esc(c.kidName)}</b></td>
          <td>${esc(c.parentName || '—')}</td>
          <td>${esc(c.parentPhone || '—')}</td>
          <td class="warn">${esc(c.allergiesSnapshot) || ''}</td>
        </tr>`).join('');
      return `
        <h2>${esc(b.band.label)} — Room ${esc(b.room.roomName || '?')}
            (${here.length} kid${here.length === 1 ? '' : 's'} · Lead ${esc(b.room.leadName) || 'unassigned'})</h2>
        <table>
          <thead><tr><th style="width:30px">✓</th><th>Kid</th><th>Parent</th><th>Phone</th><th>Allergies</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:10px;">
          Headcount on exit: <span class="sign-line">&nbsp;</span>
          &nbsp;&nbsp; Lead signature: <span class="sign-line">&nbsp;</span>
        </p>
      `;
    }).join('');

  const body = `
    <h1>🚨 Emergency Roll Call</h1>
    <div class="meta">
      ${now.toLocaleString()}
      &nbsp;·&nbsp; <b>${totalHere}</b> kid${totalHere === 1 ? '' : 's'} currently checked in
    </div>
    ${sections || '<p style="font-style:italic;color:#9ca3af;">No kids currently checked in.</p>'}
    <div class="footer">
      Use during an evacuation. Tick each kid on exit; compare headcounts; hand the signed sheets to the safety officer.
    </div>
  `;
  openPrintWindow('Emergency Roll Call', body);
}

/* ── Printable: parent-facing room directory ──────────────────
   A clean one-pager for the lobby kiosk / welcome packet. Just
   band name + room + lead. No PII. */
function printRoomDirectory(breakdown) {
  const today = new Date().toLocaleDateString();
  const cards = breakdown.map(b => `
    <div style="
      border: 2px solid #c7d2fe; border-radius: 14px;
      padding: 18px 22px; margin-bottom: 14px;
      page-break-inside: avoid; background: #f8fafc;
    ">
      <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px;">
        <h2 style="margin: 0; border: none; padding: 0; font-size: 18pt; color: #0f172a;">${esc(b.band.label)}</h2>
        ${b.band.minAge != null && b.band.maxAge > 0
          ? `<span style="color: #6b7280; font-size: 11pt;">Ages ${b.band.minAge}–${b.band.maxAge}</span>`
          : ''}
      </div>
      <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13pt;">
        <div><b>Room:</b> ${esc(b.room.roomName) || 'TBD'}</div>
        <div><b>Lead:</b> ${esc(b.room.leadName) || 'TBD'}</div>
      </div>
    </div>
  `).join('');
  const body = `
    <h1 style="text-align: center; border: none; color: #4338ca;">Children's Ministry</h1>
    <div class="meta" style="text-align: center; margin-bottom: 22px;">Room Directory · ${today}</div>
    ${cards || '<p style="text-align:center;font-style:italic;color:#9ca3af;">No bands configured yet.</p>'}
    <div class="footer" style="text-align: center;">
      Questions? Find a Children's Ministry volunteer near the welcome desk.
    </div>
  `;
  openPrintWindow('Children Ministry — Room Directory', body);
}

/* Compute the migration plan for the move-up wizard. For every
   eligible kid, re-derive the band whose age range contains their
   age at the target date. Returns only kids whose suggested band
   differs from their current one. */
function computeMoveUpPlan(kids, bands, targetDate) {
  if (!Array.isArray(kids) || !Array.isArray(bands)) return [];
  const sortedBands = [...bands].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return kids
    .filter(k => k.active && k.birthday)
    .map(k => {
      const age = ageOn(k.birthday, targetDate);
      if (age == null) return null;
      const suggested = sortedBands.find(b => age >= (b.minAge ?? 0) && age <= (b.maxAge ?? 99));
      if (!suggested) return null;
      if (suggested.label === k.ageBand) return null;
      return {
        kid: k,
        from: k.ageBand || '(no band)',
        to:   suggested.label,
        ageAtTarget: age,
      };
    })
    .filter(Boolean);
}

/* ── Tiny SVG sparkline for per-band attendance trend ────────── */
function Sparkline({ values, width = 100, height = 24 }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <div className="cmag-spark cmag-spark-empty" title="No attendance history yet">—</div>;
  }
  const max = Math.max(1, ...values);
  const stepX = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = 2 + i * stepX;
    const y = (height - 3) - ((v / max) * (height - 6));
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];
  const last = values[values.length - 1];
  const prev = values[values.length - 2] ?? last;
  const trend = last > prev ? 'up' : last < prev ? 'down' : 'flat';
  return (
    <svg className={`cmag-spark cmag-spark-${trend}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" strokeWidth="1.5" />
      <circle cx={lastX} cy={lastY} r="2.5" />
    </svg>
  );
}

/* Derive a single decisive status per band. When a Sunday entry
   for today supplies a room assignment for this band, use ITS lead
   + helper count for the staffing math (real substitutes &
   helpers, not yesterday's defaults). Decision tree:
   1. Empty band                  → 💤 No kids
   2. More kids than capacity     → 🚨 Over capacity
   3. Fewer adults than the ratio → ⚠ Short-staffed
   4. Otherwise                   → ✅ Ready */
function bandStatus({ kids, room, todayAssignment }) {
  if (kids.length === 0) return { id: 'empty', label: '💤 No kids', tone: 'cm-info' };
  const [num, denom] = (room.ratio || '1:0').split(':').map(Number);
  const adultsNeeded = denom > 0 ? Math.ceil((kids.length * num) / denom) : 0;

  /* Effective staffing: today's actual assignment if present, else
     the room's persistent default. Helpers from the Sunday entry are
     a comma-separated string; the room's helperCount is an int. */
  let adultsAvailable;
  if (todayAssignment) {
    const lead = todayAssignment.leadName ? 1 : 0;
    const helpers = splitList(todayAssignment.helperNames).length;
    adultsAvailable = lead + helpers;
  } else {
    adultsAvailable = (room.leadName ? 1 : 0) + Number(room.helperCount || 0);
  }

  if (room.capacity > 0 && kids.length > room.capacity) {
    return { id: 'over', label: '🚨 Over capacity', tone: 'cm-bad', adultsNeeded, adultsAvailable };
  }
  if (adultsAvailable < adultsNeeded) {
    return { id: 'short', label: '⚠ Short-staffed', tone: 'cm-warn', adultsNeeded, adultsAvailable };
  }
  return { id: 'ready', label: '✅ Ready', tone: 'cm-good', adultsNeeded, adultsAvailable };
}

/* A simple stacked-bar widget: green fill up to `value/target`,
   red overflow on top when `value > target`. */
function Bar({ value, target, label, accent = 'good' }) {
  const safeTarget = Math.max(target || 0, 1);
  const filledPct  = Math.min(100, Math.round((value / safeTarget) * 100));
  const overflow   = value > safeTarget && target > 0;
  const overPct    = overflow ? Math.min(50, Math.round(((value - safeTarget) / safeTarget) * 100)) : 0;
  return (
    <div className="cmag-bar">
      <div className="cmag-bar-label">{label}</div>
      <div className="cmag-bar-track">
        <div className={`cmag-bar-fill cmag-bar-${overflow ? 'bad' : accent}`} style={{ width: `${filledPct}%` }} />
        {overflow && <div className="cmag-bar-over" style={{ width: `${overPct}%` }} />}
      </div>
    </div>
  );
}

export default function ChildrensAgeGroups() {
  const [kids,  setKids]  = useUserStoreKey('childrens:kids', []);
  const [rooms, setRooms] = useUserStoreKey('childrens:rooms', []);
  const [bands, setBands] = useBands();
  /* Sunday-morning "today" view sources: today's Sunday plan
     (for room-assignment overrides) and live check-in log. Both
     are read-only here — this page never writes to them. */
  const [sundays]  = useUserStoreKey('childrens:sundays', []);
  const [checkIns] = useUserStoreKey('childrens:checkIns', []);
  /* Curriculum source — the room-setup picker lists current
     lessons so the lead can record what each band is teaching. */
  const [lessons]  = useUserStoreKey('childrens:lessons', []);
  /* Volunteer pool — drives the "potential helpers" affinity tags
     on each band card (volunteers whose roomPref matches). */
  const [volunteers]    = useUserStoreKey('childrens:volunteers', []);
  /* Snack rotation — shows "This Sunday's snack" on each band card
     so the volunteer doesn't have to bounce to the Snacks page. */
  const [snackRotation] = useUserStoreKey('childrens:snackRotation', []);
  const navigate = useNavigate();
  const kidList    = Array.isArray(kids) ? kids : [];
  const roomList   = Array.isArray(rooms) ? rooms : [];
  const sundayList   = Array.isArray(sundays)  ? sundays  : [];
  const checkInList  = Array.isArray(checkIns) ? checkIns : [];
  const lessonList   = Array.isArray(lessons)  ? lessons  : [];
  const volunteerList = Array.isArray(volunteers) ? volunteers : [];
  const snackList     = Array.isArray(snackRotation) ? snackRotation : [];

  const [hideEmpty, setHideEmpty] = useState(false);
  const [bandsModalOpen, setBandsModalOpen] = useState(false);
  const [moveUpOpen, setMoveUpOpen] = useState(false);

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);

  /* Find today's Sunday entry, if any. Used to pull room
     overrides per band ("today's actual lead + helpers"). */
  const today = todayLocal();
  const todaySunday = sundayList.find(s => s.date === today);
  const isSundayToday = !!todaySunday;

  /* Per-band breakdown — iterates over the LIVE bands list now,
     not a static const. Plus an "orphans" bucket for any kid whose
     stored ageBand label doesn't match any current band (happens
     when a band gets deleted out from under a kid). */
  const knownLabels = useMemo(() => new Set(bands.map(b => b.label)), [bands]);

  /* Last-8-Sundays window — reused for sparklines below. */
  const sundayWindow = useMemo(() => lastNSundays(8), []);
  const promotionTarget = useMemo(() => nextPromotionTarget(), []);
  const promotionTargetIso = isoLocal(promotionTarget);

  const breakdown = useMemo(() => {
    return bands.map(band => {
      const bandKids = kidList.filter(k => k.active && k.ageBand === band.label);
      const room = roomList.find(r => r.band === band.label) || DEFAULT_ROOM(band);
      const todayAssignment = todaySunday
        ? (todaySunday.roomAssignments || []).find(r => r.band === band.label) || null
        : null;
      const status = bandStatus({ kids: bandKids, room, todayAssignment });
      const allergySet = new Set();
      for (const k of bandKids) splitListLC(k.allergies).forEach(a => allergySet.add(a));
      const allergyList = Array.from(allergySet);
      const medsList = bandKids
        .filter(k => (k.medications || '').trim())
        .map(k => ({ name: k.name || '(unnamed)', meds: k.medications.trim() }));
      const todayCheckIns = checkInList.filter(c =>
        c.date === today && c.ageBand === band.label
      );
      const stillHere = todayCheckIns.filter(c => !c.checkedOutAt).length;

      /* ── Aggregated insights (Tier 4) ────────────────────── */

      /* Attendance trend: count check-ins per Sunday in the window.
         All-zero arrays look the same as no-data, so we explicitly
         track whether ANY Sunday had any data. */
      const trendValues = sundayWindow.map(date =>
        checkInList.filter(c => c.date === date && c.ageBand === band.label).length
      );
      const trendHasData = trendValues.some(v => v > 0);

      /* Years-served average across active kids with joinedDate set. */
      const tenures = bandKids
        .map(k => {
          if (!k.joinedDate) return null;
          const m = String(k.joinedDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (!m) return null;
          const j = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          return (Date.now() - j.getTime()) / (365.25 * 86400000);
        })
        .filter(v => v !== null && v >= 0);
      const avgTenure = tenures.length > 0
        ? (tenures.reduce((a, b) => a + b, 0) / tenures.length)
        : null;

      /* Volunteers whose roomPref matches this band (or is 'Any').
         Inactive vols excluded — they're not really available. */
      const affinity = volunteerList.filter(v =>
        v.active !== false &&
        v.name &&
        (v.roomPref === band.label || v.roomPref === 'Any')
      );

      /* Promotion preview — kids who'll age out before the target. */
      const agingOut = bandKids.filter(k => {
        const ageAtTarget = ageOn(k.birthday, promotionTarget);
        if (ageAtTarget == null) return false;
        return ageAtTarget > (band.maxAge ?? 99);
      });

      return {
        band, kids: bandKids, room, status,
        allergyList, medsList,
        todayAssignment,
        todayCheckedIn: todayCheckIns.length,
        stillHere,
        trendValues, trendHasData,
        avgTenure,
        affinity,
        agingOut,
      };
    });
  }, [bands, kidList, roomList, todaySunday, checkInList, today, sundayWindow, volunteerList, promotionTarget]);

  /* Kids whose stored ageBand label no longer matches any band
     (e.g. their band was deleted or renamed without cascading).
     Surfaced as a "Needs reassignment" callout above the grid. */
  const orphanKids = useMemo(() => {
    return kidList.filter(k => k.active && k.ageBand && !knownLabels.has(k.ageBand));
  }, [kidList, knownLabels]);

  /* ── Staffing-health rollup (next 4 upcoming Sundays) ────────
     For each upcoming Sunday in `childrens:sundays`, compute the
     staffing status per band by combining the Sunday entry's room
     assignment (lead + helperNames) with the band's required
     adult count (computed from the band's current kids and ratio). */
  const staffingForecast = useMemo(() => {
    const upcoming = sundayList
      .filter(s => s.date && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    return upcoming.map(s => {
      const perBand = bands.map(band => {
        const bandKids = kidList.filter(k => k.active && k.ageBand === band.label);
        const room = roomList.find(r => r.band === band.label);
        const [num, denom] = (room?.ratio || band.defaultRatio || '1:0').split(':').map(Number);
        const adultsNeeded = denom > 0 ? Math.ceil((bandKids.length * num) / denom) : 0;
        if (bandKids.length === 0 || adultsNeeded === 0) {
          return { band, status: 'ok', message: 'no kids' };
        }
        const ra = (s.roomAssignments || []).find(r => r.band === band.label);
        const adultsHere = ra
          ? (ra.leadName ? 1 : 0) + splitList(ra.helperNames).length
          : 0;
        if (adultsHere === 0) {
          return { band, status: 'unstaffed', message: 'unstaffed', adultsNeeded };
        }
        if (adultsHere < adultsNeeded) {
          return {
            band, status: 'short',
            message: `short ${adultsNeeded - adultsHere} adult${adultsNeeded - adultsHere === 1 ? '' : 's'}`,
            adultsNeeded, adultsHere,
          };
        }
        return { band, status: 'ok', message: 'staffed', adultsNeeded, adultsHere };
      });
      const issues = perBand.filter(b => b.status !== 'ok');
      const overall = issues.some(b => b.status === 'unstaffed') ? 'unstaffed'
                    : issues.length > 0 ? 'short' : 'ok';
      return { date: s.date, theme: s.theme || '', perBand, issues, overall };
    });
  }, [sundayList, bands, kidList, roomList, today]);

  /* Total kids aging out across all bands by the promotion target. */
  const promotionTotal = breakdown.reduce((n, b) => n + b.agingOut.length, 0);

  /** When a band is renamed, cascade the rename through kids + rooms
   *  + today's Sunday assignments so the foreign-key string stays in
   *  sync. Called from the bands modal when the label changes. */
  const cascadeRename = (oldLabel, newLabel) => {
    if (!oldLabel || !newLabel || oldLabel === newLabel) return;
    setKids(prev => (prev || []).map(k =>
      k.ageBand === oldLabel ? { ...k, ageBand: newLabel } : k
    ));
    setRooms(prev => (prev || []).map(r =>
      r.band === oldLabel ? { ...r, band: newLabel } : r
    ));
  };

  /* ── Snack rotation lookup — find the snack for this coming
        Sunday (today if today's Sunday, otherwise the next one). */
  const nextSundayDate = nextSundayIso();
  const nextSnack = snackList.find(s => s.date === nextSundayDate) || null;

  /* ── Room conflict detector — find any pair of bands that share
        a configured room name. Surfaces a top-of-page warning.
        Skips bands with no room name set (the common case during
        initial setup). */
  const roomConflicts = useMemo(() => {
    const byRoom = new Map();
    for (const r of roomList) {
      const name = (r.roomName || '').trim();
      if (!name) continue;
      if (!byRoom.has(name)) byRoom.set(name, []);
      byRoom.get(name).push(r.band);
    }
    return Array.from(byRoom.entries())
      .filter(([, bandLabels]) => bandLabels.length > 1)
      .map(([roomName, bandLabels]) => ({ roomName, bandLabels }));
  }, [roomList]);

  /* ── Bulk export everything (all-kids CSV) for the page header. */
  const exportAllKids = () => {
    const all = kidList.filter(k => k.active).sort((a, b) =>
      (a.ageBand || '').localeCompare(b.ageBand || '') ||
      (a.name || '').localeCompare(b.name || '')
    );
    downloadKidsCsv(`childrens-roster-${todayLocal()}.csv`, all);
  };

  /* "Health strip" rollup. On Sunday (when there's a `todaySunday`
     plan or any check-in activity today) we swap one of the static
     stats for the live "kids in the building right now" count, which
     is the single most useful number on a Sunday morning. */
  const health = useMemo(() => {
    const populated = breakdown.filter(b => b.kids.length > 0);
    const adultsNeeded = populated.reduce((n, b) => n + (b.status.adultsNeeded || 0), 0);
    const checkedInNow = breakdown.reduce((n, b) => n + b.stillHere, 0);
    const checkedInTotal = breakdown.reduce((n, b) => n + b.todayCheckedIn, 0);
    const live = isSundayToday || checkedInTotal > 0;
    return {
      kids:           populated.reduce((n, b) => n + b.kids.length, 0),
      adultsNeeded,
      shortStaffed:   populated.filter(b => b.status.id === 'short').length,
      overCapacity:   populated.filter(b => b.status.id === 'over').length,
      live,
      checkedInNow,
      checkedInTotal,
    };
  }, [breakdown, isSundayToday]);

  const upsertRoom = (bandObj, patch) => {
    setRooms(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex(r => r.band === bandObj.label);
      if (idx === -1) return [...list, { ...DEFAULT_ROOM(bandObj), ...patch }];
      return list.map(r => r.band === bandObj.label ? { ...r, ...patch } : r);
    });
  };

  const visible = hideEmpty ? breakdown.filter(b => b.kids.length > 0) : breakdown;

  return (
    <ChildrensShell
      groupLabel="Kids" groupIcon="👶"
      icon="🍼" title="Age Groups"
      accent={ACCENT}
      subtitle="Each age band has its own roster, ratio, room, and lead. Status badges show you at a glance which bands are ready and which need attention."
      actions={
        <>
          <button className="yps-btn" onClick={() => setMoveUpOpen(true)} title="Bulk-reassign kids whose age has aged out of their current band">
            🎓 Age-up wizard
          </button>
          <div className="cmag-print-wrap">
            <button
              type="button"
              className="yps-btn"
              onClick={() => setPrintMenuOpen(o => !o)}
              aria-expanded={printMenuOpen}
              title="Print sheets + export the roster"
            >🖨 Print &amp; export ▾</button>
            {printMenuOpen && (
              <div className="cmag-print-menu" onClick={() => setPrintMenuOpen(false)}>
                <div className="cmag-print-section">
                  <div className="cmag-print-section-hd">For your team</div>
                  <button
                    type="button"
                    onClick={() => printFireDrill(breakdown, today, checkInList)}
                    disabled={breakdown.every(b => b.stillHere === 0)}
                    title={breakdown.every(b => b.stillHere === 0) ? 'No kids currently checked in' : 'Print today’s emergency roll call'}
                  >🚨 Emergency roll call</button>
                  <button type="button" onClick={exportAllKids}>📥 All kids — CSV</button>
                </div>
                <div className="cmag-print-section">
                  <div className="cmag-print-section-hd">For parents</div>
                  <button type="button" onClick={() => printRoomDirectory(breakdown)}>📋 Room directory</button>
                </div>
              </div>
            )}
          </div>
          <button className="yps-btn" onClick={() => setBandsModalOpen(true)} title="Add, rename, reorder, or remove age bands">
            ⚙ Manage bands
          </button>
        </>
      }
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      {/* Top health strip. Adds a live "in the building" stat on
          Sunday so the lead's eyeline lands on the live number first. */}
      <div className="cmag-health">
        {health.live && (
          <Stat
            n={health.checkedInNow}
            label={`in the building${health.checkedInTotal !== health.checkedInNow ? ` (${health.checkedInTotal} today)` : ''}`}
            tone="good"
          />
        )}
        <Stat n={health.kids}         label="kids active"     tone={health.kids > 0 ? 'good' : 'mute'} />
        <Stat n={health.adultsNeeded} label="adults needed"   tone="info" />
        <Stat n={health.shortStaffed} label="bands short-staffed" tone={health.shortStaffed > 0 ? 'warn' : 'mute'} />
        <Stat n={health.overCapacity} label="bands over capacity" tone={health.overCapacity > 0 ? 'bad'  : 'mute'} />
      </div>

      {/* Sunday-banner — small but clear cue that the page is
          showing live data, not just the configured defaults. */}
      {isSundayToday && (
        <div className="cmag-today-banner">
          ☀ <b>Today is a Sunday plan day</b> — lead overrides and live check-ins are shown below.
        </div>
      )}

      {/* Room conflict warning — two bands sharing the same configured
          room name is almost always a typo / setup mistake. Surface
          it once at the top so the fix is obvious. */}
      {roomConflicts.length > 0 && (
        <div className="cmag-room-conflict">
          ⚠ <b>Room conflict</b>{roomConflicts.length > 1 ? 's' : ''}:
          {roomConflicts.map((c, i) => (
            <span key={c.roomName}>
              {' '}
              <b>{c.roomName}</b> is assigned to {c.bandLabels.join(' + ')}
              {i < roomConflicts.length - 1 ? ';' : ''}
            </span>
          ))}
          {' '} — pick distinct rooms in each band's setup below.
        </div>
      )}

      {/* Staffing forecast — quick scan of the next 4 Sundays so the
          coordinator can see what's filled and what's not without
          opening each Sunday entry. Hidden when nothing is on the
          books. */}
      {staffingForecast.length > 0 && (
        <section className="cmag-forecast">
          <header className="cmag-forecast-hd">
            <h3 className="cmag-forecast-title">📋 Staffing — next {staffingForecast.length} Sunday{staffingForecast.length === 1 ? '' : 's'}</h3>
            <button className="yps-btn ghost" onClick={() => navigate('/childrens/sunday')}>Open Sunday plans →</button>
          </header>
          <ul className="cmag-forecast-list">
            {staffingForecast.map(s => (
              <li key={s.date} className={`cmag-forecast-row cmag-forecast-${s.overall}`}>
                <span className="cmag-forecast-icon">
                  {s.overall === 'ok' ? '✅' : s.overall === 'short' ? '🟡' : '🔴'}
                </span>
                <span className="cmag-forecast-date">{s.date}</span>
                {s.theme && <span className="cmag-forecast-theme">{s.theme}</span>}
                <span className="cmag-forecast-summary">
                  {s.overall === 'ok'
                    ? 'All bands staffed'
                    : s.issues.map(i => `${i.band.label} ${i.message}`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Promotion preview — kids aging out by next September. Annual
          but high-impact: triggers the age-up workflow each summer. */}
      {promotionTotal > 0 && (
        <section className="cmag-promo">
          <header className="cmag-forecast-hd">
            <h3 className="cmag-forecast-title">🎓 Aging out by {promotionTargetIso}</h3>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cm-row-sub">{promotionTotal} kid{promotionTotal === 1 ? '' : 's'} will move up</span>
              <button className="yps-btn" onClick={() => setMoveUpOpen(true)}>🎓 Run age-up wizard →</button>
            </span>
          </header>
          <div className="cmag-promo-grid">
            {breakdown.filter(b => b.agingOut.length > 0).map(b => (
              <div key={b.band.id || b.band.label} className="cmag-promo-band">
                <div className="cmag-promo-band-label">{b.band.label}</div>
                <div className="cmag-promo-band-kids">
                  {b.agingOut.slice(0, 6).map(k => k.name || '(unnamed)').join(', ')}
                  {b.agingOut.length > 6 && <span className="cm-row-sub"> · +{b.agingOut.length - 6} more</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orphan-kids banner — shows when a band got deleted/renamed
          out from under a kid. Click "Reassign" to open All Kids
          filtered to the affected band. */}
      {orphanKids.length > 0 && (
        <div className="cmag-orphan-banner">
          ⚠ <b>{orphanKids.length} kid{orphanKids.length === 1 ? '' : 's'} need{orphanKids.length === 1 ? 's' : ''} reassignment</b>
          {' '} — stored age band no longer matches any current band.
          <details style={{ display: 'inline', marginLeft: 8 }}>
            <summary style={{ cursor: 'pointer', display: 'inline' }}>show</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 'var(--fs-sm)' }}>
              {orphanKids.slice(0, 12).map(k => (
                <li key={k.id}>{k.name} <span className="cm-row-sub">(was "{k.ageBand}")</span></li>
              ))}
              {orphanKids.length > 12 && <li>… +{orphanKids.length - 12} more</li>}
            </ul>
          </details>
          <button className="yps-btn ghost" style={{ marginLeft: 8 }} onClick={() => navigate('/childrens/kids')}>
            Open All Kids →
          </button>
        </div>
      )}

      {/* Toolbar — single toggle for now, room to grow later. */}
      <div className="cm-toolbar" style={{ justifyContent: 'flex-end' }}>
        <label className="yps-chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} style={{ marginRight: 6 }} />
          Hide empty bands
        </label>
      </div>

      <div className="cmag-grid">
        {visible.map(b => (
          <BandCard
            key={b.band.id || b.band.label}
            {...b}
            lessons={lessonList}
            nextSnack={nextSnack}
            nextSundayDate={nextSundayDate}
            onChange={(patch) => upsertRoom(b.band, patch)}
            onAddKids={() => navigate('/childrens/kids')}
            onOpenSundayPlan={() => navigate('/childrens/sunday')}
            onOpenLessons={() => navigate('/childrens/lessons')}
            onOpenSnacks={() => navigate('/childrens/snacks')}
            onExport={() => downloadKidsCsv(
              `${(b.band.label || 'band').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-roster-${todayLocal()}.csv`,
              b.kids
            )}
            onPrintSheet={() => printBandSheet(b.band, b.kids, b.room)}
          />
        ))}
        {visible.length === 0 && (
          <div className="cm-empty" style={{ gridColumn: '1 / -1' }}>
            <div className="cm-empty-icon">🍼</div>
            <div className="cm-empty-title">All bands empty</div>
            <div className="cm-empty-sub">Toggle "Hide empty bands" off, or add kids on the All Kids page.</div>
          </div>
        )}
      </div>

      {bandsModalOpen && (
        <BandsManager
          bands={bands}
          setBands={setBands}
          cascadeRename={cascadeRename}
          onClose={() => setBandsModalOpen(false)}
        />
      )}

      {moveUpOpen && (
        <MoveUpWizard
          kids={kidList}
          bands={bands}
          defaultTargetDate={promotionTargetIso}
          onApply={(planRows) => {
            const moves = new Map(planRows.map(p => [p.kid.id, p.to]));
            setKids(prev => (prev || []).map(k =>
              moves.has(k.id) ? { ...k, ageBand: moves.get(k.id) } : k
            ));
            setMoveUpOpen(false);
          }}
          onClose={() => setMoveUpOpen(false)}
        />
      )}

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </ChildrensShell>
  );
}

/* ── Single band card ───────────────────────────────────────── */
function BandCard({
  band, kids, room, status,
  allergyList, medsList,
  todayAssignment, todayCheckedIn, stillHere,
  trendValues, trendHasData,
  avgTenure, affinity, agingOut,
  lessons, nextSnack, nextSundayDate,
  onChange, onAddKids, onOpenSundayPlan, onOpenLessons, onOpenSnacks, onExport, onPrintSheet,
}) {
  const isConfigured = !!room.roomName && !!room.leadName;
  const [setupOpen, setSetupOpen] = useState(!isConfigured);
  /* Track whether the ratio dropdown is in "custom" (free-text) mode.
     Defaults to custom when the stored value isn't in COMMON_RATIOS. */
  const [customRatio, setCustomRatio] = useState(() => !COMMON_RATIOS.includes(room.ratio));

  const { adultsNeeded = 0, adultsAvailable = 0 } = status;

  /* Compute the effective lead label — today's override (if present)
     takes priority over the room's persistent default. */
  const effectiveLead = todayAssignment?.leadName || room.leadName;
  const hasLeadOverride = !!todayAssignment?.leadName
    && todayAssignment.leadName !== room.leadName;
  /* Currently-teaching lesson lookup. */
  const currentLesson = (lessons || []).find(l => l.id === room.currentLessonId) || null;

  return (
    <article className="cmag-card">
      <header className="cmag-card-hd">
        <h3 className="cmag-card-title">
          {band.label}
          {(band.minAge !== undefined && band.maxAge !== undefined && band.maxAge > 0) && (
            <span className="cmag-band-ages"> · ages {band.minAge}–{band.maxAge}</span>
          )}
        </h3>
        <span className={`yps-pill ${status.tone}`}>{status.label}</span>
      </header>

      {(room.roomName || effectiveLead) && (
        <div className="cmag-card-sub">
          {room.roomName && <>🚪 {room.roomName}</>}
          {room.roomName && effectiveLead && ' · '}
          {effectiveLead && <>👤 {effectiveLead}</>}
          {hasLeadOverride && (
            <span
              className="yps-pill cm-info cmag-override-pill"
              title={`Default lead is ${room.leadName}. Today's plan assigns ${todayAssignment.leadName}.`}
            >
              Today's sub
            </span>
          )}
        </div>
      )}

      {currentLesson && (
        <div className="cmag-card-sub">
          📖 Currently teaching:{' '}
          <button type="button" className="cmag-lesson-link" onClick={onOpenLessons}>
            {currentLesson.title || 'Untitled lesson'}
          </button>
        </div>
      )}

      {/* Live check-in row — only shows when there's been activity
          today, so non-Sunday weekday views stay quiet. */}
      {todayCheckedIn > 0 && (
        <div className="cmag-today-row">
          <span className="yps-pill cm-good">
            🟢 {todayCheckedIn} of {kids.length} checked in
          </span>
          {stillHere > 0 && stillHere < todayCheckedIn && (
            <span className="yps-pill cm-info">🚪 {stillHere} still here</span>
          )}
          {stillHere === todayCheckedIn && todayCheckedIn > 0 && (
            <span className="yps-pill cm-info">🚪 all still here</span>
          )}
          {stillHere === 0 && todayCheckedIn > 0 && (
            <span className="yps-pill">✓ all picked up</span>
          )}
        </div>
      )}

      {/* "Today's plan" jump link — shown when the band has any
          override OR when there's been check-in activity today. */}
      {(todayAssignment || todayCheckedIn > 0) && (
        <button type="button" className="cmag-sunday-link" onClick={onOpenSundayPlan}>
          ↗ Open today's Sunday plan
        </button>
      )}

      {/* Snack rotation — the snack is the same across all bands
          on a given Sunday so we show it on every card. Quiet when
          nothing's scheduled. */}
      {nextSnack && (
        <button
          type="button"
          className="cmag-snack-row"
          onClick={onOpenSnacks}
          title={nextSnack.notes || 'Open Snacks & Supplies'}
        >
          🍎 {nextSundayDate === nextSnack.date ? "This Sunday's snack:" : `${nextSnack.date}:`}
          {' '}<b>{nextSnack.snack || '(not specified)'}</b>
          {nextSnack.byVolunteer && <> · {nextSnack.byVolunteer}</>}
          {nextSnack.allergenSafe && <span className="yps-pill cm-good cmag-snack-pill">✓ allergen-safe</span>}
        </button>
      )}

      {/* Capacity bar (only meaningful if a capacity is set). */}
      {room.capacity > 0 && (
        <Bar
          label={`Kids ${kids.length} / ${room.capacity}`}
          value={kids.length}
          target={room.capacity}
          accent={kids.length > room.capacity ? 'bad' : 'good'}
        />
      )}

      {/* Ratio coverage bar. */}
      {kids.length > 0 && (
        <Bar
          label={`Adults ${adultsAvailable} of ${adultsNeeded} needed (ratio ${room.ratio})${todayAssignment ? ' — using today’s plan' : ''}`}
          value={adultsAvailable}
          target={adultsNeeded}
          accent={adultsAvailable >= adultsNeeded ? 'good' : 'warn'}
        />
      )}

      {/* Aggregated insights row: sparkline + avg tenure + aging-out
          count. All three condensed onto one line so the card stays
          scannable; per-item titles for hover detail. */}
      {(trendHasData || avgTenure != null || agingOut.length > 0) && (
        <div className="cmag-insights-row">
          {trendHasData && (
            <div className="cmag-insights-item" title={`Check-ins by Sunday: ${trendValues.join(', ')}`}>
              <span className="cmag-insights-label">Trend</span>
              <Sparkline values={trendValues} />
              <span className="cmag-insights-value">{trendValues[trendValues.length - 1]}</span>
            </div>
          )}
          {avgTenure != null && (
            <div className="cmag-insights-item" title={`Average years since each active kid in this band joined`}>
              <span className="cmag-insights-label">Avg tenure</span>
              <span className="cmag-insights-value">{avgTenure.toFixed(1)} yr</span>
            </div>
          )}
          {agingOut.length > 0 && (
            <div className="cmag-insights-item cmag-insights-warn" title={agingOut.map(k => k.name).join(', ')}>
              <span className="cmag-insights-label">🎓 Aging out</span>
              <span className="cmag-insights-value">{agingOut.length}</span>
            </div>
          )}
        </div>
      )}

      {/* Volunteer affinity — pool of helpers who prefer this band
          (or 'Any'). Only shown when there's anyone matching, and
          only the first 4 are listed inline. */}
      {affinity.length > 0 && (
        <div className="cmag-affinity" title="Volunteers whose room preference matches this band">
          <span className="cmag-affinity-icon">🙋</span>
          <span className="cmag-affinity-label">Potential helpers:</span>
          <span className="cmag-affinity-body">
            {affinity.slice(0, 4).map(v => v.name).join(', ')}
            {affinity.length > 4 && <span className="cm-row-sub"> · +{affinity.length - 4}</span>}
          </span>
        </div>
      )}

      {/* Allergies — now lists the actual allergens (deduped across
          the band) so a volunteer can scan at a glance what to keep
          out of snack mix. */}
      {allergyList.length > 0 && (
        <div className="cmag-care-line cmag-care-allergy" title={allergyList.join(', ')}>
          <span className="cmag-care-icon">⚠</span>
          <span className="cmag-care-label">Allergies:</span>
          <span className="cmag-care-body">
            {allergyList.slice(0, 8).join(', ')}
            {allergyList.length > 8 && <span className="cmag-care-more"> · +{allergyList.length - 8} more</span>}
          </span>
        </div>
      )}

      {/* Medications — per kid since each is specific. */}
      {medsList.length > 0 && (
        <div className="cmag-care-line cmag-care-meds">
          <span className="cmag-care-icon">💊</span>
          <span className="cmag-care-label">Meds:</span>
          <span className="cmag-care-body">
            {medsList.slice(0, 4).map((m, i) => (
              <span key={m.name + i} className="cmag-care-kid" title={m.meds}>
                {m.name} <span style={{ color: 'var(--text-muted)' }}>({m.meds})</span>
                {i < Math.min(medsList.length, 4) - 1 ? '; ' : ''}
              </span>
            ))}
            {medsList.length > 4 && <span className="cmag-care-more"> · +{medsList.length - 4} more</span>}
          </span>
        </div>
      )}

      {/* Empty-band shortcut. */}
      {kids.length === 0 && (
        <div className="cm-card-sub" style={{ marginTop: 4 }}>
          No kids in this band yet.
          <button className="yps-btn ghost" onClick={onAddKids} style={{ marginLeft: 8 }}>+ Add kids</button>
        </div>
      )}

      {/* Roster preview (collapsed). Plus per-band CSV + emergency
          print sheet — the print sheet is the one volunteers actually
          carry into the room with them. */}
      {kids.length > 0 && (
        <details className="cmag-roster">
          <summary>
            <span>Roster ({kids.length})</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="cmag-export-btn"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPrintSheet(); }}
                title="Print an emergency roster sheet (kid names, allergies, parent phones, emergency contacts)"
              >🖨 Print</button>
              <button
                type="button"
                className="cmag-export-btn"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExport(); }}
                title="Download a CSV with names, parents, phones, allergies — for substitute teachers"
              >📥 CSV</button>
            </span>
          </summary>
          <ul>
            {kids.slice(0, 20).map(k => (
              <li key={k.id}>
                {k.name || '(unnamed)'}
                {k.allergies && <span title={k.allergies} style={{ color: '#dc2626' }}> ⚠</span>}
                {k.medications && <span title={k.medications} style={{ color: '#b45309' }}> 💊</span>}
              </li>
            ))}
            {kids.length > 20 && <li style={{ color: 'var(--text-muted)' }}>… +{kids.length - 20} more</li>}
          </ul>
        </details>
      )}

      {/* Room setup — collapsed once configured. Sits at the bottom
          so the live data above is the focal point. */}
      <details className="cmag-setup" open={setupOpen} onToggle={(e) => setSetupOpen(e.currentTarget.open)}>
        <summary>⚙ Room setup</summary>
        <div className="cmag-setup-grid">
          <label className="cm-field">
            <span className="cm-field-label">Room name</span>
            <input className="yps-input" value={room.roomName} onChange={e => onChange({ roomName: e.target.value })} placeholder="e.g. Room 102" />
          </label>
          <label className="cm-field">
            <span className="cm-field-label">Capacity</span>
            <input type="number" min={0} className="yps-input" value={room.capacity} onChange={e => onChange({ capacity: Number(e.target.value) || 0 })} />
          </label>
          <label className="cm-field">
            <span className="cm-field-label">Ratio (adult:kid)</span>
            {customRatio ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="yps-input" value={room.ratio} onChange={e => onChange({ ratio: e.target.value })} placeholder="1:6" style={{ flex: 1 }} />
                <button type="button" className="yps-btn ghost" title="Pick from common ratios" onClick={() => setCustomRatio(false)}>↩</button>
              </div>
            ) : (
              <select
                className="yps-select"
                value={room.ratio}
                onChange={e => {
                  if (e.target.value === '__custom__') { setCustomRatio(true); return; }
                  onChange({ ratio: e.target.value });
                }}
              >
                {!COMMON_RATIOS.includes(room.ratio) && room.ratio && <option value={room.ratio}>{room.ratio}</option>}
                {COMMON_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                <option value="__custom__">Custom…</option>
              </select>
            )}
          </label>
          <label className="cm-field">
            <span className="cm-field-label">Helpers (besides lead)</span>
            <input type="number" min={0} className="yps-input" value={room.helperCount || 0} onChange={e => onChange({ helperCount: Number(e.target.value) || 0 })} />
          </label>
          <label className="cm-field full">
            <span className="cm-field-label">Lead volunteer</span>
            <input className="yps-input" value={room.leadName} onChange={e => onChange({ leadName: e.target.value })} placeholder="Name of the lead" />
          </label>
          <label className="cm-field full">
            <span className="cm-field-label">Currently teaching (curriculum)</span>
            <select
              className="yps-select"
              value={room.currentLessonId || ''}
              onChange={e => onChange({ currentLessonId: e.target.value })}
            >
              <option value="">— (none)</option>
              {(lessons || []).map(l => (
                <option key={l.id} value={l.id}>{l.title || 'Untitled lesson'}{l.series ? ` · ${l.series}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="cm-field full">
            <span className="cm-field-label">Notes</span>
            <input className="yps-input" value={room.notes || ''} onChange={e => onChange({ notes: e.target.value })} placeholder="Quirks, allergens, alternate room…" />
          </label>
        </div>
      </details>
    </article>
  );
}

function Stat({ n, label, tone = 'mute' }) {
  return (
    <div className={`cmag-stat cmag-stat-${tone}`}>
      <div className="cmag-stat-n">{n}</div>
      <div className="cmag-stat-label">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MoveUpWizard — annual age-up workflow. Picks a target date,
   computes the migration plan (kid → new band), lets the user
   uncheck individual rows, then bulk-applies on confirm.

   Defaults to next September 1 so it matches the US school-year
   rollover. The plan is grouped by from→to so the user can see the
   shape of the move ("4 Preschoolers becoming K-2nd, 3 K-2nd
   becoming 3rd-5th") before pulling the trigger.
   ───────────────────────────────────────────────────────────── */
function MoveUpWizard({ kids, bands, defaultTargetDate, onApply, onClose }) {
  const [targetDate, setTargetDate] = useState(defaultTargetDate);

  const plan = useMemo(() => {
    const m = String(targetDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return [];
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return computeMoveUpPlan(kids, bands, d);
  }, [kids, bands, targetDate]);

  /* Selected kid IDs — defaults to ALL on the first run; whenever
     the plan changes we reset the selection to "everyone selected"
     so the user only has to UN-check exceptions. */
  const [selectedIds, setSelectedIds] = useState(() => new Set(plan.map(p => p.kid.id)));
  /* Whenever the plan recomputes (date change, kids change), reset
     selection to include the new plan rows. */
  useMemo(() => {
    setSelectedIds(new Set(plan.map(p => p.kid.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  /* Group plan rows by from→to for the readout. */
  const grouped = useMemo(() => {
    const m = new Map();
    for (const p of plan) {
      const key = `${p.from} → ${p.to}`;
      if (!m.has(key)) m.set(key, { from: p.from, to: p.to, rows: [] });
      m.get(key).rows.push(p);
    }
    return Array.from(m.values());
  }, [plan]);

  const toggle = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll  = () => setSelectedIds(new Set(plan.map(p => p.kid.id)));
  const selectNone = () => setSelectedIds(new Set());

  const apply = () => {
    const rows = plan.filter(p => selectedIds.has(p.kid.id));
    if (rows.length === 0) {
      alert('Nothing selected — pick at least one kid to move.');
      return;
    }
    if (!confirm(`Move ${rows.length} kid${rows.length === 1 ? '' : 's'} to their new band${rows.length === 1 ? '' : 's'}? This updates each kid's ageBand immediately.`)) return;
    onApply(rows);
  };

  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div className="cm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <header className="cm-modal-hd">
          <h2>🎓 Age-Up Wizard</h2>
          <button className="yps-btn ghost" onClick={onClose}>✕</button>
        </header>
        <div style={{ padding: 16 }}>
          <div className="cm-card-sub" style={{ marginBottom: 10 }}>
            Pick the target date (usually the first day of the new school year). The wizard
            re-computes each kid's age on that date and suggests a new band — you can uncheck
            any individual move before applying.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <label className="cm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <span className="cm-field-label" style={{ whiteSpace: 'nowrap' }}>Target date</span>
              <input
                type="date"
                className="yps-input"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </label>
            {plan.length > 0 && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="yps-btn ghost" onClick={selectAll}  disabled={selectedIds.size === plan.length}>Select all</button>
                <button className="yps-btn ghost" onClick={selectNone} disabled={selectedIds.size === 0}>Select none</button>
              </span>
            )}
          </div>

          {plan.length === 0 ? (
            <div className="cm-empty" style={{ padding: 24 }}>
              <div className="cm-empty-icon">🎓</div>
              <div className="cm-empty-title">No moves needed</div>
              <div className="cm-empty-sub">
                Every active kid with a birthday on file fits their current band on this date.
                Try a later target date to see the next age-up cohort.
              </div>
            </div>
          ) : (
            <div className="cmag-wizard-groups">
              {grouped.map(g => (
                <div key={`${g.from}__${g.to}`} className="cmag-wizard-group">
                  <header className="cmag-wizard-group-hd">
                    <span className="cmag-wizard-arrow">{g.from} → <b>{g.to}</b></span>
                    <span className="cm-row-sub">{g.rows.length} kid{g.rows.length === 1 ? '' : 's'}</span>
                  </header>
                  <ul className="cmag-wizard-list">
                    {g.rows.map(p => (
                      <li key={p.kid.id} className={`cmag-wizard-row ${selectedIds.has(p.kid.id) ? 'on' : 'off'}`}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.kid.id)}
                            onChange={() => toggle(p.kid.id)}
                          />
                          <span className="cmag-wizard-name">{p.kid.name || '(unnamed)'}</span>
                          <span className="cmag-wizard-meta">
                            age {p.ageAtTarget} on target date · DOB {p.kid.birthday}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="cm-modal-ft">
          <button className="yps-btn" onClick={onClose}>Cancel</button>
          <button className="yps-add-btn" onClick={apply} disabled={selectedIds.size === 0 || plan.length === 0}>
            ✓ Apply {selectedIds.size} move{selectedIds.size === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BandsManager — modal to add / rename / reorder / delete bands.
   - Renaming cascades through kids + rooms via the parent's
     cascadeRename callback.
   - Deleting a band orphans any kids assigned to it; they'll show
     up in the "Needs reassignment" banner on the next render.
   - Reorder is up/down arrows (simple + always-works, no drag
     dependencies). Sort persists via the sortOrder field.
   ───────────────────────────────────────────────────────────── */
function BandsManager({ bands, setBands, cascadeRename, onClose }) {
  /* Local working copy so renames don't cascade on every keystroke. */
  const [draft, setDraft] = useState(() => bands.map(b => ({ ...b, _originalLabel: b.label })));

  const updateRow = (id, patch) =>
    setDraft(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const addRow = () =>
    setDraft(prev => [...prev, { ...makeBand(), _originalLabel: '', sortOrder: prev.length }]);
  const removeRow = (id) => {
    const row = draft.find(b => b.id === id);
    if (!row) return;
    if (!confirm(`Delete the band "${row.label || 'Untitled'}"? Any kids assigned to it will need reassignment.`)) return;
    setDraft(prev => prev.filter(b => b.id !== id));
  };
  const moveRow = (id, dir) => {
    setDraft(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      /* Renumber sortOrder so the visible order survives a reload. */
      return next.map((b, i) => ({ ...b, sortOrder: i }));
    });
  };

  const canSave = draft.every(b => b.label.trim().length > 0)
    && new Set(draft.map(b => b.label.trim())).size === draft.length;

  const save = () => {
    if (!canSave) {
      alert('Each band needs a unique non-empty label.');
      return;
    }
    /* Cascade any renames through kids + rooms BEFORE we overwrite
       the bands list, so the lookup-by-label still works. */
    for (const b of draft) {
      if (b._originalLabel && b._originalLabel !== b.label) {
        cascadeRename(b._originalLabel, b.label);
      }
    }
    /* Persist the bands array (strip the _originalLabel scratch field). */
    setBands(draft.map(({ _originalLabel, ...rest }) => rest));
    onClose();
  };

  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div className="cm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <header className="cm-modal-hd">
          <h2>⚙ Manage Age Bands</h2>
          <button className="yps-btn ghost" onClick={onClose}>✕</button>
        </header>
        <div style={{ padding: 14 }}>
          <div className="cm-card-sub" style={{ marginBottom: 10 }}>
            Add, rename, reorder, or remove the age bands your ministry uses.
            Renaming a band automatically updates every kid and room currently assigned to it.
          </div>

          <div className="cmag-bands-list">
            <div className="cmag-bands-row cmag-bands-row-hd">
              <span></span>
              <span>Label</span>
              <span>Min age</span>
              <span>Max age</span>
              <span>Default ratio</span>
              <span></span>
            </div>
            {draft.map((b, idx) => (
              <div key={b.id} className="cmag-bands-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button type="button" className="yps-btn ghost cmag-bands-arrow" onClick={() => moveRow(b.id, -1)} disabled={idx === 0} title="Move up">▲</button>
                  <button type="button" className="yps-btn ghost cmag-bands-arrow" onClick={() => moveRow(b.id, +1)} disabled={idx === draft.length - 1} title="Move down">▼</button>
                </div>
                <input className="yps-input" value={b.label} onChange={e => updateRow(b.id, { label: e.target.value })} placeholder="e.g. Kindergarten" />
                <input type="number" min={0} className="yps-input" value={b.minAge ?? 0} onChange={e => updateRow(b.id, { minAge: Number(e.target.value) || 0 })} />
                <input type="number" min={0} className="yps-input" value={b.maxAge ?? 0} onChange={e => updateRow(b.id, { maxAge: Number(e.target.value) || 0 })} />
                <select className="yps-select" value={b.defaultRatio} onChange={e => updateRow(b.id, { defaultRatio: e.target.value })}>
                  {COMMON_RATIOS.map(r => <option key={r}>{r}</option>)}
                </select>
                <button type="button" className="yps-btn ghost" onClick={() => removeRow(b.id)} title="Delete band">🗑</button>
              </div>
            ))}
          </div>

          <button type="button" className="yps-btn" style={{ marginTop: 10 }} onClick={addRow}>＋ Add band</button>
        </div>
        <footer className="cm-modal-ft">
          <button className="yps-btn" onClick={onClose}>Cancel</button>
          <button className="yps-add-btn" onClick={save} disabled={!canSave} title={canSave ? '' : 'Each band needs a unique non-empty label.'}>
            ✓ Save changes
          </button>
        </footer>
      </div>
    </div>
  );
}
