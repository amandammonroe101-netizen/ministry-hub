import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { journalService } from '../../services/journalService';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { journalReminderService } from '../../services/journalReminderService';
import { format, parseISO } from 'date-fns';
import NavRail from '../../components/layout/NavRail';
import JournalDashboard from './JournalDashboard';
import { useUserStoreKey } from '../../lib/userStore';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile, contactFields } from '../../lib/userProfile';
import { useJournalNotifications } from '../../lib/journalNotifications';
import {
  useJournalPrivacy, useJournalPromptSettings,
  randomPromptFromSettings, PROMPT_CATEGORIES, ALL_PROMPT_CATEGORIES,
  DASHBOARD_CARDS, useJournalDashboardSettings, useJournalGoals,
  useJournalEditor, useJournalDisplay, useJournalBackup, useJournalNotifPrefs,
  useJournalIntegrations,
  JOURNAL_THEMES, getJournalTheme,
  DEFAULT_PROMPTS,
  BIBLE_TRANSLATIONS, DATE_FORMATS,
} from '../../lib/journalPageSettings';
import { calendarService } from '../../services/calendarService';
import { useMemoryVerses } from '../../lib/memoryVersesStore';
import { fetchVerseText as sharedFetchVerseText } from '../../lib/bibleLookup';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { downloadGuideDocx } from '../../lib/downloadGuideDocx';
import { JOURNAL_GUIDE } from './journalGuide';
import PageTourHost from '../../components/tour/PageTourHost';
import './Journal.css';

/* Same list of ministry types Chat's profile dialog uses. Kept in
   sync manually for now — if this list ever drifts long-term, lift
   to a shared module. */
const MINISTRY_TYPES = [
  'Worship', 'Youth', "Children's", 'Outreach', 'Small Groups',
  'Prayer', 'Tech / Production', 'Missions', 'Hospitality',
  'Discipleship', 'Pastoral / Teaching', 'Administration', 'Other',
];

/* Match Chat.getInitials so the same name renders the same initials
   across pages. Handles 0/1/2+ word names, falls back to '?'. */
function getInitialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* Best-effort clipboard copy that falls back to the legacy execCommand
   path when the secure-context API is unavailable (e.g. inside Electron
   without an https origin). Matches the helper in Chat.jsx. */
async function copyText(value) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* (Prompt pool moved to lib/journalPageSettings.js — Page Settings
   lets the user pick which categories are active and add custom
   prompts. randomPromptFromSettings() reads the live settings.) */

const EMPTY = {
  title: '', content: '', scripture: '', verse_text: '', verses: [],
  prompt_used: false, prompt_text: '',
  is_locked: false, lock_code: '',
  /* Per-entry visual theme — picks from JOURNAL_THEMES. Applied
     in view mode (hero gradient + accent colors) AND while editing
     so the picker doubles as a live preview. */
  theme_id: 'default',
  /* Prayer-picker (Integrations → Link prayers): array of prayer ids
     this entry references. Empty by default. */
  linked_prayer_ids: [],
};

/* Minimal markdown renderer for the entry view. Escapes HTML first,
   then applies safe inline rules:
     - **bold** → <strong>
     - *italic* → <em>
     - `code` → <code>
     - leading "# " → <h3> heading
     - newlines → <br/>
   We deliberately avoid pulling in a markdown library — this covers
   the 80% case for personal journaling. */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function renderInlineMarkdown(text) {
  if (!text) return '';
  let html = escHtml(text);
  // Headings (# heading) — line-level
  html = html.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes, body) => {
    const level = Math.min(3, hashes.length) + 2; // # → h3, ## → h4, ### → h5
    return `<h${level}>${body}</h${level}>`;
  });
  // Bold + italic + code (inline)
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Newlines → <br/>
  html = html.replace(/\n/g, '<br/>');
  return html;
}

/* Pretty-print a 24-hour "HH:MM" string as a 12-hour time with
   AM/PM. Falls back to "12 AM" when blank (matches the "no time =
   midnight" semantic the reminder system uses). */
function format12Hour(hhmm) {
  if (!hhmm) return '12 AM';
  const parts = String(hhmm).split(':');
  let h = parseInt(parts[0], 10);
  if (Number.isNaN(h)) return hhmm;
  const m = parseInt(parts[1] || '0', 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${period}` : `${h}:${String(m).padStart(2, '0')} ${period}`;
}

/* Count words in any string. Strips HTML tags and collapses whitespace. */
const wordCount = (txt) => {
  if (!txt) return 0;
  const clean = String(txt).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
};

const BIBLE_BOOKS =['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther',
  'Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations',
  'Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah',
  'Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
  '2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians',
  '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John',
  '3 John','Jude','Revelation'];

/* Re-export the shared lookup under the same name as the old inline
   helper so every existing call site in this file keeps working
   without churn. Implementation now lives in lib/bibleLookup.js
   alongside the Prayer-page consumer. */
const fetchVerseText = sharedFetchVerseText;


// ── ViewVerse: collapsible verse card for view mode ──
/* Image size + shrink helpers removed alongside the cover-image
   feature. Entries are text + scripture + linked prayers only. */

/* ─── Per-entry theme decorations ────────────────────────────
   A subtle SVG overlay rendered behind every themed entry — ocean
   waves, sun + hills, honeycomb hexes, sparkle stars, etc. — so
   each theme feels distinct without overwhelming the prose.

   PORTED 1:1 FROM Chat's `ThemeDecorations` (Chat.jsx). Keep the
   two in sync — when Chat gains a theme, add a matching case here
   and a matching entry in JOURNAL_THEMES. Only the className and
   SVG `<defs>` ids are journal-namespaced (`j-` prefix) to avoid
   collisions if both pages happen to mount at once.

   Layout assumptions (handled in Journal.css):
     - position: absolute + inset: 0 + z-index: 0
     - pointer-events: none so the deco can't intercept clicks */
function JournalThemeDeco({ themeId }) {
  const common = {
    className: 'j-theme-deco',
    viewBox: '0 0 1200 800',
    preserveAspectRatio: 'none',
    'aria-hidden': true,
  };
  switch (themeId) {
    case 'ocean':
      return (
        <svg {...common}>
          {/* Layered waves at the bottom */}
          <path d="M0 660 Q 200 600 400 640 T 800 640 T 1200 620 L 1200 800 L 0 800 Z" fill="#22d3ee" opacity="0.10"/>
          <path d="M0 700 Q 200 660 400 690 T 800 690 T 1200 680 L 1200 800 L 0 800 Z" fill="#3b82f6" opacity="0.14"/>
          <path d="M0 740 Q 200 720 400 740 T 800 740 T 1200 740 L 1200 800 L 0 800 Z" fill="#0ea5e9" opacity="0.18"/>
          {/* Bubbles */}
          <circle cx="120" cy="180" r="6"  fill="#22d3ee" opacity="0.25"/>
          <circle cx="180" cy="240" r="4"  fill="#22d3ee" opacity="0.20"/>
          <circle cx="1080" cy="320" r="5" fill="#22d3ee" opacity="0.22"/>
        </svg>
      );
    case 'sunset':
      return (
        <svg {...common}>
          {/* Halo behind the sun */}
          <circle cx="1050" cy="160" r="140" fill="#fb923c" opacity="0.10"/>

          {/* SUN — body + 12 triangular rays around the perimeter */}
          <g transform="translate(1050 160)" opacity="0.55">
            <g fill="#fbbf24">
              <polygon points="0,-100 -10,-62 10,-62"/>
              <polygon points="50,-86 33,-55 47,-47"/>
              <polygon points="86,-50 55,-33 62,-19"/>
              <polygon points="100,0 62,-10 62,10"/>
              <polygon points="86,50 55,33 62,47"/>
              <polygon points="50,86 33,55 47,62"/>
              <polygon points="0,100 -10,62 10,62"/>
              <polygon points="-50,86 -33,55 -47,62"/>
              <polygon points="-86,50 -55,33 -62,47"/>
              <polygon points="-100,0 -62,-10 -62,10"/>
              <polygon points="-86,-50 -55,-33 -62,-19"/>
              <polygon points="-50,-86 -33,-55 -47,-47"/>
            </g>
            <circle r="50" fill="#fbbf24"/>
            <circle r="42" fill="#fb923c" opacity="0.85"/>
            <circle r="32" fill="#fbbf24" opacity="0.65"/>
            <ellipse cx="-12" cy="-12" rx="10" ry="6" fill="#fef3c7" opacity="0.45"/>
          </g>

          {/* Distant hills, layered for depth */}
          <path d="M0 720 Q 300 680 600 720 T 1200 720 L 1200 800 L 0 800 Z" fill="#f472b6" opacity="0.18"/>
          <path d="M0 760 Q 200 740 500 760 T 1200 760 L 1200 800 L 0 800 Z" fill="#9333ea" opacity="0.20"/>
        </svg>
      );
    case 'forest':
      return (
        <svg {...common}>
          {/* Pine tree silhouettes along the bottom */}
          <g fill="#34d399" opacity="0.18">
            <polygon points="120,800 100,720 80,800"/>
            <polygon points="240,800 215,690 190,800"/>
            <polygon points="360,800 340,730 320,800"/>
            <polygon points="500,800 470,680 440,800"/>
            <polygon points="680,800 660,720 640,800"/>
            <polygon points="820,800 790,690 760,800"/>
            <polygon points="980,800 960,710 940,800"/>
            <polygon points="1120,800 1095,700 1070,800"/>
          </g>
          {/* A few falling leaves */}
          <ellipse cx="200" cy="180" rx="6" ry="3" fill="#a3e635" opacity="0.30" transform="rotate(30 200 180)"/>
          <ellipse cx="900" cy="260" rx="5" ry="2.5" fill="#a3e635" opacity="0.25" transform="rotate(-20 900 260)"/>
          <ellipse cx="1050" cy="420" rx="6" ry="3" fill="#34d399" opacity="0.22" transform="rotate(50 1050 420)"/>
        </svg>
      );
    case 'lavender':
      return (
        <svg {...common}>
          {/* Scattered sparkles */}
          {[
            [140, 180, 8], [260, 320, 5], [430, 140, 6], [620, 260, 7],
            [800, 180, 5], [950, 380, 6], [1080, 240, 7], [1140, 480, 5],
            [180, 540, 6], [400, 580, 5], [720, 620, 6], [900, 540, 7],
          ].map(([cx, cy, r], i) => (
            <g key={i} transform={`translate(${cx},${cy})`} opacity="0.35">
              <path
                d={`M0 -${r} L${r/3} -${r/3} L${r} 0 L${r/3} ${r/3} L0 ${r} L-${r/3} ${r/3} L-${r} 0 L-${r/3} -${r/3} Z`}
                fill="#f0abfc"
              />
            </g>
          ))}
        </svg>
      );
    case 'rose':
      return (
        <svg {...common}>
          <defs>
            <g id="j-rose">
              {/* Outer ring of 5 petals */}
              <g fill="#fb7185">
                <ellipse cx="0" cy="-11" rx="10" ry="14"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(72)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(144)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(216)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(288)"/>
              </g>
              {/* Inner ring of 5 petals — offset 36° */}
              <g fill="#ec4899">
                <ellipse cx="0" cy="-7" rx="7" ry="9" transform="rotate(36)"/>
                <ellipse cx="0" cy="-7" rx="7" ry="9" transform="rotate(108)"/>
                <ellipse cx="0" cy="-7" rx="7" ry="9" transform="rotate(180)"/>
                <ellipse cx="0" cy="-7" rx="7" ry="9" transform="rotate(252)"/>
                <ellipse cx="0" cy="-7" rx="7" ry="9" transform="rotate(324)"/>
              </g>
              <circle r="4" fill="#9d174d"/>
            </g>
            <g id="j-rose-leaf">
              <ellipse cx="0" cy="0" rx="14" ry="6" fill="#16a34a"/>
              <line x1="-14" y1="0" x2="14" y2="0" stroke="#15803d" strokeWidth="0.6" opacity="0.7"/>
            </g>
          </defs>

          <g opacity="0.55">
            <use href="#j-rose" transform="translate(110  170) scale(1.4) rotate(15)"/>
            <use href="#j-rose" transform="translate(280  120) scale(0.9) rotate(-30)"/>
            <use href="#j-rose" transform="translate(490   90) scale(1.1) rotate(40)"/>
            <use href="#j-rose" transform="translate(720  140) scale(0.85) rotate(-20)"/>
            <use href="#j-rose" transform="translate(940  180) scale(1.3) rotate(25)"/>
            <use href="#j-rose" transform="translate(1120 130) scale(0.95) rotate(-15)"/>
            <use href="#j-rose" transform="translate(180  420) scale(1.0) rotate(50)"/>
            <use href="#j-rose" transform="translate(420  470) scale(0.8) rotate(-40)"/>
            <use href="#j-rose" transform="translate(680  430) scale(1.2) rotate(10)"/>
            <use href="#j-rose" transform="translate(950  500) scale(0.95) rotate(-25)"/>
            <use href="#j-rose" transform="translate(140  680) scale(1.1) rotate(20)"/>
            <use href="#j-rose" transform="translate(380  720) scale(0.9) rotate(-10)"/>
            <use href="#j-rose" transform="translate(640  690) scale(1.3) rotate(35)"/>
            <use href="#j-rose" transform="translate(870  720) scale(1.0) rotate(-30)"/>
            <use href="#j-rose" transform="translate(1090 660) scale(0.85) rotate(45)"/>
          </g>

          <g opacity="0.45">
            <use href="#j-rose-leaf" transform="translate(220 270) rotate(40)"/>
            <use href="#j-rose-leaf" transform="translate(560 240) rotate(-20)"/>
            <use href="#j-rose-leaf" transform="translate(820 320) rotate(60)"/>
            <use href="#j-rose-leaf" transform="translate(1040 380) rotate(-10)"/>
            <use href="#j-rose-leaf" transform="translate(300 580) rotate(25)"/>
            <use href="#j-rose-leaf" transform="translate(720 580) rotate(-35)"/>
          </g>
        </svg>
      );
    case 'amber':
      return (
        <svg {...common}>
          {/* Honeycomb hex pattern */}
          <defs>
            <pattern id="j-honey" x="0" y="0" width="48" height="42" patternUnits="userSpaceOnUse">
              <polygon
                points="24,2 44,12 44,30 24,40 4,30 4,12"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1"
                opacity="0.18"
              />
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#j-honey)"/>
        </svg>
      );
    case 'slate':
      return (
        <svg {...common}>
          {/* Subtle dot grid */}
          <defs>
            <pattern id="j-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#94a3b8" opacity="0.20"/>
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#j-dots)"/>
        </svg>
      );
    case 'midnight':
      return (
        <svg {...common}>
          {/* Crescent moon */}
          <g transform="translate(1060 140)">
            <circle r="58" fill="#fef3c7" opacity="0.85"/>
            <circle cx="20" r="58" fill="#0c0a1e"/>
          </g>
          {/* Sparkle stars */}
          {[
            [140, 100], [320, 180], [480, 80], [620, 200], [780, 120],
            [220, 380], [420, 460], [560, 360], [720, 480], [880, 380],
            [180, 600], [380, 660], [560, 620], [740, 660], [920, 600],
            [1080, 480], [1120, 320],
          ].map(([cx, cy], i) => (
            <g key={i} transform={`translate(${cx},${cy})`} opacity="0.6">
              <path d="M0 -3 L1 -1 L3 0 L1 1 L0 3 L-1 1 L-3 0 L-1 -1 Z" fill="#fff"/>
            </g>
          ))}
        </svg>
      );
    case 'crimson':
      return (
        <svg {...common}>
          {/* Angular mountains at the bottom */}
          <polygon points="0,720 220,560 420,720"   fill="#ef4444" opacity="0.18"/>
          <polygon points="320,720 520,540 720,720" fill="#dc2626" opacity="0.20"/>
          <polygon points="620,720 860,560 1100,720" fill="#ef4444" opacity="0.16"/>
          <polygon points="0,800 1200,800 1200,700 0,700" fill="#7f1d1d" opacity="0.25"/>
        </svg>
      );
    case 'party':
      return (
        <svg {...common}>
          {/* Balloons floating up from the corners */}
          <g opacity="0.42">
            <ellipse cx="120" cy="180" rx="22" ry="28" fill="#f43f5e"/>
            <polygon points="118,206 122,206 120,212" fill="#f43f5e"/>
            <path d="M 120 212 Q 115 250 122 290" stroke="#f43f5e" strokeWidth="1" fill="none"/>
          </g>
          <g opacity="0.40">
            <ellipse cx="180" cy="140" rx="20" ry="26" fill="#fbbf24"/>
            <polygon points="178,164 182,164 180,170" fill="#fbbf24"/>
            <path d="M 180 170 Q 185 200 178 240" stroke="#fbbf24" strokeWidth="1" fill="none"/>
          </g>
          <g opacity="0.38">
            <ellipse cx="1080" cy="200" rx="22" ry="28" fill="#a855f7"/>
            <polygon points="1078,226 1082,226 1080,232" fill="#a855f7"/>
            <path d="M 1080 232 Q 1085 270 1078 310" stroke="#a855f7" strokeWidth="1" fill="none"/>
          </g>
          <g opacity="0.40">
            <ellipse cx="1140" cy="160" rx="20" ry="26" fill="#22d3ee"/>
            <polygon points="1138,184 1142,184 1140,190" fill="#22d3ee"/>
            <path d="M 1140 190 Q 1135 220 1142 260" stroke="#22d3ee" strokeWidth="1" fill="none"/>
          </g>
          {/* Confetti rectangles scattered everywhere */}
          {[
            [300, 80, 30, '#f43f5e'], [450, 60, -20, '#fbbf24'], [600, 110, 45, '#a855f7'],
            [780, 70, -15, '#22d3ee'], [920, 110, 60, '#34d399'], [350, 380, -40, '#f472b6'],
            [560, 420, 25, '#22d3ee'], [780, 360, -55, '#f43f5e'], [950, 430, 35, '#34d399'],
            [150, 600, -30, '#fbbf24'], [400, 660, 50, '#a855f7'], [700, 640, -25, '#f43f5e'],
            [950, 680, 40, '#22d3ee'], [1100, 540, -10, '#fbbf24'],
            [240, 240, 15, '#a855f7'], [410, 200, -60, '#34d399'], [580, 260, 70, '#fbbf24'],
            [850, 240, -35, '#f472b6'], [1010, 280, 20, '#22d3ee'],
          ].map(([x, y, rot, fill], i) => (
            <rect key={i} x={x} y={y} width="9" height="3" fill={fill} opacity="0.55"
              transform={`rotate(${rot} ${x+4} ${y+1})`}/>
          ))}
          {/* Streamer curls */}
          <path d="M 30 40 Q 80 70 60 110 T 100 180" fill="none" stroke="#f472b6" strokeWidth="2" opacity="0.30"/>
          <path d="M 1170 50 Q 1130 90 1160 130 T 1130 200" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.30"/>
        </svg>
      );
    case 'music':
      return (
        <svg {...common}>
          {/* Musical notes scattered across the canvas */}
          <g fill="#8b5cf6" opacity="0.36">
            <g transform="translate(150 200)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-36" stroke="#8b5cf6" strokeWidth="2.5"/>
              <path d="M 7 -36 Q 22 -32 22 -16" stroke="#8b5cf6" strokeWidth="2.5" fill="none"/>
            </g>
            <g transform="translate(1060 240)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-36" stroke="#8b5cf6" strokeWidth="2.5"/>
            </g>
          </g>
          <g fill="#ec4899" opacity="0.32">
            <g transform="translate(720 180)">
              <ellipse cx="0" cy="0" rx="8" ry="6"/>
              <ellipse cx="24" cy="-2" rx="8" ry="6"/>
              <line x1="6" y1="-2" x2="6" y2="-30" stroke="#ec4899" strokeWidth="2.5"/>
              <line x1="30" y1="-4" x2="30" y2="-32" stroke="#ec4899" strokeWidth="2.5"/>
              <rect x="6" y="-32" width="24" height="4" fill="#ec4899"/>
            </g>
            <g transform="translate(440 400)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-34" stroke="#ec4899" strokeWidth="2.5"/>
            </g>
          </g>
          {/* Treble clef hint */}
          <g stroke="#a78bfa" fill="none" strokeWidth="3" opacity="0.20" strokeLinecap="round">
            <path d="M 970 400 Q 950 420 955 460 Q 965 490 985 480 Q 1000 470 990 440 Q 980 410 985 380"/>
          </g>
          {/* Equalizer bars along the bottom */}
          <g>
            {[24,42,30,58,46,72,38,52,62,40,58,76,46,32,52,68,38,56,42,62,52,32,46,68,42,58,38,52,68,32,46,58,40,62,52,38,46,58,32,52].map((h, i) => (
              <rect
                key={i}
                x={50 + i * 28}
                y={780 - h}
                width="10"
                height={h}
                rx="2"
                fill={i % 3 === 0 ? '#8b5cf6' : i % 3 === 1 ? '#ec4899' : '#a78bfa'}
                opacity="0.34"
              />
            ))}
          </g>
        </svg>
      );
    case 'podcast':
      return (
        <svg {...common}>
          {/* Studio microphone in the upper right */}
          <g transform="translate(1080 180)">
            <rect x="-14" y="-34" width="28" height="46" rx="14" fill="#f59e0b" opacity="0.55"/>
            <line x1="-10" y1="-22" x2="10" y2="-22" stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="-12" x2="10" y2="-12" stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="-2"  x2="10" y2="-2"  stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="8"   x2="10" y2="8"   stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <path d="M -22 6 Q -22 28 0 28 Q 22 28 22 6" stroke="#f59e0b" strokeWidth="2.5" fill="none" opacity="0.50"/>
            <line x1="0" y1="28" x2="0" y2="50" stroke="#f59e0b" strokeWidth="2.5" opacity="0.50"/>
            <line x1="-14" y1="50" x2="14" y2="50" stroke="#f59e0b" strokeWidth="2.5" opacity="0.50"/>
          </g>
          {/* Sound waves arcing out from the mic */}
          <g stroke="#f59e0b" fill="none" strokeWidth="2" opacity="0.22" strokeLinecap="round">
            <path d="M 1000 200 Q 970 240 1000 290"/>
            <path d="M 970 175 Q 925 240 970 320"/>
            <path d="M 940 150 Q 880 240 940 350"/>
          </g>
          {/* Audio waveform bar reel along the bottom */}
          <g>
            {[28,48,22,68,40,56,32,72,46,40,62,36,52,28,70,46,38,56,32,52,42,66,28,52,38,62,46,42,72,38,52,28,58,42,66,32,46,52,38,62].map((h, i) => (
              <rect
                key={i}
                x={50 + i * 28}
                y={690 - h / 2}
                width="4"
                height={h}
                rx="2"
                fill="#f59e0b"
                opacity="0.34"
              />
            ))}
          </g>
          {/* "ON AIR" tag */}
          <g transform="translate(80 200)" opacity="0.30">
            <rect x="0" y="0" width="80" height="22" rx="4" fill="#b45309"/>
            <text x="40" y="15" textAnchor="middle" fill="#fef3c7"
              fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700"
              letterSpacing="1.5">ON AIR</text>
          </g>
        </svg>
      );
    case 'webdev':
      return (
        <svg {...common}>
          {/* Subtle grid background */}
          <defs>
            <pattern id="j-webgrid" x="0" y="0" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#06b6d4" strokeWidth="0.5" opacity="0.18"/>
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#j-webgrid)"/>
          {/* Code brackets */}
          <g fontFamily="ui-monospace, 'SF Mono', monospace" fontSize="42" fontWeight="700">
            <text x="40"   y="160" fill="#06b6d4" opacity="0.30">&lt;/&gt;</text>
            <text x="1060" y="180" fill="#10b981" opacity="0.30">{'{ }'}</text>
            <text x="80"   y="640" fill="#10b981" opacity="0.22" fontSize="28">function()</text>
            <text x="900"  y="660" fill="#06b6d4" opacity="0.22" fontSize="26">{'=>'}</text>
          </g>
          {/* Browser window mock-up */}
          <g opacity="0.22" stroke="#06b6d4" fill="none" strokeWidth="1.4">
            <rect x="90" y="320" width="220" height="130" rx="8"/>
            <line x1="90" y1="347" x2="310" y2="347"/>
            <circle cx="108" cy="333" r="3" fill="#ef4444" stroke="none" opacity="0.7"/>
            <circle cx="120" cy="333" r="3" fill="#fbbf24" stroke="none" opacity="0.7"/>
            <circle cx="132" cy="333" r="3" fill="#10b981" stroke="none" opacity="0.7"/>
            <line x1="106" y1="372" x2="280" y2="372" strokeWidth="2"/>
            <line x1="106" y1="392" x2="240" y2="392" strokeWidth="2"/>
            <line x1="106" y1="412" x2="260" y2="412" strokeWidth="2"/>
          </g>
          {/* Floating diamonds */}
          <g opacity="0.30">
            <rect x="380" y="500" width="10" height="10" fill="#10b981" transform="rotate(45 385 505)"/>
            <rect x="560" y="540" width="12" height="12" fill="#06b6d4" transform="rotate(45 566 546)"/>
            <rect x="720" y="500" width="8"  height="8"  fill="#10b981" transform="rotate(45 724 504)"/>
            <rect x="1100" y="580" width="10" height="10" fill="#06b6d4" transform="rotate(45 1105 585)"/>
            <rect x="1050" y="460" width="8"  height="8"  fill="#10b981" transform="rotate(45 1054 464)"/>
          </g>
        </svg>
      );
    case 'worship':
      return (
        <svg {...common}>
          {/* Soft light rays streaming down from the top */}
          <defs>
            <linearGradient id="j-worship-ray" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points="500,0 700,0 820,800 380,800" fill="url(#j-worship-ray)"/>
          <polygon points="580,0 620,0 700,800 500,800" fill="url(#j-worship-ray)" opacity="0.5"/>
          {/* Cross silhouette behind the light */}
          <g transform="translate(600 320)" opacity="0.28">
            <rect x="-7"  y="-110" width="14" height="240" rx="2" fill="#fef3c7"/>
            <rect x="-55" y="-55"  width="110" height="14" rx="2" fill="#fef3c7"/>
          </g>
          {/* Dove descending */}
          <g transform="translate(900 180)" opacity="0.32" fill="#fef9c3">
            <ellipse cx="0" cy="0" rx="24" ry="9"/>
            <circle  cx="-18" cy="-4" r="6"/>
            <circle  cx="-23" cy="-5" r="1" fill="#1a1106"/>
            <path d="M 5 -8 Q 18 -22 30 -16 Q 22 -10 14 -2 Z"/>
            <path d="M -5 8 Q -18 18 -28 12 Q -18 4 -10 0 Z"/>
            <polygon points="22,2 32,0 22,4"/>
          </g>
          {/* Raised hands silhouettes along the bottom */}
          <g fill="#7c2d12" opacity="0.40">
            {[120, 240, 360, 480, 720, 840, 960, 1080].map((x, i) => {
              const top = 700 + (i % 2) * 20;
              return (
                <g key={i} transform={`translate(${x} 0)`}>
                  <path d={`M -16 800 L -16 ${top + 30} Q -14 ${top + 10} 0 ${top + 10} Q 14 ${top + 10} 16 ${top + 30} L 16 800 Z`}/>
                  <ellipse cx="0" cy={top + 10} rx="18" ry="22"/>
                </g>
              );
            })}
          </g>
          {/* Worship music notes drifting */}
          <g fill="#fde68a" opacity="0.30">
            <g transform="translate(200 250)">
              <ellipse cx="0" cy="0" rx="7" ry="5" transform="rotate(-20)"/>
              <line x1="5" y1="-2" x2="5" y2="-28" stroke="#fde68a" strokeWidth="2"/>
              <path d="M 5 -28 Q 15 -25 17 -16" stroke="#fde68a" strokeWidth="2" fill="none"/>
            </g>
            <g transform="translate(1000 400)">
              <ellipse cx="0" cy="0" rx="7" ry="5" transform="rotate(-20)"/>
              <line x1="5" y1="-2" x2="5" y2="-26" stroke="#fde68a" strokeWidth="2"/>
            </g>
          </g>
        </svg>
      );
    case 'scripture':
      return (
        <svg {...common}>
          {/* Soft warm glow behind the centerpiece */}
          <defs>
            <radialGradient id="j-scripture-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#fde68a" stopOpacity="0.18"/>
              <stop offset="60%"  stopColor="#fde68a" stopOpacity="0.04"/>
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="600" cy="400" r="220" fill="url(#j-scripture-glow)"/>

          {/* Heart with a cross — centerpiece */}
          <g transform="translate(600 320)" opacity="0.55">
            <path d="M 0 30
                     C -40 -60, -130 -14, -130 36
                     C -130 80, -42 124, 0 160
                     C 42 124, 130 80, 130 36
                     C 130 -14, 40 -60, 0 30
                     Z"
              fill="#b91c1c"
              stroke="#fde68a"
              strokeWidth="5"
              strokeLinejoin="round"/>
            <rect x="-11" y="-18" width="22" height="148" rx="3" fill="#fde68a"/>
            <rect x="-50" y="22"  width="100" height="24" rx="3" fill="#fde68a"/>
          </g>

          {/* Four short verses spread across the corners */}
          <g fontFamily="'Georgia', 'Times New Roman', serif" fontStyle="italic">
            <g transform="translate(60 130)" fill="#fef3c7" opacity="0.55">
              <text fontSize="22">&ldquo;Be still, and know</text>
              <text y="28" fontSize="22">that I am God.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PSALM 46:10
              </text>
            </g>
            <g transform="translate(820 140)" fill="#fde68a" opacity="0.55">
              <text fontSize="22">&ldquo;The Lord is</text>
              <text y="28" fontSize="22">my shepherd.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PSALM 23:1
              </text>
            </g>
            <g transform="translate(60 600)" fill="#fed7aa" opacity="0.55">
              <text fontSize="22">&ldquo;I can do all things</text>
              <text y="28" fontSize="22">through Christ.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PHILIPPIANS 4:13
              </text>
            </g>
            <g transform="translate(820 600)" fill="#fef3c7" opacity="0.55">
              <text fontSize="22">&ldquo;For God so loved</text>
              <text y="28" fontSize="22">the world.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — JOHN 3:16
              </text>
            </g>
          </g>
          {/* Decorative ornaments */}
          <g fill="#a16207" opacity="0.32">
            <circle cx="600" cy="80"  r="3"/>
            <circle cx="610" cy="80"  r="2"/>
            <circle cx="590" cy="80"  r="2"/>
            <circle cx="600" cy="720" r="3"/>
            <circle cx="610" cy="720" r="2"/>
            <circle cx="590" cy="720" r="2"/>
          </g>
        </svg>
      );
    case 'missions':
      return (
        <svg {...common}>
          {/* Globe wireframe in the center */}
          <g stroke="#3b82f6" fill="none" strokeWidth="0.8" opacity="0.30">
            <circle cx="600" cy="400" r="280"/>
            <ellipse cx="600" cy="400" rx="100" ry="280"/>
            <ellipse cx="600" cy="400" rx="200" ry="280"/>
            <ellipse cx="600" cy="400" rx="280" ry="80"/>
            <ellipse cx="600" cy="400" rx="280" ry="160"/>
            <ellipse cx="600" cy="400" rx="280" ry="240"/>
            <line x1="320" y1="400" x2="880" y2="400" strokeWidth="1.2"/>
          </g>
          {/* Mission "destination" dots */}
          <g fill="#fbbf24" opacity="0.70">
            <circle cx="430" cy="320" r="5"/>
            <circle cx="560" cy="270" r="5"/>
            <circle cx="700" cy="370" r="5"/>
            <circle cx="800" cy="320" r="5"/>
            <circle cx="500" cy="490" r="5"/>
            <circle cx="640" cy="530" r="5"/>
            <circle cx="770" cy="500" r="5"/>
            <circle cx="380" cy="430" r="5"/>
          </g>
          {/* Dotted flight paths */}
          <g stroke="#fbbf24" strokeWidth="1.3" opacity="0.40" fill="none"
             strokeDasharray="4 5" strokeLinecap="round">
            <path d="M 430 320 Q 495 250 560 270"/>
            <path d="M 560 270 Q 630 290 700 370"/>
            <path d="M 700 370 Q 750 330 800 320"/>
            <path d="M 380 430 Q 440 470 500 490"/>
            <path d="M 500 490 Q 570 540 640 530"/>
            <path d="M 640 530 Q 705 525 770 500"/>
          </g>
          {/* Airplane flying across, top-right */}
          <g transform="translate(960 240) rotate(20)" fill="#60a5fa" opacity="0.55">
            <path d="M -30 0 L 20 -3 L 36 0 L 20 3 Z"/>
            <path d="M -10 -2 L -20 -14 L -6 -3 Z"/>
            <path d="M -10  2 L -20  14 L -6  3 Z"/>
            <path d="M 16 -2 L 22 -8 L 24 -2 Z"/>
            <path d="M 16  2 L 22  8 L 24  2 Z"/>
          </g>
          {/* Compass rose in the bottom-left corner */}
          <g transform="translate(120 660)" opacity="0.40">
            <circle r="36" stroke="#fbbf24" fill="none" strokeWidth="1"/>
            <polygon points="0,-32 4,0 0,32 -4,0" fill="#fbbf24"/>
            <polygon points="-32,0 0,4 32,0 0,-4" fill="#3b82f6"/>
            <text x="0" y="-44" textAnchor="middle" fill="#fbbf24"
              fontSize="11" fontFamily="'Georgia', serif" fontWeight="700">N</text>
            <text x="44" y="4" textAnchor="middle" fill="#3b82f6"
              fontSize="10" fontFamily="'Georgia', serif" fontWeight="700">E</text>
            <text x="0" y="52" textAnchor="middle" fill="#fbbf24"
              fontSize="10" fontFamily="'Georgia', serif" fontWeight="700">S</text>
            <text x="-44" y="4" textAnchor="middle" fill="#3b82f6"
              fontSize="10" fontFamily="'Georgia', serif" fontWeight="700">W</text>
          </g>
        </svg>
      );
    case 'default':
    default:
      return (
        <svg {...common}>
          {/* Soft floating circles — gentle bokeh */}
          <circle cx="160"  cy="180" r="40" fill="#60a5fa" opacity="0.12"/>
          <circle cx="1020" cy="280" r="60" fill="#a78bfa" opacity="0.10"/>
          <circle cx="540"  cy="540" r="50" fill="#60a5fa" opacity="0.08"/>
          <circle cx="1100" cy="600" r="35" fill="#a78bfa" opacity="0.10"/>
        </svg>
      );
  }
}

function ViewVerse({ verse }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="j-view-scripture-block">
      <button className="j-scripture-toggle" onClick={() => setOpen(v => !v)}>
        <span className="j-scripture-toggle-ref">📖 {verse.ref}</span>
        {verse.text && (
          <span className="j-scripture-toggle-chevron">{open ? '▲ collapse' : '▼ read verse'}</span>
        )}
      </button>
      {open && verse.text && (
        <div className="j-view-verse-text j-verse-expand-anim">{verse.text}</div>
      )}
    </div>
  );
}

export default function Journal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  /* Initials shown on the header avatar. Prefer the profile
     displayName (matches what Chat shows) and fall back to the
     auth displayName / email handle. */
  const avatarSourceName = profile?.displayName || user?.displayName || user?.email || '';
  const initials = getInitialsFromName(avatarSourceName);

  /* Profile modal state. Two tabs:
       - 'profile':  the editable profile (mirrors Chat)
       - 'page':     Journal-specific Page Settings (reminders + memory-verse schedule) */
  const [showProfile, setShowProfile] = useState(false);
  const [profileTab,  setProfileTab]  = useState('profile');

  /* Notifications popover (bell). */
  const [showNotifs, setShowNotifs] = useState(false);
  const { notifications, dismiss, dismissAll } = useJournalNotifications();
  const firedNotifsRef = useRef(new Set());
  /* Grace-period timer so the tooltip doesn't snap closed when the
     mouse briefly leaves the bell wrap (e.g. crossing the gap into
     the popover, or hitting a sub-pixel boundary while scrolling
     through the notification list). */
  const notifsCloseTimerRef = useRef(null);
  const openNotifsTooltip = () => {
    if (notifsCloseTimerRef.current) clearTimeout(notifsCloseTimerRef.current);
    setShowNotifs(true);
  };
  const scheduleCloseNotifs = () => {
    if (notifsCloseTimerRef.current) clearTimeout(notifsCloseTimerRef.current);
    notifsCloseTimerRef.current = setTimeout(() => setShowNotifs(false), 220);
  };

  /* Page Settings — live-subscribed via Firestore so changes from
     the Page Settings tab apply immediately without reloads. */
  /* Privacy + prompt settings — `setPrivacy` is needed by the
     auto-heal effect and the "Forgot code? Disable lock" escape
     hatch on the master-lock screen, so we destructure the setter
     too (not just the value). */
  const [privacy, setPrivacy]   = useJournalPrivacy();
  const [promptSettings]        = useJournalPromptSettings();
  const [editor]                = useJournalEditor();
  const [display]               = useJournalDisplay();
  const [backup]                = useJournalBackup();
  const [notifPrefs]            = useJournalNotifPrefs();
  const [integrations]          = useJournalIntegrations();
  /* Per-entry theme picker dropdown — shown inside the new/edit
     editor (NOT the topbar). State just controls the popover's
     open/close; the picked theme lives on the entry's form field
     `theme_id`. */
  const [showThemes, setShowThemes] = useState(false);

  /* OS / quiet-hours notification firing was removed — notifications
     are now in-app bell-only. The bell + skipped-day + goal-miss
     alerts continue to surface via useJournalNotifications. */

  /* Master lock: when enabled, require the code before showing the
     page. `unlocked` is session-scoped so a refresh re-prompts. */
  const [masterUnlocked, setMasterUnlocked] = useState(() => {
    try { return sessionStorage.getItem('mh-journal-master-unlocked') === '1'; }
    catch { return false; }
  });
  const [masterChallenge, setMasterChallenge] = useState(null); // { value, error }

  /* Auto-lock idle: when autoLockMinutes > 0, re-lock the page after
     N minutes without user activity. */
  useEffect(() => {
    if (!privacy.masterLock || !masterUnlocked) return;
    const mins = parseInt(privacy.autoLockMinutes, 10) || 0;
    if (!mins) return;
    let timer = setTimeout(reLock, mins * 60_000);
    function reLock() {
      setMasterUnlocked(false);
      try { sessionStorage.removeItem('mh-journal-master-unlocked'); } catch {}
    }
    function bump() {
      clearTimeout(timer);
      timer = setTimeout(reLock, mins * 60_000);
    }
    const evts = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    evts.forEach(e => window.addEventListener(e, bump, { passive: true }));
    return () => {
      clearTimeout(timer);
      evts.forEach(e => window.removeEventListener(e, bump));
    };
  }, [privacy.masterLock, privacy.autoLockMinutes, masterUnlocked]);

  /* If the page just turned master-lock ON, immediately challenge. */
  useEffect(() => {
    if (privacy.masterLock && !masterUnlocked && privacy.masterLockCode) {
      setMasterChallenge({ value: '', error: '' });
    } else if (!privacy.masterLock) {
      setMasterChallenge(null);
    }
  }, [privacy.masterLock, privacy.masterLockCode, masterUnlocked]);

  /* Detect masterLock transitioning OFF → ON (e.g. user just enabled
     it in Page Settings, or re-enabled after using "Forgot code?
     Disable lock") and force the session into a locked state so the
     gate at the top of the component renders the lock screen
     immediately — no refresh required. */
  const prevMasterLockRef = useRef(privacy.masterLock);
  useEffect(() => {
    const prev = prevMasterLockRef.current;
    const now  = privacy.masterLock;
    if (!prev && now) {
      setMasterUnlocked(false);
      try { sessionStorage.removeItem('mh-journal-master-unlocked'); } catch {}
    }
    prevMasterLockRef.current = now;
  }, [privacy.masterLock]);

  const submitMasterChallenge = () => {
    if (!masterChallenge) return;
    if ((masterChallenge.value || '').trim() !== (privacy.masterLockCode || '').trim()) {
      setMasterChallenge(c => c && ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setMasterUnlocked(true);
    try { sessionStorage.setItem('mh-journal-master-unlocked', '1'); } catch {}
    setMasterChallenge(null);
  };

  /* Live-synced via Firestore. */
  const [entriesRaw, setEntries] = useUserStoreKey('journal-entries', []);
  /* Live list of prayers for the prayer-picker (Integrations →
     Link prayers). Empty when the user has no prayers yet. */
  const [allPrayers] = useUserStoreKey('prayer-requests', []);

  /* Sort entries based on the user's preferred order. Materializes
     a fresh array each render so React sees a new reference.
     Declared AFTER entriesRaw so the dep array doesn't read it
     before initialization. */
  const entries = React.useMemo(() => {
    const list = [...(entriesRaw || [])];
    const order = display?.sortOrder || 'newest';
    if (order === 'oldest') {
      list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    } else if (order === 'longest') {
      list.sort((a, b) => (b.content || '').length - (a.content || '').length);
    } else {
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return list;
  }, [entriesRaw, display?.sortOrder]);
  const [loading, setLoading]           = useState(false);
  const [selected, setSelected]         = useState(null);
  const [mode, setMode]                 = useState(null); // null=dashboard, 'view', 'edit', 'new'

  /* Default-landing-view setting — on first mount only, redirect
     from 'dashboard' to the user's chosen landing target. Guarded
     by a ref so we don't re-apply it after the user navigates. */
  const didApplyLandingRef = React.useRef(false);
  useEffect(() => {
    if (didApplyLandingRef.current) return;
    const view = display?.landingView || 'dashboard';
    if (view === 'newEntry') {
      didApplyLandingRef.current = true;
      // Defer until openNew is in scope below.
      queueMicrotask(() => { try { openNew(); } catch {} });
    } else if (view === 'lastEntry') {
      const latest = (entriesRaw || [])
        .slice()
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      if (latest) {
        didApplyLandingRef.current = true;
        setSelected(latest);
        setMode('view');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display?.landingView, entriesRaw]);
  const [form, setForm]                 = useState(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo,   setFilterTo]       = useState('');
  const [listCollapsed, setListCollapsed] = useState(false);
  /* Fullscreen entry mode — hides the app topbar, NavRail launcher,
     and entries list panel so the editor / view fills the viewport.
     Toggled from the ⛶ button in both edit and view modes; Esc exits
     so the user is never trapped. */
  const [fullscreen, setFullscreen]     = useState(false);
  const [promptUsed, setPromptUsed]     = useState(false);
  const [verseLoading, setVerseLoading] = useState(false);
  const verseDebounceRef = useRef(null);
  const [verseExpanded, setVerseExpanded] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminders, setReminders, { loading: remindersLoading }] = useUserStoreKey('journal-reminders', []);

  /* Esc exits fullscreen so the user is never trapped without the
     toolbar. Only binds while fullscreen is active. */
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  /* Mirror the fullscreen flag onto <body> so CSS can hide chrome
     that lives OUTSIDE .j-root — namely the global NavRail that
     App.jsx mounts at the route level. Without this, the floating
     ☰ trigger keeps showing in fullscreen because my .j-root
     selector can't reach it. Cleared on unmount so the body class
     never lingers after navigating away. */
  useEffect(() => {
    if (fullscreen) document.body.classList.add('j-fs');
    else            document.body.classList.remove('j-fs');
    return () => document.body.classList.remove('j-fs');
  }, [fullscreen]);

  /* If the user navigates back to the dashboard (mode === null) while
     fullscreen was on, drop fullscreen — there's nothing entry-sized
     left to fill the viewport. */
  useEffect(() => {
    if (mode === null && fullscreen) setFullscreen(false);
  }, [mode, fullscreen]);

  /* Mount-time cleanup for the calendar:
       1) Legacy `source: 'journal-entry'` events from the now-removed
          "Sync each saved entry to Calendar" integration. We never
          create these anymore, so any are dead weight.
       2) Orphan `source: 'journal-reminder'` events — anything not
          tracked by a currently-synced reminder's `eventIds`. Handles
          the case where reminders were deleted or sync was turned off
          but the calendar events stuck around. Also catches stragglers
          from the early rebuild-approach experiments.
     Both run once per mount, guarded by a ref. Depends on `reminders`
     being loaded — once the live subscription returns the user's
     reminder list, we can reliably tell which events are orphans. */
  const didSweepLegacyRef = React.useRef(false);
  useEffect(() => {
    if (didSweepLegacyRef.current) return;
    /* Wait for Firestore to actually return before running the
       orphan sweep — otherwise we'd run against the empty default
       and wipe events the user just created (no tracked ids yet). */
    if (remindersLoading) return;
    if (!Array.isArray(reminders)) return;
    didSweepLegacyRef.current = true;
    (async () => {
      try {
        const all = (await calendarService.getAll())?.data?.data || [];

        /* (1) Dead legacy entry events. */
        const entryIds = all
          .filter(ev => ev.source === 'journal-entry')
          .map(ev => ev.id);

        /* (2) Orphan reminder events — anything tagged journal-reminder
               that isn't listed in any synced reminder's eventIds. */
        const tracked = new Set();
        (reminders || []).forEach(r => {
          if (!r?.syncCalendar) return;
          (r.eventIds || []).forEach(id => tracked.add(id));
        });
        const orphanReminderIds = all
          .filter(ev => ev.source === 'journal-reminder' && !tracked.has(ev.id))
          .map(ev => ev.id);

        const toDelete = [...entryIds, ...orphanReminderIds];
        if (toDelete.length) await calendarService.bulkDelete(toDelete);
      } catch { /* noop */ }
    })();
  }, [reminders, remindersLoading]);
  const [newRemTime, setNewRemTime]     = useState('08:00');
  const [newRemLabel, setNewRemLabel]   = useState('');
  const [newRemDays, setNewRemDays]     = useState(['Mon','Wed','Fri']);
  /* Image upload feature removed — Firestore's 1 MiB per-doc cap
     and the absence of a guaranteed Storage path made cover photos
     unreliable. Entries are now text + scripture + linked prayers. */
  /* The prompt shown in the New / Edit form. Each call to openNew()
     refreshes it via randomPrompt(); openEdit() restores the prompt
     that the entry was originally written with (or empty). */
  const [prompt, setPrompt] = useState('');

  /* Lock UI state.
     - `lockChallenge`: opening a locked entry — { entry, value, error }
     - `lockSetup`:     setting/changing a code — { mode: 'set'|'change', value, error }
     Both render an in-app modal because Electron doesn't implement
     window.prompt() / window.alert(). */
  const [lockChallenge, setLockChallenge] = useState(null);
  const [lockSetup,     setLockSetup]     = useState(null);

  /* No initial fetch — useUserStoreKey loads via onSnapshot. */

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await journalService.getAll();
      setEntries(res.data.data);
    } catch { setError('Could not load entries.'); }
    finally { setLoading(false); }
  };

  const fetchReminders = async () => {
    try {
      const res = await journalReminderService.getAll();
      setReminders(res.data.data);
    } catch { /* non-critical */ }
  };

  /* The reminder service writes directly to Firestore, and the
     `journal-reminders` kv is live-subscribed via useUserStoreKey,
     so the local state updates automatically. We previously also
     called `setReminders(...)` here which wrote the change AGAIN —
     producing a duplicate entry on every create. Both calls now
     just await the service and let the subscription update state. */
  const persistNewReminder = async (rem) => {
    try {
      await journalReminderService.create(rem);
    } catch { setError('Failed to save reminder.'); }
  };

  const removeReminder = async (id) => {
    try {
      await journalReminderService.delete(id);
    } catch { setError('Failed to delete reminder.'); }
  };

  const openNew = () => {
    /* If auto-save is enabled and a draft exists, restore it.
       Otherwise start blank with a fresh random prompt. */
    let restored = null;
    if (editor.autoSaveDrafts) {
      try {
        const raw = localStorage.getItem('mh-journal-draft');
        if (raw) restored = JSON.parse(raw);
      } catch { /* ignore */ }
    }

    const fresh = restored?.prompt_text || randomPromptFromSettings(promptSettings);
    setPrompt(fresh);

    const lockOn  = !!privacy.defaultLock && !!privacy.defaultLockCode;
    const startingForm = restored ? {
      ...EMPTY,
      ...restored,
    } : {
      ...EMPTY,
      prompt_text: fresh,
      is_locked:   lockOn,
      lock_code:   lockOn ? privacy.defaultLockCode : '',
    };
    setSelected(null);
    setForm(startingForm);
    setPromptUsed(!!restored?.prompt_used);
    setMode('new');
  };

  /* Locked entries: route the unlock challenge through the in-app
     modal (Electron has no window.prompt). */
  const openView = (entry) => {
    if (entry?.is_locked && entry?.lock_code) {
      setLockChallenge({ entry, value: '', error: '' });
      return;
    }
    setSelected(entry);
    setMode('view');
  };

  /* Confirm the typed code against the entry. On match, open view
     mode and dismiss the modal; on miss, set an inline error. */
  const confirmLockChallenge = () => {
    if (!lockChallenge) return;
    const { entry, value } = lockChallenge;
    if ((value || '').trim() !== (entry.lock_code || '').trim()) {
      setLockChallenge(c => c && ({ ...c, error: 'Incorrect code.' }));
      return;
    }
    setSelected(entry);
    setMode('view');
    setLockChallenge(null);
  };

  /* Apply the result of the set/change-code modal to the current form. */
  const commitLockSetup = () => {
    if (!lockSetup) return;
    const trimmed = String(lockSetup.value || '').trim();
    if (!trimmed) {
      setLockSetup(s => s && ({ ...s, error: 'Lock code cannot be empty.' }));
      return;
    }
    setForm(f => ({ ...f, is_locked: true, lock_code: trimmed }));
    setLockSetup(null);
  };

  const openEdit = (entry) => {
    setSelected(entry);
    /* Restore the prompt that was used when the entry was created
       so re-opening it shows the same context (not a fresh random
       prompt). */
    setPrompt(entry.prompt_text || '');
    setForm({
      title: entry.title,
      content: entry.content,
      scripture: entry.scripture || '',
      verse_text: entry.verse_text || '',
      verses: (() => { try { return JSON.parse(entry.verses || '[]'); } catch { return []; } })(),
      prompt_used: !!entry.prompt_used,
      prompt_text: entry.prompt_text || '',
      is_locked: !!entry.is_locked,
      lock_code: entry.lock_code || '',
      /* Restore per-entry theme (falls back to default for older
         entries saved before this field existed). */
      theme_id: entry.theme_id || 'default',
      /* Deserialize linked prayers (stored as JSON-stringified array). */
      linked_prayer_ids: (() => {
        try { return JSON.parse(entry.linked_prayer_ids || '[]'); }
        catch { return []; }
      })(),
    });
    setPromptUsed(!!entry.prompt_used);
    setMode('edit');
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    /* Lock requires a non-empty code. */
    if (form.is_locked && !String(form.lock_code || '').trim()) {
      setError('Set a lock code (or unlock the entry) before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        prompt_used: promptUsed,
        verses: JSON.stringify(form.verses || []),
        is_locked: form.is_locked ? 1 : 0,
        lock_code: form.is_locked ? String(form.lock_code).trim() : '',
        /* Persist the prayer-picker selection. Service stringifies. */
        linked_prayer_ids: Array.isArray(form.linked_prayer_ids) ? form.linked_prayer_ids : [],
      };
      const result = (mode === 'edit' && selected)
        ? await journalService.update(selected.id, payload)
        : await journalService.create(payload);
      const saved = result.data.data;
      await fetchEntries();
      setSelected(saved);
      setMode('view');
      /* Successfully saved → clear any auto-save draft + any stale
         error banner from a previous attempt. */
      try { localStorage.removeItem('mh-journal-draft'); } catch {}
      setError(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Journal] Save failed:', err);
      const code = err?.code || '';
      const msg  = err?.message || '';
      let friendly;
      if (code === 'auth/not-authenticated') {
        friendly = 'You\'re signed out. Sign back in and try again.';
      } else if (
        code === 'invalid-argument' ||
        /maximum.*size|too large|exceeds the maximum|longer than 1048487 bytes/i.test(msg)
      ) {
        friendly =
          'Your journal storage is full — the entries doc has grown past Firestore\'s 1 MiB ' +
          'limit. Export your entries from Page Settings → Data and clear out some old ones to ' +
          'free space.';
      } else if (code === 'permission-denied') {
        friendly = 'Firestore rejected the write. Check your security rules / billing.';
      } else if (code === 'unavailable' || /offline|network/i.test(msg)) {
        friendly = 'Couldn\'t reach Firestore. Check your internet connection and try again.';
      } else {
        friendly = `Failed to save: ${msg || code || 'unknown error'}`;
      }
      setError(friendly);
    }
    finally { setSaving(false); }
  };

  /* Auto-save drafts: while a NEW entry is being composed AND the
     editor preference is on, persist form + promptUsed to
     localStorage. Restored by openNew() on next mount. Throttled
     so we don't write on every keystroke. */
  useEffect(() => {
    if (!editor.autoSaveDrafts) return;
    if (mode !== 'new') return;
    /* Don't save totally-empty drafts (avoids restoring nothing). */
    if (!form.title.trim() && !form.content.trim()) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem('mh-journal-draft', JSON.stringify({
          ...form,
          prompt_used: promptUsed,
        }));
      } catch {}
    }, 600);
    return () => clearTimeout(id);
  }, [form, promptUsed, mode, editor.autoSaveDrafts]);

  /* Drop the draft when the user explicitly cancels a new entry. */
  const cancelNewEntry = () => {
    try { localStorage.removeItem('mh-journal-draft'); } catch {}
    setMode(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await journalService.delete(id);
      const rem = entries.filter(e => e.id !== id);
      setEntries(rem);
      setSelected(null);
      setMode(null);
      /* Clean up any leftover calendar event that was created via
         the deprecated "Sync each saved entry to Calendar"
         integration for this specific entry. */
      try {
        const evs = (await calendarService.getAll())?.data?.data || [];
        const ids = evs.filter(ev => ev.source === 'journal-entry' && ev.source_id === id).map(ev => ev.id);
        if (ids.length) await calendarService.bulkDelete(ids);
      } catch { /* noop */ }
    } catch { setError('Failed to delete.'); }
  };

  // Add a new verse reference to the list
  const handleAddVerse = async (ref) => {
    if (!ref.trim() || !/\d/.test(ref)) return;
    setVerseLoading(true);
    const text = await fetchVerseText(ref.trim(), editor.bibleTranslation);
    setVerseLoading(false);
    if (!text) return;
    setForm(f => ({
      ...f,
      verses: [...(f.verses||[]), { ref: ref.trim(), text, expanded: false }]
    }));
  };

  const handleRemoveVerse = (idx) => {
    setForm(f => ({ ...f, verses: (f.verses||[]).filter((_,i) => i !== idx) }));
  };

  const toggleVerseExpanded = (idx) => {
    setForm(f => ({
      ...f,
      verses: (f.verses||[]).map((v,i) => i === idx ? {...v, expanded: !v.expanded} : v)
    }));
  };

  const handleScriptureChange = (e) => {
    const val = e.target.value;
    setForm(f => ({ ...f, scripture: val, verse_text: val ? f.verse_text : '' }));
    if (verseDebounceRef.current) clearTimeout(verseDebounceRef.current);
    if (!val.trim()) { setVerseLoading(false); return; }
    // Only fetch if it looks like a real reference (has a number or colon)
    if (!/\d/.test(val)) return;
    setVerseLoading(true);
    verseDebounceRef.current = setTimeout(async () => {
      const text = await fetchVerseText(val, editor.bibleTranslation);
      setForm(f => ({ ...f, verse_text: text }));
      setVerseLoading(false);
    }, 900);
  };

  /* Mark the prompt as used WITHOUT inserting its text into the
     content textarea. The prompt is still persisted on the entry
     (form.prompt_text) and shown above the saved entry in view mode,
     so we don't need to duplicate it in the body. */
  const usePrompt = () => {
    setPromptUsed(true);
  };

  /* Download a single entry as plain .txt — title, date, prompt,
     scripture refs, and the full body. Filename is slugged from the
     entry's title. */
  const downloadEntry = (entry) => {
    if (!entry) return;
    const lines = [];
    lines.push(entry.title || 'Untitled Entry');
    lines.push('='.repeat((entry.title || 'Untitled Entry').length));
    try { lines.push(format(new Date(entry.created_at), 'MMMM d, yyyy · h:mm a')); } catch {}
    lines.push('');
    if (entry.prompt_used && entry.prompt_text) {
      lines.push(`Prompt: "${entry.prompt_text}"`);
      lines.push('');
    }
    let verses = [];
    try { verses = JSON.parse(entry.verses || '[]'); } catch {}
    if (!verses.length && entry.scripture) {
      verses = [{ ref: entry.scripture, text: entry.verse_text || '' }];
    }
    if (verses.length) {
      lines.push('Scripture');
      lines.push('---------');
      verses.forEach(v => {
        lines.push(`• ${v.ref}`);
        if (v.text) lines.push(`  ${v.text.replace(/\n/g, '\n  ')}`);
      });
      lines.push('');
    }
    lines.push(entry.content || '');
    lines.push('');
    lines.push(`— ${wordCount(entry.content)} word${wordCount(entry.content) === 1 ? '' : 's'}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const slug = (entry.title || 'journal-entry').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    let datePart = '';
    try { datePart = format(new Date(entry.created_at), 'yyyy-MM-dd'); } catch {}
    a.href = url;
    a.download = `journal-${datePart || 'entry'}-${slug || 'entry'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* Download ALL entries in the user's preferred format (txt / md / json).
     Includes image_url references when backup.includeImages is true. */
  const downloadAllEntries = () => {
    const fmt = backup.defaultFormat || 'md';
    const filename = `journal-export-${new Date().toISOString().slice(0, 10)}.${fmt}`;

    const fmtEntryMd = (e) => {
      const lines = [];
      lines.push(`# ${e.title || 'Untitled'}`);
      try { lines.push(`*${format(new Date(e.created_at), 'MMMM d, yyyy · h:mm a')}*`); } catch {}
      lines.push('');
      if (backup.includeImages && (e.image_url || e.image_data)) {
        lines.push(`![cover](${e.image_url || e.image_data})`);
        lines.push('');
      }
      if (e.prompt_used && e.prompt_text) {
        lines.push(`> Prompt: "${e.prompt_text}"`);
        lines.push('');
      }
      let verses = [];
      try { verses = JSON.parse(e.verses || '[]'); } catch {}
      if (!verses.length && e.scripture) verses = [{ ref: e.scripture, text: e.verse_text || '' }];
      if (verses.length) {
        lines.push('## Scripture');
        verses.forEach(v => {
          lines.push(`- **${v.ref}**`);
          if (v.text) lines.push(`  > ${v.text.replace(/\n/g, '\n  > ')}`);
        });
        lines.push('');
      }
      lines.push(e.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
      return lines.join('\n');
    };

    const fmtEntryTxt = (e) => {
      const lines = [];
      lines.push(e.title || 'Untitled');
      lines.push('='.repeat((e.title || 'Untitled').length));
      try { lines.push(format(new Date(e.created_at), 'MMMM d, yyyy · h:mm a')); } catch {}
      lines.push('');
      if (e.prompt_used && e.prompt_text) {
        lines.push(`Prompt: "${e.prompt_text}"`);
        lines.push('');
      }
      let verses = [];
      try { verses = JSON.parse(e.verses || '[]'); } catch {}
      if (!verses.length && e.scripture) verses = [{ ref: e.scripture, text: e.verse_text || '' }];
      if (verses.length) {
        lines.push('Scripture');
        lines.push('---------');
        verses.forEach(v => {
          lines.push(`- ${v.ref}`);
          if (v.text) lines.push(`  ${v.text.replace(/\n/g, '\n  ')}`);
        });
        lines.push('');
      }
      if (backup.includeImages && (e.image_url || e.image_data)) {
        lines.push(`Cover image: ${e.image_url || e.image_data}`);
        lines.push('');
      }
      lines.push(e.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
      return lines.join('\n');
    };

    let content;
    let mime;
    if (fmt === 'json') {
      const data = entries.map(e => ({
        id: e.id, title: e.title, content: e.content,
        scripture: e.scripture, verses: e.verses, verse_text: e.verse_text,
        prompt_text: e.prompt_text, prompt_used: e.prompt_used,
        is_locked: e.is_locked,
        image: backup.includeImages ? (e.image_url || e.image_data || null) : null,
        created_at: e.created_at, updated_at: e.updated_at,
      }));
      content = JSON.stringify(data, null, 2);
      mime = 'application/json';
    } else if (fmt === 'txt') {
      content = entries.map(fmtEntryTxt).join('\n');
      mime = 'text/plain;charset=utf-8';
    } else {
      content = entries.map(fmtEntryMd).join('\n');
      mime = 'text/markdown;charset=utf-8';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* Search matches against title/content. Date range filter is
     inclusive on both ends and uses the entry's created_at date.
     Privacy: when `hideLockedFromSearch` is on, locked entries are
     excluded from search results (but still visible in an unfiltered
     list). */
  const filtered = entries.filter(e => {
    const q = search.trim().toLowerCase();
    if (q && privacy.hideLockedFromSearch && e.is_locked) return false;
    const ms = !q
      || (e.title  || '').toLowerCase().includes(q)
      || (e.content || '').toLowerCase().includes(q);
    if (!ms) return false;
    if (filterFrom || filterTo) {
      const created = (e.created_at || '').slice(0, 10); // YYYY-MM-DD
      if (filterFrom && created < filterFrom) return false;
      if (filterTo   && created > filterTo)   return false;
    }
    return true;
  });

  /* True when the user actively narrowed the list — used to suppress
     the empty-state CTA when search/filter returns nothing. */
  const hasActiveFilter = !!(search.trim() || filterFrom || filterTo);

  const leftW  = listCollapsed ? '44px' : '280px';

  /* Auto-heal: if the master lock is on but no code is actually set
     (e.g. user toggled it on with an empty field, or stored state
     drifted), silently disable the lock so the user can never get
     trapped behind a code they didn't set. */
  useEffect(() => {
    if (privacy.masterLock && !String(privacy.masterLockCode || '').trim()) {
      setPrivacy({ ...privacy, masterLock: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacy.masterLock, privacy.masterLockCode]);

  /* Reset the master lock entirely — used as the "Forgot code?"
     escape hatch on the lock screen so the user can never be
     permanently locked out of their own journal. */
  const resetMasterLock = () => {
    setPrivacy({ ...privacy, masterLock: false, masterLockCode: '' });
    setMasterUnlocked(true);
    try { sessionStorage.setItem('mh-journal-master-unlocked', '1'); } catch {}
  };

  /* Master lock blocks the whole page when active. Once unlocked
     this session, the user gets normal access (until auto-lock idle
     re-locks). */
  if (privacy.masterLock && privacy.masterLockCode && !masterUnlocked) {
    return (
      <div className="j-root">
        <div className="j-bg" aria-hidden="true">
          <div className="orb o1"/><div className="orb o2"/>
          <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
        </div>
        <div className="j-master-lock-wrap" role="dialog" aria-label="Locked journal">
          <div className="j-master-lock-card">
            <div className="j-master-lock-icon">🔒</div>
            <div className="j-master-lock-title">Journal is locked</div>
            <div className="j-master-lock-sub">Enter your master code to continue.</div>
            <input
              autoFocus
              type="password"
              className="j-lock-modal-input"
              placeholder="Code"
              value={masterChallenge?.value || ''}
              onChange={e => setMasterChallenge(c => ({
                ...(c || {}),
                value: e.target.value,
                error: '',
              }))}
              onKeyDown={e => { if (e.key === 'Enter') submitMasterChallenge(); }}
            />
            {masterChallenge?.error && (
              <div className="j-lock-modal-err">{masterChallenge.error}</div>
            )}
            <button
              className="j-save-btn"
              disabled={!masterChallenge?.value?.trim()}
              onClick={submitMasterChallenge}
              style={{ marginTop: 12 }}
            >Unlock</button>

            {/* Escape hatch — never let the user get permanently
                locked out of their own journal. Single click clears
                masterLock + masterLockCode and signs them in. */}
            <button
              type="button"
              className="j-master-lock-forgot"
              onClick={() => {
                if (window.confirm(
                  'Disable the master lock and remove the code? You can re-enable it later from Page Settings.'
                )) {
                  resetMasterLock();
                }
              }}
            >Forgot code? Disable lock</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`j-root ${fullscreen ? 'j-fullscreen' : ''}`}>
      <div className="j-bg" aria-hidden="true">
        <div className="orb o1"/><div className="orb o2"/>
        <div className="orb o3"/><div className="orb o4"/><div className="orb o5"/>
      </div>

      <PageTourHost pageId="journal" />

      {/* ── TOPBAR ── */}
      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag journal">Journal</span>
        </div>
        <div className="app-tb-actions">
          {/* Notification bell — blue badge with live count, hover
              opens a tooltip listing each notification with a dismiss
              button. Click toggles a persistent popover for keyboard
              users / touch devices. */}
          <div
            className="j-tb-bell-wrap"
            onMouseEnter={openNotifsTooltip}
            onMouseLeave={scheduleCloseNotifs}
          >
            <button
              className="j-tb-bell"
              onClick={() => setShowNotifs(v => !v)}
              aria-label={`${notifications.length} notifications`}
              title={`${notifications.length} notification${notifications.length === 1 ? '' : 's'}`}
            >
              🔔
              {notifications.length > 0 && (
                <span className="j-tb-bell-badge">{notifications.length}</span>
              )}
            </button>
            {showNotifs && (
              <div
                className="j-notif-popover"
                role="dialog"
                aria-label="Notifications"
                onMouseEnter={openNotifsTooltip}
                onMouseLeave={scheduleCloseNotifs}
              >
                <div className="j-notif-popover-hd">
                  <span className="j-notif-popover-title">Notifications</span>
                  {notifications.length > 0 && (
                    <button className="j-notif-dismiss-all" onClick={dismissAll}>
                      Dismiss all
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="j-notif-empty">You're all caught up.</div>
                ) : (
                  <div className="j-notif-list">
                    {notifications.map(n => (
                      <div key={n.id} className="j-notif-item">
                        <span className="j-notif-icon">{n.icon || '🔔'}</span>
                        <div className="j-notif-text">
                          <div className="j-notif-title">{n.title}</div>
                          <div className="j-notif-body">{n.body}</div>
                        </div>
                        <button
                          className="j-notif-dismiss"
                          onClick={() => dismiss(n.id)}
                          title="Dismiss"
                          aria-label="Dismiss notification"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Themes are per-entry now (picker lives inside the
              new/edit editor), not page-wide. */}

          {/* Profile avatar — opens a small tabbed modal:
              • Profile tab: the same editable profile that Chat shows
              • Settings tab: button that jumps to the full /settings page */}
          <button
            className="j-tb-avatar"
            data-tour="tour-settings"
            onClick={() => { setProfileTab('profile'); setShowProfile(true); }}
            title={avatarSourceName || 'Profile'}
            aria-label="Open profile"
          >
            {initials}
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      {/* Grid template no longer leads with var(--rail-w) — the
          NavRail is a fixed-positioned slide-out drawer, so it's
          removed from the grid's auto-placement. If we kept the
          empty rail column, the list panel would land in a 0px
          slot and the widgets would get squished. */}
      <div className="j-body" style={{ gridTemplateColumns: `${leftW} 1fr` }}>
        <NavRail />

        {/* ── LEFT: Entry List ── */}
        <div className={`j-list-panel ${listCollapsed ? 'collapsed' : ''}`}>
          <div className="j-panel-header">
            <button
              className="j-collapse-btn"
              onClick={() => setListCollapsed(v=>!v)}
              title={listCollapsed ? 'Expand entries list' : 'Collapse entries list'}
              aria-label={listCollapsed ? 'Expand entries list' : 'Collapse entries list'}
            >
              {listCollapsed ? '›' : '‹'}
            </button>
            {!listCollapsed && <span className="j-panel-title">Entries</span>}
            {!listCollapsed && <button className="j-icon-btn" data-tour="tour-primary-action" onClick={openNew} title="New entry">✦</button>}
          </div>

          {!listCollapsed && (
            <>
              <div className="j-search">
                <span>🔍</span>
                <input className="j-search-input" type="text" placeholder="Search..."
                  value={search} onChange={e=>setSearch(e.target.value)} />
                {search && <button className="j-search-clear" onClick={()=>setSearch('')} title="Clear search" aria-label="Clear search">✕</button>}
              </div>

              {/* Date range filter — replaces the old mood pills. */}
              <div className="j-daterange">
                <div className="j-daterange-row">
                  <label className="j-daterange-lbl">From</label>
                  <input
                    type="date"
                    className="j-daterange-input"
                    value={filterFrom}
                    onChange={e => setFilterFrom(e.target.value)}
                  />
                </div>
                <div className="j-daterange-row">
                  <label className="j-daterange-lbl">To</label>
                  <input
                    type="date"
                    className="j-daterange-input"
                    value={filterTo}
                    onChange={e => setFilterTo(e.target.value)}
                  />
                </div>
                {(filterFrom || filterTo) && (
                  <button
                    className="j-daterange-clear"
                    onClick={() => { setFilterFrom(''); setFilterTo(''); }}
                  >Clear dates</button>
                )}
              </div>

              {error && <div className="j-error">{error}<button onClick={()=>setError(null)}>✕</button></div>}

              <div className="j-entries">
                {loading ? (
                  <div className="j-list-empty">Loading...</div>
                ) : filtered.length === 0 ? (
                  /* When the user is actively searching / filtering and
                     nothing matches, render nothing — keep the panel
                     blank as requested. The empty CTA only shows for
                     truly-no-entries-yet. */
                  hasActiveFilter ? null : (
                    <div className="j-list-empty">
                      <div>No entries yet.</div>
                      <button className="j-empty-cta" onClick={openNew}>+ Write first prayer</button>
                    </div>
                  )
                ) : filtered.map(entry => {
                  const isSel = selected?.id===entry.id;
                  const locked = !!entry.is_locked;
                  const hidePreview = locked && privacy.hideLockedPreviews;
                  const density = display?.cardDensity || 'comfy';
                  const fmt = display?.dateFormat || 'MMM d, yyyy';
                  let dateStr = '';
                  try { dateStr = format(new Date(entry.created_at), fmt); } catch {}
                  return (
                    <div key={entry.id} className={`j-ecard d-${density} ${isSel?'sel':''} ${locked?'locked':''}`}>
                      <div className="j-ecard-row">
                        <div className="j-ecard-info" onClick={() => openView(entry)}>
                          <div className="j-ecard-title">
                            {locked && <span className="j-ecard-lock" title="Locked entry">🔒</span>}
                            {hidePreview ? <em style={{ opacity: 0.55 }}>Locked entry</em> : entry.title}
                          </div>
                          {!hidePreview && density !== 'titleOnly' && (
                            <div className="j-ecard-date">
                              {dateStr}
                              {display?.showWordCount && (
                                <span className="j-ecard-wc"> · {wordCount(entry.content)} words</span>
                              )}
                            </div>
                          )}
                        </div>
                        <button className="j-ecard-del" onClick={()=>handleDelete(entry.id)} title="Delete entry" aria-label="Delete entry">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── CENTER ── */}
        <div className="j-center">

          {/* DASHBOARD */}
          {mode === null && (
            <JournalDashboard
              entries={entries}
              onOpenNew={openNew}
              onOpenView={openView}
            />
          )}

          {/* VIEW MODE */}
          {mode === 'view' && selected && (() => {
            const words = wordCount(selected.content);
            /* Apply the entry's saved theme to the view wrapper —
               cascades CSS vars to the hero gradient + accent
               sub-components below. */
            const viewTheme = getJournalTheme(selected.theme_id || 'default');
            return (
            <div
              className={`j-view-wrap j-themed j-theme-${viewTheme.id}`}
              style={{
                '--j-accent':    viewTheme.accent,
                '--j-secondary': viewTheme.secondary,
                '--j-surface':   viewTheme.surface,
                '--j-bg':        viewTheme.bg,
              }}
            >
              {/* Themed background + decorative overlay rendered
                  behind everything else (z-index: 0 in CSS). */}
              <div className="j-themed-bg" aria-hidden="true"/>
              <JournalThemeDeco themeId={viewTheme.id}/>

              {/* Hero header — uses the entry's theme gradient
                  (via --j-bg) instead of the hardcoded brand one. */}
              <div className="j-detail-hero j-detail-hero-themed"><div className="hero-shine"/></div>

              <div className="j-view-body">
                {/* Prompt used badge. `prompt_used` is stored as 0/1 by
                    the service (not a real boolean), so guard with !! —
                    otherwise React renders a literal "0" when the entry
                    didn't use a prompt. */}
                {!!selected.prompt_used && selected.prompt_text && (
                  <div className="j-view-prompt-badge">
                    ✨ Prompted: <em>"{selected.prompt_text}"</em>
                  </div>
                )}

                <div className="j-view-title">
                  {/* Same 0/1 → boolean coercion for the lock icon — without
                      it, unlocked entries showed a stray "0" next to the title. */}
                  {!!selected.is_locked && <span className="j-view-lock" title="Locked entry">🔒</span>}
                  {selected.title}
                </div>
                <div className="j-view-meta">
                  <span>📅 {(() => {
                    try { return format(new Date(selected.created_at), `${display?.dateFormat || 'MMMM d, yyyy'} · h:mm a`); }
                    catch { return ''; }
                  })()}</span>
                  <span className="j-view-wc">📝 {words.toLocaleString()} word{words === 1 ? '' : 's'}</span>
                </div>

                {/* Multi-verse display — view mode */}
                {(() => {
                  let verses = [];
                  try { verses = JSON.parse(selected.verses || '[]'); } catch {}
                  // Fall back to legacy single scripture
                  if (!verses.length && selected.scripture) {
                    verses = [{ ref: selected.scripture, text: selected.verse_text || '', expanded: false }];
                  }
                  if (!verses.length) return null;
                  return (
                    <div className="j-view-verses">
                      {verses.map((v, idx) => (
                        <ViewVerse key={idx} verse={v} />
                      ))}
                    </div>
                  );
                })()}

                {/* Linked prayers (Integrations → Link prayers).
                    Renders only when the entry actually has links AND
                    we can resolve at least one to a known prayer.
                    Clicking jumps to the Prayers page filtered to
                    that prayer's id. */}
                {(() => {
                  let ids = [];
                  try { ids = JSON.parse(selected.linked_prayer_ids || '[]'); } catch {}
                  if (!Array.isArray(ids) || !ids.length) return null;
                  const linked = ids
                    .map(pid => (allPrayers || []).find(p => p.id === pid))
                    .filter(Boolean);
                  if (!linked.length) return null;
                  return (
                    <div className="j-view-prayers">
                      <div className="j-view-prayers-lbl">🙏 Linked Prayers</div>
                      <div className="j-prayer-chips">
                        {linked.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="j-prayer-chip view"
                            onClick={() => navigate(`/prayers?prayer=${p.id}`)}
                            title="Open in Prayers"
                          >🙏 {p.title || 'Untitled prayer'}</button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div
                  className="j-view-content"
                  style={{
                    fontFamily: editor.bodyFont === 'serif' ? 'Georgia, serif'
                              : editor.bodyFont === 'mono'  ? '"SF Mono", Menlo, monospace'
                              : 'inherit',
                    fontSize: `${editor.bodyFontSize || 16}px`,
                  }}
                >
                  {editor.markdownShortcuts
                    ? <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(selected.content) }} />
                    : selected.content}
                </div>

                {/* Actions */}
                <div className="j-view-actions">
                  <button className="j-view-edit-btn" onClick={() => openEdit(selected)}>✏ Edit Entry</button>
                  <button className="j-view-dl-btn"   onClick={() => downloadEntry(selected)}>⬇ Download</button>
                  <button className="j-view-del-btn"  onClick={() => handleDelete(selected.id)}>🗑 Delete</button>
                  {/* Toggle full-viewport reading — Esc also exits. */}
                  <button
                    className="j-view-fs-btn"
                    onClick={() => setFullscreen(v => !v)}
                    title={fullscreen ? 'Exit fullscreen (Esc)' : 'Open in fullscreen'}
                  >
                    {fullscreen ? '⛶ Exit Full Screen' : '⛶ Full Screen'}
                  </button>
                  <button className="j-view-back-btn" onClick={() => setMode(null)}>← Dashboard</button>
                </div>
              </div>
            </div>
            );
          })()}

          {/* NEW / EDIT MODE */}
          {(mode === 'new' || mode === 'edit') && (() => {
            /* Live-preview the picked theme on the editor itself
               so the user sees the picker's effect immediately
               (no save required). */
            const editTheme = getJournalTheme(form.theme_id || 'default');
            return (
            <div
              className={`j-form-wrap j-themed j-theme-${editTheme.id}`}
              style={{
                '--j-accent':    editTheme.accent,
                '--j-secondary': editTheme.secondary,
                '--j-surface':   editTheme.surface,
                '--j-bg':        editTheme.bg,
              }}
            >
              {/* Themed background + decorative SVG overlay. Renders
                  behind every direct child via z-index: 0; everything
                  else gets bumped to z-index: 1 in CSS. */}
              <div className="j-themed-bg" aria-hidden="true"/>
              <JournalThemeDeco themeId={editTheme.id}/>

              <div className="j-form-header">
                <div className="j-form-header-title">
                  {mode === 'new' ? '✨ New Journal Entry' : '✏ Edit Entry'}
                </div>
                <div className="j-form-header-actions">
                  {/* Same fullscreen toggle as view mode — Esc exits. */}
                  <button
                    type="button"
                    className="j-form-fs"
                    onClick={() => setFullscreen(v => !v)}
                    title={fullscreen ? 'Exit fullscreen (Esc)' : 'Open in fullscreen'}
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {fullscreen ? '⛶ Exit Full Screen' : '⛶ Full Screen'}
                  </button>
                  <button className="j-form-close" onClick={() => { if (mode === 'new') cancelNewEntry(); else setMode('view'); }} title="Close" aria-label="Close">✕</button>
                </div>
              </div>

              <div className="j-form-fields">

                {/* Reflection Prompt — fresh random pick per new entry.
                    In edit mode we restore the entry's original prompt;
                    if the entry had no prompt, the card is hidden. */}
                {prompt && (
                  <div className="j-prompt-card">
                    <div className="j-prompt-label">
                      ✨ {mode === 'new' ? 'Reflection Prompt' : 'Original Prompt'}
                    </div>
                    <div className="j-prompt-text">"{prompt}"</div>
                    <div className="j-prompt-btns">
                      <button
                        className={`j-prompt-use ${promptUsed ? 'used' : ''}`}
                        onClick={usePrompt}
                        disabled={promptUsed}
                        title="Mark this prompt as the one you're answering (doesn't add anything to the body)"
                      >
                        {promptUsed ? '✓ Used' : 'Use Prompt'}
                      </button>
                      <button className="j-prompt-skip" onClick={() => setPromptUsed(false)}>
                        Don't Use
                      </button>
                      {mode === 'new' && (
                        <button
                          className="j-prompt-skip"
                          onClick={() => {
                            const fresh = randomPromptFromSettings(promptSettings);
                            setPrompt(fresh);
                            setForm(f => ({ ...f, prompt_text: fresh }));
                            setPromptUsed(false);
                          }}
                          title="Get a different prompt"
                        >🔀 New</button>
                      )}
                    </div>
                  </div>
                )}

                {/* Per-entry theme picker.
                    Same drop-down design as the (removed) topbar
                    version, but bound to the entry's `theme_id`
                    field — so each entry can have its own visual
                    mood that follows it into view mode. Click the
                    button to open the popover; click a row to pick
                    that theme + close. */}
                {(() => {
                  const currentTheme = getJournalTheme(form.theme_id || 'default');
                  return (
                    <div className="j-edit-themes-wrap">
                      <button
                        type="button"
                        className="j-edit-themes-btn"
                        onClick={() => setShowThemes(v => !v)}
                        aria-label="Choose entry theme"
                        title={`Theme: ${currentTheme.name}`}
                      >
                        <span
                          className="j-edit-themes-swatch"
                          aria-hidden="true"
                          style={{
                            background:
                              `linear-gradient(135deg, ${currentTheme.accent} 0%, ${currentTheme.secondary} 100%)`,
                          }}
                        />
                        <span className="j-edit-themes-label">🎨 Theme: {currentTheme.name}</span>
                        <span className="j-edit-themes-chev">{showThemes ? '▴' : '▾'}</span>
                      </button>
                      {showThemes && (
                        <div
                          className="j-themes-popover j-edit-themes-popover"
                          role="dialog"
                          aria-label="Pick an entry theme"
                        >
                          <div className="j-themes-popover-hd">
                            <span className="j-themes-popover-title">🎨 Entry theme</span>
                          </div>
                          <div className="j-themes-list">
                            {JOURNAL_THEMES.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                className={`j-themes-item ${t.id === (form.theme_id || 'default') ? 'is-active' : ''}`}
                                onClick={() => {
                                  setForm(f => ({ ...f, theme_id: t.id }));
                                  setShowThemes(false);
                                }}
                              >
                                <span
                                  className="j-themes-item-swatch"
                                  style={{
                                    background:
                                      `linear-gradient(135deg, ${t.accent} 0%, ${t.secondary} 100%)`,
                                  }}
                                />
                                <span className="j-themes-item-name">{t.name}</span>
                                {t.id === (form.theme_id || 'default') && (
                                  <span className="j-themes-item-check">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <input
                  className="j-title-input"
                  type="text"
                  placeholder="What are you bringing before God today?"
                  value={form.title}
                  onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                />

                <textarea
                  className="j-body-textarea"
                  placeholder="Write your prayer, reflection, or request..."
                  value={form.content}
                  spellCheck={editor.spellCheck !== false}
                  style={{
                    fontFamily: editor.bodyFont === 'serif' ? 'Georgia, serif'
                              : editor.bodyFont === 'mono'  ? '"SF Mono", Menlo, monospace'
                              : 'inherit',
                    fontSize: `${editor.bodyFontSize || 16}px`,
                  }}
                  onChange={e => {
                    let v = e.target.value;
                    /* Smart-quote substitution. Triggers only on the
                       just-typed character to avoid clobbering quotes
                       in pasted content. */
                    if (editor.smartQuotes !== false && v.length > form.content.length) {
                      const before = v[v.length - 2] || '';
                      const last   = v[v.length - 1];
                      const openish = !before || /\s|[(\[{]/.test(before);
                      if (last === '"') v = v.slice(0, -1) + (openish ? '“' : '”');
                      else if (last === "'") v = v.slice(0, -1) + (openish ? '‘' : '’');
                    }
                    setForm(f => ({ ...f, content: v }));
                  }}
                />
                {editor.wordCountTarget > 0 && (() => {
                  const wc = wordCount(form.content);
                  const target = editor.wordCountTarget;
                  const pct = Math.min(100, Math.round((wc / target) * 100));
                  return (
                    <div className={`j-wc-target ${wc >= target ? 'hit' : ''}`}>
                      <span>{wc} / {target} words</span>
                      <div className="j-wc-track">
                        <div className="j-wc-fill" style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  );
                })()}

                {/* Multi-verse references */}
                <div className="j-verses-section">
                  <div className="j-verses-label">📖 Scripture References</div>

                  {/* Saved verse chips — toggle + delete are siblings.
                      Nesting buttons trips React's validateDOMNesting
                      and is invalid HTML, so the ✕ lives outside the
                      toggle but inside the same card row. */}
                  {(form.verses||[]).map((v, idx) => (
                    <div key={idx} className="j-verse-card">
                      <div className="j-verse-card-row">
                        <button
                          type="button"
                          className="j-verse-card-toggle"
                          onClick={() => toggleVerseExpanded(idx)}
                        >
                          <span className="j-verse-card-ref">📖 {v.ref}</span>
                          <span className="j-verse-card-chevron">{v.expanded ? '▲' : '▼ read'}</span>
                        </button>
                        <button
                          type="button"
                          className="j-verse-card-del"
                          onClick={() => handleRemoveVerse(idx)}
                          aria-label="Remove verse"
                        >✕</button>
                      </div>
                      {v.expanded && (
                        <div className="j-verse-card-text j-verse-expand-anim">{v.text}</div>
                      )}
                    </div>
                  ))}

                  {/* Add new verse row */}
                  <div className="j-verse-add-row">
                    <div className="j-scripture-input-row">
                      <input
                        className="j-scripture-input"
                        type="text"
                        placeholder="e.g. John 3:16, Psalm 23, Romans 8:28-39..."
                        value={form.scripture}
                        onChange={handleScriptureChange}
                        onKeyDown={e => { if (e.key === 'Enter') { handleAddVerse(form.scripture); setForm(f=>({...f,scripture:'',verse_text:''})); }}}
                      />
                      {verseLoading && (
                        <div className="j-verse-spinner">
                          <div className="j-verse-dot"/><div className="j-verse-dot"/><div className="j-verse-dot"/>
                        </div>
                      )}
                    </div>
                    <button
                      className="j-verse-add-btn"
                      disabled={verseLoading || !form.scripture.trim() || !/\d/.test(form.scripture)}
                      onClick={() => { handleAddVerse(form.scripture); setForm(f=>({...f,scripture:'',verse_text:''})); }}
                    >+ Add</button>
                  </div>
                  <div className="j-verse-hint">Press Enter or click Add · You can add multiple references</div>
                </div>

                {/* ── Prayer picker ──
                    Renders when "Link prayers to entries" is on.
                    Shows the selected prayers as chips + a dropdown to
                    link more. Falls back to an empty-state hint when
                    there are no prayers yet (so the integration
                    doesn't look broken). */}
                {integrations?.linkPrayers && (
                  <div className="j-prayer-picker">
                    <div className="j-prayer-picker-lbl">🙏 Linked Prayers</div>

                    {(form.linked_prayer_ids || []).length > 0 && (
                      <div className="j-prayer-chips">
                        {form.linked_prayer_ids.map(pid => {
                          const p = (allPrayers || []).find(x => x.id === pid);
                          /* Render even when the prayer no longer
                             exists (deleted from Prayers) so the user
                             can see the broken link and unlink it. */
                          return (
                            <button
                              key={pid}
                              type="button"
                              className="j-prayer-chip"
                              onClick={() => setForm(f => ({
                                ...f,
                                linked_prayer_ids: (f.linked_prayer_ids || []).filter(x => x !== pid),
                              }))}
                              title="Click to unlink"
                            >🙏 {p?.title || 'Deleted prayer'} ✕</button>
                          );
                        })}
                      </div>
                    )}

                    {Array.isArray(allPrayers) && allPrayers.length > 0 ? (
                      <select
                        className="j-prayer-select"
                        value=""
                        onChange={e => {
                          const pid = e.target.value;
                          if (!pid) return;
                          if ((form.linked_prayer_ids || []).includes(pid)) return;
                          setForm(f => ({
                            ...f,
                            linked_prayer_ids: [...(f.linked_prayer_ids || []), pid],
                          }));
                        }}
                      >
                        <option value="">+ Link a prayer…</option>
                        {allPrayers
                          .filter(p => !(form.linked_prayer_ids || []).includes(p.id))
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {p.title || 'Untitled prayer'}
                              {p.status ? ` — ${p.status}` : ''}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <div className="j-prayer-empty">
                        No prayers yet.{' '}
                        <button
                          type="button"
                          className="j-prayer-empty-link"
                          onClick={() => navigate('/prayers')}
                        >Open Prayers →</button>
                      </div>
                    )}
                  </div>
                )}

                <div className="j-form-footer">
                  {/* Lock toggle — replaces the old mood picker.
                      Clicking "Locked" prompts for a code; clicking it
                      again clears the lock. The code is required to
                      open the entry from view mode. */}
                  <div className="j-lock-wrap">
                    <button
                      type="button"
                      className={`j-lock-btn ${form.is_locked ? 'on' : ''}`}
                      onClick={() => {
                        if (form.is_locked) {
                          // Toggle off — clear the code.
                          setForm(f => ({ ...f, is_locked: false, lock_code: '' }));
                          return;
                        }
                        setLockSetup({ mode: 'set', value: '', error: '' });
                      }}
                      title={form.is_locked ? 'Click to unlock' : 'Click to lock and set a code'}
                    >
                      {form.is_locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                    {form.is_locked && (
                      <button
                        type="button"
                        className="j-lock-change"
                        onClick={() => setLockSetup({ mode: 'change', value: '', error: '' })}
                      >Change code</button>
                    )}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="j-cancel-btn" onClick={() => { if (mode === 'new') cancelNewEntry(); else setMode('view'); }}>Cancel</button>
                    <button className="j-save-btn" onClick={handleSave}
                      disabled={saving||!form.title.trim()||!form.content.trim()}>
                      💾 {saving ? 'Saving...' : 'Save Journal'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}
        </div>

      </div>{/* end j-body */}
      {/* Modal overlay outside grid */}

      {/* ── REMINDER MODAL ── */}
      {showReminders && (
        <>
          <div className="j-modal-overlay" onClick={() => setShowReminders(false)}/>
          <div className="j-reminder-modal">
            <div className="j-rem-modal-hd">
              <span>🔔 Journal Reminders</span>
              <button className="j-rem-modal-close" onClick={() => setShowReminders(false)}>✕</button>
            </div>
            <div className="j-rem-modal-body">

              {/* Existing reminders list — moved into the modal so the
                  feature stays usable without the old right sidebar. */}
              <div className="j-rem-modal-lbl">Your reminders</div>
              {reminders.length === 0 ? (
                <div className="j-rem-empty">No reminders set yet.</div>
              ) : (
                <div className="j-rem-modal-list">
                  {reminders.map((r) => (
                    <div key={r.id} className="j-rem-item">
                      <span className="j-rem-dot"/>
                      <div className="j-rem-info">
                        <span className="j-rem-time">{format12Hour(r.time)}</span>
                        {r.label && <span className="j-rem-label">{r.label}</span>}
                        <span className="j-rem-days">{(r.days || []).join(', ')}</span>
                      </div>
                      <button className="j-rem-del" onClick={() => removeReminder(r.id)} title="Delete reminder">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="j-rem-modal-divider"/>
              <div className="j-rem-modal-section-title">Add new reminder</div>

              <div className="j-rem-modal-lbl">Time</div>
              <input
                className="j-rem-modal-time"
                type="time"
                value={newRemTime}
                onChange={e => setNewRemTime(e.target.value)}
              />
              <div className="j-rem-modal-lbl">Label (optional)</div>
              <input
                className="j-rem-modal-input"
                type="text"
                placeholder="e.g. Morning devotion, Evening reflection"
                value={newRemLabel}
                onChange={e => setNewRemLabel(e.target.value)}
              />
              <div className="j-rem-modal-lbl">Repeat on</div>
              <div className="j-rem-modal-days">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <button
                    key={d}
                    className={`j-rem-modal-day ${newRemDays.includes(d) ? 'on' : ''}`}
                    onClick={() => setNewRemDays(ds =>
                      ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]
                    )}
                  >{d}</button>
                ))}
              </div>
              <div className="j-rem-modal-presets">
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Mon','Tue','Wed','Thu','Fri'])}>Weekdays</button>
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Sat','Sun'])}>Weekends</button>
                <button className="j-rem-preset" onClick={() => setNewRemDays(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])}>Daily</button>
              </div>
            </div>
            <div className="j-rem-modal-ft">
              <button className="j-cancel-btn" onClick={() => setShowReminders(false)}>Cancel</button>
              <button
                className="j-save-btn"
                disabled={newRemDays.length === 0}
                onClick={async () => {
                  if (!newRemDays.length) return;
                  await persistNewReminder({ time: newRemTime, label: newRemLabel, days: newRemDays });
                  setNewRemTime('08:00');
                  setNewRemLabel('');
                  setNewRemDays(['Mon','Wed','Fri']);
                  setShowReminders(false);
                }}
              >✓ Add Reminder</button>
            </div>
          </div>
        </>
      )}

      {/* ── LOCK CHALLENGE MODAL (opening a locked entry) ── */}
      {lockChallenge && (
        <>
          <div className="j-modal-overlay" onClick={() => setLockChallenge(null)}/>
          <div className="j-lock-modal">
            <div className="j-lock-modal-hd">
              <span>🔒 Locked Entry</span>
              <button className="j-rem-modal-close" onClick={() => setLockChallenge(null)}>✕</button>
            </div>
            <div className="j-lock-modal-body">
              <div className="j-lock-modal-lbl">
                Enter the code to view “{lockChallenge.entry.title || 'Untitled'}”
              </div>
              <input
                autoFocus
                type="password"
                className="j-lock-modal-input"
                placeholder="Code"
                value={lockChallenge.value}
                onChange={e => setLockChallenge(c => c && ({ ...c, value: e.target.value, error: '' }))}
                onKeyDown={e => { if (e.key === 'Enter') confirmLockChallenge(); }}
              />
              {lockChallenge.error && (
                <div className="j-lock-modal-err">{lockChallenge.error}</div>
              )}
            </div>
            <div className="j-lock-modal-ft">
              <button className="j-cancel-btn" onClick={() => setLockChallenge(null)}>Cancel</button>
              <button
                className="j-save-btn"
                disabled={!lockChallenge.value.trim()}
                onClick={confirmLockChallenge}
              >Unlock</button>
            </div>
          </div>
        </>
      )}

      {/* ── LOCK SETUP MODAL (setting / changing the code) ── */}
      {lockSetup && (
        <>
          <div className="j-modal-overlay" onClick={() => setLockSetup(null)}/>
          <div className="j-lock-modal">
            <div className="j-lock-modal-hd">
              <span>🔒 {lockSetup.mode === 'change' ? 'Change Lock Code' : 'Set Lock Code'}</span>
              <button className="j-rem-modal-close" onClick={() => setLockSetup(null)}>✕</button>
            </div>
            <div className="j-lock-modal-body">
              <div className="j-lock-modal-lbl">
                {lockSetup.mode === 'change'
                  ? 'Enter a new code for this entry.'
                  : 'Choose a code. You’ll need it to open this entry from view mode.'}
              </div>
              <input
                autoFocus
                type="password"
                className="j-lock-modal-input"
                placeholder="Code (digits or letters)"
                value={lockSetup.value}
                onChange={e => setLockSetup(s => s && ({ ...s, value: e.target.value, error: '' }))}
                onKeyDown={e => { if (e.key === 'Enter') commitLockSetup(); }}
              />
              {lockSetup.error && (
                <div className="j-lock-modal-err">{lockSetup.error}</div>
              )}
            </div>
            <div className="j-lock-modal-ft">
              <button className="j-cancel-btn" onClick={() => setLockSetup(null)}>Cancel</button>
              <button
                className="j-save-btn"
                disabled={!lockSetup.value.trim()}
                onClick={commitLockSetup}
              >✓ {lockSetup.mode === 'change' ? 'Update Code' : 'Lock Entry'}</button>
            </div>
          </div>
        </>
      )}

      {/* ── PROFILE MODAL (two tabs: Profile · Page Settings) ── */}
      {showProfile && (
        <>
          <div className="j-modal-overlay" onClick={() => setShowProfile(false)}/>
          <div className="j-profile-modal" role="dialog" aria-label="Profile">
            <div className="j-profile-modal-hd">
              <div className="j-profile-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={profileTab === 'profile'}
                  className={`j-profile-tab ${profileTab === 'profile' ? 'active' : ''}`}
                  onClick={() => setProfileTab('profile')}
                >👤 Profile</button>
                <button
                  role="tab"
                  aria-selected={profileTab === 'page'}
                  className={`j-profile-tab ${profileTab === 'page' ? 'active' : ''}`}
                  onClick={() => setProfileTab('page')}
                >📋 Page Settings</button>
              </div>
              <button
                className="j-rem-modal-close"
                onClick={() => setShowProfile(false)}
                aria-label="Close"
              >✕</button>
            </div>

            {profileTab === 'profile' && (
              <ProfileTab
                profile={profile}
                loading={profileLoading}
                user={user}
                onClose={() => setShowProfile(false)}
              />
            )}

            {profileTab === 'page' && (
              <PageSettingsTab
                reminders={reminders}
                persistNewReminder={persistNewReminder}
                removeReminder={removeReminder}
                setReminders={setReminders}
                downloadAllEntries={downloadAllEntries}
                entries={entries}
                setEntries={setEntries}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Profile tab body ───────────────────────────────────────
   Mirrors Chat's MyProfileDialog form so the same profile fields
   appear in both places. Saves to the same Firestore /users/{uid}
   doc that Chat reads from, so edits show up everywhere. */
function ProfileTab({ profile, loading, user, onClose }) {
  const [displayName, setDisplayName]   = useState(profile?.displayName || '');
  const [ministryName, setMinistryName] = useState(profile?.ministryName || '');
  const [logo, setLogo]                 = useState(profile?.logo || '');
  const [logoErr, setLogoErr]           = useState('');
  const [ministryTypes, setMinistryTypes] = useState(
    Array.isArray(profile?.ministryTypes)
      ? profile.ministryTypes
      : profile?.ministryType ? [profile.ministryType] : []
  );
  const [bio, setBio]                   = useState(profile?.bio || '');
  const [emailVisible, setEmailVisible] = useState(profile?.emailVisible !== false);
  const [phone, setPhone]               = useState(profile?.phone || '');
  const [phoneVisible, setPhoneVisible] = useState(profile?.phoneVisible !== false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');
  const [copied, setCopied]             = useState(false);
  const [toast, setToast]               = useState('');

  /* Keep local form state in sync if the profile doc reloads while
     the modal is open (e.g. another tab edited it). */
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setMinistryName(profile.ministryName || '');
    setLogo(profile.logo || '');
    setMinistryTypes(
      Array.isArray(profile.ministryTypes)
        ? profile.ministryTypes
        : profile.ministryType ? [profile.ministryType] : []
    );
    setBio(profile.bio || '');
    setEmailVisible(profile.emailVisible !== false);
    setPhone(profile.phone || '');
    setPhoneVisible(profile.phoneVisible !== false);
  }, [profile?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleType = (t) => {
    setMinistryTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const copyKey = async () => {
    if (!profile?.identifyingKey) return;
    const ok = await copyText(profile.identifyingKey);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoErr('');
    try {
      setLogo(await fileToResizedDataUrl(file, { maxSize: 256 }));
    } catch (ex) {
      setLogoErr(ex?.message || 'Could not use that image.');
    }
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!displayName.trim()) { setErr('Display name is required.'); return; }
    if (!profile?.uid) { setErr('Profile not loaded yet.'); return; }
    setBusy(true);
    setErr('');
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName:   displayName.trim(),
        ministryName:  ministryName.trim(),
        logo:          logo || '',
        ministryTypes,
        bio:           bio.trim(),
        ...contactFields({ emailVisible, phone, phoneVisible }),
      });
      setToast('Profile saved.');
      setTimeout(() => { setToast(''); onClose?.(); }, 800);
    } catch (ex) {
      setErr(ex?.message || 'Failed to save profile.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="j-profile-body"><div className="j-profile-loading">Loading profile…</div></div>;
  }
  if (!profile) {
    return (
      <div className="j-profile-body">
        <div className="j-profile-loading">
          No profile found yet. It will appear here after you visit Chat once.
        </div>
      </div>
    );
  }

  return (
    <form className="j-profile-body" onSubmit={submit}>
      {err   && <div className="j-profile-err">{err}</div>}
      {toast && <div className="j-profile-toast">{toast}</div>}

      <div className="j-profile-meta">
        <div className="j-profile-avatar-lg">
          {getInitialsFromName(displayName || profile?.displayName)}
        </div>
        <div className="j-profile-meta-text">
          {profile.email && <div className="j-profile-email">{profile.email}</div>}
          {profile.identifyingKey && (
            <button
              type="button"
              className={`j-profile-keychip ${copied ? 'copied' : ''}`}
              onClick={copyKey}
              title="Click to copy your identifying key"
            >
              <span className="j-profile-keychip-lbl">Your key</span>
              <span className="j-profile-keychip-val">{profile.identifyingKey}</span>
              <span className="j-profile-keychip-act">{copied ? '✓' : '⧉'}</span>
            </button>
          )}
        </div>
      </div>

      {profile.email && (
        <label className="j-profile-toggle">
          <input
            type="checkbox"
            checked={emailVisible}
            onChange={e => setEmailVisible(e.target.checked)}
          />
          <span>Show my email to other members</span>
        </label>
      )}

      <label className="j-profile-field">
        <span className="j-profile-lbl">Phone number</span>
        <input
          type="tel"
          className="j-profile-input"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="e.g. (555) 123-4567"
        />
      </label>

      {phone.trim() && (
        <label className="j-profile-toggle">
          <input
            type="checkbox"
            checked={phoneVisible}
            onChange={e => setPhoneVisible(e.target.checked)}
          />
          <span>Show my phone number to other members</span>
        </label>
      )}

      <label className="j-profile-field">
        <span className="j-profile-lbl">Display name</span>
        <input
          type="text"
          className="j-profile-input"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
      </label>

      <label className="j-profile-field">
        <span className="j-profile-lbl">Ministry name</span>
        <input
          type="text"
          className="j-profile-input"
          value={ministryName}
          onChange={e => setMinistryName(e.target.value)}
          placeholder="e.g. Trinity Church Worship Team"
        />
      </label>

      <div className="j-profile-field">
        <span className="j-profile-lbl">
          Ministry logo <span className="j-profile-lbl-hint">— shown in your header</span>
        </span>
        <div className="j-profile-logo-row">
          <div className="j-profile-logo-preview">
            {logo
              ? <img src={logo} alt="Ministry logo preview" />
              : <span className="j-profile-logo-placeholder" aria-hidden="true">⛪</span>}
          </div>
          <div className="j-profile-logo-actions">
            <label className="j-profile-logo-btn">
              {logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/*" onChange={onLogoPick} hidden />
            </label>
            {logo && (
              <button
                type="button"
                className="j-profile-logo-remove"
                onClick={() => { setLogo(''); setLogoErr(''); }}
              >Remove</button>
            )}
          </div>
        </div>
        {logoErr && <div className="j-profile-err">{logoErr}</div>}
      </div>

      <div className="j-profile-field">
        <span className="j-profile-lbl">
          Type of ministry <span className="j-profile-lbl-hint">— pick any that apply</span>
        </span>
        <div className="j-profile-chips">
          {MINISTRY_TYPES.map(t => {
            const on = ministryTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`j-profile-chip ${on ? 'on' : ''}`}
                onClick={() => toggleType(t)}
                aria-pressed={on}
              >
                {on && <span aria-hidden="true">✓ </span>}{t}
              </button>
            );
          })}
        </div>
      </div>

      <label className="j-profile-field">
        <span className="j-profile-lbl">About you</span>
        <textarea
          className="j-profile-input j-profile-textarea"
          rows={4}
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="A short bio that other members will see."
        />
      </label>

      <div className="j-profile-actions">
        <button type="button" className="j-cancel-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="j-save-btn" disabled={busy}>
          {busy ? 'Saving…' : '💾 Save Profile'}
        </button>
      </div>
    </form>
  );
}

/* ─── Date helpers for calendar sync ────────────────────────
   Mirrors the helpers in JournalDashboard.jsx so the same
   weekday/step math applies to both journal-entry reminders
   and the memory-verse schedule. */
const SHORT_DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const FULL_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SHORT_INDEX = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
const FULL_INDEX  = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };

function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function nextOccurrenceISOFor(targetWeekday, baseDate = new Date()) {
  const offset = (targetWeekday - baseDate.getDay() + 7) % 7;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offset);
  return toLocalISO(d);
}

/* For a journal-entry reminder that fires on multiple weekdays,
   generate the next N weeks of dates across all those days. */
function reminderDates(days, weeks = 12) {
  const out = [];
  const base = new Date();
  for (const short of days || []) {
    const target = SHORT_INDEX[short];
    if (target == null) continue;
    const startISO = nextOccurrenceISOFor(target, base);
    const [y, m, d] = startISO.split('-').map(n => parseInt(n, 10));
    const start = new Date(y, m - 1, d);
    for (let i = 0; i < weeks; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i * 7);
      out.push(toLocalISO(cur));
    }
  }
  return out.sort();
}

/* ─── Page Settings tab body ────────────────────────────────
   Single place to manage Journal Entry reminders (with per-reminder
   sync-to-calendar) and the Memory Verse review schedule (with its
   own sync-to-calendar checkbox). */
function PageSettingsTab({
  reminders, persistNewReminder, removeReminder, setReminders,
  downloadAllEntries, entries, setEntries,
}) {
  /* ── Live-subscribed settings groups. Each writes to its own
        Firestore key so changes from any consumer fan out instantly. */
  const [privacy,       setPrivacy]       = useJournalPrivacy();
  const [dashSettings,  setDashSettings]  = useJournalDashboardSettings();
  const [promptSettings,setPromptSettings]= useJournalPromptSettings();
  const [goals,         setGoals]         = useJournalGoals();
  const [editor,        setEditor]        = useJournalEditor();
  const [display,       setDisplay]       = useJournalDisplay();
  const [backup,        setBackup]        = useJournalBackup();
  const [notifPrefs,    setNotifPrefs]    = useJournalNotifPrefs();
  /* `mvAdv` setting removed — memorization tracking + spaced
     repetition are always on now (no user opt-in needed). */
  const [integrations,  setIntegrations]  = useJournalIntegrations();

  /* ── Memory verses (Archived + Memorized sub-tabs) ──
        Shared with the dashboard via the useMemoryVerses hook so
        edits here flow back to the dashboard immediately. */
  const [mvAll, saveMvAll] = useMemoryVerses();
  const archivedVerses  = (mvAll || []).filter(v => v.archived && !v.memorized);
  const memorizedVerses = (mvAll || []).filter(v => v.memorized);

  /* Sweep a verse's Spaced Repetition calendar events. Mirrors the
     dashboard's clearSrForVerse so a verse can leave the archive or
     get deleted from here without leaving orphan SR events behind. */
  const clearSrForVerse = async (verse) => {
    if (!Array.isArray(verse?.srEventIds) || !verse.srEventIds.length) return;
    try { await calendarService.bulkDelete(verse.srEventIds); } catch { /* noop */ }
  };

  /* Promote an archived verse back to "current". Clears whatever
     verse was previously active + its SR events. */
  const setVerseCurrent = async (verse) => {
    const prev = (mvAll || []).find(v => v.active && !v.archived);
    if (prev && prev.id !== verse.id) await clearSrForVerse(prev);
    saveMvAll((mvAll || []).map(v => {
      if (v.id === verse.id) {
        return {
          ...v,
          active: true, archived: false,
          /* Pulling a verse back to current also clears its memorized
             flag — it's not memorized anymore if it's the active verse
             to re-learn. */
          memorized: false, memorizedAt: null,
          srEventIds: [],
        };
      }
      if (v.id === prev?.id) return { ...v, active: false, srEventIds: [] };
      return { ...v, active: false };
    }));
  };

  /* Unmark a verse as memorized. Leaves it archived (mirrors the
     dashboard behavior — the user can promote it back to current
     via the Archived tab). */
  const unmarkMemorized = (verse) => {
    saveMvAll((mvAll || []).map(v => v.id === verse.id
      ? { ...v, memorized: false, memorizedAt: null }
      : v
    ));
  };

  /* Permanently delete a verse + its SR events. */
  const deleteVerse = async (verse) => {
    if (!window.confirm(`Delete memory verse "${verse.ref}"? This cannot be undone.`)) return;
    await clearSrForVerse(verse);
    saveMvAll((mvAll || []).filter(v => v.id !== verse.id));
  };

  /* Local state for Data & Reset actions. */
  const [importText,    setImportText]    = useState('');
  const [importStatus,  setImportStatus]  = useState('');

  /* ── Journal entry reminders ── */
  const [newTime,  setNewTime]  = useState('08:00');
  const [newLabel, setNewLabel] = useState('');
  const [newDays,  setNewDays]  = useState(['Mon','Wed','Fri']);
  /* Calendar-sync span in weeks (1..52). Default 12.
     `newSync` was removed — sync is controlled exclusively by the
     per-row checkbox on each reminder, not by the add form, so
     creating a reminder can never accidentally double-sync events
     when the user later toggles the row checkbox. */
  const [newWeeks, setNewWeeks] = useState(12);
  const [savingRem, setSavingRem] = useState(false);
  /* Edit mode: id of the reminder currently being edited (null when
     the form is in "add new" mode). */
  const [editingId, setEditingId] = useState(null);

  /* Reset form back to "add new" defaults. */
  const resetReminderForm = () => {
    setNewTime('08:00'); setNewLabel(''); setNewDays(['Mon','Wed','Fri']);
    setNewWeeks(12); setEditingId(null);
  };

  /* Populate form with values from an existing reminder for editing. */
  const startEditingReminder = (r) => {
    setNewTime(r.time || '08:00');
    setNewLabel(r.label || '');
    setNewDays(Array.isArray(r.days) && r.days.length ? r.days : ['Mon','Wed','Fri']);
    setNewWeeks(Math.max(1, Math.min(52, parseInt(r.syncWeeks, 10) || 12)));
    setEditingId(r.id);
  };

  /* Local state for the custom-prompt input row. */
  const [newCustomPrompt, setNewCustomPrompt] = useState('');

  /* Set-code prompt for the Lock & Privacy toggles. When the user
     clicks an empty lock checkbox, we open this inline modal so
     they can enter the code AND enable the lock in one step. */
  const [codePrompt, setCodePrompt] = useState(null);
  // { type: 'master' | 'default', value: '', error: '' }

  /* Sub-tab navigation inside Page Settings. Splits the sections
     into themed groups so the modal isn't a single long scroll. */
  const SUB_TABS = [
    { id: 'reminders',    label: '🔔', name: 'Reminders' },
    { id: 'privacy',      label: '🔒', name: 'Privacy' },
    { id: 'writing',      label: '✏️', name: 'Writing' },
    { id: 'display',      label: '🎨', name: 'Display' },
    { id: 'integrations', label: '🔗', name: 'Integrations' },
    { id: 'archived',     label: '📦', name: 'Archived' },
    { id: 'memorized',    label: '✓',  name: 'Memorized' },
    { id: 'data',         label: '💾', name: 'Data' },
    { id: 'howto',        label: '❓', name: 'How to Use' },
  ];
  const [activeSub, setActiveSub] = useState('reminders');

  const askForCode = (type) => setCodePrompt({ type, value: '', error: '' });

  const commitCodePrompt = () => {
    if (!codePrompt) return;
    const trimmed = String(codePrompt.value || '').trim();
    if (!trimmed) {
      setCodePrompt(c => c && ({ ...c, error: 'Code cannot be empty.' }));
      return;
    }
    if (codePrompt.type === 'master') {
      setPrivacy({ ...privacy, masterLockCode: trimmed, masterLock: true });
    } else {
      setPrivacy({ ...privacy, defaultLockCode: trimmed, defaultLock: true });
    }
    setCodePrompt(null);
  };

  /* Add a new reminder OR save edits to an existing one.
     The add form NEVER creates calendar events — calendar sync is
     opt-in via the per-row "Sync to Calendar" checkbox AFTER saving.
     This is the single source of truth: one checkbox, one action.
     When editing an existing reminder that already has sync on,
     we rebuild its events with the new time/days/weeks/label. */
  const saveReminder = async () => {
    if (!newDays.length) return;
    setSavingRem(true);

    if (editingId) {
      const cur = (reminders || []).find(x => x.id === editingId);
      /* Sweep the editing reminder's old events first. */
      if (cur?.eventIds?.length) {
        try { await calendarService.bulkDelete(cur.eventIds); } catch { /* noop */ }
      }
      /* If sync was already on for this reminder, rebuild its events
         with the new values. Otherwise leave the calendar untouched. */
      let eventIds = [];
      if (cur?.syncCalendar) {
        eventIds = await createReminderEvents({
          label: newLabel || 'Journal reminder',
          time:  newTime,
          days:  newDays,
          weeks: newWeeks,
        });
      }
      setReminders(prev => (prev || []).map(x => x.id === editingId
        ? { ...x,
            time:         newTime,
            label:        newLabel,
            days:         newDays,
            syncWeeks:    newWeeks,
            eventIds,
          }
        : x
      ));
    } else {
      /* New reminder — never synced at create time. User flips sync
         on via the row checkbox after the reminder appears in the
         list. */
      await persistNewReminder({
        time: newTime, label: newLabel, days: newDays,
        syncCalendar: false, syncWeeks: newWeeks, eventIds: [],
      });
    }

    resetReminderForm();
    setSavingRem(false);
  };

  /* Toggle sync on an existing reminder. Off → on creates events
     using the reminder's stored syncWeeks; on → off deletes the
     events this reminder owns. */
  const toggleReminderSync = async (r) => {
    /* Wipe the reminder's existing events (if any). */
    if (r.eventIds?.length) {
      try { await calendarService.bulkDelete(r.eventIds); } catch { /* noop */ }
    }
    const turningOn = !r.syncCalendar;
    let eventIds = [];
    if (turningOn) {
      eventIds = await createReminderEvents({
        label: r.label || 'Journal reminder',
        time:  r.time,
        days:  r.days,
        weeks: r.syncWeeks,
      });
    }
    setReminders(prev => (prev || []).map(x =>
      x.id === r.id ? { ...x, syncCalendar: turningOn, eventIds } : x
    ));
  };

  /* Delete a reminder + clean up its calendar events. */
  const deleteReminderWithSync = async (r) => {
    if (r.eventIds?.length) {
      try { await calendarService.bulkDelete(r.eventIds); } catch { /* noop */ }
    }
    await removeReminder(r.id);
  };

  /* ── Memory Verse review schedule ──
     Reads / writes localStorage directly because the MemoryVerse
     component on the dashboard owns the same key. Both stay in sync
     because each writes on every change, and MemoryVerse's mount
     reconciler covers stale calendar events. */
  const [mvSchedule, setMvSchedule] = useState(() => {
    /* `monthlyWeek` only matters when frequency === 'monthly'. Values:
       1 = First, 2 = Second, 3 = Third, 4 = Fourth, 'last' = Last.
       Span is no longer user-configurable — see PNV_HORIZON_COUNT. */
    const DEFAULTS = {
      enabled: false, day: 'Sunday', frequency: 'weekly',
      monthlyWeek: 1, eventIds: [],
    };
    try {
      const raw = JSON.parse(localStorage.getItem('mh_memory_verse_schedule') || 'null');
      return raw ? { ...DEFAULTS, ...raw } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  /* Fixed horizon — we always generate the next 12 occurrences of
     the chosen cadence (≈ 3 months weekly, 6 months biweekly, 12
     months monthly). The user no longer chooses this in the UI. */
  const PNV_HORIZON_COUNT = 12;
  /* `currentVerse` is no longer needed — the calendar event title
     is the generic "Pick New Verse" so the reminder is independent
     of which verse happens to be active right now. */

  const saveMvSchedule = (next) => {
    setMvSchedule(next);
    localStorage.setItem('mh_memory_verse_schedule', JSON.stringify(next));
  };

  /* Build dates for memory-verse review events. */
  /* Find the Nth weekday of a given month (year, monthIdx 0-11).
     `which` is 1..4 for first..fourth, or 'last' for the final
     occurrence in that month. Returns a Date or null if no such
     occurrence (e.g. a 5th-Sunday in February will simply slide
     to a different month in the iteration). */
  const nthWeekdayOfMonth = (year, monthIdx, weekday, which) => {
    if (which === 'last') {
      /* Walk back from the last day of the month. */
      const last = new Date(year, monthIdx + 1, 0); // day 0 of next month
      const diff = (last.getDay() - weekday + 7) % 7;
      const d = new Date(year, monthIdx, last.getDate() - diff);
      return d;
    }
    const first = new Date(year, monthIdx, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    const day = 1 + offset + (which - 1) * 7;
    /* If a 5th-week request would spill past month end, return null. */
    const test = new Date(year, monthIdx, day);
    if (test.getMonth() !== monthIdx) return null;
    return test;
  };

  const mvDates = (sched) => {
    /* Generate the next PNV_HORIZON_COUNT occurrences of the chosen
       cadence — no user-facing span anymore. */
    const weekday = FULL_INDEX[sched.day] ?? 0;
    const out = [];

    if (sched.frequency === 'monthly') {
      const which = sched.monthlyWeek === 'last' ? 'last'
                  : Math.max(1, Math.min(4, parseInt(sched.monthlyWeek, 10) || 1));
      const today = new Date();
      let y = today.getFullYear();
      let m = today.getMonth();
      let safety = 0;
      while (out.length < PNV_HORIZON_COUNT && safety < 24) {
        const d = nthWeekdayOfMonth(y, m, weekday, which);
        if (d && d >= today) {
          out.push(toLocalISO(d));
        }
        m += 1;
        if (m > 11) { m = 0; y += 1; }
        safety += 1;
      }
      return out;
    }

    /* Weekly + biweekly — fixed stride from the next weekday. */
    const startISO = nextOccurrenceISOFor(weekday);
    const stepDays = sched.frequency === 'biweekly' ? 14 : 7;
    const [y, mo, d] = startISO.split('-').map(n => parseInt(n, 10));
    const base = new Date(y, mo - 1, d);
    for (let i = 0; i < PNV_HORIZON_COUNT; i++) {
      const cur = new Date(base);
      cur.setDate(base.getDate() + i * stepDays);
      out.push(toLocalISO(cur));
    }
    return out;
  };

  /* Sweep all memory-verse events and rebuild from current schedule.
     Calendar event title is the generic "Pick New Verse" (not the
     current verse's reference) so the user is reminded to choose a
     new verse to memorize — independent of whatever's set as
     "current" at any given moment. */
  const regenerateMvEvents = async (next) => {
    try {
      const all = await calendarService.getAll();
      const evs = all?.data?.data || [];
      const ids = evs.filter(e => e.source === 'memory-verse').map(e => e.id);
      if (ids.length) await calendarService.bulkDelete(ids);
    } catch { /* noop */ }

    if (!next.enabled) {
      saveMvSchedule({ ...next, eventIds: [] });
      return;
    }
    try {
      const dates = mvDates(next);
      const events = dates.map(date => ({
        title:       '📝 Pick New Verse',
        description: '',
        event_date:  date,
        event_time:  '',
        color:       '#22c55e',
        category:    'general',
        source:      'memory-verse',
        source_id:   '',
      }));
      const res = await calendarService.bulkCreate(events);
      const created = res?.data?.data || [];
      saveMvSchedule({ ...next, eventIds: created.map(e => e.id) });
    } catch {
      saveMvSchedule({ ...next, eventIds: [] });
    }
  };

  const updateMv = (patch) => {
    const next = { ...mvSchedule, ...patch };
    regenerateMvEvents(next);
  };

  return (
    <div className="j-profile-body">
      {/* Sub-tab pill bar — chooses which group of sections to show. */}
      <div className="j-ps-subtabs">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`j-ps-subtab ${activeSub === t.id ? 'on' : ''}`}
            onClick={() => setActiveSub(t.id)}
          >
            <span className="j-ps-subtab-icon">{t.label}</span>
            <span className="j-ps-subtab-name">{t.name}</span>
          </button>
        ))}
      </div>

      {/* ───────── Journal Entry Reminders ───────── */}
      {activeSub === 'reminders' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">📖 Journal Entry Reminders</div>
        <div className="j-ps-section-sub">
          Get nudged to journal on the days and time you choose.
        </div>

        {(reminders || []).length === 0 ? (
          <div className="j-rem-empty">No reminders set yet.</div>
        ) : (
          <div className="j-ps-rem-list">
            {reminders.map(r => {
              const isEditing = editingId === r.id;
              const weeks = Math.max(1, Math.min(52, parseInt(r.syncWeeks, 10) || 12));
              return (
                <div key={r.id} className={`j-ps-rem-item ${isEditing ? 'editing' : ''}`}>
                  <div className="j-ps-rem-row">
                    <span className="j-rem-dot"/>
                    <div className="j-rem-info">
                      <span className="j-rem-time">{format12Hour(r.time)}</span>
                      {r.label && <span className="j-rem-label">{r.label}</span>}
                      <span className="j-rem-days">{(r.days || []).join(', ')}</span>
                    </div>
                    <button
                      className="j-ps-rem-edit"
                      onClick={() => startEditingReminder(r)}
                      title="Edit reminder"
                      aria-label="Edit reminder"
                    >✏</button>
                    <button
                      className="j-rem-del"
                      onClick={() => deleteReminderWithSync(r)}
                      title="Delete reminder"
                    >✕</button>
                  </div>
                  <label className="j-ps-sync-row">
                    <input
                      type="checkbox"
                      checked={!!r.syncCalendar}
                      onChange={() => toggleReminderSync(r)}
                    />
                    <span>🗓 Sync to Calendar ({weeks} week{weeks === 1 ? '' : 's'} ahead)</span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="j-ps-divider"/>
        <div className="j-ps-mini-title">
          {editingId ? '✏ Editing reminder' : 'Add a reminder'}
        </div>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Time</div>
            <input
              type="time" className="j-rem-modal-time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
            />
          </div>
          <div className="j-ps-add-col j-ps-add-col-wide">
            <div className="j-rem-modal-lbl">Label (optional)</div>
            <input
              type="text" className="j-rem-modal-input"
              placeholder="e.g. Morning devotion"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
          </div>
        </div>

        <div className="j-rem-modal-lbl">Repeat on</div>
        <div className="j-rem-modal-days">
          {SHORT_DAYS.map(d => (
            <button
              key={d}
              className={`j-rem-modal-day ${newDays.includes(d) ? 'on' : ''}`}
              onClick={() => setNewDays(ds =>
                ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]
              )}
            >{d}</button>
          ))}
        </div>

        {/* Weeks-ahead input — sets how many weeks of events the
            per-row "Sync to Calendar" checkbox will create when the
            user enables it. Always visible so it can be configured
            up front. The form itself never creates events; the row
            checkbox is the sole sync trigger. */}
        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Weeks ahead (1–52)</div>
            <input
              type="number" min="1" max="52"
              className="jd-inp"
              value={newWeeks}
              onChange={e => {
                const n = Math.max(1, Math.min(52, parseInt(e.target.value, 10) || 1));
                setNewWeeks(n);
              }}
            />
          </div>
          <div className="j-ps-add-col j-ps-add-col-wide" style={{ alignSelf:'flex-end' }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>
              {newWeeks === 1 ? 'Just the next occurrence' : `Next ${newWeeks} weeks of matching days`}
              <em style={{ opacity:.6, display:'block', marginTop:2 }}>
                Toggle "Sync to Calendar" on the saved reminder to push events.
              </em>
            </div>
          </div>
        </div>

        <div className="j-profile-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
          {editingId && (
            <button
              className="j-cancel-btn"
              onClick={resetReminderForm}
              disabled={savingRem}
            >Cancel</button>
          )}
          <button
            className="j-save-btn"
            disabled={savingRem || newDays.length === 0}
            onClick={saveReminder}
          >
            {savingRem
              ? 'Saving…'
              : (editingId ? '💾 Save Changes' : '✓ Add Reminder')}
          </button>
        </div>
      </div>

      )}

      {/* ───────── 📝 Pick New Verse ───────── */}
      {activeSub === 'reminders' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">📝 Pick New Verse</div>
        <div className="j-ps-section-sub">
          Schedule a recurring "📝 Pick New Verse" reminder on your
          Calendar so you remember to memorize a fresh verse.
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={mvSchedule.enabled}
            onChange={e => updateMv({ enabled: e.target.checked })}
          />
          <span>🗓 Sync to Calendar</span>
        </label>

        {mvSchedule.enabled && (
          <div className="j-ps-mv-grid">
            <div className="j-ps-add-col">
              <div className="j-rem-modal-lbl">Day</div>
              <select
                className="jd-sel"
                value={mvSchedule.day}
                onChange={e => updateMv({ day: e.target.value })}
              >
                {FULL_DAYS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="j-ps-add-col">
              <div className="j-rem-modal-lbl">Frequency</div>
              <select
                className="jd-sel"
                value={mvSchedule.frequency}
                onChange={e => updateMv({ frequency: e.target.value })}
              >
                <option value="weekly">Every week</option>
                <option value="biweekly">Every other week</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        )}

        {/* Which-week-of-month picker — only shown for monthly. */}
        {mvSchedule.enabled && mvSchedule.frequency === 'monthly' && (
          <div className="j-ps-add-row">
            <div className="j-ps-add-col j-ps-add-col-wide">
              <div className="j-rem-modal-lbl">Which week of the month</div>
              <select
                className="jd-sel"
                value={mvSchedule.monthlyWeek}
                onChange={e => {
                  const v = e.target.value === 'last' ? 'last' : parseInt(e.target.value, 10);
                  updateMv({ monthlyWeek: v });
                }}
              >
                <option value={1}>First {mvSchedule.day}</option>
                <option value={2}>Second {mvSchedule.day}</option>
                <option value={3}>Third {mvSchedule.day}</option>
                <option value={4}>Fourth {mvSchedule.day}</option>
                <option value="last">Last {mvSchedule.day}</option>
              </select>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:4 }}>
                Reminder lands on the {mvSchedule.monthlyWeek === 'last' ? 'last' : ['', '1st', '2nd', '3rd', '4th'][mvSchedule.monthlyWeek] || '1st'} {mvSchedule.day} of each month.
              </div>
            </div>
          </div>
        )}
      </div>

      )}

      {/* ───────── 🔒 Lock & Privacy ───────── */}
      {activeSub === 'privacy' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🔒 Lock & Privacy</div>
        <div className="j-ps-section-sub">
          Lock individual entries or the whole Journal page behind a code.
        </div>

        {/* ── Default lock on new entries.
            Code field shows ABOVE the toggle so the user is guided
            to set the code first; checkbox refuses to turn on
            without one. */}
        <div className="j-ps-mini-title">Default lock for new entries</div>
        <div className="j-ps-add-row">
          <div className="j-ps-add-col j-ps-add-col-wide">
            <input
              type="password"
              className="j-rem-modal-input"
              placeholder="Default lock code (set this first)"
              value={privacy.defaultLockCode}
              onChange={e => setPrivacy({ ...privacy, defaultLockCode: e.target.value })}
            />
          </div>
        </div>
        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!privacy.defaultLock}
            onChange={e => {
              const want = e.target.checked;
              if (want && !String(privacy.defaultLockCode || '').trim()) {
                /* No code yet — open the inline code-setter modal
                   instead of blocking the click. */
                askForCode('default');
                return;
              }
              setPrivacy({ ...privacy, defaultLock: want });
            }}
          />
          <span>Default-lock every new entry with the code above</span>
        </label>

        {/* ── Master journal lock.
            Same pattern: code first, then toggle. Refuses to turn
            on without a code. */}
        <div className="j-ps-mini-title">Master lock</div>
        <div className="j-ps-add-row">
          <div className="j-ps-add-col j-ps-add-col-wide">
            <input
              type="password"
              className="j-rem-modal-input"
              placeholder="Master code (set this first)"
              value={privacy.masterLockCode}
              onChange={e => setPrivacy({ ...privacy, masterLockCode: e.target.value })}
            />
          </div>
          <div className="j-ps-add-col">
            <select
              className="jd-sel"
              value={privacy.autoLockMinutes}
              onChange={e => setPrivacy({ ...privacy, autoLockMinutes: parseInt(e.target.value, 10) || 0 })}
            >
              <option value={0}>Auto-lock: Never</option>
              <option value={5}>Auto-lock: 5 min</option>
              <option value={15}>Auto-lock: 15 min</option>
              <option value={30}>Auto-lock: 30 min</option>
            </select>
          </div>
        </div>
        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!privacy.masterLock}
            onChange={e => {
              const want = e.target.checked;
              if (want && !String(privacy.masterLockCode || '').trim()) {
                askForCode('master');
                return;
              }
              setPrivacy({ ...privacy, masterLock: want });
            }}
          />
          <span>Require code to open the Journal page</span>
        </label>

        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!privacy.hideLockedPreviews}
            onChange={e => setPrivacy({ ...privacy, hideLockedPreviews: e.target.checked })}
          />
          <span>Hide titles of locked entries in the list</span>
        </label>

        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!privacy.hideLockedFromSearch}
            onChange={e => setPrivacy({ ...privacy, hideLockedFromSearch: e.target.checked })}
          />
          <span>Exclude locked entries from search results</span>
        </label>
      </div>

      )}

      {/* ───────── 📊 Dashboard Cards Visibility ───────── */}
      {activeSub === 'display' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">📊 Dashboard Cards</div>
        <div className="j-ps-section-sub">
          Choose which cards appear on the Journal dashboard.
        </div>
        <div className="j-ps-cards-grid">
          {DASHBOARD_CARDS.map(c => {
            const on = dashSettings?.visible?.[c.id] !== false;
            return (
              <label key={c.id} className="j-ps-card-toggle">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={e => setDashSettings({
                    ...dashSettings,
                    visible: { ...(dashSettings?.visible || {}), [c.id]: e.target.checked },
                  })}
                />
                <span className="j-ps-card-toggle-emoji">{c.emoji}</span>
                <span className="j-ps-card-toggle-lbl">{c.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      )}

      {/* ───────── ✨ Prompts ───────── */}
      {activeSub === 'writing' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">✨ Reflection Prompts</div>
        <div className="j-ps-section-sub">
          Pick which categories your random prompts come from, or add your own.
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!promptSettings.enabled}
            onChange={e => setPromptSettings({ ...promptSettings, enabled: e.target.checked })}
          />
          <span>Show random prompt on new entries</span>
        </label>

        {promptSettings.enabled && (
          <>
            <div className="j-ps-mini-title">Categories</div>
            <div className="j-ps-chips">
              {ALL_PROMPT_CATEGORIES.map(cat => {
                const on = (promptSettings.enabledCategories || []).includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`j-profile-chip ${on ? 'on' : ''}`}
                    onClick={() => {
                      const cur = promptSettings.enabledCategories || [];
                      const next = on ? cur.filter(c => c !== cat) : [...cur, cat];
                      setPromptSettings({ ...promptSettings, enabledCategories: next });
                    }}
                  >
                    {on && '✓ '}{cat} <span style={{ opacity:.45 }}>({PROMPT_CATEGORIES[cat].length})</span>
                  </button>
                );
              })}
            </div>

            <div className="j-ps-mini-title">Your custom prompts</div>
            {(promptSettings.custom || []).length === 0 ? (
              <div className="j-rem-empty">No custom prompts yet.</div>
            ) : (
              <div className="j-ps-custom-list">
                {(promptSettings.custom || []).map((p, i) => (
                  <div key={i} className="j-ps-custom-item">
                    <div className="j-ps-custom-text">{p}</div>
                    <button
                      className="j-rem-del"
                      onClick={() => setPromptSettings({
                        ...promptSettings,
                        custom: promptSettings.custom.filter((_, idx) => idx !== i),
                      })}
                      title="Delete prompt"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="j-ps-add-row">
              <div className="j-ps-add-col j-ps-add-col-wide">
                <input
                  type="text"
                  className="j-rem-modal-input"
                  placeholder="Write your own reflection prompt…"
                  value={newCustomPrompt}
                  onChange={e => setNewCustomPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCustomPrompt.trim()) {
                      setPromptSettings({
                        ...promptSettings,
                        custom: [...(promptSettings.custom || []), newCustomPrompt.trim()],
                      });
                      setNewCustomPrompt('');
                    }
                  }}
                />
              </div>
              <button
                className="j-save-btn"
                disabled={!newCustomPrompt.trim()}
                onClick={() => {
                  setPromptSettings({
                    ...promptSettings,
                    custom: [...(promptSettings.custom || []), newCustomPrompt.trim()],
                  });
                  setNewCustomPrompt('');
                }}
              >+ Add</button>
            </div>
          </>
        )}
      </div>

      )}

      {/* ───────── 🎯 Goals ───────── */}
      {activeSub === 'writing' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🎯 Goals</div>
        <div className="j-ps-section-sub">
          Set targets that show as progress bars on the dashboard. Set
          to 0 to hide that goal.
        </div>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Daily entries</div>
            <input
              type="number" min="0" max="20"
              className="jd-inp"
              value={goals.dailyGoal}
              onChange={e => setGoals({ ...goals, dailyGoal: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Weekly entries</div>
            <input
              type="number" min="0" max="100"
              className="jd-inp"
              value={goals.weeklyGoal}
              onChange={e => setGoals({ ...goals, weeklyGoal: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </div>
        </div>

        <div className="j-ps-mini-title">Vacation mode</div>
        <div className="j-ps-section-sub">
          Pauses goal tracking and dims progress bars during the date range.
        </div>
        <label className="j-ps-sync-row">
          <input
            type="checkbox"
            checked={!!goals.vacationEnabled}
            onChange={e => setGoals({ ...goals, vacationEnabled: e.target.checked })}
          />
          <span>🏖 Enable vacation mode</span>
        </label>
        {goals.vacationEnabled && (
          <div className="j-ps-add-row" style={{ marginLeft: 22 }}>
            <div className="j-ps-add-col">
              <div className="j-rem-modal-lbl">From</div>
              <input
                type="date"
                className="jd-inp"
                value={goals.vacationStart || ''}
                onChange={e => setGoals({ ...goals, vacationStart: e.target.value })}
              />
            </div>
            <div className="j-ps-add-col">
              <div className="j-rem-modal-lbl">To</div>
              <input
                type="date"
                className="jd-inp"
                value={goals.vacationEnd || ''}
                onChange={e => setGoals({ ...goals, vacationEnd: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      )}

      {/* ───────── 📝 Editor Preferences ───────── */}
      {activeSub === 'writing' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">📝 Editor Preferences</div>
        <div className="j-ps-section-sub">
          How the entry editor behaves while you're writing.
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!editor.autoSaveDrafts}
            onChange={e => setEditor({ ...editor, autoSaveDrafts: e.target.checked })}
          />
          <span>Auto-save drafts (restored next time you open a new entry)</span>
        </label>
        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={editor.spellCheck !== false}
            onChange={e => setEditor({ ...editor, spellCheck: e.target.checked })}
          />
          <span>Spell check the entry body</span>
        </label>
        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={editor.smartQuotes !== false}
            onChange={e => setEditor({ ...editor, smartQuotes: e.target.checked })}
          />
          <span>Convert straight quotes to smart quotes as you type</span>
        </label>
        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!editor.markdownShortcuts}
            onChange={e => setEditor({ ...editor, markdownShortcuts: e.target.checked })}
          />
          <span>Render <b>**bold**</b>, <em>*italic*</em>, <code>`code`</code> in view mode</span>
        </label>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col j-ps-add-col-wide">
            <div className="j-rem-modal-lbl">Bible translation</div>
            <select
              className="jd-sel"
              value={editor.bibleTranslation || 'kjv'}
              onChange={e => setEditor({ ...editor, bibleTranslation: e.target.value })}
            >
              {BIBLE_TRANSLATIONS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Word-count target</div>
            <input
              type="number" min="0" max="5000"
              className="jd-inp"
              value={editor.wordCountTarget}
              onChange={e => setEditor({ ...editor, wordCountTarget: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </div>
        </div>
      </div>

      )}

      {/* ───────── 🎨 Display & Layout ───────── */}
      {activeSub === 'display' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🎨 Display & Layout</div>
        <div className="j-ps-section-sub">
          Where the page lands, how entries are listed, and how things look.
        </div>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Landing view</div>
            <select
              className="jd-sel" value={display.landingView}
              onChange={e => setDisplay({ ...display, landingView: e.target.value })}
            >
              <option value="dashboard">Dashboard</option>
              <option value="lastEntry">Last entry</option>
              <option value="newEntry">New entry</option>
            </select>
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Sort entries</div>
            <select
              className="jd-sel" value={display.sortOrder}
              onChange={e => setDisplay({ ...display, sortOrder: e.target.value })}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="longest">Longest first</option>
            </select>
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Card density</div>
            <select
              className="jd-sel" value={display.cardDensity}
              onChange={e => setDisplay({ ...display, cardDensity: e.target.value })}
            >
              <option value="comfy">Comfy</option>
              <option value="compact">Compact</option>
              <option value="titleOnly">Title only</option>
            </select>
          </div>
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!display.showWordCount}
            onChange={e => setDisplay({ ...display, showWordCount: e.target.checked })}
          />
          <span>Show word count in the entry list</span>
        </label>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Cover image</div>
            <select
              className="jd-sel" value={display.coverImageMode}
              onChange={e => setDisplay({ ...display, coverImageMode: e.target.value })}
            >
              <option value="full">Full hero</option>
              <option value="thumb">Thumbnail</option>
              <option value="off">Hidden</option>
            </select>
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Date format</div>
            <select
              className="jd-sel" value={display.dateFormat}
              onChange={e => setDisplay({ ...display, dateFormat: e.target.value })}
            >
              {DATE_FORMATS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Body font</div>
            <select
              className="jd-sel" value={display.bodyFont}
              onChange={e => setDisplay({ ...display, bodyFont: e.target.value })}
            >
              <option value="sans">Sans (default)</option>
              <option value="serif">Serif (Georgia)</option>
              <option value="mono">Mono (SF Mono)</option>
            </select>
          </div>
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Body font size</div>
            <select
              className="jd-sel" value={display.bodyFontSize}
              onChange={e => setDisplay({ ...display, bodyFontSize: parseInt(e.target.value, 10) || 16 })}
            >
              <option value={14}>14 px</option>
              <option value={16}>16 px</option>
              <option value={18}>18 px</option>
              <option value={20}>20 px</option>
            </select>
          </div>
        </div>
      </div>

      )}

      {/* ───────── 💾 Backup & Export ───────── */}
      {activeSub === 'data' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">💾 Backup & Export</div>
        <div className="j-ps-section-sub">
          Download a full archive of your entries any time.
        </div>

        <div className="j-ps-add-row">
          <div className="j-ps-add-col">
            <div className="j-rem-modal-lbl">Format</div>
            <select
              className="jd-sel" value={backup.defaultFormat}
              onChange={e => setBackup({ ...backup, defaultFormat: e.target.value })}
            >
              <option value="md">Markdown (.md)</option>
              <option value="txt">Plain text (.txt)</option>
              <option value="json">JSON (.json)</option>
            </select>
          </div>
          <div className="j-ps-add-col j-ps-add-col-wide" style={{ alignSelf: 'flex-end' }}>
            <button
              className="j-save-btn"
              onClick={() => { if (typeof downloadAllEntries === 'function') downloadAllEntries(); }}
            >📥 Download all entries</button>
          </div>
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!backup.includeImages}
            onChange={e => setBackup({ ...backup, includeImages: e.target.checked })}
          />
          <span>Include image URLs in exports</span>
        </label>

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!backup.autoExportWeekly}
            onChange={e => setBackup({ ...backup, autoExportWeekly: e.target.checked })}
          />
          <span>Auto-export weekly to email <em style={{ opacity:.55 }}>(requires server — preference saved)</em></span>
        </label>
        {backup.autoExportWeekly && (
          <div className="j-ps-add-row" style={{ marginLeft: 22 }}>
            <div className="j-ps-add-col j-ps-add-col-wide">
              <input
                type="email" className="j-rem-modal-input"
                placeholder="Email address"
                value={backup.autoExportEmail || ''}
                onChange={e => setBackup({ ...backup, autoExportEmail: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      )}

      {/* ───────── 🔔 Notification Behavior ───────── */}
      {activeSub === 'reminders' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🔔 Notification Behavior</div>
        <div className="j-ps-section-sub">
          Controls in-app bell notifications for journal-related events.
        </div>

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!notifPrefs.skippedDayAlert}
            onChange={e => setNotifPrefs({ ...notifPrefs, skippedDayAlert: e.target.checked })}
          />
          <span>Alert when I haven't journaled in a while</span>
        </label>
        {notifPrefs.skippedDayAlert && (
          <div className="j-ps-add-row" style={{ marginLeft: 22 }}>
            <div className="j-ps-add-col">
              <div className="j-rem-modal-lbl">After (days)</div>
              <input
                type="number" min="1" max="30"
                className="jd-inp"
                value={notifPrefs.skippedDayThreshold}
                onChange={e => setNotifPrefs({
                  ...notifPrefs,
                  skippedDayThreshold: Math.max(1, parseInt(e.target.value, 10) || 1),
                })}
              />
            </div>
          </div>
        )}

        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!notifPrefs.goalMissAlert}
            onChange={e => setNotifPrefs({ ...notifPrefs, goalMissAlert: e.target.checked })}
          />
          <span>Evening nudge if my daily goal isn't met</span>
        </label>
        {notifPrefs.goalMissAlert && (() => {
          /* Convert stored 24h "HH:MM" to displayed (hour, minute, period). */
          const stored = notifPrefs.goalMissTime || '20:00';
          const [storedH, storedM] = stored.split(':').map(n => parseInt(n, 10) || 0);
          const period = storedH >= 12 ? 'PM' : 'AM';
          const h12 = storedH % 12 === 0 ? 12 : storedH % 12;
          const writeTime = (h, m, p) => {
            let h24 = h % 12;
            if (p === 'PM') h24 += 12;
            const hh = String(h24).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            setNotifPrefs({ ...notifPrefs, goalMissTime: `${hh}:${mm}` });
          };
          return (
            <div className="j-ps-add-row" style={{ marginLeft: 22 }}>
              <div className="j-ps-add-col">
                <div className="j-rem-modal-lbl">Hour</div>
                <select
                  className="jd-sel" value={h12}
                  onChange={e => writeTime(parseInt(e.target.value, 10) || 12, storedM, period)}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="j-ps-add-col">
                <div className="j-rem-modal-lbl">Min</div>
                <select
                  className="jd-sel" value={storedM}
                  onChange={e => writeTime(h12, parseInt(e.target.value, 10) || 0, period)}
                >
                  {[0, 15, 30, 45].map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
              <div className="j-ps-add-col">
                <div className="j-rem-modal-lbl">AM/PM</div>
                <select
                  className="jd-sel" value={period}
                  onChange={e => writeTime(h12, storedM, e.target.value)}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          );
        })()}
      </div>
      )}

      {/* Memory Verse Advanced section removed — Track memorization
          and Spaced repetition are now always-on. The verse card on
          the dashboard always shows the Mark memorized + Schedule
          reviews buttons. */}

      {/* ───────── 🔗 Integrations (own sub-tab) ───────── */}
      {activeSub === 'integrations' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🔗 Integrations</div>
        <div className="j-ps-section-sub">
          Connect Journal to the rest of Ministry Hub.
        </div>
        <label className="j-ps-sync-row">
          <input
            type="checkbox" checked={!!integrations.linkPrayers}
            onChange={e => setIntegrations({ ...integrations, linkPrayers: e.target.checked })}
          />
          <span>
            Link prayers to entries
            <em style={{ opacity:.55, marginLeft:6 }}>— shows a prayer-picker under the entry editor</em>
          </span>
        </label>
      </div>
      )}

      {/* ───────── 📦 Archived Verses (archived sub-tab) ─────────
            Manages the user's full archive of past memory verses.
            Mirrors the inline archive on the dashboard but lives in
            settings so the dashboard stays focused on the current
            verse. */}
      {activeSub === 'archived' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">📦 Archived Verses</div>
        <div className="j-ps-section-sub">
          Past memory verses you've set aside. Promote one back to
          current any time, or delete the ones you no longer need.
        </div>

        {archivedVerses.length === 0 ? (
          <div className="j-rem-empty">No archived verses yet.</div>
        ) : (
          <div className="j-ps-mv-list">
            {archivedVerses.map(v => (
              <div key={v.id} className="j-ps-mv-item">
                <div className="j-ps-mv-info">
                  <div className="j-ps-mv-ref">{v.ref}</div>
                  <div className="j-ps-mv-text">
                    "{(v.text || '').slice(0, 120)}{(v.text || '').length > 120 ? '…' : ''}"
                  </div>
                  <div className="j-ps-mv-date">
                    {v.addedAt ? `Added ${format(parseISO(v.addedAt), 'MMM d, yyyy')}` : ''}
                  </div>
                </div>
                <div className="j-ps-mv-acts">
                  <button
                    type="button"
                    className="j-ps-mv-activate"
                    onClick={() => setVerseCurrent(v)}
                  >Set current</button>
                  <button
                    type="button"
                    className="j-ps-mv-delete"
                    onClick={() => deleteVerse(v)}
                    title="Delete this archived verse"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ───────── ✓ Memorized Verses (memorized sub-tab) ─────────
            All verses the user has marked memorized. Unmark drops
            the memorized flag (leaves the verse archived); delete
            removes the verse entirely. */}
      {activeSub === 'memorized' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">✓ Memorized Verses</div>
        <div className="j-ps-section-sub">
          Every verse you've marked memorized. Unmark a verse to put
          it back in the regular archive, or delete it entirely.
        </div>

        {memorizedVerses.length === 0 ? (
          <div className="j-rem-empty">No memorized verses yet.</div>
        ) : (
          <div className="j-ps-mv-list">
            {memorizedVerses.map(v => (
              <div key={v.id} className="j-ps-mv-item">
                <div className="j-ps-mv-info">
                  <div className="j-ps-mv-ref">{v.ref}</div>
                  <div className="j-ps-mv-text">
                    "{(v.text || '').slice(0, 120)}{(v.text || '').length > 120 ? '…' : ''}"
                  </div>
                  <div className="j-ps-mv-date">
                    {v.memorizedAt
                      ? `Memorized ${format(parseISO(v.memorizedAt), 'MMM d, yyyy')}`
                      : ''}
                  </div>
                </div>
                <div className="j-ps-mv-acts">
                  <button
                    type="button"
                    className="j-ps-mv-activate"
                    onClick={() => unmarkMemorized(v)}
                  >◯ Unmark</button>
                  <button
                    type="button"
                    className="j-ps-mv-delete"
                    onClick={() => deleteVerse(v)}
                    title="Delete this verse"
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ───────── 🧹 Data & Reset (data sub-tab) ───────── */}
      {activeSub === 'data' && (
      <div className="j-ps-section">
        <div className="j-ps-section-title">🧹 Data & Reset</div>
        <div className="j-ps-section-sub">
          Reset specific data, import from another source, or wipe everything.
        </div>

        <div className="j-ps-mini-title">Resets</div>
        <div className="j-ps-reset-grid">
          <button
            type="button"
            className="j-ps-reset-btn"
            onClick={() => {
              if (window.confirm('Reset the prompt pool to defaults? Your custom prompts will be removed.')) {
                setPromptSettings({ ...DEFAULT_PROMPTS });
              }
            }}
          >🔄 Reset prompt pool</button>
          <button
            type="button"
            className="j-ps-reset-btn"
            onClick={() => {
              if (window.confirm('Permanently delete every archived memory verse?')) {
                try {
                  const raw = JSON.parse(localStorage.getItem('mh_memory_verses') || '[]');
                  const kept = raw.filter(v => !v.archived);
                  localStorage.setItem('mh_memory_verses', JSON.stringify(kept));
                  window.alert('Archived memory verses cleared.');
                } catch { /* noop */ }
              }
            }}
          >🗑 Reset Memory Verse archive</button>
          <button
            type="button"
            className="j-ps-reset-btn"
            onClick={() => {
              try { localStorage.removeItem('mh-journal-search-history'); } catch {}
              window.alert('Search history cleared.');
            }}
          >🧹 Clear search history</button>
        </div>

        <div className="j-ps-mini-title">Import from another journal</div>
        <div className="j-ps-section-sub">
          Paste a JSON array exported from this app (or another journaling tool that uses
          <code style={{ margin:'0 4px', fontSize:'10px' }}>{`{ title, content, created_at }`}</code>
          fields). New entries are added — your existing entries aren't touched.
        </div>
        <textarea
          className="j-rem-modal-input j-ps-import-ta"
          rows={4}
          placeholder='[{"title":"...","content":"...","created_at":"2025-01-01T00:00:00Z"}]'
          value={importText}
          onChange={e => { setImportText(e.target.value); setImportStatus(''); }}
        />
        {importStatus && <div className="j-ps-import-status">{importStatus}</div>}
        <div className="j-profile-actions" style={{ borderTop:'none', paddingTop:0 }}>
          <button
            className="j-save-btn"
            disabled={!importText.trim()}
            onClick={async () => {
              setImportStatus('Importing…');
              let parsed;
              try { parsed = JSON.parse(importText); }
              catch { setImportStatus('❌ Couldn\'t parse JSON.'); return; }
              if (!Array.isArray(parsed)) {
                setImportStatus('❌ Expected a JSON array of entries.');
                return;
              }
              let added = 0;
              for (const e of parsed) {
                if (!e || (!e.title && !e.content)) continue;
                try {
                  await journalService.create({
                    title:       e.title || 'Imported entry',
                    content:     e.content || '',
                    scripture:   e.scripture || null,
                    verse_text:  e.verse_text || null,
                    verses:      typeof e.verses === 'string' ? e.verses : JSON.stringify(e.verses || []),
                    prompt_text: e.prompt_text || null,
                    prompt_used: e.prompt_used ? 1 : 0,
                  });
                  added++;
                } catch { /* skip bad rows */ }
              }
              setImportText('');
              setImportStatus(`✓ Imported ${added} entr${added === 1 ? 'y' : 'ies'}.`);
            }}
          >📥 Import entries</button>
        </div>

        <div className="j-ps-mini-title" style={{ marginTop:8 }}>Danger zone</div>
        <button
          type="button"
          className="j-ps-nuke-btn"
          onClick={async () => {
            if (!window.confirm(`Delete ALL ${entries?.length || 0} journal entries? This cannot be undone.`)) return;
            if (!window.confirm('Are you sure? This will permanently erase every entry.')) return;
            try {
              for (const e of entries || []) {
                try { await journalService.delete(e.id); } catch {}
              }
              if (typeof setEntries === 'function') setEntries([]);
              window.alert('All entries deleted.');
            } catch { /* noop */ }
          }}
        >☠ Bulk delete all entries</button>
      </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ─────────
            A full, typed-out reference guide to the Journal page,
            written in-app so users don't have to go hunting for
            documentation. Mirrors docs/JOURNAL_HOW_TO_USE.md. */}
      {activeSub === 'howto' && (
      <div className="j-ps-section">
        <div className="j-ps-howto-title-row">
          <div className="j-ps-section-title">❓ How to Use the Journal Page</div>
          <button
            type="button"
            className="j-ps-howto-download"
            onClick={() => downloadGuideDocx(JOURNAL_GUIDE, 'Journal-How-To-Use.docx')}
          >⬇ Download as Word doc</button>
        </div>

        <div className="j-ps-howto-feedback">
          <span className="j-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="j-ps-howto-intro">
          A full walkthrough of everything on this page — writing entries, tracking your
          rhythm, memorizing scripture, and locking things down. Skim the headers below or
          read start to finish.
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🏠 The Dashboard</div>
          <div className="j-ps-howto-p">
            Opening Journal lands you on the Dashboard — a snapshot of your writing habits.
            Every card can be shown or hidden in the <b>Display</b> tab above.
          </div>
          <ul className="j-ps-howto-list">
            <li><b>Today's Reflection Prompt</b> — a rotating prompt with a "Write Today's Entry" button.</li>
            <li><b>Goals Progress</b> — bars tracking your daily/weekly entry targets, with a vacation-mode badge when applicable.</li>
            <li><b>Entry Stats</b> — total entries, entries in the last 7 days, whether you've written today, and books referenced.</li>
            <li><b>Writing Rhythm</b> — a 30-day heatmap; darker squares are days you journaled.</li>
            <li><b>Entry Length Over Time</b> — a bar chart of word counts across your last 20 entries.</li>
            <li><b>Themes & Words</b> — a word cloud built from your most common words.</li>
            <li><b>Scripture Coverage</b> — which Bible books you've referenced, with counts.</li>
            <li><b>On This Day</b> — past entries written on this same date in previous years.</li>
            <li><b>Memory Verse</b> — your current verse, with memorization progress and controls.</li>
          </ul>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">✏️ Writing an Entry</div>
          <div className="j-ps-howto-p">
            Click <b>✦ New Entry</b> in the sidebar, or "Write Today's Entry" on the Dashboard.
          </div>
          <ul className="j-ps-howto-list">
            <li><b>Prompt banner</b> — Use Prompt to keep it, Don't Use to dismiss it, or 🔀 New to swap it out.</li>
            <li><b>Theme picker</b> — 16 visual themes; the editor's background live-previews your pick.</li>
            <li><b>Title & Body</b> — both required to save. Body supports light markdown if enabled in Editor settings: <b>**bold**</b>, <b>*italic*</b>, <b>`code`</b>, and <b># headings</b>.</li>
            <li><b>Word count bar</b> — appears only if you've set a word-count goal; turns green once you hit it.</li>
            <li><b>Scripture References</b> — see below.</li>
            <li><b>Linked Prayers</b> — appears only if prayer linking is enabled (Integrations tab above).</li>
            <li><b>Lock toggle</b> — 🔓/🔒 sets a code just for this entry.</li>
          </ul>
          <div className="j-ps-howto-p">
            Drafts auto-save to your browser every 600ms (if enabled in Editor settings) and
            restore automatically if you navigate away before saving.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">👁 Viewing an Entry</div>
          <div className="j-ps-howto-p">
            Click any entry in the sidebar to open it full-page. From there you can
            <b> ✏ Edit</b>, <b>⬇ Download</b> as .txt, <b>🗑 Delete</b>, go <b>⛶ Full Screen</b>
            (press Esc to exit), or head <b>← Dashboard</b>.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">📚 The Entry List (Sidebar)</div>
          <ul className="j-ps-howto-list">
            <li><b>Search</b> — matches title and body text in real time.</li>
            <li><b>Date range filter</b> — narrow the list to a specific window.</li>
            <li><b>Sort order & card style</b> — set in the Display tab (newest/oldest/longest; comfy/compact/title-only).</li>
            <li>Locked entries show a 🔒 icon; if "hide locked previews" is on, their title is replaced with <i>Locked entry</i>.</li>
            <li>Click the <b>›</b> chevron to collapse the sidebar for more room.</li>
          </ul>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">📖 Scripture References</div>
          <div className="j-ps-howto-p">
            Type a reference (e.g. <i>John 3:16</i>) into the Scripture field in the editor.
            After a short pause the verse text auto-fetches (translation set in Editor settings).
            Press Enter or click Add to save it — add as many verses as you like, each collapsible
            and removable. If the lookup fails you'll see "Couldn't load the verse text," but the
            reference is still saved.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🔗 Linking Prayers to Entries</div>
          <div className="j-ps-howto-p">
            Off by default — turn it on in the <b>Integrations</b> tab above. Once enabled, a
            Prayer picker appears in the entry editor. Linked prayers show as removable chips in
            the editor and as clickable chips in the viewer, jumping to the Prayers page.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🔒 Locking Entries & Privacy</div>
          <ul className="j-ps-howto-list">
            <li><b>Per-entry lock</b> — click 🔓 Unlocked in the editor to set a code just for that entry.</li>
            <li><b>Master lock</b> — set in the <b>Privacy</b> tab; gates the whole page and re-locks after a chosen idle period.</li>
            <li><b>Default lock code</b> — pre-fills a code so you don't retype it for every new locked entry.</li>
            <li><b>Hide locked previews</b> / <b>exclude locked from search</b> — extra privacy toggles, also in Privacy.</li>
            <li>Forgot your master code? The lock screen has a "Forgot code? Disable lock" escape hatch (confirmation required).</li>
          </ul>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🧠 Memory Verses & Spaced Repetition</div>
          <div className="j-ps-howto-p">
            The Memory Verse card on the Dashboard lets you set a verse (auto-fetched), expand or
            collapse it, mark it memorized (archives it and clears review reminders), schedule
            spaced-repetition reviews on a calendar grid, archive it, or delete it. Past verses
            live in the <b>Archived</b> and <b>Memorized</b> tabs above, where you can restore or
            permanently delete them. You can also schedule a recurring "Pick New Verse" reminder
            in the <b>Reminders</b> tab.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🔔 Reminders</div>
          <div className="j-ps-howto-p">
            Click the bell icon in the topbar, or use the <b>Reminders</b> tab above. Set a time,
            an optional label, and which days it applies to (with Weekdays / Weekends / Daily
            presets). Reminders can sync to your Calendar page and are cleaned up automatically
            if you delete them.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">📋 Page Settings — Full Reference</div>
          <ul className="j-ps-howto-list">
            <li><b>🔔 Reminders</b> — journal reminders and the recurring "Pick New Verse" schedule.</li>
            <li><b>🔒 Privacy</b> — lock codes, auto-lock timing, locked-entry visibility.</li>
            <li><b>✏️ Writing</b> — reflection prompts, categories, custom prompts, and daily/weekly goals.</li>
            <li><b>🎨 Display</b> — which Dashboard cards show, sort order, card density, date format.</li>
            <li><b>🔗 Integrations</b> — turn prayer linking on/off.</li>
            <li><b>📦 Archived</b> / <b>✓ Memorized</b> — manage past memory verses.</li>
            <li><b>💾 Data</b> — export, import, and clear-all-data tools.</li>
          </ul>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">💾 Export, Import & Clearing Data</div>
          <div className="j-ps-howto-p">
            In the <b>Data</b> tab: export everything as .txt, .md, or .json (optionally including
            images), import entries you've exported before, or clear all data entirely. Clearing
            cannot be undone — export first if there's any chance you'll want the entries again.
          </div>
        </div>

        <div className="j-ps-howto-block">
          <div className="j-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="j-ps-howto-list">
            <li><b>"Your journal storage is full…"</b> — export your entries, then clear old ones.</li>
            <li><b>"Couldn't reach Firestore…"</b> — you're offline; try again once connected.</li>
            <li><b>"You're signed out…"</b> — your session expired; sign back in.</li>
            <li><b>"Incorrect code."</b> — wrong entry or master lock code.</li>
            <li><b>"Couldn't load the verse text…"</b> — the Bible lookup failed; the reference is still saved.</li>
          </ul>
        </div>
      </div>
      )}

      {/* ── Inline code-setter modal ──
          Pops when the user toggles on a lock without having set a
          code yet. Saves the code + flips the toggle in one step so
          the checkbox click feels responsive (and so users can never
          enable a lock with no code). */}
      {codePrompt && (
        <>
          <div className="j-modal-overlay" onClick={() => setCodePrompt(null)} style={{ zIndex: 1100 }}/>
          <div className="j-lock-modal" role="dialog" style={{ zIndex: 1101 }}>
            <div className="j-lock-modal-hd">
              <span>🔒 {codePrompt.type === 'master' ? 'Set Master Code' : 'Set Default Lock Code'}</span>
              <button
                className="j-rem-modal-close"
                onClick={() => setCodePrompt(null)}
                aria-label="Close"
              >✕</button>
            </div>
            <div className="j-lock-modal-body">
              <div className="j-lock-modal-lbl">
                {codePrompt.type === 'master'
                  ? "Choose a code. You'll be asked for it every time you open the Journal page."
                  : 'Choose a code. New entries will be locked with it automatically.'}
              </div>
              <input
                autoFocus
                type="password"
                className="j-lock-modal-input"
                placeholder="Code (digits or letters)"
                value={codePrompt.value}
                onChange={e => setCodePrompt(c => c && ({ ...c, value: e.target.value, error: '' }))}
                onKeyDown={e => { if (e.key === 'Enter') commitCodePrompt(); }}
              />
              {codePrompt.error && (
                <div className="j-lock-modal-err">{codePrompt.error}</div>
              )}
            </div>
            <div className="j-lock-modal-ft">
              <button className="j-cancel-btn" onClick={() => setCodePrompt(null)}>Cancel</button>
              <button
                className="j-save-btn"
                disabled={!codePrompt.value.trim()}
                onClick={commitCodePrompt}
              >✓ Save &amp; Enable</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* Create N weekly review events on the calendar for a single
   journal-entry reminder. `weeks` controls the span (clamped to
   1..52). Returns the array of event ids so the reminder can track
   which events belong to it. Events are tagged with
   source='journal-reminder' for cleanup. */
async function createReminderEvents({ label, time, days, weeks }) {
  try {
    const span = Math.max(1, Math.min(52, parseInt(weeks, 10) || 12));
    const dates = reminderDates(days || [], span);
    if (!dates.length) return [];
    const title = label || 'Journal reminder';
    const events = dates.map(date => ({
      title,
      description: '',
      event_date:  date,
      event_time:  time || '',
      color:       '#22c55e',
      category:    'general',
      source:      'journal-reminder',
      source_id:   '',
    }));
    const res = await calendarService.bulkCreate(events);
    return (res?.data?.data || []).map(e => e.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[journal-reminder] create failed:', e?.message || e);
    return [];
  }
}
