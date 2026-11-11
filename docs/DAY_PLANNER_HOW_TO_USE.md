# Day Planner — How to Use

A complete guide to the Day Planner page in Ministry Hub: time-blocking your day on an hourly grid, tracking priorities and energy levels, setting up recurring blocks and templates, and syncing your day to the Calendar.

> **A note on the pictures in this guide:** the Day Planner page sits behind Firebase sign-in, so this document couldn't be auto-illustrated with live screenshots of your account. Each major section below has a `📸 [Screenshot: ...]` placeholder marking exactly where to drop in a screenshot — sign in, navigate to that screen, capture it, and paste the image in place of the placeholder.

---

## Table of Contents

1. [Getting to the Day Planner](#1-getting-to-the-day-planner)
2. [Layout Overview](#2-layout-overview)
3. [Navigating Between Days](#3-navigating-between-days)
4. [Creating a Time Block](#4-creating-a-time-block)
5. [Editing, Moving, and Resizing a Block](#5-editing-moving-and-resizing-a-block)
6. [Completing and Deleting Blocks](#6-completing-and-deleting-blocks)
7. [Categories and Focus Levels](#7-categories-and-focus-levels)
8. [Top Priorities](#8-top-priorities)
9. [Recurring Blocks](#9-recurring-blocks)
10. [Templates](#10-templates)
11. [Day Theme, Notes, and Stats](#11-day-theme-notes-and-stats)
12. [View Modes: Day, Split, Week](#12-view-modes-day-split-week)
13. [Syncing to Calendar](#13-syncing-to-calendar)
14. [Toolbar Extras: Copy, Print, Roll Over](#14-toolbar-extras-copy-print-roll-over)
15. [Sidebar Panels: Guardrail, Focus Mix, Prayer Focus, Reach Out](#15-sidebar-panels-guardrail-focus-mix-prayer-focus-reach-out)
16. [Profile](#16-profile)
17. [Troubleshooting & Error Messages](#17-troubleshooting--error-messages)

---

## 1. Getting to the Day Planner

Click **🕐 Day Planner** in the nav rail. It opens on today's date by default.

You can also deep-link to a specific date with `?date=YYYY-MM-DD` in the URL — the Calendar page uses this to jump you straight to a given day.

📸 *[Screenshot: Day Planner topbar and header on load]*

---

## 2. Layout Overview

The page is built in three columns beneath a header and a week strip:

- **Header** — date controls, pretty-printed date ("Friday, July 7, 2026"), stats row, and the day theme.
- **Week strip** — a 7-day overview with a density bar per day; click any day to jump to it.
- **Left column** — Rest Guardrail, Focus Mix, Prayer Focus, Reach Out, Top Priorities, and Day Notes.
- **Center column** — the main timeline (or Split/Week view — see [section 12](#12-view-modes-day-split-week)).
- **Right column** — Recurring Blocks, a Categories reference, and Templates.

**Topbar buttons:** **Today**, **‹** / **›** (previous/next day), **📅 Sync**, **✦ New Block**, and your profile avatar.

📸 *[Screenshot: full three-column layout, day with several blocks]*

---

## 3. Navigating Between Days

Several controls all move you between days and stay in sync with each other:

- **Topbar:** **Today**, **‹**, **›**
- **Header:** **◀**, **Today**, **▶**, and a date-picker input
- **Week strip:** click any of the 7 day columns
- **Split/Week views:** click a day's mini-header to jump to it

The current date is reflected in the URL, so refreshing the page keeps you on the same day.

📸 *[Screenshot: week strip with today highlighted]*

---

## 4. Creating a Time Block

There are four ways to add a block:

1. **✦ New Block** (topbar) — adds a 1-hour block starting at the current time, rounded to the nearest 15 minutes.
2. **Double-click an empty hour** on the timeline — adds a 1-hour block starting there.
3. **＋ [X]h free** — appears in any open gap once you have at least one block that day; click it to fill the gap with a generic block.
4. **Quick-add chips** — in gaps of a decent size, three shortcut buttons appear:
   - **🙏 Pray** — 30-minute prayer block
   - **🧠 Focus** — 90-minute focus block
   - **🌿 Rest** — 60-minute rest block

Each of these pre-fills a sensible title, category, and focus level — you can adjust everything afterward.

📸 *[Screenshot: an open gap showing the "+ 2h free" button and Pray/Focus/Rest chips]*

---

## 5. Editing, Moving, and Resizing a Block

**Edit:** double-click anywhere on a block to expand its inline editor:

- **Title**
- **Start** / **End** time (15-minute steps)
- **Category** (see [section 7](#7-categories-and-focus-levels))
- **Focus level** — none / 🧠 Deep focus / 🗂️ Admin / 🌿 Light
- **Notes** (optional)
- **🔔 Remind me via the bell** — toggle on to pick a **When** offset (e.g. 15m before, at time) with an optional custom time
- **🗑 Delete**, **🔁 Make recurring**, and **Done** to save

📸 *[Screenshot: block editor open, showing all fields]*

**Move:** click and hold anywhere on the block body (not the bottom edge) and drag up or down. Movement snaps to 15-minute intervals; a very short drag (under a few pixels) just opens the editor instead.

**Resize:** grab the bottom edge of a block and drag down to extend it, or up to shorten it (minimum 15 minutes). Both moving and resizing are capped to the planning window (6 AM–11 PM).

**Overlapping blocks** are automatically laid out side-by-side in lanes so nothing is hidden.

---

## 6. Completing and Deleting Blocks

- **Mark done:** click the checkbox at the start of a block. Done blocks are visually muted and don't count as "free time" for gap fillers.
- **Delete:** click the **×** in the top-right corner of a block (view mode), or **🗑 Delete** inside the editor.
- Deleting a block that was synced to Calendar also removes the corresponding Calendar event.
- Deleting a block that came from a recurring rule dismisses just that day's instance — it won't reappear today, but the rule still fires on other matching days.

---

## 7. Categories and Focus Levels

**Categories** (pick one per block, defaults to Personal):

| Category | Color |
|---|---|
| Prayer | purple |
| Bible Study | blue |
| Ministry | pink |
| Meeting | amber |
| Work | teal |
| Family | orange |
| Meals | green |
| Rest | gray |
| Travel | cyan |
| Exercise | red |
| Outreach | lime |
| Personal | purple |
| Other | neutral gray |

The right sidebar's **Categories** card lists all of these as a color-coded reference.

**Focus levels** (optional, one per block):

- **🧠 Deep focus** — cognitively demanding work
- **🗂️ Admin** — routine or administrative tasks
- **🌿 Light** — low-effort or restorative activity

Untagged blocks fall into their own bucket in the Focus Mix chart (see [section 15](#15-sidebar-panels-guardrail-focus-mix-prayer-focus-reach-out)).

📸 *[Screenshot: Categories reference card in the right sidebar]*

---

## 8. Top Priorities

The **⭐ Top priorities** card (left sidebar) tracks up to a few key things for the day, separately from time blocks:

- Click **＋ Add** to create a new priority (it starts in edit mode).
- Double-click an existing priority to edit its text.
- Check the box to mark it done.
- Click **×** to remove it.

The header stats row shows a running "X/Y priorities done" count.

📸 *[Screenshot: Top Priorities card with a couple of items, one checked]*

---

## 9. Recurring Blocks

Recurring blocks are rules that automatically spawn a matching block onto the right days.

**Create a rule from scratch** — in the **🔁 Recurring blocks** card (right sidebar), click **＋ Add**:

- **Title**, **Start**, **End**, **Category**
- **Repeat:**
  - **Every day**
  - **Weekdays** (Mon–Fri)
  - **Weekly on…** — pick one or more weekdays
  - **Every 2 weeks on…** — pick weekday(s), counted from today
  - **Monthly on…** — pick weekday(s), same week-of-month each time
- Click **Add recurring block**

**Turn an existing block into a recurring one** — open a block's editor and click **🔁 Make recurring**. Choose which weekday(s) and how often (every week / every 2 weeks / every month), then click **Add to schedule**.

**Managing rules:**

- The Recurring Blocks card lists every active rule with its time and frequency (e.g. "06:30 · Mon, Wed, Fri · every 2 wks").
- Click **×** next to a rule to delete it — you'll be asked to confirm, and it removes that rule's block from *every* day in your planner, not just today.

Recurring instances behave like normal blocks once they appear — edit, move, resize, or delete them the same way.

📸 *[Screenshot: Recurring Blocks card with a couple of active rules]*

---

## 10. Templates

Templates let you save a whole day's layout (blocks + priorities + theme) and reuse it later. Found in the **🧩 Templates** card (right sidebar).

**Built-in presets** (always available, can't be deleted):

- **📖 Sermon Prep Day**
- **🤝 Visitation Day**
- **🕊️ Sabbath / Rest Day**

**Save today as a template:** click **💾 Save today**, type a name (or leave blank to use the day's theme or "My Day"), and press Enter or Save.

**Apply a template:** click its name. You'll be asked to confirm — "Replace today's blocks + priorities with '[name]'? (Notes are kept.)" Applying it swaps in the template's blocks, priorities, and theme; your day notes stay untouched.

**Delete a saved template:** click the **×** next to it (only your own saved templates can be removed, not the built-in presets).

📸 *[Screenshot: Templates card showing the 3 presets plus a user-saved template]*

---

## 11. Day Theme, Notes, and Stats

- **Day theme:** double-click the large title under the date to name the day (e.g. "Sermon prep focus"). Press Enter to save, Escape to cancel.
- **Day Notes:** a free-form notes card in the left sidebar for anything that doesn't belong on the timeline.
- **Header stats:** hours scheduled, hours free, and priorities done/total — all update live as you edit blocks.

📸 *[Screenshot: header with theme set and stats row visible]*

---

## 12. View Modes: Day, Split, Week

Three tabs in the timeline toolbar switch how much of the calendar you see at once:

- **Day** — the default single-day hourly timeline.
- **Split** — today and tomorrow side-by-side, handy for planning tomorrow in the evening.
- **Week** — all 7 days as mini columns, with a summary above showing total hours scheduled, days with rest, and how many days are "packed" (14+ hours scheduled).

Click any day's mini-header in Split or Week view to jump into full editing for that day.

📸 *[Screenshot: Week view showing the 7-day rhythm summary]*

---

## 13. Syncing to Calendar

The **📅 Sync** button (topbar) marks the whole day as planned on your Calendar with a single "🗓 Day Is Planned" event — it doesn't push every individual block over.

- Requires at least one block on the day; otherwise you'll see "No blocks to sync — add some first."
- While syncing: "Marking this day on your Calendar…"
- On success: "Day marked as planned on your Calendar." (fades after 5 seconds)
- On failure: "Could not mark the day — please try again."

**Per-block reminders** are separate from Sync — turn on **🔔 Remind me via the bell** on an individual block to get a bell notification for just that block, regardless of whether you've synced the day.

Other Calendar events and Bible Study meetings for the day show up as translucent "ghost" overlays on the timeline for reference — they're read-only and don't affect your blocks.

📸 *[Screenshot: success message after clicking Sync, plus the resulting Calendar event]*

---

## 14. Toolbar Extras: Copy, Print, Roll Over

In the timeline toolbar:

- **📋 Copy** — copies a plain-text agenda of the day to your clipboard (checked items shown as `[x]`, unchecked as `[ ]`). Shows "Day sheet copied to clipboard." or, if the clipboard is blocked, "Could not copy — clipboard blocked."
- **🖨 Print** — opens your browser's print dialog with a clean, app-chrome-free agenda (works for printing to PDF too).
- **↪ Roll over** — walks through every unfinished block one at a time and asks "Roll '[title]' over to [tomorrow's date]?" Confirmed blocks move to tomorrow as fresh, unchecked entries. If everything's already checked off, you'll see "Nothing to roll over — every block is checked off. 🎉"

---

## 15. Sidebar Panels: Guardrail, Focus Mix, Prayer Focus, Reach Out

**🛟 Guardrail** (left sidebar) — a gentle nudge about balance:
- Balanced day: "🕊️ Balanced day — rest is on the calendar."
- Overloaded or rest-free day: warns if 14+ hours are scheduled, and/or if no rest block exists yet.

**🧠 Focus Mix** (left sidebar) — a stacked bar chart of your Deep/Admin/Light hours (plus an untagged bucket), with a "X.Xh deep" badge in the card title once you've scheduled an hour or more of deep focus. Empty state: "Tag blocks with a focus level (Deep / Admin / Light) to see your day's energy balance."

**🙏 Prayer Focus** (left sidebar) — surfaces a handful of prayers to work through today; only shown if Prayers is enabled in Settings. Use the **–** / **+** stepper in its header to change how many show (1–10, saved as a preference).

**Reach Out** (left sidebar) — friend reach-out reminders; only shown if Friends is enabled in Settings.

📸 *[Screenshot: left sidebar showing Guardrail, Focus Mix, and Prayer Focus stacked]*

---

## 16. Profile

The **👤 profile avatar** (top right of the topbar) opens the same Profile modal used across the app — update your display name, ministry info, or photo, plus a **⚙ Settings** tab that embeds the full app Settings page.

---

## 17. Troubleshooting & Error Messages

| Message | What it means |
|---|---|
| "No blocks to sync — add some first." | You clicked Sync on a day with zero blocks — add at least one before syncing. |
| "Could not mark the day — please try again." | The Calendar sync request failed; check your connection and retry. |
| "Could not copy — clipboard blocked." | Your browser blocked clipboard access for the Copy button. |
| "Nothing to roll over — every block is checked off. 🎉" | Roll Over found no unfinished blocks to move to tomorrow. |
| "Delete this recurring block? It will be removed from every day in your planner." | Confirmation before permanently deleting a recurring rule and all its spawned instances. |
| "Replace today's blocks + priorities with '[name]'? (Notes are kept.)" | Confirmation before applying a template, which overwrites today's blocks and priorities (but not notes). |

---

*This guide covers the Day Planner page as of the current build. If a screen looks different from what's described here, the feature may have moved to a newer settings location — check Page Settings first.*
