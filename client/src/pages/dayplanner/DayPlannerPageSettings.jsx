/* Day Planner Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab on the Day Planner page.

   Mirrors Prayers/Journal's sub-tab pill pattern so this can grow
   real preferences later without restructuring. For now it holds a
   single tab: an in-app "How to Use" reference guide, so users don't
   have to go hunting for documentation. Mirrors
   docs/DAY_PLANNER_HOW_TO_USE.md — keep the two in sync if either
   changes. The shared `pm-ps-*` classes from ProfileModal.css style
   the pill bar + section headers; this file only owns the
   `dp-ps-howto-*` guide rules. */

import React, { useState } from 'react';
import { downloadGuideDocx } from '../../lib/downloadGuideDocx';
import { DAY_PLANNER_GUIDE } from './dayPlannerGuide';
import './DayPlannerPageSettings.css';

const SUB_TABS = [
  { id: 'howto', label: '❓', name: 'How to Use' },
];

export default function DayPlannerPageSettings() {
  const [activeSub, setActiveSub] = useState('howto');

  return (
    <div className="pm-body dp-ps-root">
      {/* Sub-tab pill bar. */}
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

      {/* ───────── ❓ How to Use (howto sub-tab) ───────── */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="dp-ps-howto-title-row">
          <div className="pm-ps-section-title">❓ How to Use the Day Planner</div>
          <button
            type="button"
            className="dp-ps-howto-download"
            onClick={() => downloadGuideDocx(DAY_PLANNER_GUIDE, 'Day-Planner-How-To-Use.docx')}
          >⬇ Download as Word doc</button>
        </div>

        <div className="dp-ps-howto-feedback">
          <span className="dp-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder
            Dashboard.
          </span>
        </div>

        <div className="dp-ps-howto-intro">
          A full walkthrough of everything on this page — time-blocking your day on the hourly
          grid, tracking priorities and energy levels, recurring blocks, templates, and syncing
          your day to the Calendar. Skim the headers below or read start to finish.
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🗺 Layout Overview</div>
          <ul className="dp-ps-howto-list">
            <li><b>Header</b> — date controls, the pretty-printed date, stats row, and the day theme.</li>
            <li><b>Week strip</b> — a 7-day overview with a density bar per day; click any day to jump to it.</li>
            <li><b>Left column</b> — Rest Guardrail, Focus Mix, Prayer Focus, Reach Out, Top Priorities, and Day Notes.</li>
            <li><b>Center column</b> — the main timeline (or Split/Week view).</li>
            <li><b>Right column</b> — Recurring Blocks, a Categories reference, and Templates.</li>
            <li><b>Topbar</b> — Today, ‹ / › (previous/next day), 📅 Sync, ✦ New Block, and your profile avatar.</li>
          </ul>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🧭 Navigating Between Days</div>
          <div className="dp-ps-howto-p">
            Move between days from the topbar (<b>Today</b>, <b>‹</b>, <b>›</b>), the header
            (<b>◀</b>, <b>Today</b>, <b>▶</b>, or the date picker), the week strip (click any
            day), or by clicking a day's mini-header in Split or Week view. The current date is
            reflected in the URL, so refreshing keeps you on the same day.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">✦ Creating a Time Block</div>
          <ul className="dp-ps-howto-list">
            <li><b>✦ New Block</b> — adds a 1-hour block at the current time, rounded to the nearest 15 minutes.</li>
            <li><b>Double-click an empty hour</b> on the timeline — adds a 1-hour block starting there.</li>
            <li><b>＋ [X]h free</b> — fills an open gap once you have at least one block that day.</li>
            <li><b>Quick-add chips</b> — 🙏 Pray (30m), 🧠 Focus (90m), 🌿 Rest (60m) appear in larger gaps.</li>
          </ul>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">✏ Editing, Moving, and Resizing a Block</div>
          <div className="dp-ps-howto-p">
            <b>Double-click a block</b> to open its editor — title, start/end time, category,
            focus level, notes, and an optional <b>🔔 Remind me via the bell</b> toggle, plus
            <b> 🗑 Delete</b> and <b>🔁 Make recurring</b>. <b>Drag the block body</b> up or down
            to move it (snaps to 15 minutes). <b>Drag the bottom edge</b> to resize it (minimum
            15 minutes). Overlapping blocks automatically lay out side-by-side.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">✓ Completing and Deleting Blocks</div>
          <div className="dp-ps-howto-p">
            Click the checkbox at the start of a block to mark it done — done blocks are muted
            and don't count as free time. Click the <b>×</b> on a block (or <b>🗑 Delete</b> in
            the editor) to remove it; a synced Calendar event is removed with it. Deleting a
            recurring instance only dismisses that day — the rule still fires on other matching
            days.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🎨 Categories and Focus Levels</div>
          <div className="dp-ps-howto-p">
            Every block has one <b>category</b> (Prayer, Bible Study, Ministry, Meeting, Work,
            Family, Meals, Rest, Travel, Exercise, Outreach, Personal, Other — each color-coded,
            see the Categories card in the right sidebar), and can optionally carry a <b>focus
            level</b>: 🧠 Deep focus, 🗂️ Admin, or 🌿 Light. Untagged blocks show up in their own
            bucket on the Focus Mix chart.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">⭐ Top Priorities</div>
          <div className="dp-ps-howto-p">
            The <b>⭐ Top priorities</b> card (left sidebar) tracks a few key things for the day,
            separately from blocks. Click <b>＋ Add</b> to create one, double-click to edit its
            text, check it off when done, or click <b>×</b> to remove it. The header stats row
            shows a running "X/Y priorities done" count.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🔁 Recurring Blocks</div>
          <div className="dp-ps-howto-p">
            In the <b>🔁 Recurring blocks</b> card (right sidebar), click <b>＋ Add</b> to build a
            rule from scratch, or open any block's editor and click <b>🔁 Make recurring</b> to
            turn it into one. Choose which weekday(s) and how often — every day, weekdays,
            weekly, every 2 weeks, or monthly (same week-of-month). Click <b>×</b> next to a rule
            to delete it everywhere it appears, not just today.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🧩 Templates</div>
          <div className="dp-ps-howto-p">
            The <b>🧩 Templates</b> card (right sidebar) offers three built-in presets — 📖
            Sermon Prep Day, 🤝 Visitation Day, and 🕊️ Sabbath / Rest Day — plus any you save
            yourself with <b>💾 Save today</b>. Click a template's name to apply it (with a
            confirmation, since it replaces today's blocks and priorities — your notes are kept).
            Your own saved templates can be deleted with the <b>×</b> next to them.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">📅 Syncing to Calendar</div>
          <div className="dp-ps-howto-p">
            The <b>📅 Sync</b> button marks the whole day as planned on your Calendar with a
            single "🗓 Day Is Planned" event — it needs at least one block first. Per-block
            reminders (<b>🔔 Remind me via the bell</b>) are separate and fire independently of
            whether you've synced the day.
          </div>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🗓 View Modes: Day, Split, Week</div>
          <ul className="dp-ps-howto-list">
            <li><b>Day</b> — the default single-day hourly timeline.</li>
            <li><b>Split</b> — today and tomorrow side-by-side, handy for planning tomorrow in the evening.</li>
            <li><b>Week</b> — all 7 days as mini columns, with a summary of total hours, days with rest, and packed days.</li>
          </ul>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🧰 Toolbar Extras</div>
          <ul className="dp-ps-howto-list">
            <li><b>📋 Copy</b> — copies a plain-text agenda of the day to your clipboard.</li>
            <li><b>🖨 Print</b> — opens a clean, print-friendly agenda (works for printing to PDF too).</li>
            <li><b>↪ Roll over</b> — walks through unfinished blocks one at a time, offering to move each to tomorrow.</li>
          </ul>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🛟 Sidebar Panels</div>
          <ul className="dp-ps-howto-list">
            <li><b>🛟 Guardrail</b> — a gentle nudge if the day is overloaded (14+ hours) or has no rest blocked out.</li>
            <li><b>🧠 Focus Mix</b> — a stacked bar chart of your Deep/Admin/Light hours for the day.</li>
            <li><b>🙏 Prayer Focus</b> — a handful of prayers to work through today (only shown if Prayers is enabled); use the –/+ stepper to change how many show.</li>
            <li><b>Reach Out</b> — friend reach-out reminders (only shown if Friends is enabled).</li>
          </ul>
        </div>

        <div className="dp-ps-howto-block">
          <div className="dp-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="dp-ps-howto-list">
            <li><b>"No blocks to sync — add some first."</b> — add at least one block before clicking Sync.</li>
            <li><b>"Could not mark the day — please try again."</b> — the Calendar sync request failed; check your connection and retry.</li>
            <li><b>"Could not copy — clipboard blocked."</b> — your browser blocked clipboard access for the Copy button.</li>
            <li><b>"Nothing to roll over — every block is checked off. 🎉"</b> — Roll Over found no unfinished blocks to move.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}
