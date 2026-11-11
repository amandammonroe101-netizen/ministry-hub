import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUserStoreKey } from '../../lib/userStore';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './Parents.css';

/* Youth → Parent Communication
   Storage:
     youth:parentComms          — broadcasts (drafts, scheduled, sent)
     youth:parentCommTemplates  — saved templates (incl. language)
     youth:parentCommThreads    — inbound replies logged per household
     calendar-events            — scheduled broadcasts push reminders */

const ACCENT = '#854d0e';
const CAL_SOURCE = 'youth-parent-comm';
const CAL_COLOR  = '#854d0e';

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const GRADE_GROUPS = ['All', '6th-8th', '9th-12th', 'Visitors'];

const PER_RECIPIENT_PLACEHOLDERS = ['parent_name', 'kid_name', 'kid_names', 'kid_first_name', 'kid_count'];

const LANGUAGES = [
  { id: 'English', label: 'English', flag: '🇺🇸' },
  { id: 'Spanish', label: 'Español', flag: '🇪🇸' },
];
const langDef = (id) => LANGUAGES.find(l => l.id === id) || LANGUAGES[0];

const STARTER_TEMPLATES = [
  {
    id: 'tmpl-weekly-recap', name: 'Weekly recap', channel: 'email', language: 'English',
    subject: 'This week at youth',
    body:
`Hi {parent_name},

Here's what {kid_first_name} got into at youth this week:
• Lesson:
• Game / activity:
• Prayer focus:

Next week we'll be covering …

Thanks for partnering with us!
— Pastor`,
  },
  {
    id: 'tmpl-trip-reminder', name: 'Trip reminder (1 week out)', channel: 'email', language: 'English',
    subject: 'Reminder: {event_name} is on {event_date}',
    body:
`Hi {parent_name},

A quick reminder that {kid_names} {kid_count_is} signed up for {event_name} on {event_date}.

Packing list:
•

Drop-off / pick-up info:
•

Please reply with any questions. We can't wait!
— Pastor`,
  },
  {
    id: 'tmpl-permission-slip', name: 'Permission slip still needed', channel: 'email', language: 'English',
    subject: 'Permission slip needed for {form_name}',
    body:
`Hi {parent_name},

We still need a signed {form_name} for {kid_names}{form_due_phrase}.

You can sign and return it:
• At drop-off this week
• Or email a scan back to me

Thank you!
— Pastor`,
  },
  {
    id: 'tmpl-schedule-change', name: 'Schedule change', channel: 'email', language: 'English',
    subject: 'Schedule update for youth',
    body:
`Hi {parent_name},

Quick heads-up — there's been a change to the youth schedule:

What:
When:
Where:

— Pastor`,
  },
  {
    id: 'tmpl-lesson-preview', name: 'Sunday lesson preview', channel: 'email', language: 'English',
    subject: 'This Sunday at youth',
    body:
`Hi {parent_name},

Here's a preview of what we're covering this Sunday with {kid_first_name}:

Topic:
Scripture:
Discussion at home:

See you then!
— Pastor`,
  },
  {
    id: 'tmpl-sms-reminder', name: 'Quick SMS reminder', channel: 'sms', language: 'English',
    subject: '',
    body: 'Reminder: youth tonight at . {kid_first_name} should bring a Bible!',
  },
  {
    id: 'tmpl-intro-packet', name: '📦 New-parent intro packet', channel: 'email', language: 'English',
    subject: `Welcome to our youth ministry — everything you need in one email`,
    body:
`Hi {parent_name},

Welcome! Here's everything you need to know now that {kid_first_name} is part of our youth ministry:

━━━━━━━━━━━━━━━━━━━━━━
📅 OUR SCHEDULE
• Weekly youth night:
• Sunday morning:
• Upcoming events: (use ⋯ More → 📅 Insert upcoming events to auto-fill this)
• Or attach our calendar: (use ⋯ More → 📎 Download .ics)

━━━━━━━━━━━━━━━━━━━━━━
👥 OUR LEADERSHIP
•
•
•

━━━━━━━━━━━━━━━━━━━━━━
🛡 OUR COMMITMENTS
• Safe-from-Harm trained leaders
• Background-checked volunteers
• Code of conduct — happy to share on request

━━━━━━━━━━━━━━━━━━━━━━
📋 PERMISSION FORMS
We'll be in touch about specific forms for events. The recurring ones (medical release, photo release) get refreshed annually.

━━━━━━━━━━━━━━━━━━━━━━
📲 STAYING IN TOUCH
You'll hear from us weekly with what we covered + what's coming up. Reply to any of our emails anytime — we'd love to know how your family is doing.

So glad to be on this with you.
— Pastor`,
  },
  /* Spanish starters — paired with English originals via translationOf
     so a future per-household send can pick the right language. */
  {
    id: 'tmpl-weekly-recap-es', name: 'Resumen semanal', channel: 'email', language: 'Spanish',
    translationOf: 'tmpl-weekly-recap',
    subject: 'Esta semana en el grupo de jóvenes',
    body:
`Hola {parent_name},

Esto fue lo que {kid_first_name} hizo en jóvenes esta semana:
• Lección:
• Juego / actividad:
• Enfoque de oración:

La próxima semana cubriremos …

¡Gracias por colaborar con nosotros!
— Pastor`,
  },
  {
    id: 'tmpl-trip-reminder-es', name: 'Recordatorio de viaje', channel: 'email', language: 'Spanish',
    translationOf: 'tmpl-trip-reminder',
    subject: 'Recordatorio: {event_name} es el {event_date}',
    body:
`Hola {parent_name},

Un recordatorio rápido: {kid_names} {kid_count_is} inscrito para {event_name} el {event_date}.

Lista de equipaje:
•

Información de entrega / recogida:
•

¡Avíseme si tiene preguntas!
— Pastor`,
  },
];

function renderTemplate(str, ctx) {
  return (str || '').replace(/\{(\w+)\}/g, (m, k) =>
    ctx[k] !== undefined && ctx[k] !== '' ? ctx[k] : m
  );
}
function hasPerRecipientPlaceholders(...strs) {
  const joined = strs.join(' ');
  return PER_RECIPIENT_PLACEHOLDERS.some(k => joined.includes(`{${k}}`));
}
function joinNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

/* Practical body-length threshold before we stop pre-filling the
   body and fall back to clipboard. Most modern mail apps handle
   30KB+ URLs comfortably (Gmail, macOS Mail, Outlook) but iOS Mail
   has historically choked around 8KB. 8000 chars is the conservative
   "safe everywhere" line. */
const SAFE_MAILTO_URL_LIMIT = 8000;

function buildMailtoUrl({ to, bcc, subject, body }) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    params.push(`body=${encodeURIComponent(body)}`);
  const toPart  = to  ? encodeURIComponent(to)  : '';
  const bccPart = bcc ? `bcc=${encodeURIComponent(bcc)}` : '';
  if (bccPart) params.unshift(bccPart);
  return `mailto:${toPart}${params.length ? '?' + params.join('&') : ''}`;
}
function buildSmsUrl({ recipients, body }) {
  const nums = recipients.join(',');
  const sep  = recipients.length > 1 ? '&' : '?';
  return `sms:${nums}${sep}body=${encodeURIComponent(body)}`;
}

/** Click a hidden <a> to launch the URL — way more reliable than
 *  `window.location.href = mailto:…` across browsers (Safari in
 *  particular fails the location.href path silently sometimes). */
function clickToLaunch(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel  = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Open a mailto: URL reliably. When the full URL would exceed
 *  SAFE_MAILTO_URL_LIMIT, opens with headers + recipients only and
 *  copies the body to the clipboard so the user can paste it. */
async function openMailto({ to = '', bcc = '', subject = '', body = '' }) {
  const fullUrl = buildMailtoUrl({ to, bcc, subject, body });
  if (fullUrl.length <= SAFE_MAILTO_URL_LIMIT) {
    clickToLaunch(fullUrl);
    return { fellBack: false };
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(body);
    copied = true;
  } catch { /* clipboard blocked — proceed with header-only open */ }
  clickToLaunch(buildMailtoUrl({ to, bcc, subject, body: '' }));
  return { fellBack: true, copied };
}

/** SMS doesn't have a clean header-only fallback so we always launch
 *  the full URL — the OS / messaging app handles truncation. */
function openSms({ recipients, body }) {
  clickToLaunch(buildSmsUrl({ recipients, body }));
}

/** Open many mailto URLs in sequence (per-recipient personalized
 *  sends). First one uses the in-page launcher; the rest open in
 *  new windows with a short stagger so the browser doesn't pop-up-
 *  block the burst. */
async function openSequentially(urls) {
  if (urls.length === 0) return 0;
  clickToLaunch(urls[0]);
  for (let i = 1; i < urls.length; i++) {
    window.open(urls[i], '_blank', 'noopener');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 220));
  }
  return urls.length;
}

/* ── Recap auto-compose ─────────────────────────────────────────
   Build a draft body from the past + upcoming week's youth activity.
   Returns { subject, body } the user can drop straight into the
   composer. */
function buildRecapDraft({ lessons, weeklyNights, outreach, trips }, today = new Date()) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const t0  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastWeek = fmt(new Date(t0.getTime() - 7 * 86400000));
  const todayIso = fmt(t0);
  const nextWeek = fmt(new Date(t0.getTime() + 14 * 86400000));

  const inRange = (iso, start, end) => iso && iso >= start && iso <= end;

  const taughtLast = (lessons || []).flatMap(l =>
    (l.teachings || [])
      .filter(t => inRange(t.date, lastWeek, todayIso))
      .map(t => ({ lesson: l, teaching: t }))
  );
  const heldNights   = (weeklyNights || []).filter(n => inRange(n.date, lastWeek, todayIso));
  const heldOutreach = (outreach || []).filter(o => inRange(o.date || o.event_date, lastWeek, todayIso));

  const upcomingNights   = (weeklyNights || []).filter(n => inRange(n.date, todayIso, nextWeek)).slice(0, 3);
  const upcomingOutreach = (outreach || []).filter(o => inRange(o.date || o.event_date, todayIso, nextWeek)).slice(0, 3);
  const upcomingTrips    = (trips || []).filter(t => inRange(t.startDate || t.start_date, todayIso, fmt(new Date(t0.getTime() + 60 * 86400000)))).slice(0, 3);

  const lines = [];
  lines.push('Hi {parent_name},');
  lines.push('');
  lines.push('Here\'s a quick recap of what\'s been happening with youth:');
  lines.push('');

  if (taughtLast.length || heldNights.length || heldOutreach.length) {
    lines.push('📖 This past week:');
    taughtLast.slice(0, 3).forEach(({ lesson }) => {
      lines.push(`  • Lesson taught: ${lesson.title || 'Untitled'}${lesson.bigIdea ? ' — ' + lesson.bigIdea : ''}`);
    });
    heldNights.slice(0, 3).forEach(n => {
      lines.push(`  • ${n.theme || 'Youth night'} (${n.date})${Number(n.attendance) > 0 ? ` — ${n.attendance} students` : ''}`);
    });
    heldOutreach.slice(0, 3).forEach(o => {
      lines.push(`  • ${o.title || 'Outreach event'} (${o.date || o.event_date})`);
    });
    lines.push('');
  }

  if (upcomingNights.length || upcomingOutreach.length || upcomingTrips.length) {
    lines.push('📅 Coming up:');
    upcomingNights.forEach(n => {
      lines.push(`  • ${n.theme || 'Youth night'} — ${n.date}`);
    });
    upcomingOutreach.forEach(o => {
      lines.push(`  • ${o.title || 'Outreach'} — ${o.date || o.event_date}`);
    });
    upcomingTrips.forEach(t => {
      lines.push(`  • 🧳 ${t.name || 'Trip'} — ${t.startDate || t.start_date || 'TBD'}`);
    });
    lines.push('');
  }

  if (taughtLast.length === 0 && heldNights.length === 0 && heldOutreach.length === 0 &&
      upcomingNights.length === 0 && upcomingOutreach.length === 0 && upcomingTrips.length === 0) {
    lines.push('(Nothing logged for this week or next — add some events on the other youth pages.)');
    lines.push('');
  }

  lines.push('Thank you for partnering with us in raising your kids!');
  lines.push('— Pastor');

  return {
    subject: `Youth weekly recap — ${todayIso}`,
    body: lines.join('\n'),
  };
}

/* ── Format upcoming events as plain text for the composer ───── */
function buildUpcomingEventsBlock({ weeklyNights, outreach, trips }, today = new Date()) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const t0  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayIso = fmt(t0);
  const horizon  = fmt(new Date(t0.getTime() + 60 * 86400000));
  const events = [
    ...(weeklyNights || []).filter(n => n.date >= todayIso && n.date <= horizon)
      .map(n => ({ date: n.date, label: `🌙 ${n.theme || 'Youth night'}` })),
    ...(outreach || []).filter(o => (o.date || o.event_date) >= todayIso && (o.date || o.event_date) <= horizon)
      .map(o => ({ date: o.date || o.event_date, label: `🤝 ${o.title || 'Outreach'}` })),
    ...(trips || []).filter(t => (t.startDate || t.start_date || '') >= todayIso && (t.startDate || t.start_date || '') <= horizon)
      .map(t => ({ date: t.startDate || t.start_date, label: `🧳 ${t.name || 'Trip'}` })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (events.length === 0) return '';
  return '\n\n📅 Upcoming youth events:\n' + events.map(e => `  • ${e.date} — ${e.label}`).join('\n');
}

/* ── .ics file generator ───────────────────────────────────────
   Bundles all upcoming youth events (next 90 days) into a single
   calendar file. The output is a string the caller can wrap in a
   Blob + download link. */
function buildIcs({ weeklyNights, outreach, trips }, today = new Date()) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const t0  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayIso = fmt(t0);
  const horizon  = fmt(new Date(t0.getTime() + 90 * 86400000));
  const events = [
    ...(weeklyNights || []).filter(n => n.date >= todayIso && n.date <= horizon)
      .map(n => ({ id: n.id, date: n.date, end: n.endDate, summary: n.theme || 'Youth Night', desc: n.bigIdea || '' })),
    ...(outreach || []).filter(o => (o.date || o.event_date) >= todayIso && (o.date || o.event_date) <= horizon)
      .map(o => ({ id: o.id, date: o.date || o.event_date, end: '', summary: o.title || 'Outreach', desc: o.description || '' })),
    ...(trips || []).filter(t => (t.startDate || t.start_date || '') >= todayIso && (t.startDate || t.start_date || '') <= horizon)
      .map(t => ({ id: t.id, date: t.startDate || t.start_date, end: t.endDate || t.end_date, summary: `🧳 ${t.name || 'Trip'}`, desc: t.notes || '' })),
  ];
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ministry Hub//Youth//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    if (!e.date) continue;
    const startCompact = e.date.replace(/-/g, '');
    const endCompact = (e.end || e.date).replace(/-/g, '');
    /* For ICS all-day, DTEND is exclusive (the day AFTER the last day).
       Bump by 1 day so single-day events render correctly. */
    const endDate = new Date(endCompact.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
    endDate.setDate(endDate.getDate() + 1);
    const endExclusive = endDate.toISOString().slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@ministry-hub`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startCompact}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusive}`);
    lines.push(`SUMMARY:${(e.summary || '').replace(/\n/g, ' ')}`);
    if (e.desc) lines.push(`DESCRIPTION:${e.desc.replace(/\n/g, '\\n')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ── Pastoral Moments (Tier 1) ──────────────────────────────────
   Each nudge type scans the relevant app data and returns 0+
   actionable cards. The Parents page renders them at the top of
   the compose view with one-click "📨 Compose" buttons that
   pre-fill the composer with the right template + locked target. */

const NEWCOMER_WINDOW_DAYS  = 14;
const MISSING_WINDOW_DAYS   = 28;
const BIRTHDAY_WINDOW_DAYS  = 7;
const MILESTONE_WINDOW_DAYS = 30;
const CRISIS_GAP_DAYS       = 14;

const READ_CONFIRMATION_FOOTER = "\n\n— Please reply 'OK' to confirm you got this. Thanks!";

/* Days from today until the next occurrence of a stored month/day.
   Returns null if iso is empty/invalid. Negative = already passed
   this year (we roll to next year inside the function). */
function daysUntilAnnual(iso, today = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next.getTime() < t0.getTime()) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((next.getTime() - t0.getTime()) / 86400000);
}
function yearsSince(iso, today = new Date()) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  let y = today.getFullYear() - d.getFullYear();
  const passed = today.getMonth() > d.getMonth() ||
    (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
  if (!passed) y -= 1;
  return Math.max(0, y);
}
function daysSince(iso, today = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((today.getTime() - d.getTime()) / 86400000);
}

/* Build all nudges. Pure function — easy to test, easy to extend.
   Returns an array of nudge objects, each with `items[]` so the
   panel can render one card per actionable item. */
function computeNudges({ students, lessons, weeklyNights, forms, history }, today = new Date()) {
  const out = [];
  const safeStudents = Array.isArray(students) ? students : [];
  const active = safeStudents.filter(s => s.crisisStatus !== 'flagged');

  /* 1 · Birthdays in next week. */
  const bday = active
    .map(s => ({ s, days: daysUntilAnnual(s.birthday, today) }))
    .filter(x => x.days !== null && x.days <= BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  if (bday.length) out.push({
    id: 'birthday', icon: '🎂', label: 'Birthdays this week', tone: 'pink',
    items: bday.map(({ s, days }) => ({
      key: `bday-${s.id}`,
      label: `${s.name || '(unnamed)'}`,
      subLabel: days === 0 ? 'today!' : days === 1 ? 'tomorrow' : `in ${days}d`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'sms',
          subject: '',
          body: `Hi {parent_name}, just wanted to wish {kid_first_name} a happy birthday from all of us at youth! Hope ${s.name?.split(/\s+/)[0] || 'they'} has an amazing day. 🎂`,
        },
      }),
    })),
  });

  /* 2 · First-time attended (last 14 days, no welcome message yet). */
  const newcomers = active
    .map(s => ({ s, days: daysSince(s.firstAttended, today) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= NEWCOMER_WINDOW_DAYS);
  if (newcomers.length) out.push({
    id: 'newcomer', icon: '🌱', label: 'New to youth — welcome them', tone: 'green',
    items: newcomers.map(({ s, days }) => ({
      key: `new-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: days === 0 ? 'attended today!' : `first attended ${days}d ago`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: `Welcome to youth, ${s.name?.split(/\s+/)[0] || 'friend'}!`,
          body:
`Hi {parent_name},

So glad {kid_first_name} could join us at youth this week! It was great to meet ${s.name?.split(/\s+/)[0] || 'them'} and we hope to see ${s.name?.split(/\s+/)[0] ? 'them' : 'you both'} again soon.

A quick intro:
• What we're studying right now:
• Our regular schedule:
• A few things to know:

Reach out anytime — happy to answer any questions!
— Pastor`,
        },
      }),
    })),
  });

  /* 3 · Haven't shown up in 4+ weeks (and they've been before). */
  const missing = active
    .map(s => ({ s, days: daysSince(s.lastAttended, today) }))
    .filter(x => x.s.firstAttended && x.days !== null && x.days >= MISSING_WINDOW_DAYS);
  if (missing.length) out.push({
    id: 'missing', icon: '💔', label: 'We miss you', tone: 'rose',
    items: missing.map(({ s, days }) => ({
      key: `miss-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: `${days}d since last visit`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: 'We missed you at youth',
          body:
`Hi {parent_name},

Just wanted to check in — we haven't seen {kid_first_name} at youth in a few weeks and wanted to make sure everything's OK.

No pressure at all, but we'd love to have ${s.name?.split(/\s+/)[0] || 'them'} back whenever it works for your family.

Praying for you all!
— Pastor`,
        },
      }),
    })),
  });

  /* 4 · Recent salvation. */
  const salv = active
    .map(s => ({ s, days: daysSince(s.salvationDate, today) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= MILESTONE_WINDOW_DAYS);
  if (salv.length) out.push({
    id: 'salvation', icon: '✝️', label: 'Recent salvation', tone: 'amber',
    items: salv.map(({ s, days }) => ({
      key: `salv-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: days === 0 ? 'today!' : `${days}d ago`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: `A milestone for ${s.name?.split(/\s+/)[0] || 'your family'}`,
          body:
`Hi {parent_name},

What a moment — ${s.name?.split(/\s+/)[0] || 'your child'} made the decision to follow Jesus. We are absolutely thrilled to celebrate this with you.

A few ways we'd love to come alongside you:
• Next steps materials we can send home
• Baptism conversation when you're ready
• Any specific way to pray for {kid_first_name} this season

Praising God for what He's doing!
— Pastor`,
        },
      }),
    })),
  });

  /* 5 · Recent baptism. */
  const bapt = active
    .map(s => ({ s, days: daysSince(s.baptismDate, today) }))
    .filter(x => x.days !== null && x.days >= 0 && x.days <= MILESTONE_WINDOW_DAYS);
  if (bapt.length) out.push({
    id: 'baptism', icon: '🌊', label: 'Recent baptism', tone: 'sky',
    items: bapt.map(({ s, days }) => ({
      key: `bapt-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: days === 0 ? 'today!' : `${days}d ago`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: `Celebrating ${s.name?.split(/\s+/)[0] || 'your family'}'s baptism`,
          body:
`Hi {parent_name},

What a day — celebrating ${s.name?.split(/\s+/)[0] || 'your child'}'s baptism! It's an honor to walk alongside your family in this.

Keeping {kid_first_name} in prayer as ${s.name?.split(/\s+/)[0] ? 'they' : 'you'} continue forward.

Thank you for raising ${s.name?.split(/\s+/)[0] || 'such a wonderful kid'}.
— Pastor`,
        },
      }),
    })),
  });

  /* 6 · Family anniversary (joinedDate matches today ± window). */
  const anniv = active
    .map(s => ({ s, days: daysUntilAnnual(s.joinedDate, today), years: yearsSince(s.joinedDate, today) }))
    .filter(x => x.days !== null && x.days <= BIRTHDAY_WINDOW_DAYS && x.years >= 1);
  if (anniv.length) out.push({
    id: 'anniversary', icon: '🎉', label: 'Ministry anniversaries', tone: 'violet',
    items: anniv.map(({ s, days, years }) => ({
      key: `ann-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: `${years}yr — ${days === 0 ? 'today!' : days === 1 ? 'tomorrow' : `in ${days}d`}`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: `${years} years with ${s.name?.split(/\s+/)[0] || 'your family'}`,
          body:
`Hi {parent_name},

Can you believe it — ${years} year${years === 1 ? '' : 's'} since {kid_first_name} joined us at youth. It's been such a privilege to watch ${s.name?.split(/\s+/)[0] || 'them'} grow.

Thank you for trusting us with ${s.name?.split(/\s+/)[0] || 'your kid'} this whole time.
— Pastor`,
        },
      }),
    })),
  });

  /* 7 · Discussion prompts — for lessons taught in the last 7 days.
     One card per recently-taught lesson; sends to ALL parents (no
     household lock) since the prompt applies universally. */
  const recentLessons = (Array.isArray(lessons) ? lessons : [])
    .flatMap(l => (l.teachings || [])
      .filter(t => {
        const days = daysSince(t.date, today);
        return days !== null && days >= 0 && days <= 7;
      })
      .map(t => ({ lesson: l, teaching: t })));
  if (recentLessons.length) out.push({
    id: 'discussion', icon: '💬', label: 'Discussion prompts for the family', tone: 'teal',
    items: recentLessons.map(({ lesson }) => {
      const scrRef = lesson.scripturePassages?.[0]?.reference || lesson.scripture || '';
      const idea = lesson.bigIdea || lesson.title || 'this week\'s lesson';
      return {
        key: `disc-${lesson.id}`,
        label: lesson.title || '(untitled lesson)',
        subLabel: scrRef ? `📖 ${scrRef}` : 'taught this week',
        compose: () => ({
          template: {
            channel: 'email',
            subject: `Discussion at home — ${lesson.title || 'this week'}`,
            body:
`Hi {parent_name},

This week we covered "${lesson.title || 'a lesson'}"${scrRef ? ` from ${scrRef}` : ''}. If you'd like to keep the conversation going at home, here are 3 questions to try over dinner:

1. What stood out to you${scrRef ? ` from ${scrRef}` : ''}?
2. How can we live out "${idea}" together as a family this week?
3. Is there something you'd like our family to pray about together?

Thanks for partnering with us!
— Pastor`,
          },
        }),
      };
    }),
  });

  /* 8 · Form complete celebration. Filter out forms that have
     already been celebrated (celebratedAt set) or have zero kids. */
  const safeForms = Array.isArray(forms) ? forms : [];
  const completeForms = safeForms.filter(f => {
    if (f.celebratedAt) return false;
    const sids = active.map(s => s.id);
    if (sids.length === 0) return false;
    const status = f.status || {};
    return sids.every(id => status[id] === 'signed');
  });
  if (completeForms.length) out.push({
    id: 'form-complete', icon: '🎉', label: 'Forms all in — celebrate!', tone: 'green',
    items: completeForms.map(f => ({
      key: `form-${f.id}`,
      label: f.title || 'Untitled form',
      subLabel: `${active.length} of ${active.length} signed!`,
      compose: () => ({
        formId: f.id,
        template: {
          channel: 'email',
          subject: `All set! Every ${f.title || 'form'} is in 🎉`,
          body:
`Hi parents,

Just wanted to say a huge thank you — every ${f.title || 'form'} is in! We couldn't pull off what we do without you. 🎉

— Pastor`,
        },
      }),
    })),
  });

  /* 8.5 · Connect-card (Tier 3 #6) — students still in `visitorStatus
     === 'new'` whose household has never received a broadcast. Higher
     urgency than the firstAttended-based newcomer nudge: this catches
     visitor cards added BEFORE the kid's first attendance. */
  const safeHistory0 = Array.isArray(history) ? history : [];
  const contactsMessaged = new Set();
  for (const h of safeHistory0) (h.contacts || []).forEach(c => contactsMessaged.add(c));
  const uncontactedNew = active.filter(s => {
    if (s.visitorStatus !== 'new') return false;
    const c = s.parentEmail || s.email || s.parentPhone || s.phone;
    return c && !contactsMessaged.has(c);
  });
  if (uncontactedNew.length) out.push({
    id: 'connect-card', icon: '🌱', label: 'New visitor — no contact yet', tone: 'green',
    items: uncontactedNew.map(s => ({
      key: `connect-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: s.visitorAssignedTo ? `assigned to ${s.visitorAssignedTo}` : 'first contact owed',
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: `Welcome to youth — so glad to meet your family`,
          body:
`Hi {parent_name},

So glad to have ${s.name?.split(/\s+/)[0] || 'your kid'} as part of our youth ministry! Wanted to reach out personally and say a quick hi.

A few things to know upfront:
• Our regular schedule:
• What we're studying right now:
• Who I am and how to reach me:

We'd love to have ${s.name?.split(/\s+/)[0] || 'them'} at our next event:

Reach out anytime — happy to answer any questions!
— Pastor`,
        },
      }),
    })),
  });

  /* 9 · Crisis check-in — flagged families with no message in N days.
     We surface this AS its own nudge so the pastor doesn't lose
     track of intentionally-quieter families. */
  const safeHistory = Array.isArray(history) ? history : [];
  const lastMessagedByContact = {};
  for (const h of safeHistory) {
    const when = h.sentAt || h.createdAt;
    if (!when) continue;
    (h.contacts || []).forEach(c => {
      if (!lastMessagedByContact[c] || when > lastMessagedByContact[c]) {
        lastMessagedByContact[c] = when;
      }
    });
  }
  const flagged = safeStudents.filter(s => s.crisisStatus === 'flagged');
  const flaggedDue = flagged.map(s => {
    const contact = s.parentEmail || s.email || s.parentPhone || s.phone;
    const last = contact ? lastMessagedByContact[contact] : null;
    const days = last ? daysSince(last, today) : 999;
    return { s, days, contact };
  }).filter(x => x.days >= CRISIS_GAP_DAYS);
  if (flaggedDue.length) out.push({
    id: 'crisis-checkin', icon: '💜', label: 'Needs care — gentle check-in', tone: 'violet',
    items: flaggedDue.map(({ s, days }) => ({
      key: `crisis-${s.id}`,
      label: s.name || '(unnamed)',
      subLabel: `last contact ${days >= 999 ? 'never' : `${days}d ago`}`,
      compose: () => ({
        lockedStudentId: s.id,
        template: {
          channel: 'email',
          subject: 'Just thinking of you',
          body:
`Hi {parent_name},

Just wanted to check in and let you know we're thinking of your family. No agenda — just praying for you and for {kid_first_name}.

Anything we can do to support you this season?

— Pastor`,
        },
      }),
    })),
  });

  return out;
}

export default function Parents() {
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);
  const [history,   setHistory,   { loading }] = useUserStoreKey('youth:parentComms', []);
  const [students,  setStudents]               = useUserStoreKey('youth:students', []);
  const [templates, setTemplates]              = useUserStoreKey('youth:parentCommTemplates', STARTER_TEMPLATES);
  const [threads,   setThreads]                = useUserStoreKey('youth:parentCommThreads', []);
  /* Tier 4: per-household conversation state — status, assigned
     leader, internal notes. Keyed by contact (the parent's email
     or phone) so it survives across roster changes. */
  const [householdMeta, setHouseholdMeta] = useUserStoreKey('youth:parentHouseholdMeta', {});
  const [leadersRaw]       = useUserStoreKey('youth:leaders', []);
  const [trips]            = useUserStoreKey('youth:trips', []);
  const [outreach]         = useUserStoreKey('youth:outreach', []);
  const [forms, setForms]  = useUserStoreKey('youth:forms', []);
  const [lessons]          = useUserStoreKey('youth:lessons', []);
  const [weeklyNights]     = useUserStoreKey('youth:weeklyNights', []);
  const [, setCalendarEvents] = useUserStoreKey('calendar-events', []);

  const leaderList = Array.isArray(leadersRaw) ? leadersRaw : [];
  const metaMap = (householdMeta && typeof householdMeta === 'object') ? householdMeta : {};
  /* Default state for households we've never customized. */
  const metaFor = (contact) => metaMap[contact] || { status: 'open', assignedLeaderId: '', internalNotes: '' };
  const updateMeta = (contact, patch) => {
    setHouseholdMeta(prev => {
      const safe = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...safe,
        [contact]: { ...metaFor(contact), ...patch, updatedAt: new Date().toISOString() },
      };
    });
  };

  const list         = Array.isArray(history)   ? history   : [];
  const studentList  = Array.isArray(students)  ? students  : [];
  const templateList = Array.isArray(templates) ? templates : [];
  const threadList   = Array.isArray(threads)   ? threads   : [];
  const formList     = Array.isArray(forms)     ? forms     : [];

  /* Sent vs. scheduled split. Scheduled show in their own list with
     "Send now" buttons; sent show in the history. */
  const sentList      = list.filter(h => h.status !== 'scheduled');
  const scheduledList = list.filter(h => h.status === 'scheduled').sort((a, b) => (a.scheduledFor || '').localeCompare(b.scheduledFor || ''));

  const [view, setView] = useState('home'); // 'home' | 'compose' | 'scheduled' | 'history' | 'directory'

  /* "More" menu (in the composer) — collapses secondary actions
     (quick-fill, schedule, save-as-template) into a single button
     so the action bar stays clean. */
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [channel, setChannel] = useState('email');
  const [audience, setAudience] = useState('All');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedEventKey, setSelectedEventKey] = useState('');
  const [selectedFormId,   setSelectedFormId]   = useState('');

  /* URL-param pre-fill — supports ?studentId=<id> (lock to one
     household) and ?broadcastId=<id> (load a scheduled draft). */
  const [searchParams, setSearchParams] = useSearchParams();
  const [lockedStudentId, setLockedStudentId] = useState('');
  useEffect(() => {
    const sid = searchParams.get('studentId');
    const bid = searchParams.get('broadcastId');
    const wfor = searchParams.get('welcomeFor');
    let changed = false;
    if (sid) {
      setLockedStudentId(sid);
      const tid = searchParams.get('template');
      if (tid) {
        const t = STARTER_TEMPLATES.find(t => t.id === tid)
              || templateList.find(t => t.id === tid);
        if (t) { setChannel(t.channel || 'email'); setSubject(t.subject || ''); setBody(t.body || ''); }
      }
      changed = true;
    }
    if (bid) {
      const sched = list.find(h => h.id === bid && h.status === 'scheduled');
      if (sched) {
        setChannel(sched.channel || 'email');
        setSubject(sched.subject || '');
        setBody(sched.body || '');
      }
      changed = true;
    }
    if (wfor) {
      /* AllStudents → "🚀 Start welcome sequence" navigates here
         with this param. Auto-runs the welcome series for that
         student then jumps to the Scheduled tab so the user can
         see what got created. */
      const s = studentList.find(x => x.id === wfor);
      if (s) {
        scheduleWelcomeSequenceFor(s);
        setView('scheduled');
      }
      changed = true;
    }
    if (changed) {
      const next = new URLSearchParams(searchParams);
      next.delete('studentId'); next.delete('template'); next.delete('broadcastId'); next.delete('welcomeFor');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, studentList]);

  const lockedStudent = lockedStudentId ? studentList.find(s => s.id === lockedStudentId) : null;

  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateLang, setNewTemplateLang] = useState('English');

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  /* Tier 3 #3: cadence for the scheduled broadcast. 'none' = one-off
     (existing behavior). 'weekly' / 'monthly' = recurring — when the
     user clicks "Send now" on a recurring scheduled broadcast, the
     next occurrence auto-gets created. */
  const [scheduleCadence, setScheduleCadence] = useState('none');

  const [threadModalContact, setThreadModalContact] = useState(null);
  const [ackOpenId, setAckOpenId] = useState(null);

  /* Tier-2: when on, the send/copy flows append a "please reply OK"
     footer so parents know the broadcast actually wants confirmation. */
  const [requestAck, setRequestAck] = useState(false);

  /* Pastoral Moments — recomputed when any source data changes. */
  const nudges = useMemo(
    () => computeNudges({ students: studentList, lessons, weeklyNights, forms: formList, history: list }),
    [studentList, lessons, weeklyNights, formList, list]
  );
  const nudgeCount = nudges.reduce((n, g) => n + g.items.length, 0);

  /* Tier 4: stats for the Inbox tab badge. "needsResponse" surfaces
     when at least one household has an inbound reply we haven't
     marked resolved. */
  const inboxStats = useMemo(() => {
    let needsResponse = 0;
    for (const k of Object.keys(metaMap)) {
      if (metaMap[k]?.status === 'needs-response') needsResponse++;
    }
    return { needsResponse };
  }, [metaMap]);

  /* ── Events / Forms ─────────────────────────────────────────── */
  const availableEvents = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = (iso) => {
      if (!iso) return true;
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && d.getTime() >= today.getTime() - 86400000;
    };
    const t = (Array.isArray(trips) ? trips : []).filter(t => upcoming(t.startDate || t.start_date))
      .map(t => ({ key: `trip:${t.id}`, label: `🧳 ${t.name || 'Trip'}`, date: t.startDate || t.start_date || '', kind: 'trip', raw: t }));
    const o = (Array.isArray(outreach) ? outreach : []).filter(o => upcoming(o.date || o.event_date))
      .map(o => ({ key: `outreach:${o.id}`, label: `🤝 ${o.title || 'Outreach'}`, date: o.date || o.event_date || '', kind: 'outreach', raw: o }));
    return [...t, ...o].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [trips, outreach]);

  const selectedEvent = availableEvents.find(e => e.key === selectedEventKey) || null;
  const selectedForm  = formList.find(f => f.id === selectedFormId) || null;

  const availableForms = formList.map(f => ({
    ...f,
    missingCount: studentList.filter(s => (f.status || {})[s.id] !== 'signed').length,
  }));

  const eventStudentIds = useMemo(() => {
    if (!selectedEvent) return null;
    if (selectedEvent.kind === 'trip') {
      return new Set((selectedEvent.raw.roster || []).filter(r => typeof r === 'string' && r.startsWith('s_')));
    }
    return new Set((selectedEvent.raw.signups || []).filter(s => s.studentId).map(s => s.studentId));
  }, [selectedEvent]);

  const formStudentIds = useMemo(() => {
    if (!selectedForm) return null;
    return new Set(studentList.filter(s => (selectedForm.status || {})[s.id] !== 'signed').map(s => s.id));
  }, [selectedForm, studentList]);

  /* ── Recipients & households ────────────────────────────────── */
  const recipients = useMemo(() => {
    if (lockedStudent) return [lockedStudent];
    const gradeMatches = (g) => {
      if (audience === 'All') return true;
      if (audience === 'Visitors') return false;
      if (audience === '6th-8th') return ['6th', '7th', '8th'].includes(g);
      if (audience === '9th-12th') return ['9th', '10th', '11th', '12th'].includes(g);
      return false;
    };
    let result = studentList;
    if (audience === 'Visitors') {
      result = studentList.filter(s => s.visitorStatus && s.visitorStatus !== 'connected');
    } else if (audience !== 'All') {
      result = studentList.filter(s => gradeMatches(s.grade));
    }
    if (eventStudentIds) result = result.filter(s => eventStudentIds.has(s.id));
    if (formStudentIds)  result = result.filter(s => formStudentIds.has(s.id));
    return result;
  }, [studentList, audience, eventStudentIds, formStudentIds, lockedStudent]);

  const households = useMemo(() => {
    const map = new Map();
    for (const s of recipients) {
      const v = channel === 'email' ? (s.parentEmail || s.email) : (s.parentPhone || s.phone);
      if (!v) continue;
      if (!map.has(v)) map.set(v, { contact: v, kids: [], parentName: '', preferredLanguage: '' });
      const entry = map.get(v);
      entry.kids.push(s);
      if (!entry.parentName && s.parentName) entry.parentName = s.parentName;
      if (!entry.preferredLanguage && s.preferredLanguage) entry.preferredLanguage = s.preferredLanguage;
    }
    return Array.from(map.values()).map(h => {
      const names = h.kids.map(k => k.name || '').filter(Boolean);
      const firstNames = names.map(n => n.split(/\s+/)[0]);
      return {
        ...h,
        kidNames:      joinNames(names),
        kidFirstNames: joinNames(firstNames),
        kidCount:      h.kids.length,
      };
    });
  }, [recipients, channel]);

  const contacts = households.map(h => h.contact);
  const kidCount = households.reduce((n, h) => n + h.kids.length, 0);

  const baseCtx = useMemo(() => ({
    event_name: selectedEvent ? (selectedEvent.raw.name || selectedEvent.raw.title || '') : '',
    event_date: selectedEvent ? selectedEvent.date : '',
    form_name:  selectedForm  ? (selectedForm.title || 'permission slip') : '',
    form_due:   selectedForm  ? (selectedForm.dueDate || '') : '',
    form_due_phrase: selectedForm?.dueDate ? ` by ${selectedForm.dueDate}` : '',
  }), [selectedEvent, selectedForm]);

  const contextFor = (h) => ({
    ...baseCtx,
    parent_name:     h.parentName || 'parent',
    kid_name:        h.kidNames || '(your kid)',
    kid_names:       h.kidNames || '(your kid)',
    kid_first_name:  h.kidFirstNames || '(your kid)',
    kid_count:       h.kidCount,
    kid_count_is:    h.kidCount > 1 ? 'are' : 'is',
  });

  const perRecipientMode = hasPerRecipientPlaceholders(subject, body);

  /* When per-recipient mode is on AND we have multilingual templates
     for the current draft, swap to each household's preferred-language
     version before substituting placeholders. */
  const currentTemplate = useMemo(() => {
    return templateList.find(t => (t.body || '').trim() === (body || '').trim() && t.channel === channel) || null;
  }, [templateList, body, channel]);
  const translationsForCurrent = useMemo(() => {
    if (!currentTemplate) return new Map();
    const m = new Map();
    m.set(currentTemplate.language || 'English', currentTemplate);
    /* Walk templates and find any that are translations of the
       current one (or that the current one is a translation of). */
    const rootId = currentTemplate.translationOf || currentTemplate.id;
    templateList.forEach(t => {
      if (t.id === currentTemplate.id) return;
      if (t.id === rootId || t.translationOf === rootId) {
        m.set(t.language || 'English', t);
      }
    });
    return m;
  }, [currentTemplate, templateList]);
  const hasTranslations = translationsForCurrent.size > 1;

  const previewCtx = perRecipientMode && households.length > 0 ? contextFor(households[0]) : baseCtx;
  /* When requestAck is on, every outgoing body picks up the
     please-reply-OK footer. Subject is unchanged. */
  const withAck = (s) => requestAck ? (s || '') + READ_CONFIRMATION_FOOTER : s;
  const resolvedSubject = useMemo(() => renderTemplate(subject, previewCtx), [subject, previewCtx]);
  const resolvedBody    = useMemo(() => withAck(renderTemplate(body, previewCtx)), [body, previewCtx, requestAck]);

  const personalizedDrafts = useMemo(() => {
    if (!perRecipientMode) return null;
    return households.map(h => {
      const ctx = contextFor(h);
      /* If the household has a preferred language and we have a
         translation, swap to it before rendering. */
      let useSubject = subject, useBody = body;
      if (hasTranslations && h.preferredLanguage) {
        const langTmpl = translationsForCurrent.get(h.preferredLanguage);
        if (langTmpl) { useSubject = langTmpl.subject || subject; useBody = langTmpl.body || body; }
      }
      return {
        household: h,
        language:  h.preferredLanguage || (currentTemplate?.language || 'English'),
        subject:   renderTemplate(useSubject, ctx),
        body:      withAck(renderTemplate(useBody, ctx)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [households, subject, body, perRecipientMode, baseCtx, hasTranslations, translationsForCurrent, currentTemplate, requestAck]);

  const canSend = (channel === 'sms' ? !!resolvedBody : (!!resolvedSubject || !!resolvedBody)) && contacts.length > 0;

  /* ── Mutations ──────────────────────────────────────────────── */
  const logSend = (status = 'sent') => {
    const entry = {
      id: makeId('pc'),
      channel,
      audience: lockedStudent ? `Direct: ${lockedStudent.name || 'family'}` : audience,
      event: selectedEvent ? { kind: selectedEvent.kind, name: selectedEvent.raw.name || selectedEvent.raw.title || '', date: selectedEvent.date } : null,
      form:  selectedForm  ? { name: selectedForm.title || '', due: selectedForm.dueDate || '' } : null,
      personalized:    perRecipientMode,
      subject:         channel === 'email' ? subject : '',
      body,
      recipientCount:  contacts.length,
      householdCount:  households.length,
      kidCount,
      contacts,
      acknowledgments: {},
      status,
      scheduledFor: status === 'scheduled' ? scheduleDate : '',
      /* Tier 3 #3: cadence carries to the scheduled entry so "Send
         now" later can auto-roll the next occurrence. */
      cadence:      status === 'scheduled' ? scheduleCadence : 'none',
      sentAt: status === 'sent' ? new Date().toISOString() : '',
      createdAt: new Date().toISOString(),
    };
    setHistory(prev => [entry, ...(prev || [])]);
    if (status === 'scheduled' && scheduleDate) {
      setCalendarEvents(prev => [{
        id: 'ce_' + makeId('sched'),
        created_at: new Date().toISOString(),
        title:        `📨 Send: ${subject || 'parent broadcast'}${scheduleCadence !== 'none' ? ' (recurring)' : ''}`,
        description:  `Scheduled parent broadcast — ${households.length} household(s).${scheduleCadence !== 'none' ? ` Repeats ${scheduleCadence}.` : ''} Open Parent Communication to send.`,
        event_date:   scheduleDate,
        end_date:     '',
        event_time:   '',
        color:        CAL_COLOR,
        category:     'youth',
        source:       CAL_SOURCE,
        source_id:    entry.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...(prev || [])]);
    }
    if (status === 'sent') {
      setSubject(''); setBody('');
      setShowSaveTemplate(false);
      setNewTemplateName('');
      setLockedStudentId('');
    }
    setShowScheduleForm(false);
    setScheduleCadence('none');
    return entry;
  };

  /* Schedule → push to draft state, hold for later send. */
  const scheduleBroadcast = () => {
    if (!canSend || !scheduleDate) return;
    logSend('scheduled');
    setSubject(''); setBody('');
    setLockedStudentId('');
  };

  /* "Send now" on a scheduled broadcast — restore its content into
     the composer and drop the scheduled entry + calendar event.
     If it's a recurring broadcast (cadence weekly/monthly), auto-
     create the NEXT occurrence so the rhythm keeps going. */
  const sendScheduledNow = (entry) => {
    setChannel(entry.channel);
    setSubject(entry.subject || '');
    setBody(entry.body || '');
    setView('compose');
    if (entry.event?.name) {
      const match = availableEvents.find(e => (e.raw.name || e.raw.title) === entry.event.name);
      if (match) setSelectedEventKey(match.key);
    }
    if (entry.form?.name) {
      const match = formList.find(f => f.title === entry.form.name);
      if (match) setSelectedFormId(match.id);
    }
    cancelScheduled(entry.id);
    if (entry.cadence && entry.cadence !== 'none') {
      const days = entry.cadence === 'weekly' ? 7 : 30;
      const nextDate = dateOffset(entry.scheduledFor, days);
      const nextEntry = {
        ...entry,
        id: makeId('pc'),
        scheduledFor: nextDate,
        sentAt: '',
        acknowledgments: {},
        createdAt: new Date().toISOString(),
      };
      setHistory(prev => [nextEntry, ...(prev || [])]);
      setCalendarEvents(prev => [{
        id: 'ce_' + makeId('sched'),
        created_at: new Date().toISOString(),
        title:        `📨 Send: ${entry.subject || 'parent broadcast'} (recurring)`,
        description:  `Recurring ${entry.cadence} broadcast — ${entry.householdCount || 0} household(s).`,
        event_date:   nextDate,
        end_date:     '',
        event_time:   '',
        color:        CAL_COLOR,
        category:     'youth',
        source:       CAL_SOURCE,
        source_id:    nextEntry.id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      }, ...(prev || [])]);
    }
  };
  const cancelScheduled = (id) => {
    setHistory(prev => (prev || []).filter(h => h.id !== id));
    setCalendarEvents(prev => (prev || []).filter(e => !(e.source === CAL_SOURCE && e.source_id === id)));
  };

  /* Tier 3 #4: push a scheduled broadcast forward by N days
     (default 7 — "skip this week"). Updates both the history entry
     and the corresponding calendar event. */
  const postponeScheduled = (id, days = 7) => {
    setHistory(prev => (prev || []).map(h => {
      if (h.id !== id) return h;
      return { ...h, scheduledFor: dateOffset(h.scheduledFor, days) };
    }));
    setCalendarEvents(prev => (prev || []).map(e => {
      if (e.source !== CAL_SOURCE || e.source_id !== id) return e;
      return { ...e, event_date: dateOffset(e.event_date, days) };
    }));
  };

  const loadTemplate = (t) => {
    setChannel(t.channel || 'email');
    setSubject(t.subject || '');
    setBody(t.body || '');
    setNewTemplateLang(t.language || 'English');
  };
  const saveAsTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    const tmpl = {
      id: makeId('tmpl'),
      name,
      channel,
      language: newTemplateLang,
      subject: channel === 'email' ? subject : '',
      body,
    };
    setTemplates(prev => [...(prev || []), tmpl]);
    setNewTemplateName('');
    setShowSaveTemplate(false);
  };
  const removeTemplate = (id) => {
    if (!confirm('Delete this template?')) return;
    setTemplates(prev => (prev || []).filter(t => t.id !== id));
  };

  const copyAddresses = async () => {
    if (contacts.length === 0) return;
    try {
      await navigator.clipboard.writeText(contacts.join(channel === 'email' ? ', ' : '\n'));
      alert(`${contacts.length} ${channel === 'email' ? 'email addresses' : 'phone numbers'} copied.`);
    } catch { alert('Copy failed.'); }
  };
  const copyBody = async () => {
    try {
      if (perRecipientMode && personalizedDrafts) {
        const blocks = personalizedDrafts.map(d =>
          (channel === 'email' ? `To: ${d.household.contact}\nSubject: ${d.subject}\n\n${d.body}` : `To: ${d.household.contact}\n${d.body}`)
        );
        await navigator.clipboard.writeText(blocks.join('\n\n---\n\n'));
        alert(`Copied ${blocks.length} personalized message${blocks.length === 1 ? '' : 's'}.`);
      } else {
        const text = channel === 'email' ? `Subject: ${resolvedSubject}\n\n${resolvedBody}` : resolvedBody;
        await navigator.clipboard.writeText(text);
        alert('Message copied.');
      }
    } catch { alert('Copy failed.'); }
  };

  /* Bulk-open helpers — moved into the ⋯ More menu as a convenience.
     They DO NOT auto-log anymore (since the user might just be
     opening drafts to copy/paste, not actually sending). The explicit
     "✓ Log on Send" button handles recording. */
  const openBulkInMailApp = async () => {
    if (contacts.length === 0) return;
    const result = await openMailto({
      bcc: contacts.join(','),
      subject: resolvedSubject,
      body: resolvedBody,
    });
    if (result.fellBack) {
      alert(
        result.copied
          ? `📋 Body was too long to pre-fill — opened your mail app with recipients + subject only, and copied the body to your clipboard. Paste (Cmd/Ctrl + V) into the message area.`
          : `Body was too long to pre-fill. Use "📋 Copy" to grab it and paste into the mail draft.`
      );
    }
  };
  const openBulkInSmsApp = () => {
    if (contacts.length === 0) return;
    openSms({ recipients: contacts, body: resolvedBody });
  };
  const openAllPersonalized = async () => {
    if (!personalizedDrafts || personalizedDrafts.length === 0) {
      alert('Nothing to open.');
      return;
    }
    if (personalizedDrafts.length > 5 && !confirm(`Open ${personalizedDrafts.length} personalized drafts? Your browser may ask to allow pop-ups.`)) return;
    if (channel === 'email') {
      const [first, ...rest] = personalizedDrafts;
      await openMailto({ to: first.household.contact, subject: first.subject, body: first.body });
      for (const d of rest) {
        const url = buildMailtoUrl({ to: d.household.contact, subject: d.subject, body: d.body });
        window.open(url, '_blank', 'noopener');
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 220));
      }
    } else {
      const urls = personalizedDrafts.map(d => buildSmsUrl({ recipients: [d.household.contact], body: d.body }));
      await openSequentially(urls);
    }
  };
  const openOnePersonalized = async (draft) => {
    if (channel === 'email') {
      const result = await openMailto({ to: draft.household.contact, subject: draft.subject, body: draft.body });
      if (result.fellBack) {
        alert(result.copied
          ? '📋 Body was too long for a one-tap link — opened your mail app with To + Subject only and copied the body to your clipboard. Paste it into the draft.'
          : 'Body was too long for a one-tap link — opened with To + Subject only. Use Copy to grab the body.');
      }
    } else {
      openSms({ recipients: [draft.household.contact], body: draft.body });
    }
  };

  const removeEntry = (id) => {
    if (!confirm('Remove this from history?')) return;
    setHistory(prev => (prev || []).filter(e => e.id !== id));
  };

  /* ── Tier 1 nudges → composer pre-fill ─────────────────────── */
  const applyNudge = (nudgeItem) => {
    const spec = nudgeItem.compose();
    if (!spec) return;
    if (spec.template) {
      setChannel(spec.template.channel || 'email');
      setSubject(spec.template.subject || '');
      setBody(spec.template.body || '');
    }
    setLockedStudentId(spec.lockedStudentId || '');
    setSelectedFormId(spec.formId || '');
    setSelectedEventKey(spec.eventKey || '');
    /* Form-completion celebrations get marked so the nudge stops
       showing once the user takes action. */
    if (spec.formId && nudgeItem.markCelebrated) markFormCelebrated(spec.formId);
  };
  const markFormCelebrated = (formId) => {
    setForms(prev => (prev || []).map(f => f.id === formId
      ? { ...f, celebratedAt: new Date().toISOString().slice(0, 10) }
      : f));
  };

  /* ── Generic multi-stage scheduler ──────────────────────────
     Powers form reminders, welcome sequences, and event campaigns.
     Each `step` is { fireDate, subject, body, audienceLabel? }.
     Past-date steps are silently skipped so historical campaigns
     don't re-fire. */
  const scheduleSeries = ({ steps, contacts, kidCount, label, form, event, summary }) => {
    if (!Array.isArray(contacts) || contacts.length === 0) {
      alert(`Nothing to schedule — no recipients with email addresses.`);
      return 0;
    }
    const today = todayLocal();
    const totalSteps = (steps || []).filter(s => s.fireDate).length;
    const valid = (steps || []).filter(s => s.fireDate && s.fireDate >= today);
    if (valid.length === 0) {
      /* All steps are in the past — usually means the event date
         itself is past, or the event has no date set. Surface what's
         actually wrong so the user can fix it. */
      const firstStep = steps?.[0];
      if (!firstStep?.fireDate) {
        alert("Couldn't schedule — this event doesn't have a date set yet. Add a start date on the source page (Trips / Outreach / Weekly Nights) and try again.");
      } else {
        alert("Couldn't schedule — every step in this campaign would fire in the past. Make sure the event date is in the future.");
      }
      return 0;
    }
    const skipped = totalSteps - valid.length;
    const newEntries = [];
    const newCalEvents = [];
    valid.forEach((s, idx) => {
      const id = makeId('pc');
      newEntries.push({
        id,
        channel: 'email',
        audience: s.audienceLabel || label,
        event: event || null,
        form:  form  || null,
        personalized: true,
        subject: s.subject,
        body: s.body,
        recipientCount: contacts.length,
        householdCount: contacts.length,
        kidCount: kidCount ?? contacts.length,
        contacts,
        acknowledgments: {},
        status: 'scheduled',
        scheduledFor: s.fireDate,
        sentAt: '',
        createdAt: new Date().toISOString(),
        seriesLabel: label,
      });
      newCalEvents.push({
        id: 'ce_' + makeId('sched'),
        created_at: new Date().toISOString(),
        title:        `📨 Send: ${s.subject}`,
        description:  `Auto-scheduled — ${label} (step ${idx + 1} of ${valid.length}, ${contacts.length} household${contacts.length === 1 ? '' : 's'})`,
        event_date:   s.fireDate,
        end_date:     '',
        event_time:   '',
        color:        CAL_COLOR,
        category:     'youth',
        source:       CAL_SOURCE,
        source_id:    id,
        reminder_offset: 'none',
        reminder_time:   '',
        reminder_note:   '',
      });
    });
    setHistory(prev => [...newEntries, ...(prev || [])]);
    setCalendarEvents(prev => [...newCalEvents, ...(prev || [])]);
    const skipSuffix = skipped > 0
      ? `\n\n(Skipped ${skipped} earlier step${skipped === 1 ? '' : 's'} — fire dates were already in the past.)`
      : '';
    alert((summary || `Scheduled ${valid.length} message${valid.length === 1 ? '' : 's'} for ${contacts.length} household${contacts.length === 1 ? '' : 's'}.`) + skipSuffix);
    return valid.length;
  };

  /* Helper — build a household-contacts list from a set of student
     IDs (snapshots email at scheduling time). */
  const householdsFor = (studentIds) => {
    const idSet = new Set(studentIds);
    const matched = studentList.filter(s => idSet.has(s.id));
    const map = new Map();
    for (const s of matched) {
      const v = s.parentEmail || s.email;
      if (!v) continue;
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(s);
    }
    return { contacts: Array.from(map.keys()), kidCount: matched.length };
  };

  /* Local-date helpers. Important: `new Date('2024-10-15')` parses
     as midnight UTC, then `toISOString()` shifts back to UTC for
     output — for any user west of UTC after ~4pm, this drifts the
     date forward by a day and turns past-events into "wait, that's
     today" comparisons. Building the YYYY-MM-DD from local fields
     sidesteps the entire mess. */
  const isoLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayLocal = () => isoLocal(new Date());
  const dateOffset = (baseIso, offsetDays) => {
    if (!baseIso) return '';
    const m = String(baseIso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + offsetDays);
    return isoLocal(d);
  };

  /* ── Tier 2: Form reminder series (refactored) ──────────────── */
  const scheduleFormReminderSeries = (form) => {
    if (!form) return;
    if (!form.dueDate) {
      alert('This form has no due date — set one on the Forms page first.');
      return;
    }
    const missingIds = studentList.filter(s => (form.status || {})[s.id] !== 'signed').map(s => s.id);
    const { contacts, kidCount } = householdsFor(missingIds);
    if (contacts.length === 0) {
      alert(`Nothing to schedule — every kid has already signed ${form.title || 'this form'}.`);
      return;
    }
    const due = form.dueDate;
    scheduleSeries({
      label:  `Form reminder: ${form.title || 'form'}`,
      contacts, kidCount,
      form:   { name: form.title || '', due },
      summary: `Scheduled reminders for ${contacts.length} parent${contacts.length === 1 ? '' : 's'} missing ${form.title || 'this form'}.`,
      steps: [
        { fireDate: dateOffset(due, -7), audienceLabel: 'friendly',
          subject: `Friendly reminder: ${form.title || 'permission slip'}`,
          body: `Hi {parent_name},\n\nJust a heads-up that we need a signed ${form.title || 'permission slip'} for {kid_names} by ${due}.\n\nThanks!\n— Pastor` },
        { fireDate: dateOffset(due, -2), audienceLabel: 'firmer',
          subject: `Reminder: ${form.title || 'permission slip'} due in 2 days`,
          body: `Hi {parent_name},\n\nQuick reminder — the ${form.title || 'permission slip'} for {kid_names} is due ${due} (just 2 days from now).\n\nYou can return it at drop-off or scan and email back.\n\n— Pastor` },
        { fireDate: dateOffset(due, 0), audienceLabel: 'urgent',
          subject: `URGENT: ${form.title || 'permission slip'} due today`,
          body: `Hi {parent_name},\n\nThe ${form.title || 'permission slip'} for {kid_names} is due TODAY. Without it, {kid_names} won't be able to participate.\n\nIf there's any issue, please reply right away.\n\n— Pastor` },
      ],
    });
  };

  /* ── Tier 3 #1: Welcome sequence for a new visitor ──────────── */
  const scheduleWelcomeSequenceFor = (student) => {
    if (!student) return;
    const contact = student.parentEmail || student.email;
    if (!contact) { alert('This student has no parent email yet — add one before starting the welcome sequence.'); return; }
    const today = todayLocal();
    const firstName = (student.name || '').split(/\s+/)[0] || 'your kid';
    const { contacts, kidCount } = householdsFor([student.id]);
    scheduleSeries({
      label:    `Welcome: ${student.name || 'new visitor'}`,
      contacts, kidCount,
      summary:  `Scheduled 4 onboarding messages for ${student.parentName || `${firstName}'s parent`}.`,
      steps: [
        { fireDate: today,
          subject: `Welcome to youth, ${firstName}!`,
          body: `Hi {parent_name},\n\nSo glad ${firstName} could join us at youth! It was great to meet ${firstName} and we hope to see ${firstName} again soon.\n\nReach out anytime — we'd love to answer any questions you have.\n\n— Pastor` },
        { fireDate: dateOffset(today, 3),
          subject: `What to expect at youth`,
          body: `Hi {parent_name},\n\nThanks again for letting ${firstName} come to youth. Here's a quick "what to expect" so you know what your kid is walking into each week:\n\n• Our regular schedule:\n• What we're studying right now:\n• A few things to know:\n\nWe'd love to have ${firstName} back this week. Reach out anytime!\n— Pastor` },
        { fireDate: dateOffset(today, 14),
          subject: `Meet the youth leadership team`,
          body: `Hi {parent_name},\n\nNow that ${firstName} has been to a few weeks of youth, we wanted you to know who's investing in your kid. Our leaders:\n\n•\n•\n•\n\nWe take seriously the trust you've placed in us. Always feel free to reach out.\n— Pastor` },
        { fireDate: dateOffset(today, 30),
          subject: `An invite for ${firstName}`,
          body: `Hi {parent_name},\n\nIt's been about a month of having ${firstName} at youth — we love it! As you think about what's next, we'd love to invite ${firstName} to:\n\n• Our next big event:\n• Our small group / discipleship offering:\n\nThanks for being part of this with us.\n— Pastor` },
      ],
    });
  };

  /* ── Tier 3 #2: Event campaign series ──────────────────────── */
  const scheduleEventCampaign = (eventSpec) => {
    if (!eventSpec) return;
    const ids = (() => {
      if (eventSpec.kind === 'trip') {
        return (eventSpec.raw.roster || []).filter(r => typeof r === 'string' && r.startsWith('s_'));
      }
      return (eventSpec.raw.signups || []).filter(s => s.studentId).map(s => s.studentId);
    })();
    if (ids.length === 0) { alert('No kids are signed up for this event yet — add some, then schedule the campaign.'); return; }
    const { contacts, kidCount } = householdsFor(ids);
    if (contacts.length === 0) { alert('Signed-up kids don\'t have parent emails on file yet.'); return; }
    const eventName = eventSpec.raw.name || eventSpec.raw.title || 'event';
    const eventDate = eventSpec.date || '';
    scheduleSeries({
      label:   `Event campaign: ${eventName}`,
      contacts, kidCount,
      event:   { kind: eventSpec.kind, name: eventName, date: eventDate },
      summary: `Scheduled a full ${eventName} campaign (up to 5 broadcasts) for ${contacts.length} household${contacts.length === 1 ? '' : 's'}.`,
      steps: [
        { fireDate: dateOffset(eventDate, -14), audienceLabel: 'announce',
          subject: `Coming up: ${eventName} on ${eventDate}`,
          body: `Hi {parent_name},\n\nJust a heads-up that ${eventName} is coming up on ${eventDate} and {kid_names} {kid_count_is} signed up.\n\nMore details to come — for now, save the date!\n\n— Pastor` },
        { fireDate: dateOffset(eventDate, -7), audienceLabel: 'packing-list',
          subject: `${eventName} — packing list (1 week out)`,
          body: `Hi {parent_name},\n\nOne week until ${eventName} for {kid_names}! Here's what to pack:\n\n•\n•\n•\n\nReply with any questions!\n— Pastor` },
        { fireDate: dateOffset(eventDate, -1), audienceLabel: 'drop-off',
          subject: `${eventName} — drop-off info for tomorrow`,
          body: `Hi {parent_name},\n\n${eventName} is tomorrow! Drop-off details for {kid_names}:\n\n• Where:\n• When:\n• Bring:\n\nCan't wait!\n— Pastor` },
        { fireDate: eventDate, audienceLabel: 'during',
          subject: `${eventName} — we made it!`,
          body: `Hi {parent_name},\n\nQuick note that {kid_names} arrived safely and we're underway. We'll be back at .\n\n— Pastor` },
        { fireDate: dateOffset(eventDate, 1), audienceLabel: 'follow-up',
          subject: `Thanks for letting ${'{kid_first_name}'} come to ${eventName}!`,
          body: `Hi {parent_name},\n\nWhat a weekend with {kid_names}. A few highlights:\n\n•\n•\n\nThanks for trusting us with ${'{kid_first_name}'}!\n— Pastor` },
      ],
    });
  };

  /* ── Tier 2: Form-required-for-event warning ────────────────── */
  /* When the user picks an Event, scan every form for kids who are
     on this event's roster AND haven't signed. This nudges the user
     to send a permission-slip reminder before the event date. */
  const eventFormGaps = useMemo(() => {
    if (!selectedEvent || !eventStudentIds || eventStudentIds.size === 0) return [];
    const gaps = [];
    for (const f of formList) {
      const status = f.status || {};
      const missing = [...eventStudentIds].filter(sid => status[sid] !== 'signed');
      if (missing.length > 0) gaps.push({ form: f, missingCount: missing.length });
    }
    return gaps;
  }, [selectedEvent, eventStudentIds, formList]);

  /* ── Auto-compose recap ─────────────────────────────────────── */
  const autoComposeRecap = () => {
    const draft = buildRecapDraft({ lessons, weeklyNights, outreach, trips });
    setChannel('email');
    setSubject(draft.subject);
    setBody(draft.body);
  };
  const insertUpcomingEvents = () => {
    const block = buildUpcomingEventsBlock({ weeklyNights, outreach, trips });
    if (!block) { alert('No upcoming events in the next 60 days.'); return; }
    setBody(b => (b || '') + block);
  };
  const downloadIcs = () => {
    const ics = buildIcs({ weeklyNights, outreach, trips });
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `youth-events-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ── Acknowledgments ────────────────────────────────────────── */
  const toggleAck = (broadcastId, contact) => {
    setHistory(prev => (prev || []).map(h => {
      if (h.id !== broadcastId) return h;
      const next = { ...(h.acknowledgments || {}) };
      if (next[contact]) delete next[contact]; else next[contact] = true;
      return { ...h, acknowledgments: next };
    }));
  };
  const followUpUnacked = (broadcast) => {
    const unacked = (broadcast.contacts || []).filter(c => !(broadcast.acknowledgments || {})[c]);
    if (unacked.length === 0) { alert('Everyone has acknowledged — nothing to follow up on.'); return; }
    setChannel(broadcast.channel);
    setSubject(broadcast.subject ? `Follow-up: ${broadcast.subject}` : '');
    setBody(`Just bumping this in case it got lost:\n\n${broadcast.body || ''}`);
    setLockedStudentId('');
    /* Switch to a custom audience by clearing all filters and using
       the user's lockedStudentId path — simplest is to manually set
       audience to 'All' and rely on copy/send for the unacked group. */
    setAudience('All');
    /* Show a hint to the user — the follow-up draft is loaded but
       they'll need to use the copy-then-paste workflow for this
       custom audience since we don't have a "custom recipient list"
       state. */
    alert(`Loaded follow-up draft. Copy this list of ${unacked.length} unacked contact(s) into your mail app:\n\n${unacked.join(channel === 'email' ? ', ' : '\n')}`);
  };

  /* ── Threads ────────────────────────────────────────────────── */
  const logReply = (contact, body, broadcastId = '') => {
    if (!body.trim()) return;
    setThreads(prev => [{
      id: makeId('th'),
      contact,
      kind: 'inbound',
      body,
      at: new Date().toISOString(),
      broadcastId,
    }, ...(prev || [])]);
    /* Tier 4: when we get a new inbound reply, bump the household
       state to "needs-response" so it surfaces in the Inbox filter. */
    updateMeta(contact, { status: 'needs-response' });
  };
  const removeThread = (id) => {
    if (!confirm('Remove this thread entry?')) return;
    setThreads(prev => (prev || []).filter(t => t.id !== id));
  };

  /* Per-contact: combined timeline of inbound replies + outbound
     broadcasts that included this contact. Sorted newest first. */
  const threadFor = (contact) => {
    const inbound = threadList.filter(t => t.contact === contact).map(t => ({ ...t, _at: t.at }));
    const outbound = list.filter(h => (h.contacts || []).includes(contact) && h.status !== 'scheduled').map(h => ({
      id: h.id, kind: 'outbound', subject: h.subject, body: h.body, at: h.sentAt || h.createdAt, _at: h.sentAt || h.createdAt,
    }));
    return [...inbound, ...outbound].sort((a, b) => (b._at || '').localeCompare(a._at || ''));
  };

  /* ── Directory: every contact + kids ────────────────────────── */
  const directory = useMemo(() => {
    const map = new Map();
    for (const s of studentList) {
      const contact = s.parentEmail || s.email || s.parentPhone || s.phone;
      const key = contact || `__no-contact__${s.id}`;
      if (!map.has(key)) map.set(key, {
        key,
        contact: contact || '',
        parentName:  s.parentName || '',
        parentPhone: s.parentPhone || s.phone || '',
        parentEmail: s.parentEmail || s.email || '',
        preferredLanguage: s.preferredLanguage || '',
        kids: [],
      });
      const e = map.get(key);
      e.kids.push(s);
      if (!e.parentName  && s.parentName)  e.parentName  = s.parentName;
      if (!e.parentPhone && s.parentPhone) e.parentPhone = s.parentPhone;
      if (!e.parentEmail && s.parentEmail) e.parentEmail = s.parentEmail;
      if (!e.preferredLanguage && s.preferredLanguage) e.preferredLanguage = s.preferredLanguage;
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.parentName || a.kids[0]?.name || '').localeCompare(b.parentName || b.kids[0]?.name || '')
    );
  }, [studentList]);

  const [dirQuery, setDirQuery] = useState('');
  const visibleDirectory = useMemo(() => {
    const q = dirQuery.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(d =>
      (d.parentName || '').toLowerCase().includes(q) ||
      (d.parentEmail || '').toLowerCase().includes(q) ||
      (d.parentPhone || '').toLowerCase().includes(q) ||
      d.kids.some(k => (k.name || '').toLowerCase().includes(q))
    );
  }, [directory, dirQuery]);

  const visibleTemplates = templateList.filter(t => (t.channel || 'email') === channel);

  return (
    <YouthShell
      groupLabel="Team" groupIcon="🙋"
      icon="📨" title="Parent Communication"
      accent={ACCENT}
      subtitle="Templates, scheduled sends, acknowledgments, per-family threads, and a printable parent directory."
      stats={[
        { n: sentList.length, label: 'broadcasts sent' },
        { n: scheduledList.length, label: 'scheduled' },
        { n: directory.length, label: 'households in directory' },
      ]}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <nav className="yp-tabs" role="tablist">
        <TabButton id="home"      active={view} onClick={setView} label="🏠 Home" />
        <TabButton id="compose"   active={view} onClick={setView} label="📨 Compose" highlight={nudgeCount > 0 ? nudgeCount : null} />
        <TabButton id="inbox"     active={view} onClick={setView} label="📬 Inbox" count={inboxStats.needsResponse} countTone={inboxStats.needsResponse > 0 ? 'alert' : 'neutral'} />
        <TabButton id="scheduled" active={view} onClick={setView} label="📅 Scheduled" count={scheduledList.length} />
        <TabButton id="history"   active={view} onClick={setView} label="📜 History"   count={sentList.length} />
        <TabButton id="directory" active={view} onClick={setView} label="📒 Directory" count={directory.length} />
      </nav>

      {view === 'home' && (
        <HomeView
          nudges={nudges}
          nudgeCount={nudgeCount}
          scheduledList={scheduledList}
          sentList={sentList}
          households={households}
          directoryCount={directory.length}
          onApplyNudge={(item) => { applyNudge(item); setView('compose'); }}
          onGo={setView}
          onSendScheduledNow={sendScheduledNow}
        />
      )}

      {view === 'scheduled' && (
        <ScheduledView
          scheduledList={scheduledList}
          onSendNow={sendScheduledNow}
          onCancel={cancelScheduled}
          onPostpone={postponeScheduled}
          onGo={setView}
        />
      )}

      {view === 'history' && (
        <HistoryView
          sentList={sentList}
          ackOpenId={ackOpenId}
          setAckOpenId={setAckOpenId}
          onToggleAck={toggleAck}
          onFollowUp={followUpUnacked}
          onOpenThread={setThreadModalContact}
          onRemove={removeEntry}
          loading={loading}
        />
      )}

      {view === 'inbox' && (
        <InboxView
          directory={directory}
          metaMap={metaMap}
          metaFor={metaFor}
          updateMeta={updateMeta}
          threadList={threadList}
          history={list}
          leaders={leaderList}
          threadFor={threadFor}
          onLogReply={logReply}
          onRemoveThread={removeThread}
          onCompose={(contact) => {
            const d = directory.find(x => x.contact === contact);
            if (d?.kids?.[0]) {
              setLockedStudentId(d.kids[0].id);
              setView('compose');
            }
          }}
        />
      )}

      {view === 'compose' ? (
        <>
          {lockedStudent && (
            <>
              <div className="yp-locked-banner">
                <span className="yp-locked-banner-text">
                  ✉️ Messaging just <b>{lockedStudent.parentName || lockedStudent.name + "'s parent"}</b>
                  {' '}({lockedStudent.name || 'student'}'s household)
                </span>
                <button type="button" className="yps-btn ghost" onClick={() => setLockedStudentId('')}>✕ Switch to broadcast</button>
              </div>
              {/* Tier 4: surface this household's internal notes so the
                  pastor sees the family context BEFORE composing. */}
              {(() => {
                const lockedContact = lockedStudent.parentEmail || lockedStudent.email || lockedStudent.parentPhone || lockedStudent.phone;
                const notes = lockedContact ? (metaFor(lockedContact).internalNotes || '') : '';
                if (!notes.trim()) return null;
                return (
                  <div className="yp-locked-notes" title="Internal notes from your Inbox">
                    <span className="yp-locked-notes-icon">📝</span>
                    <span className="yp-locked-notes-label">Internal notes:</span>
                    <span className="yp-locked-notes-body">{notes}</span>
                  </div>
                );
              })()}
            </>
          )}

          <section className="yp-composer">
            <header className="yp-composer-hd">
              <h2>New {lockedStudent ? 'message' : 'broadcast'}</h2>
              <div className="yp-channel">
                <button className={`yps-chip ${channel === 'email' ? 'on' : ''}`} onClick={() => setChannel('email')}>📧 Email</button>
                <button className={`yps-chip ${channel === 'sms'   ? 'on' : ''}`} onClick={() => setChannel('sms')}>💬 SMS</button>
                <label
                  className={`yps-chip yp-ack-toggle ${requestAck ? 'on' : ''}`}
                  title="Append a 'Please reply OK to confirm' footer so you can track ack via the Thread button later"
                >
                  <input type="checkbox" checked={requestAck} onChange={e => setRequestAck(e.target.checked)} />
                  <span>📋 Request confirmation</span>
                </label>
              </div>
            </header>

            {/* Compact 4-dropdown picker grid: Templates / Audience /
                Event / Form. Replaces the previous 4-chip-row stack
                — same options, much less vertical real estate, and
                a more familiar form-control vibe. Works for both
                Email and SMS (templates filter by current channel). */}
            <div className="yp-pickers">
              <label className="yp-picker">
                <span className="yp-row-label">Template</span>
                <div className="yp-picker-with-trash">
                  <select
                    className="yps-select"
                    value={currentTemplate?.id || ''}
                    onChange={(e) => {
                      const t = templateList.find(t => t.id === e.target.value);
                      if (t) loadTemplate(t);
                      else { setSubject(''); setBody(''); }
                    }}
                  >
                    <option value="">— Pick a template ({visibleTemplates.length} {channel === 'email' ? 'email' : 'SMS'})</option>
                    {visibleTemplates.map(t => (
                      <option key={t.id} value={t.id}>{langDef(t.language).flag} {t.name}</option>
                    ))}
                  </select>
                  {currentTemplate && (
                    <button
                      type="button"
                      className="yp-picker-trash"
                      onClick={() => removeTemplate(currentTemplate.id)}
                      title="Delete this template"
                    >🗑</button>
                  )}
                </div>
              </label>

              {!lockedStudent && (
                <>
                  <label className="yp-picker">
                    <span className="yp-row-label">Audience</span>
                    <select
                      className="yps-select"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                    >
                      {GRADE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>

                  <label className="yp-picker">
                    <span className="yp-row-label">Event</span>
                    <select
                      className="yps-select"
                      value={selectedEventKey}
                      onChange={e => setSelectedEventKey(e.target.value)}
                    >
                      <option value="">— No event</option>
                      {availableEvents.filter(e => e.kind === 'trip').length > 0 && (
                        <optgroup label="🧳 Trips & Retreats">
                          {availableEvents.filter(e => e.kind === 'trip').map(e => (
                            <option key={e.key} value={e.key}>{e.label}{e.date ? ` · ${e.date}` : ''}</option>
                          ))}
                        </optgroup>
                      )}
                      {availableEvents.filter(e => e.kind === 'outreach').length > 0 && (
                        <optgroup label="🤝 Outreach">
                          {availableEvents.filter(e => e.kind === 'outreach').map(e => (
                            <option key={e.key} value={e.key}>{e.label}{e.date ? ` · ${e.date}` : ''}</option>
                          ))}
                        </optgroup>
                      )}
                      {availableEvents.length === 0 && (
                        <option disabled>(No upcoming events)</option>
                      )}
                    </select>
                  </label>

                  <label className="yp-picker">
                    <span className="yp-row-label">Form</span>
                    <select
                      className="yps-select"
                      value={selectedFormId}
                      onChange={e => setSelectedFormId(e.target.value)}
                    >
                      <option value="">— No form</option>
                      {availableForms.map(f => (
                        <option key={f.id} value={f.id}>
                          📋 {f.title || 'Untitled form'}{f.missingCount > 0 ? ` · ${f.missingCount} pending` : ''}
                        </option>
                      ))}
                      {availableForms.length === 0 && (
                        <option disabled>(No forms tracked)</option>
                      )}
                    </select>
                  </label>
                </>
              )}
            </div>

            {/* Contextual buttons + warnings that depend on the picked
                event / form — moved out of the picker rows since the
                dropdowns are now compact and don't have inline space. */}
            {!lockedStudent && (
              <div className="yp-picker-actions">
                {selectedEvent && (
                  <button
                    type="button"
                    className="yps-btn"
                    onClick={() => scheduleEventCampaign(selectedEvent)}
                    title="Auto-schedule a 5-stage broadcast pipeline (announce → packing list → drop-off → during → follow-up) relative to the event date"
                  >🚀 Schedule full campaign for this event</button>
                )}
                {selectedForm && (
                  <button
                    type="button"
                    className="yps-btn"
                    onClick={() => scheduleFormReminderSeries(selectedForm)}
                    disabled={!selectedForm.dueDate}
                    title={selectedForm.dueDate
                      ? `Create 3 scheduled reminders (1 week / 2 days / day-of ${selectedForm.dueDate}) for parents missing this form`
                      : 'This form needs a due date first — set one on the Forms page'}
                  >📅 Schedule reminder series</button>
                )}
                {selectedForm && !selectedForm.dueDate && (
                  <span className="yp-row-muted">⚠ Form needs a due date (Forms page) to enable reminder series.</span>
                )}
              </div>
            )}

            {/* Form-required-for-event warning: stacks below the
                picker grid so it can grow without breaking layout. */}
            {!lockedStudent && eventFormGaps.length > 0 && (
              <div className="yp-form-gap-warn">
                ⚠️ <b>Forms missing for this event:</b>
                {eventFormGaps.map(gap => (
                  <button
                    key={gap.form.id}
                    type="button"
                    className="yps-chip yp-form-gap-chip"
                    onClick={() => setSelectedFormId(gap.form.id)}
                    title={`Switch the recipients to the ${gap.missingCount} parent(s) missing this form`}
                  >📋 {gap.form.title} · {gap.missingCount} missing</button>
                ))}
              </div>
            )}

            <div className="yp-recipients-summary">
              <span className="yp-recipients-summary-n">
                {households.length} household{households.length === 1 ? '' : 's'}
                {kidCount !== households.length && ` (${kidCount} kid${kidCount === 1 ? '' : 's'})`}
              </span>
              {selectedEvent && <span className="yp-recipients-summary-hint">· signed up for <b>{selectedEvent.raw.name || selectedEvent.raw.title}</b></span>}
              {selectedForm && <span className="yp-recipients-summary-hint">· still need <b>{selectedForm.title}</b></span>}
              {perRecipientMode && <span className="yp-personalized-badge" title="One personalized draft per family">✨ Personalized</span>}
              {hasTranslations && perRecipientMode && (
                <span className="yp-personalized-badge yp-lang-badge" title="Households with a preferred language get the matching translation">🌐 Multilingual</span>
              )}
            </div>

            {channel === 'email' && (
              <input
                className="yps-input"
                placeholder="Subject line… ({event_name}, {kid_first_name}, etc.)"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            )}
            <textarea
              className="yps-textarea"
              rows={channel === 'email' ? 10 : 5}
              placeholder={channel === 'email'
                ? 'Hi {parent_name}, …\n\nUse {parent_name}, {kid_name}, {kid_first_name}, {event_name}, {event_date}, {form_name}, {form_due} as placeholders.'
                : 'Short message — under 160 chars works best.'}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
            {channel === 'sms' && (
              <div className={`yp-sms-count ${resolvedBody.length > 160 ? 'over' : ''}`}>{resolvedBody.length} / 160</div>
            )}

            {(subject !== resolvedSubject || body !== resolvedBody) && (
              <details className="yp-preview" open={perRecipientMode}>
                <summary>
                  👀 Preview
                  {perRecipientMode && households.length > 0 && (
                    <span className="yp-preview-for"> as {households[0].parentName || `${households[0].kidNames || 'first household'}'s parent`} will see it</span>
                  )}
                </summary>
                <div className="yp-preview-body">
                  {channel === 'email' && resolvedSubject && <div><b>Subject:</b> {resolvedSubject}</div>}
                  <div className="yp-preview-text">{resolvedBody}</div>
                </div>
              </details>
            )}

            {/* Action bar — workflow is: Copy the message, paste into
                your mail/SMS app of choice, send, then click
                "✓ Log on Send" to record it. Convenience openers for
                mail/sms live in ⋯ More for users who want a one-tap
                shortcut. */}
            <div className="yp-composer-actions">
              <button
                className="yps-add-btn yp-action-primary"
                onClick={() => logSend('sent')}
                disabled={!canSend}
                title="Record this broadcast as sent — after you've actually sent it from your mail / SMS app."
              >✓ Log on Send</button>
              <button className="yps-btn" onClick={copyBody} disabled={!canSend} title="Copy the message (or all personalized) to clipboard">
                📋 Copy {perRecipientMode ? 'all personalized' : 'message'}
              </button>
              <button className="yps-btn" onClick={copyAddresses} disabled={contacts.length === 0}>
                📋 Copy {channel === 'email' ? 'addresses' : 'numbers'}
              </button>
              <div className="yp-more-wrap">
                <button
                  type="button"
                  className="yps-btn"
                  onClick={() => setShowMoreMenu(m => !m)}
                  aria-expanded={showMoreMenu}
                  title="More actions"
                >⋯ More</button>
                {showMoreMenu && (
                  <div className="yp-more-menu" onClick={() => setShowMoreMenu(false)}>
                    <div className="yp-more-section">
                      <div className="yp-more-section-hd">One-tap open (optional)</div>
                      {!perRecipientMode && channel === 'email' && (
                        <button type="button" onClick={openBulkInMailApp} disabled={!canSend}>📧 Open in mail app (BCC pre-filled)</button>
                      )}
                      {!perRecipientMode && channel === 'sms' && (
                        <button type="button" onClick={openBulkInSmsApp} disabled={!canSend}>💬 Open in messages</button>
                      )}
                      {perRecipientMode && (
                        <button type="button" onClick={openAllPersonalized} disabled={!canSend || (personalizedDrafts || []).length === 0}>
                          {channel === 'email' ? '📧' : '💬'} Open {(personalizedDrafts || []).length} personalized drafts
                        </button>
                      )}
                    </div>
                    <div className="yp-more-section">
                      <div className="yp-more-section-hd">Schedule</div>
                      <button type="button" onClick={() => { setShowScheduleForm(true); setShowMoreMenu(false); }} disabled={!canSend}>📅 Schedule for later…</button>
                    </div>
                    <div className="yp-more-section">
                      <div className="yp-more-section-hd">Quick fill</div>
                      <button type="button" onClick={autoComposeRecap}>✨ Weekly recap</button>
                      <button type="button" onClick={insertUpcomingEvents}>📅 Insert upcoming events</button>
                      <button type="button" onClick={downloadIcs}>📎 Download .ics</button>
                    </div>
                    <div className="yp-more-section">
                      <div className="yp-more-section-hd">Templates</div>
                      <button type="button" onClick={() => { setShowSaveTemplate(true); setShowMoreMenu(false); }} disabled={!body && !subject}>💾 Save current as template</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showScheduleForm && (
              <div className="yp-save-template yp-schedule-form">
                <label className="yp-row-label">Send on</label>
                <input type="date" className="yps-input" value={scheduleDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setScheduleDate(e.target.value)} />
                <label className="yp-row-label">Repeat</label>
                <select className="yps-select" value={scheduleCadence} onChange={e => setScheduleCadence(e.target.value)}>
                  <option value="none">Just once</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <button className="yps-add-btn" onClick={scheduleBroadcast} disabled={!canSend || !scheduleDate}>📅 Schedule it</button>
                <button className="yps-btn ghost" onClick={() => setShowScheduleForm(false)}>Cancel</button>
              </div>
            )}

            {showSaveTemplate && (
              <div className="yp-save-template">
                <input
                  className="yps-input"
                  placeholder="Template name (e.g. 'Camp follow-up')"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveAsTemplate(); } }}
                  autoFocus
                />
                <select className="yps-select" value={newTemplateLang} onChange={e => setNewTemplateLang(e.target.value)}>
                  {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.flag} {l.label}</option>)}
                </select>
                <button className="yps-add-btn" onClick={saveAsTemplate} disabled={!newTemplateName.trim()}>💾 Save</button>
                <button className="yps-btn ghost" onClick={() => { setShowSaveTemplate(false); setNewTemplateName(''); }}>Cancel</button>
              </div>
            )}

            {perRecipientMode && (personalizedDrafts || []).length > 0 && (
              <details className="yp-drafts" open>
                <summary>📨 Personalized drafts ({personalizedDrafts.length})</summary>
                <ul className="yp-drafts-list">
                  {personalizedDrafts.map(d => (
                    <li key={d.household.contact} className="yp-draft-row">
                      <div className="yp-draft-info">
                        <div className="yp-draft-to">
                          <span className="yp-draft-contact">{d.household.contact}</span>
                          <span className="yp-draft-kids">
                            {d.household.parentName ? `${d.household.parentName} · ` : ''}
                            {d.household.kidNames || '(unknown kid)'}
                          </span>
                          {hasTranslations && d.household.preferredLanguage && (
                            <span className="yp-draft-lang" title={`${d.language} version`}>{langDef(d.language).flag}</span>
                          )}
                        </div>
                        {channel === 'email' && d.subject && <div className="yp-draft-subject"><b>Subject:</b> {d.subject}</div>}
                        <div className="yp-draft-body">{d.body}</div>
                      </div>
                      <button type="button" className="yps-btn" onClick={() => openOnePersonalized(d)}>{channel === 'email' ? '📧' : '💬'} Open</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!perRecipientMode && households.length > 0 && (
              <details className="yp-recipients">
                <summary>Preview recipients ({households.length} household{households.length === 1 ? '' : 's'})</summary>
                <ul className="yp-recipients-list">
                  {households.map(h => (
                    <li key={h.contact} className="yp-recipients-row">
                      <span className="yp-recipients-contact">{h.contact}</span>
                      <span className="yp-recipients-kids">{h.kids.map(k => k.name || '(unnamed)').join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

        </>
      ) : null}

      {view === 'directory' && (
        <DirectoryView
          directory={visibleDirectory}
          query={dirQuery}
          setQuery={setDirQuery}
          onMessage={(contactKey) => {
            const entry = directory.find(d => d.key === contactKey);
            if (!entry || !entry.kids[0]) return;
            setLockedStudentId(entry.kids[0].id);
            setView('compose');
          }}
          onOpenThread={(contact) => setThreadModalContact(contact)}
          threadList={threadList}
        />
      )}

      {threadModalContact && (
        <ThreadModal
          contact={threadModalContact}
          household={households.find(h => h.contact === threadModalContact) ||
                     directory.find(d => d.contact === threadModalContact)}
          entries={threadFor(threadModalContact)}
          onLogReply={(b) => logReply(threadModalContact, b)}
          onRemove={removeThread}
          onClose={() => setThreadModalContact(null)}
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
   Parent Directory — alphabetical list of every household with
   their kids underneath. Printable via the @media print CSS.
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   TabButton — pill in the top navigation, with optional count
   badge or "highlight" pip for unread/actionable.
   ───────────────────────────────────────────────────────────── */
function TabButton({ id, active, onClick, label, count, countTone, highlight }) {
  const isOn = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isOn}
      className={`yp-tab ${isOn ? 'on' : ''}`}
      onClick={() => onClick(id)}
    >
      <span className="yp-tab-label">{label}</span>
      {count !== undefined && count !== null && (
        <span className={`yp-tab-count ${countTone === 'alert' && count > 0 ? 'yp-tab-count-alert' : ''}`}>{count}</span>
      )}
      {highlight ? (
        <span className="yp-tab-highlight" title={`${highlight} pastoral moments waiting`}>✨ {highlight}</span>
      ) : null}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   HomeView — landing dashboard. Surfaces what's "live" right now:
   pastoral nudges, today's scheduled, recent sent. Heavy
   navigation hooks to the other tabs.
   ───────────────────────────────────────────────────────────── */
function HomeView({ nudges, nudgeCount, scheduledList, sentList, households, directoryCount, onApplyNudge, onGo, onSendScheduledNow }) {
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = scheduledList.filter(h => h.scheduledFor === today);
  const recentSent = sentList.slice(0, 3);
  const sentThisWeek = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    return sentList.filter(h => (h.sentAt || h.createdAt || '') >= cutoff).length;
  }, [sentList]);

  return (
    <section className="yp-home">
      {/* Greeting + at-a-glance stats. */}
      <header className="yp-home-hero">
        <div>
          <h2 className="yp-home-title">Hi there 👋</h2>
          <p className="yp-home-sub">
            {nudgeCount > 0
              ? `You have ${nudgeCount} pastoral moment${nudgeCount === 1 ? '' : 's'} waiting and ${dueToday.length} broadcast${dueToday.length === 1 ? '' : 's'} going out today.`
              : 'Nothing urgent right now — a great day to check in on a family.'}
          </p>
        </div>
        <div className="yp-home-hero-actions">
          <button className="yps-add-btn" onClick={() => onGo('compose')}>📨 New broadcast</button>
        </div>
      </header>

      <div className="yp-home-grid">
        <div className="yp-home-stat">
          <div className="yp-home-stat-n">{directoryCount}</div>
          <div className="yp-home-stat-label">households in directory</div>
        </div>
        <div className="yp-home-stat">
          <div className="yp-home-stat-n">{sentThisWeek}</div>
          <div className="yp-home-stat-label">broadcasts this week</div>
        </div>
        <div className="yp-home-stat">
          <div className="yp-home-stat-n">{scheduledList.length}</div>
          <div className="yp-home-stat-label">scheduled ahead</div>
        </div>
        <div className="yp-home-stat">
          <div className="yp-home-stat-n">{nudgeCount}</div>
          <div className="yp-home-stat-label">pastoral moments</div>
        </div>
      </div>

      {/* Today's scheduled — most actionable thing. */}
      {dueToday.length > 0 && (
        <div className="yp-home-card yp-home-card-due">
          <header className="yp-home-card-hd">
            <h3>📅 Going out today ({dueToday.length})</h3>
            <button className="yps-btn ghost" onClick={() => onGo('scheduled')}>View all scheduled →</button>
          </header>
          <ul className="yp-home-due-list">
            {dueToday.slice(0, 3).map(h => (
              <li key={h.id} className="yp-home-due-row">
                <span className="yp-home-due-info">
                  <b>{h.subject || h.body?.slice(0, 60) || '(no subject)'}</b>
                  <span className="yp-row-muted"> · {h.householdCount} household{h.householdCount === 1 ? '' : 's'}</span>
                </span>
                <button className="yps-btn" onClick={() => onSendScheduledNow(h)}>📤 Send now</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pastoral moments — the headline tier-1 feature. */}
      {nudgeCount > 0 && (
        <div className="yp-home-card">
          <PastoralMomentsPanel nudges={nudges} onApply={onApplyNudge} />
        </div>
      )}

      {/* Recently sent — quick orientation. */}
      {recentSent.length > 0 && (
        <div className="yp-home-card">
          <header className="yp-home-card-hd">
            <h3>📜 Recently sent</h3>
            <button className="yps-btn ghost" onClick={() => onGo('history')}>View all history →</button>
          </header>
          <ul className="yp-home-recent">
            {recentSent.map(h => (
              <li key={h.id} className="yp-home-recent-row">
                <span className="yps-pill">{h.channel === 'email' ? '📧' : '💬'}</span>
                <span className="yp-home-recent-subject">{h.subject || h.body?.slice(0, 60) || '(no subject)'}</span>
                <span className="yp-row-muted">{h.sentAt && new Date(h.sentAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty-state when nothing's up. */}
      {nudgeCount === 0 && dueToday.length === 0 && recentSent.length === 0 && (
        <div className="yps-empty">
          <div className="yps-empty-icon">📨</div>
          <div className="yps-empty-title">All quiet — ready when you are</div>
          <div className="yps-empty-sub">Click <b>📨 New broadcast</b> above to write your first message, or <b>📒 Directory</b> to browse families.</div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   ScheduledView — just the upcoming-scheduled broadcasts, with
   send-now / cancel buttons. Empty state nudges back to compose.
   ───────────────────────────────────────────────────────────── */
function ScheduledView({ scheduledList, onSendNow, onCancel, onPostpone, onGo }) {
  if (scheduledList.length === 0) {
    return (
      <div className="yps-empty">
        <div className="yps-empty-icon">📅</div>
        <div className="yps-empty-title">Nothing scheduled</div>
        <div className="yps-empty-sub">Compose a broadcast and pick <b>📅 Schedule</b> under <b>⋯ More</b> to queue it up.</div>
        <button className="yps-add-btn" style={{ marginTop: 14 }} onClick={() => onGo('compose')}>📨 Compose now</button>
      </div>
    );
  }
  /* Group by series label so multi-stage campaigns / welcome
     sequences cluster together visually instead of mixing with
     one-off scheduled broadcasts. */
  const groups = new Map();
  for (const h of scheduledList) {
    const key = h.seriesLabel || '__solo__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const renderRow = (h) => (
    <li key={h.id} className="yp-history-row yp-scheduled-row">
      <div className="yp-history-head">
        <span className="yps-pill accent">📅 {h.scheduledFor}</span>
        <span className="yps-pill">{h.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
        <span className="yps-pill">{h.audience}</span>
        {h.form && <span className="yps-pill">📋 {h.form.name}</span>}
        {h.event && <span className="yps-pill">{h.event.kind === 'trip' ? '🧳' : '🤝'} {h.event.name}</span>}
        {h.cadence && h.cadence !== 'none' && (
          <span className="yps-pill accent" title={`Auto-creates the next ${h.cadence} occurrence when you click Send now`}>🔄 {h.cadence}</span>
        )}
        <span className="yp-history-count" style={{ marginLeft: 'auto' }}>
          {h.householdCount} household{h.householdCount === 1 ? '' : 's'}
        </span>
        <button className="yps-btn" onClick={() => onSendNow(h)}>📤 Send now</button>
        <button className="yps-btn ghost" onClick={() => onPostpone(h.id, 7)} title="Push this broadcast forward by 7 days (skip this week)">⏸ Skip 1wk</button>
        <button className="yps-btn ghost" onClick={() => onCancel(h.id)}>✕ Cancel</button>
      </div>
      {h.subject && <div className="yp-history-subject"><b>Subject:</b> {h.subject}</div>}
      <div className="yp-history-body">{h.body}</div>
    </li>
  );
  return (
    <section className="yp-scheduled">
      <h2 className="yps-section-title">📅 Scheduled ({scheduledList.length})</h2>
      {Array.from(groups.entries()).map(([key, items]) => (
        key === '__solo__' ? (
          <ul key={key} className="yp-history-list">{items.map(renderRow)}</ul>
        ) : (
          <div key={key} className="yp-scheduled-group">
            <header className="yp-scheduled-group-hd">
              <span className="yp-scheduled-group-icon">🧵</span>
              <span className="yp-scheduled-group-label">{key}</span>
              <span className="yp-scheduled-group-count">{items.length} step{items.length === 1 ? '' : 's'}</span>
            </header>
            <ul className="yp-history-list">{items.map(renderRow)}</ul>
          </div>
        )
      ))}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   HistoryView — sent broadcasts with ack tracking + filter chips.
   ───────────────────────────────────────────────────────────── */
function HistoryView({ sentList, ackOpenId, setAckOpenId, onToggleAck, onFollowUp, onOpenThread, onRemove, loading }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const filtered = sentList.filter(h =>
    channelFilter === 'all' ? true : h.channel === channelFilter
  );

  return (
    <section className="yp-history">
      <header className="yp-history-hd">
        <h2 className="yps-section-title">📜 History ({sentList.length})</h2>
        <div className="yp-history-filters">
          <button className={`yps-chip ${channelFilter === 'all'   ? 'on' : ''}`} onClick={() => setChannelFilter('all')}>All</button>
          <button className={`yps-chip ${channelFilter === 'email' ? 'on' : ''}`} onClick={() => setChannelFilter('email')}>📧 Email</button>
          <button className={`yps-chip ${channelFilter === 'sms'   ? 'on' : ''}`} onClick={() => setChannelFilter('sms')}>💬 SMS</button>
        </div>
      </header>
      {loading && sentList.length === 0 ? (
        <div className="yps-empty"><div className="yps-empty-icon">📨</div><div className="yps-empty-title">Loading…</div></div>
      ) : filtered.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">📨</div>
          <div className="yps-empty-title">{sentList.length === 0 ? 'No broadcasts logged yet' : 'No matches for this filter'}</div>
          <div className="yps-empty-sub">{sentList.length === 0 ? 'Once you log a sent message it\'ll appear here.' : 'Try clearing the channel filter.'}</div>
        </div>
      ) : (
        <ul className="yp-history-list">
          {filtered.map(h => {
            const acks    = h.acknowledgments || {};
            const ackedN  = Object.keys(acks).filter(c => acks[c]).length;
            const totalN  = (h.contacts || []).length || h.recipientCount || 0;
            const isOpen  = ackOpenId === h.id;
            return (
              <li key={h.id} className="yp-history-row">
                <div className="yp-history-head">
                  <span className="yps-pill accent">{h.channel === 'email' ? '📧 Email' : '💬 SMS'}</span>
                  <span className="yps-pill">{h.audience}</span>
                  {h.event && <span className="yps-pill">{h.event.kind === 'trip' ? '🧳' : '🤝'} {h.event.name}</span>}
                  {h.form && <span className="yps-pill">📋 {h.form.name}</span>}
                  {h.personalized && <span className="yps-pill accent">✨ personalized</span>}
                  <span className="yp-history-when">{h.sentAt && new Date(h.sentAt).toLocaleString()}</span>
                  <span className="yp-history-count">
                    {h.householdCount != null
                      ? `${h.householdCount} hh${h.kidCount && h.kidCount !== h.householdCount ? ` · ${h.kidCount} kids` : ''}`
                      : `${h.recipientCount} recipients`}
                  </span>
                  {totalN > 0 && (
                    <button
                      className={`yps-chip ${ackedN === totalN ? 'on' : ''}`}
                      onClick={() => setAckOpenId(isOpen ? null : h.id)}
                      title="Track which households have replied / confirmed"
                    >✓ Ack {ackedN}/{totalN}</button>
                  )}
                  <button className="yps-btn ghost" onClick={() => onRemove(h.id)}>✕</button>
                </div>
                {h.subject && <div className="yp-history-subject"><b>Subject:</b> {h.subject}</div>}
                <div className="yp-history-body">{h.body}</div>
                {isOpen && totalN > 0 && (
                  <div className="yp-ack-panel">
                    <div className="yp-ack-panel-hd">
                      <b>Acknowledgments</b>
                      <button className="yps-btn" onClick={() => onFollowUp(h)} disabled={ackedN === totalN}>
                        📨 Follow up with unacked ({totalN - ackedN})
                      </button>
                    </div>
                    <ul className="yp-ack-list">
                      {(h.contacts || []).map(c => (
                        <li key={c} className="yp-ack-row">
                          <label>
                            <input type="checkbox" checked={!!acks[c]} onChange={() => onToggleAck(h.id, c)} />
                            <span className="yp-ack-contact">{c}</span>
                          </label>
                          <button
                            type="button"
                            className="yps-btn ghost"
                            onClick={() => onOpenThread(c)}
                            title="View / log replies for this family"
                          >📝 Thread</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   InboxView — Tier 4 two-way conversation hub. Split layout:
   left = households list (filterable by status), right = the
   selected household's thread + reply form + meta controls
   (status, assignee, internal notes, quick reply templates).
   ───────────────────────────────────────────────────────────── */

/* One-click reply stock answers — match common short pastoral
   responses so the user can drop a reply with a single tap. */
const REPLY_QUICK_TEMPLATES = [
  { label: '👍 Got it, thanks!',     body: 'Got it — thanks for letting me know! 🙂' },
  { label: '✓ Will do',              body: 'Will do — appreciate the heads-up!' },
  { label: '🙏 Praying',             body: "Thanks for sharing that with me. Praying for you and your family this week." },
  { label: '📞 Let\'s talk',         body: "Thanks for reaching out — would love to talk this through. What's a good time this week to chat?" },
  { label: '✅ Confirmed',           body: "Confirmed — you're all set. Thanks!" },
];

const STATUS_LABEL = {
  'open':           { label: '💬 Open',           tone: 'neutral' },
  'needs-response': { label: '🔔 Needs response', tone: 'alert'   },
  'closed':         { label: '✓ Closed',          tone: 'good'    },
};

function InboxView({ directory, metaMap, metaFor, updateMeta, threadList, history, leaders, threadFor, onLogReply, onRemoveThread, onCompose }) {
  /* Filter chip controlling which households show in the left list. */
  const [filter, setFilter] = useState('needs-response');
  const [query, setQuery]   = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [replyBody, setReplyBody] = useState('');

  /* Build the inbox list: every household that has either a thread
     entry OR a meta record (status/assignee/notes set). Sorted by
     most-recent activity. */
  const inboxRows = useMemo(() => {
    const map = new Map();
    /* Households we have meta on. */
    for (const k of Object.keys(metaMap || {})) {
      if (!map.has(k)) map.set(k, { contact: k, lastAt: '' });
    }
    /* Households with thread entries. */
    for (const t of (threadList || [])) {
      if (!map.has(t.contact)) map.set(t.contact, { contact: t.contact, lastAt: '' });
      const at = t.at || '';
      if (at > map.get(t.contact).lastAt) map.get(t.contact).lastAt = at;
    }
    /* Pull each entry's directory record + meta state. */
    return Array.from(map.values()).map(r => {
      const d  = directory.find(x => x.contact === r.contact);
      const m  = metaFor(r.contact);
      const inboundN = (threadList || []).filter(t => t.contact === r.contact && t.kind === 'inbound').length;
      return {
        contact: r.contact,
        parentName: d?.parentName || '',
        kidNames:   d?.kids?.map(k => k.name).filter(Boolean).join(', ') || '',
        lastAt:     r.lastAt,
        inboundN,
        status:     m.status,
        assignedLeaderId: m.assignedLeaderId,
        leader:     leaders.find(l => l.id === m.assignedLeaderId),
        internalNotes: m.internalNotes,
      };
    })
    .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  }, [directory, metaMap, threadList, leaders, metaFor]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inboxRows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (r.parentName || '').toLowerCase().includes(q)
          || (r.kidNames || '').toLowerCase().includes(q)
          || (r.contact || '').toLowerCase().includes(q);
    });
  }, [inboxRows, filter, query]);

  /* Auto-select first row when filter changes / on mount. */
  useEffect(() => {
    if (filtered.length === 0) { setSelectedContact(null); return; }
    if (!filtered.find(r => r.contact === selectedContact)) {
      setSelectedContact(filtered[0].contact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);

  const selected = filtered.find(r => r.contact === selectedContact) ||
                   inboxRows.find(r => r.contact === selectedContact);
  const selectedThread = selected ? threadFor(selected.contact) : [];

  const sendReply = () => {
    if (!selectedContact || !replyBody.trim()) return;
    onLogReply(selectedContact, replyBody);
    setReplyBody('');
  };
  const insertTemplate = (tmpl) => setReplyBody(b => b ? `${b}\n${tmpl.body}` : tmpl.body);

  return (
    <section className="yp-inbox">
      <header className="yp-inbox-hd">
        <h2 className="yps-section-title">📬 Inbox</h2>
        <div className="yp-inbox-filters">
          {[
            ['needs-response', '🔔 Needs response', inboxRows.filter(r => r.status === 'needs-response').length],
            ['open',           '💬 Open',           inboxRows.filter(r => r.status === 'open').length],
            ['closed',         '✓ Closed',          inboxRows.filter(r => r.status === 'closed').length],
            ['all',            'All',               inboxRows.length],
          ].map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`yps-chip ${filter === id ? 'on' : ''}`}
              onClick={() => setFilter(id)}
            >{label} <span className="yp-inbox-filter-n">{count}</span></button>
          ))}
        </div>
      </header>

      {inboxRows.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">📬</div>
          <div className="yps-empty-title">Your inbox is empty</div>
          <div className="yps-empty-sub">
            Once a parent replies and you log it from a thread (or via the History tab's "📝 Thread" button), it'll show up here.
          </div>
        </div>
      ) : (
        <div className="yp-inbox-split">
          {/* LEFT: household list */}
          <aside className="yp-inbox-list">
            <input
              className="yps-input yp-inbox-search"
              placeholder="🔍 Search families…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {filtered.length === 0 ? (
              <div className="yp-row-muted" style={{ padding: 12 }}>No matches.</div>
            ) : (
              <ul className="yp-inbox-rows">
                {filtered.map(r => {
                  const sLabel = STATUS_LABEL[r.status] || STATUS_LABEL.open;
                  return (
                    <li key={r.contact}>
                      <button
                        type="button"
                        className={`yp-inbox-row ${selectedContact === r.contact ? 'on' : ''} yp-inbox-row-${sLabel.tone}`}
                        onClick={() => setSelectedContact(r.contact)}
                      >
                        <div className="yp-inbox-row-name">{r.parentName || r.contact}</div>
                        <div className="yp-inbox-row-meta">
                          <span className="yp-inbox-row-kids">{r.kidNames || '—'}</span>
                          {r.leader && <span className="yps-pill">👤 {r.leader.name}</span>}
                        </div>
                        <div className="yp-inbox-row-status">
                          <span className={`yps-pill yp-inbox-status-${sLabel.tone}`}>{sLabel.label}</span>
                          {r.inboundN > 0 && <span className="yp-inbox-row-count">{r.inboundN} repl{r.inboundN === 1 ? 'y' : 'ies'}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* RIGHT: selected household */}
          <main className="yp-inbox-detail">
            {!selected ? (
              <div className="yps-empty" style={{ minHeight: 320 }}>
                <div className="yps-empty-icon">👈</div>
                <div className="yps-empty-title">Pick a family</div>
                <div className="yps-empty-sub">Choose a household on the left to view their conversation.</div>
              </div>
            ) : (
              <InboxDetail
                row={selected}
                thread={selectedThread}
                leaders={leaders}
                onUpdateMeta={(patch) => updateMeta(selected.contact, patch)}
                onCompose={() => onCompose(selected.contact)}
                onRemoveThread={onRemoveThread}
                replyBody={replyBody}
                setReplyBody={setReplyBody}
                onSendReply={sendReply}
                onInsertTemplate={insertTemplate}
              />
            )}
          </main>
        </div>
      )}
    </section>
  );
}

function InboxDetail({ row, thread, leaders, onUpdateMeta, onCompose, onRemoveThread, replyBody, setReplyBody, onSendReply, onInsertTemplate }) {
  const sLabel = STATUS_LABEL[row.status] || STATUS_LABEL.open;
  return (
    <>
      <header className="yp-inbox-detail-hd">
        <div className="yp-inbox-detail-hd-main">
          <div className="yp-inbox-detail-name">{row.parentName || row.contact}</div>
          <div className="yp-inbox-detail-meta">
            <span>{row.contact}</span>
            {row.kidNames && <span> · {row.kidNames}</span>}
          </div>
        </div>
        <div className="yp-inbox-detail-hd-actions">
          <button type="button" className="yps-add-btn" onClick={onCompose}>📨 New message</button>
        </div>
      </header>

      {/* Status + assignee + internal-notes meta strip */}
      <div className="yp-inbox-meta-strip">
        <div className="yp-inbox-meta-block">
          <span className="yp-row-label">Status</span>
          <div className="yp-inbox-meta-status-chips">
            {Object.entries(STATUS_LABEL).map(([id, def]) => (
              <button
                key={id}
                type="button"
                className={`yps-chip ${row.status === id ? 'on' : ''} yp-inbox-status-${def.tone}`}
                onClick={() => onUpdateMeta({ status: id })}
              >{def.label}</button>
            ))}
          </div>
        </div>

        <div className="yp-inbox-meta-block">
          <span className="yp-row-label">Assigned to</span>
          <select
            className="yps-select"
            value={row.assignedLeaderId || ''}
            onChange={e => onUpdateMeta({ assignedLeaderId: e.target.value })}
          >
            <option value="">— Unassigned</option>
            {leaders.filter(l => l.status !== 'inactive').map(l => (
              <option key={l.id} value={l.id}>{l.name || '(unnamed)'}</option>
            ))}
          </select>
        </div>

        <div className="yp-inbox-meta-block yp-inbox-meta-notes">
          <span className="yp-row-label">Internal notes (leaders only)</span>
          <textarea
            className="yps-textarea"
            rows={2}
            placeholder="Prefers SMS · Single dad · Speaks Spanish at home…"
            value={row.internalNotes || ''}
            onChange={e => onUpdateMeta({ internalNotes: e.target.value })}
          />
        </div>
      </div>

      {/* Thread timeline. */}
      <div className="yp-inbox-thread-wrap">
        {thread.length === 0 ? (
          <div className="yp-row-muted" style={{ padding: 14 }}>No conversation yet. Use the reply form below to log inbound notes, or hit "📨 New message" to send a fresh broadcast.</div>
        ) : (
          <ul className="yp-thread-list">
            {thread.map(e => (
              <li key={e.id} className={`yp-thread-row yp-thread-${e.kind}`}>
                <div className="yp-thread-meta">
                  <span className="yp-thread-kind">{e.kind === 'outbound' ? '📤 Sent' : '📥 Reply'}</span>
                  <span className="yp-thread-when">{e._at && new Date(e._at).toLocaleString()}</span>
                  {e.kind === 'inbound' && (
                    <button className="yps-btn ghost" onClick={() => onRemoveThread(e.id)} title="Remove this entry">✕</button>
                  )}
                </div>
                {e.subject && <div className="yp-thread-subject"><b>Subject:</b> {e.subject}</div>}
                <div className="yp-thread-body">{e.body}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reply form. */}
      <footer className="yp-inbox-reply">
        <div className="yp-inbox-reply-templates">
          {REPLY_QUICK_TEMPLATES.map(t => (
            <button
              key={t.label}
              type="button"
              className="yps-chip"
              onClick={() => onInsertTemplate(t)}
              title={t.body}
            >{t.label}</button>
          ))}
        </div>
        <div className="yp-inbox-reply-row">
          <textarea
            className="yps-textarea"
            rows={3}
            placeholder="Log an inbound reply or note from this family…"
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
          />
          <button className="yps-add-btn" onClick={onSendReply} disabled={!replyBody.trim()}>📥 Log reply</button>
        </div>
      </footer>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pastoral Moments — top-of-composer panel showing data-driven
   ministry nudges (birthdays, milestones, missing kids, etc.).
   Each item has a one-click "📨 Compose" that pre-fills the
   composer below with a template + locked household.
   ───────────────────────────────────────────────────────────── */
function PastoralMomentsPanel({ nudges, onApply }) {
  const total = nudges.reduce((n, g) => n + g.items.length, 0);
  /* Collapsed by default once you have 4+ groups so the page
     doesn't drown in pastoral data on a Sunday morning. */
  const [collapsed, setCollapsed] = useState(nudges.length >= 4);
  return (
    <section className={`yp-pastoral ${collapsed ? 'collapsed' : ''}`}>
      <header className="yp-pastoral-hd" onClick={() => setCollapsed(c => !c)}>
        <span className="yp-pastoral-hd-icon">🌟</span>
        <span className="yp-pastoral-hd-title">Pastoral moments</span>
        <span className="yp-pastoral-hd-count">{total}</span>
        <span className="yp-pastoral-hd-chev">{collapsed ? '▸' : '▾'}</span>
      </header>
      {!collapsed && (
        <div className="yp-pastoral-body">
          {nudges.map(g => (
            <div key={g.id} className={`yp-nudge yp-nudge-${g.tone}`}>
              <div className="yp-nudge-hd">
                <span className="yp-nudge-icon">{g.icon}</span>
                <span className="yp-nudge-label">{g.label}</span>
                <span className="yp-nudge-count">{g.items.length}</span>
              </div>
              <ul className="yp-nudge-items">
                {g.items.slice(0, 6).map(it => (
                  <li key={it.key} className="yp-nudge-item">
                    <div className="yp-nudge-item-info">
                      <span className="yp-nudge-item-label">{it.label}</span>
                      {it.subLabel && <span className="yp-nudge-item-sub">{it.subLabel}</span>}
                    </div>
                    <button
                      type="button"
                      className="yps-btn yp-nudge-compose"
                      onClick={() => onApply(it)}
                      title="Load this into the composer below"
                    >📨 Compose</button>
                  </li>
                ))}
                {g.items.length > 6 && (
                  <li className="yp-nudge-item-more">… +{g.items.length - 6} more</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DirectoryView({ directory, query, setQuery, onMessage, onOpenThread, threadList }) {
  const printable = () => {
    document.body.classList.add('yp-printing');
    window.print();
    setTimeout(() => document.body.classList.remove('yp-printing'), 1000);
  };
  const replyCounts = useMemo(() => {
    const m = {};
    (threadList || []).forEach(t => { m[t.contact] = (m[t.contact] || 0) + 1; });
    return m;
  }, [threadList]);

  return (
    <section className="yp-directory">
      <header className="yp-directory-hd">
        <h2 className="yps-section-title">📒 Parent Directory ({directory.length} household{directory.length === 1 ? '' : 's'})</h2>
        <div className="yp-directory-actions">
          <input
            className="yps-input"
            placeholder="🔍 Search by parent, kid, email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="yps-btn" onClick={printable} title="Print a paper copy for emergencies">🖨 Print</button>
        </div>
      </header>
      {directory.length === 0 ? (
        <div className="yps-empty">
          <div className="yps-empty-icon">📒</div>
          <div className="yps-empty-title">{query ? 'No matches' : 'No parents yet'}</div>
          <div className="yps-empty-sub">{query ? 'Try a different search.' : 'Add students with parent info on the All Students page.'}</div>
        </div>
      ) : (
        <ul className="yp-dir-list">
          {directory.map(d => (
            <li key={d.key} className="yp-dir-row">
              <div className="yp-dir-main">
                <div className="yp-dir-name-row">
                  <span className="yp-dir-name">{d.parentName || '(no parent name)'}</span>
                  {d.preferredLanguage && <span className="yps-pill yp-lang-pill">{langDef(d.preferredLanguage).flag} {langDef(d.preferredLanguage).label}</span>}
                  {replyCounts[d.contact] > 0 && (
                    <span className="yps-pill">📝 {replyCounts[d.contact]} thread{replyCounts[d.contact] === 1 ? '' : 's'}</span>
                  )}
                </div>
                <div className="yp-dir-kids">
                  Kids: {d.kids.map(k => `${k.name || '(unnamed)'}${k.grade ? ` (${k.grade})` : ''}`).join(', ')}
                </div>
                <div className="yp-dir-contact">
                  {d.parentEmail && <a href={`mailto:${d.parentEmail}`} className="yp-dir-link">✉️ {d.parentEmail}</a>}
                  {d.parentPhone && <a href={`tel:${d.parentPhone.replace(/[^\d+]/g, '')}`} className="yp-dir-link">📞 {d.parentPhone}</a>}
                  {!d.parentEmail && !d.parentPhone && <span className="yp-row-muted">(no contact info)</span>}
                </div>
              </div>
              <div className="yp-dir-actions">
                <button
                  type="button"
                  className="yps-btn"
                  onClick={() => onMessage(d.key)}
                  disabled={!d.contact}
                  title="Open the composer pre-locked to this family"
                >📨 Message</button>
                <button
                  type="button"
                  className="yps-btn ghost"
                  onClick={() => onOpenThread(d.contact)}
                  disabled={!d.contact}
                  title="View / log replies for this family"
                >📝 Thread</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Thread modal — per-household timeline of outbound broadcasts
   + inbound replies. Form at the bottom to log a new inbound.
   ───────────────────────────────────────────────────────────── */
function ThreadModal({ contact, household, entries, onLogReply, onRemove, onClose }) {
  const [replyBody, setReplyBody] = useState('');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!replyBody.trim()) return;
    onLogReply(replyBody);
    setReplyBody('');
  };

  return (
    <div className="yp-modal-backdrop" onClick={onClose}>
      <div className="yp-modal" onClick={e => e.stopPropagation()}>
        <header className="yp-modal-hd">
          <div>
            <div className="yp-modal-title">📝 Thread with {household?.parentName || contact}</div>
            <div className="yp-modal-sub">
              {household?.kidNames || household?.kids?.map(k => k.name).join(', ') || ''}
              {contact && <span> · {contact}</span>}
            </div>
          </div>
          <button className="yps-btn ghost" onClick={onClose}>✕</button>
        </header>

        <div className="yp-modal-body">
          {entries.length === 0 ? (
            <div className="yp-row-muted">No history yet. Log an inbound reply below to start the thread.</div>
          ) : (
            <ul className="yp-thread-list">
              {entries.map(e => (
                <li key={e.id} className={`yp-thread-row yp-thread-${e.kind}`}>
                  <div className="yp-thread-meta">
                    <span className="yp-thread-kind">{e.kind === 'outbound' ? '📤 Sent' : '📥 Reply'}</span>
                    <span className="yp-thread-when">{e._at && new Date(e._at).toLocaleString()}</span>
                    {e.kind === 'inbound' && (
                      <button className="yps-btn ghost" onClick={() => onRemove(e.id)} title="Remove this entry">✕</button>
                    )}
                  </div>
                  {e.subject && <div className="yp-thread-subject"><b>Subject:</b> {e.subject}</div>}
                  <div className="yp-thread-body">{e.body}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="yp-modal-ft">
          <textarea
            className="yps-textarea"
            rows={3}
            placeholder="Log an inbound reply or note from this family…"
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
          />
          <button className="yps-add-btn" onClick={submit} disabled={!replyBody.trim()}>📥 Log reply</button>
        </footer>
      </div>
    </div>
  );
}
