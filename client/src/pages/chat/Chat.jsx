import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import MinistryBrand from '../../components/layout/MinistryBrand';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import PageTourHost from '../../components/tour/PageTourHost';
import { useAuth } from '../../context/AuthContext';
import { useUserProfile, getProfileByKey, getProfileByUid, contactFields } from '../../lib/userProfile';
import { useUserStoreKey } from '../../lib/userStore';
import { studioShareService } from '../../services/studioShareService';
import { sharedStudioProjectService } from '../../services/sharedStudioProjectService';
import { uploadChatFile, formatBytes, CHAT_FILE_MAX_BYTES } from '../../lib/chatFiles';
import { fileToResizedDataUrl } from '../../lib/imageResize';
import { db } from '../../lib/firebase';
import { isFounder } from '../../lib/founder';
import { sendRequestMessage, requestTwoWayAccess, respondToTwoWayRequest, clearRequestMessages } from '../../services/founderRequestService';
import PersonSearchBox from './PersonSearchBox';
import { CustomAvatar } from '../friends/Avatar';
import {
  sendInvite, acceptInvite, declineInvite, cancelInvite,
  useMyInvites, useMySentInvites,
} from '../../lib/chatInvites';
import {
  collection, doc, addDoc, deleteDoc, updateDoc,
  query as fsQuery, where, orderBy, limit, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import chatGuideDocxUrl from '../../assets/chat-how-to-guide.docx?url';
import './Chat.css';

/* Per-channel themes — each defines the whole feel of the
   conversation page: accent + secondary colors, a custom gradient
   background, and a "surface" tint used for unthemed message
   bubbles so they pick up the theme's mood subtly.

   Add or tweak freely — every theme needs:
     accent     - primary brand color (hex)
     secondary  - secondary brand color (hex)
     bg         - full CSS `background` value for the whole page
     surface    - rgba color for non-themed message bubbles / cards */
const CHAT_THEMES = [
  {
    id: 'default', name: 'Default',
    accent: '#60a5fa', secondary: '#a78bfa',
    bg: 'radial-gradient(ellipse 1000px 700px at 20% 10%, rgba(96,165,250,0.16), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(167,139,250,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #14121a 0%, #0e0c14 100%)',
    surface: 'rgba(255, 255, 255, 0.06)',
  },
  {
    id: 'ocean', name: 'Ocean',
    accent: '#22d3ee', secondary: '#3b82f6',
    bg: 'radial-gradient(ellipse 1200px 800px at 30% 0%, rgba(34,211,238,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 1000px 700px at 90% 100%, rgba(59,130,246,0.22), transparent 60%),'
      + 'linear-gradient(180deg, #061523 0%, #030c18 100%)',
    surface: 'rgba(34, 211, 238, 0.06)',
  },
  {
    id: 'sunset', name: 'Sunset',
    accent: '#fb923c', secondary: '#f472b6',
    bg: 'radial-gradient(ellipse 1100px 700px at 10% 0%, rgba(251,146,60,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 100% 100%, rgba(244,114,182,0.20), transparent 60%),'
      + 'linear-gradient(160deg, #1f1411 0%, #1a0d10 60%, #14080c 100%)',
    surface: 'rgba(251, 146, 60, 0.06)',
  },
  {
    id: 'forest', name: 'Forest',
    accent: '#34d399', secondary: '#a3e635',
    bg: 'radial-gradient(ellipse 1100px 700px at 70% 0%, rgba(52,211,153,0.18), transparent 60%),'
      + 'radial-gradient(ellipse 1000px 600px at 10% 100%, rgba(163,230,53,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #081a13 0%, #04130d 100%)',
    surface: 'rgba(52, 211, 153, 0.06)',
  },
  {
    id: 'lavender', name: 'Lavender',
    accent: '#c084fc', secondary: '#f0abfc',
    bg: 'radial-gradient(ellipse 1100px 700px at 40% 10%, rgba(192,132,252,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(240,171,252,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #150f1d 0%, #0e0918 100%)',
    surface: 'rgba(192, 132, 252, 0.07)',
  },
  {
    id: 'rose', name: 'Rose',
    accent: '#fb7185', secondary: '#f9a8d4',
    bg: 'radial-gradient(ellipse 1000px 700px at 20% 0%, rgba(251,113,133,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(249,168,212,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #1a0c12 0%, #14070e 100%)',
    surface: 'rgba(251, 113, 133, 0.07)',
  },
  {
    id: 'amber', name: 'Amber',
    accent: '#fbbf24', secondary: '#f97316',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(251,191,36,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(249,115,22,0.20), transparent 60%),'
      + 'linear-gradient(180deg, #1c1409 0%, #160e04 100%)',
    surface: 'rgba(251, 191, 36, 0.07)',
  },
  {
    id: 'slate', name: 'Slate',
    accent: '#94a3b8', secondary: '#cbd5e1',
    bg: 'radial-gradient(ellipse 1000px 700px at 50% 0%, rgba(148,163,184,0.12), transparent 60%),'
      + 'linear-gradient(180deg, #1a1d24 0%, #12151b 100%)',
    surface: 'rgba(255, 255, 255, 0.05)',
  },
  {
    id: 'midnight', name: 'Midnight',
    accent: '#6366f1', secondary: '#8b5cf6',
    bg: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.22), transparent 50%),'
      + 'radial-gradient(circle at 80% 80%, rgba(139,92,246,0.20), transparent 50%),'
      + 'radial-gradient(circle at 60% 30%, rgba(255,255,255,0.04), transparent 30%),'
      + 'linear-gradient(180deg, #0c0a1e 0%, #050414 100%)',
    surface: 'rgba(99, 102, 241, 0.08)',
  },
  {
    id: 'crimson', name: 'Crimson',
    accent: '#ef4444', secondary: '#dc2626',
    bg: 'radial-gradient(ellipse 1000px 700px at 30% 0%, rgba(239,68,68,0.18), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 90% 100%, rgba(220,38,38,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #1a0808 0%, #140404 100%)',
    surface: 'rgba(239, 68, 68, 0.06)',
  },
  {
    id: 'party', name: 'Party',
    accent: '#f43f5e', secondary: '#fbbf24',
    bg: 'radial-gradient(ellipse 900px 600px at 20% 10%, rgba(244,63,94,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 90%, rgba(251,191,36,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 800px 500px at 50% 50%, rgba(168,85,247,0.16), transparent 60%),'
      + 'linear-gradient(160deg, #1a0d1a 0%, #1f0a1a 60%, #170410 100%)',
    surface: 'rgba(244, 63, 94, 0.07)',
  },
  {
    id: 'music', name: 'Music',
    accent: '#8b5cf6', secondary: '#ec4899',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(139,92,246,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 30% 100%, rgba(236,72,153,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #14091a 0%, #0a0510 100%)',
    surface: 'rgba(139, 92, 246, 0.08)',
  },
  {
    id: 'podcast', name: 'Podcast',
    accent: '#f59e0b', secondary: '#b45309',
    bg: 'radial-gradient(ellipse 1100px 700px at 50% 0%, rgba(245,158,11,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(180,83,9,0.20), transparent 60%),'
      + 'linear-gradient(180deg, #1a120a 0%, #120a04 100%)',
    surface: 'rgba(245, 158, 11, 0.07)',
  },
  {
    id: 'webdev', name: 'Website',
    accent: '#06b6d4', secondary: '#10b981',
    bg: 'radial-gradient(ellipse 1100px 700px at 30% 0%, rgba(6,182,212,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 80% 100%, rgba(16,185,129,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #051218 0%, #020a0e 100%)',
    surface: 'rgba(6, 182, 212, 0.08)',
  },
  {
    id: 'worship', name: 'Worship',
    accent: '#fbbf24', secondary: '#7c3aed',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(251,191,36,0.22), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(124,58,237,0.18), transparent 60%),'
      + 'linear-gradient(180deg, #1a1106 0%, #100916 100%)',
    surface: 'rgba(251, 191, 36, 0.07)',
  },
  {
    id: 'scripture', name: 'Scripture',
    accent: '#b91c1c', secondary: '#a16207',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(161,98,7,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 900px 600px at 50% 100%, rgba(146,64,14,0.16), transparent 60%),'
      + 'linear-gradient(180deg, #1d150a 0%, #150d04 100%)',
    surface: 'rgba(245, 158, 11, 0.08)',
  },
  {
    id: 'missions', name: 'Missions',
    accent: '#3b82f6', secondary: '#fbbf24',
    bg: 'radial-gradient(ellipse 1200px 800px at 50% 50%, rgba(59,130,246,0.20), transparent 60%),'
      + 'radial-gradient(ellipse 800px 500px at 80% 80%, rgba(251,191,36,0.14), transparent 60%),'
      + 'linear-gradient(180deg, #050a14 0%, #03060f 100%)',
    surface: 'rgba(59, 130, 246, 0.08)',
  },
];

/** Resolve a theme id to its full object, falling back to default. */
function getChatTheme(themeId) {
  return CHAT_THEMES.find(t => t.id === themeId) || CHAT_THEMES[0];
}

/** Hex (#rrggbb) → "rgba(r,g,b,alpha)" for use in CSS variables. */
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(96, 165, 250, ${alpha})`; // safe fallback
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Build the inline-style object for a themed conversation view.
 *  Sets accent CSS variables (cascades to children via inheritance)
 *  AND the page background. */
function themeStyle(theme) {
  return {
    '--ch-accent':    theme.accent,
    '--ch-accent-bg': hexToRgba(theme.accent, 0.14),
    '--ch-accent-br': hexToRgba(theme.accent, 0.40),
    '--ch-priv':      theme.secondary,
    '--ch-priv-bg':   hexToRgba(theme.secondary, 0.14),
    '--ch-priv-br':   hexToRgba(theme.secondary, 0.40),
    /* Surface tint for non-themed message bubbles / cards — picks up
       a subtle hue from the active theme so unmemoized surfaces don't
       feel disconnected from the rest of the page. */
    '--ch-surface':   theme.surface,
    /* Full page background — radial / linear gradient layered on a
       deep base. Replaces the default orb background within the
       conversation view. */
    background:       theme.bg,
  };
}

/* Decorative SVG overlay rendered behind every conversation when a
   theme is active. Pure visual flair — pointer-events: none so it
   never interferes with clicks, and very low opacity so it stays
   subtle behind the actual messages. Each theme returns a different
   set of shapes that fits its mood. */
function ThemeDecorations({ themeId }) {
  const common = {
    className: 'ch-theme-deco',
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
            {/* Rays (long triangles pointing outward, 30° apart) */}
            <g fill="#fbbf24">
              <polygon points="0,-100 -10,-62 10,-62"/>     {/* 12 o'clock */}
              <polygon points="50,-86 33,-55 47,-47"/>      {/* 1 o'clock */}
              <polygon points="86,-50 55,-33 62,-19"/>      {/* 2 o'clock */}
              <polygon points="100,0 62,-10 62,10"/>        {/* 3 o'clock */}
              <polygon points="86,50 55,33 62,47"/>         {/* 4 o'clock */}
              <polygon points="50,86 33,55 47,62"/>         {/* 5 o'clock */}
              <polygon points="0,100 -10,62 10,62"/>        {/* 6 o'clock */}
              <polygon points="-50,86 -33,55 -47,62"/>      {/* 7 o'clock */}
              <polygon points="-86,50 -55,33 -62,47"/>      {/* 8 o'clock */}
              <polygon points="-100,0 -62,-10 -62,10"/>     {/* 9 o'clock */}
              <polygon points="-86,-50 -55,-33 -62,-19"/>   {/* 10 o'clock */}
              <polygon points="-50,-86 -33,-55 -47,-47"/>   {/* 11 o'clock */}
            </g>
            {/* Sun body — golden, with a slightly warmer inner disc */}
            <circle r="50" fill="#fbbf24"/>
            <circle r="42" fill="#fb923c" opacity="0.85"/>
            <circle r="32" fill="#fbbf24" opacity="0.65"/>
            {/* Tiny highlight to give it dimension */}
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
          {/* Reusable rose definition. Drawn top-down (like looking
              straight into a blossom): outer petals + middle petals +
              tiny center, all in pinks. <use href="#ch-rose"> below
              stamps it at multiple positions, sizes, and rotations
              for variety. Stem-and-leaf is a separate symbol that's
              attached to a few of the larger flowers. */}
          <defs>
            <g id="ch-rose">
              {/* Outer ring of 5 petals (rotated copies of one ellipse) */}
              <g fill="#fb7185">
                <ellipse cx="0" cy="-11" rx="10" ry="14"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(72)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(144)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(216)"/>
                <ellipse cx="0" cy="-11" rx="10" ry="14" transform="rotate(288)"/>
              </g>
              {/* Inner ring of 5 petals — offset 36° so they fill the
                  gaps between the outer petals */}
              <g fill="#ec4899">
                <ellipse cx="0" cy="-7"  rx="7" ry="9"  transform="rotate(36)"/>
                <ellipse cx="0" cy="-7"  rx="7" ry="9"  transform="rotate(108)"/>
                <ellipse cx="0" cy="-7"  rx="7" ry="9"  transform="rotate(180)"/>
                <ellipse cx="0" cy="-7"  rx="7" ry="9"  transform="rotate(252)"/>
                <ellipse cx="0" cy="-7"  rx="7" ry="9"  transform="rotate(324)"/>
              </g>
              {/* Bud center */}
              <circle r="4" fill="#9d174d"/>
            </g>
            {/* Leaf — a soft green almond shape with a vein */}
            <g id="ch-rose-leaf">
              <ellipse cx="0" cy="0" rx="14" ry="6" fill="#16a34a"/>
              <line x1="-14" y1="0" x2="14" y2="0" stroke="#15803d" strokeWidth="0.6" opacity="0.7"/>
            </g>
          </defs>

          {/* Bouquet — 14 roses scattered across the canvas, varied
              scale and rotation so it doesn't look like a grid. */}
          <g opacity="0.55">
            <use href="#ch-rose" transform="translate(110  170) scale(1.4) rotate(15)"/>
            <use href="#ch-rose" transform="translate(280  120) scale(0.9) rotate(-30)"/>
            <use href="#ch-rose" transform="translate(490   90) scale(1.1) rotate(40)"/>
            <use href="#ch-rose" transform="translate(720  140) scale(0.85) rotate(-20)"/>
            <use href="#ch-rose" transform="translate(940  180) scale(1.3) rotate(25)"/>
            <use href="#ch-rose" transform="translate(1120 130) scale(0.95) rotate(-15)"/>
            <use href="#ch-rose" transform="translate(180  420) scale(1.0) rotate(50)"/>
            <use href="#ch-rose" transform="translate(420  470) scale(0.8) rotate(-40)"/>
            <use href="#ch-rose" transform="translate(680  430) scale(1.2) rotate(10)"/>
            <use href="#ch-rose" transform="translate(950  500) scale(0.95) rotate(-25)"/>
            <use href="#ch-rose" transform="translate(140  680) scale(1.1) rotate(20)"/>
            <use href="#ch-rose" transform="translate(380  720) scale(0.9) rotate(-10)"/>
            <use href="#ch-rose" transform="translate(640  690) scale(1.3) rotate(35)"/>
            <use href="#ch-rose" transform="translate(870  720) scale(1.0) rotate(-30)"/>
            <use href="#ch-rose" transform="translate(1090 660) scale(0.85) rotate(45)"/>
          </g>

          {/* Scattered leaves — a few drifting between the flowers */}
          <g opacity="0.45">
            <use href="#ch-rose-leaf" transform="translate(220 270) rotate(40)"/>
            <use href="#ch-rose-leaf" transform="translate(560 240) rotate(-20)"/>
            <use href="#ch-rose-leaf" transform="translate(820 320) rotate(60)"/>
            <use href="#ch-rose-leaf" transform="translate(1040 380) rotate(-10)"/>
            <use href="#ch-rose-leaf" transform="translate(300 580) rotate(25)"/>
            <use href="#ch-rose-leaf" transform="translate(720 580) rotate(-35)"/>
          </g>
        </svg>
      );
    case 'amber':
      return (
        <svg {...common}>
          {/* Honeycomb hex pattern (subtle, repeated) */}
          <defs>
            <pattern id="ch-honey" x="0" y="0" width="48" height="42" patternUnits="userSpaceOnUse">
              <polygon
                points="24,2 44,12 44,30 24,40 4,30 4,12"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1"
                opacity="0.18"
              />
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#ch-honey)"/>
        </svg>
      );
    case 'slate':
      return (
        <svg {...common}>
          {/* Subtle dot grid */}
          <defs>
            <pattern id="ch-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#94a3b8" opacity="0.20"/>
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#ch-dots)"/>
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
          <polygon points="0,720 220,560 420,720" fill="#ef4444" opacity="0.18"/>
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
            {/* Eighth note */}
            <g transform="translate(150 200)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-36" stroke="#8b5cf6" strokeWidth="2.5"/>
              <path d="M 7 -36 Q 22 -32 22 -16" stroke="#8b5cf6" strokeWidth="2.5" fill="none"/>
            </g>
            {/* Single note */}
            <g transform="translate(1060 240)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-36" stroke="#8b5cf6" strokeWidth="2.5"/>
            </g>
          </g>
          {/* Beamed two-note */}
          <g fill="#ec4899" opacity="0.32">
            <g transform="translate(720 180)">
              <ellipse cx="0" cy="0" rx="8" ry="6"/>
              <ellipse cx="24" cy="-2" rx="8" ry="6"/>
              <line x1="6" y1="-2" x2="6" y2="-30" stroke="#ec4899" strokeWidth="2.5"/>
              <line x1="30" y1="-4" x2="30" y2="-32" stroke="#ec4899" strokeWidth="2.5"/>
              <rect x="6" y="-32" width="24" height="4" fill="#ec4899"/>
            </g>
            {/* Single quarter note */}
            <g transform="translate(440 400)">
              <ellipse cx="0" cy="0" rx="9" ry="7" transform="rotate(-20)"/>
              <line x1="7" y1="-3" x2="7" y2="-34" stroke="#ec4899" strokeWidth="2.5"/>
            </g>
          </g>
          {/* Treble clef hint (simplified curls) */}
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
            {/* Mic grill lines */}
            <line x1="-10" y1="-22" x2="10" y2="-22" stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="-12" x2="10" y2="-12" stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="-2"  x2="10" y2="-2"  stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            <line x1="-10" y1="8"   x2="10" y2="8"   stroke="#fbbf24" strokeWidth="1" opacity="0.6"/>
            {/* Boom */}
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
          {/* "ON AIR" tag indicator on the left */}
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
            <pattern id="ch-webgrid" x="0" y="0" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#06b6d4" strokeWidth="0.5" opacity="0.18"/>
            </pattern>
          </defs>
          <rect width="1200" height="800" fill="url(#ch-webgrid)"/>
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
            <linearGradient id="ch-worship-ray" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde68a" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points="500,0 700,0 820,800 380,800" fill="url(#ch-worship-ray)"/>
          <polygon points="580,0 620,0 700,800 500,800" fill="url(#ch-worship-ray)" opacity="0.5"/>
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
          {/* Soft warm glow behind the centerpiece so the heart "lifts"
              off the dark background without needing a hard border. */}
          <defs>
            <radialGradient id="ch-scripture-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#fde68a" stopOpacity="0.18"/>
              <stop offset="60%"  stopColor="#fde68a" stopOpacity="0.04"/>
              <stop offset="100%" stopColor="#fde68a" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="600" cy="400" r="220" fill="url(#ch-scripture-glow)"/>

          {/* Big bold heart with a cross inside — the centerpiece.
              Heart drawn as one path with a thick warm stroke; cross
              drawn as two rounded rectangles in the same cream color
              so they read as a single emblem. */}
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
            {/* Cross — vertical bar */}
            <rect x="-11" y="-18" width="22" height="148" rx="3" fill="#fde68a"/>
            {/* Cross — horizontal bar (placed upper-third inside the heart) */}
            <rect x="-50" y="22"  width="100" height="24" rx="3" fill="#fde68a"/>
          </g>

          {/* Four short verses spread across the corners — different
              sizes/serif italic so it looks like an old open Bible. */}
          <g fontFamily="'Georgia', 'Times New Roman', serif" fontStyle="italic">
            {/* Top left */}
            <g transform="translate(60 130)" fill="#fef3c7" opacity="0.55">
              <text fontSize="22">&ldquo;Be still, and know</text>
              <text y="28" fontSize="22">that I am God.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PSALM 46:10
              </text>
            </g>
            {/* Top right */}
            <g transform="translate(820 140)" fill="#fde68a" opacity="0.55">
              <text fontSize="22">&ldquo;The Lord is</text>
              <text y="28" fontSize="22">my shepherd.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PSALM 23:1
              </text>
            </g>
            {/* Bottom left */}
            <g transform="translate(60 600)" fill="#fed7aa" opacity="0.55">
              <text fontSize="22">&ldquo;I can do all things</text>
              <text y="28" fontSize="22">through Christ.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — PHILIPPIANS 4:13
              </text>
            </g>
            {/* Bottom right */}
            <g transform="translate(820 600)" fill="#fef3c7" opacity="0.55">
              <text fontSize="22">&ldquo;For God so loved</text>
              <text y="28" fontSize="22">the world.&rdquo;</text>
              <text y="56" fontSize="12" opacity="0.7" fontStyle="normal"
                fontFamily="ui-monospace, 'SF Mono', monospace" letterSpacing="1">
                — JOHN 3:16
              </text>
            </g>
          </g>
          {/* Decorative ornaments — small filigree dots between the
              verses to keep the corners visually anchored. */}
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
            {/* Outline + a few "longitude" curves */}
            <circle cx="600" cy="400" r="280"/>
            <ellipse cx="600" cy="400" rx="100" ry="280"/>
            <ellipse cx="600" cy="400" rx="200" ry="280"/>
            {/* "Latitude" curves */}
            <ellipse cx="600" cy="400" rx="280" ry="80"/>
            <ellipse cx="600" cy="400" rx="280" ry="160"/>
            <ellipse cx="600" cy="400" rx="280" ry="240"/>
            {/* Equator */}
            <line x1="320" y1="400" x2="880" y2="400" strokeWidth="1.2"/>
          </g>
          {/* Mission "destination" dots scattered on the globe */}
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
          {/* Dotted flight paths arcing between destinations */}
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
          <circle cx="160" cy="180" r="40" fill="#60a5fa" opacity="0.12"/>
          <circle cx="1020" cy="280" r="60" fill="#a78bfa" opacity="0.10"/>
          <circle cx="540" cy="540" r="50" fill="#60a5fa" opacity="0.08"/>
          <circle cx="1100" cy="600" r="35" fill="#a78bfa" opacity="0.10"/>
        </svg>
      );
  }
}

/* Available "Type of Ministry" values for the profile dropdown.
   Edit this list to add/remove options — both MyProfileDialog and
   MemberProfileDialog read from it. */
const MINISTRY_TYPES = [
  'Worship',
  'Youth',
  "Children's",
  'Outreach',
  'Small Groups',
  'Prayer',
  'Tech / Production',
  'Missions',
  'Hospitality',
  'Discipleship',
  'Pastoral / Teaching',
  'Administration',
  'Other',
];


/* Emoji catalog — small, curated set per category so the picker
   loads instantly and feels usable. Add/remove freely; the picker
   reads this object directly. The category label keys also drive
   the tab row at the top of the picker. */
const EMOJI_CATEGORIES = {
  '😀 Faces': [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
    '😗','😙','😚','😋','😛','😝','😜','🤪','😎','🤩','🥳','😏','😒','😔','😟','😕',
    '🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶',
    '😱','😨','😰','😥','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😪',
    '🥱','😴','🤤','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤠','🥸','🤓','🧐',
  ],
  '👍 Gestures': [
    '👍','👎','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝',
    '👋','🤚','🖐','✋','🖖','👏','🙌','🫶','🤲','🤝','🙏','💪','✍',
  ],
  '❤ Hearts': [
    '❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟',
  ],
  '🎉 Celebrate': [
    '🎉','🎊','🥳','🎈','🎁','🎂','🎀','🍰','🎆','🎇','✨','⭐','🌟','💫','🔥','💥',
    '🏆','🥇','🥈','🥉','🏅','🎖',
  ],
  '✝ Faith': [
    '✝','⛪','🙏','🕊','📖','🌟','💒','🌈','🕯','😇','🛐','⛲','🌅','🌄',
  ],
  '🎵 Music': [
    '🎵','🎶','🎤','🎧','🎸','🎹','🥁','🎺','🎷','🎻','🪕','🪘','🪗','🎼','📯','🔔',
  ],
  '🍔 Food': [
    '🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🍣','🍱','🍝','🍜','🍲','🥗','🥘',
    '🍳','🥞','🥐','🥯','🍞','🧀','🥚','🍙','🍚','🍘','🍢','🍡','🍮','🍦','🍨','🍧',
    '🎂','🍰','🧁','🥧','🍪','🍩','🍫','🍬','🍭','🍿','🥜','🌰','☕','🍵','🧋','🥛',
    '🍺','🍻','🍷','🥂','🍸','🍹','🍶','🥃','🫖',
  ],
  '🌸 Nature': [
    '🌸','💐','🌷','🌹','🌺','🌻','🌼','🌱','🌿','☘','🍀','🍃','🌳','🌲','🌴','🌵',
    '🍂','🍁','🍄','🌍','🌎','🌏','🌐','🌞','☀','🌤','⛅','☁','🌦','🌧','⛈','🌩',
    '❄','☃','⛄','🌊','💧','💦','🌈','🌅','🌄','🌠','⭐','🌟','✨','🌙','🌛','🌜',
  ],
  '✅ Symbols': [
    '✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚪','⚫','🟤','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜',
    '❤','💔','❣','💯','⚡','🔥','💫','✨','💢','💨','💦','💤','‼','⁉','❓','❔','❕','❗',
    '〽','⚠','🚸','🔱','🔰','♻','✳','❇','✴','⚜','〰','➰','➿',
  ],
};

/* Compose-area popover for picking an emoji to insert into the
   message draft. Closes on outside click, on Escape, or after a
   user picks (configurable below — currently it stays open so
   you can pile on several). */
function EmojiPicker({ onPick, onClose }) {
  const tabs = Object.keys(EMOJI_CATEGORIES);
  const [tab, setTab] = useState(tabs[0]);
  const panelRef = useRef(null);

  /* Esc to dismiss */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Outside-click to dismiss. Delayed by a tick so the click that
     opened the picker doesn't immediately close it again. */
  useEffect(() => {
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div className="ch-emoji-panel" ref={panelRef} role="dialog" aria-label="Emoji picker">
      <div className="ch-emoji-tabs">
        {tabs.map(label => (
          <button
            key={label}
            type="button"
            className={`ch-emoji-tab${tab === label ? ' on' : ''}`}
            onClick={() => setTab(label)}
            title={label.replace(/^\S+\s/, '')}
            aria-pressed={tab === label}
          >
            {label.split(' ')[0]}
          </button>
        ))}
      </div>
      <div className="ch-emoji-grid">
        {EMOJI_CATEGORIES[tab].map((e, i) => (
          <button
            key={`${tab}-${i}`}
            type="button"
            className="ch-emoji"
            onClick={() => onPick(e)}
            aria-label={`Insert ${e}`}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}

/* Tiny shared copy-to-clipboard helper. Returns true on success.

   We try the modern async clipboard API first (works in most modern
   browsers + Electron). When it fails — which it sometimes does
   silently in Electron due to focus/permission quirks — we fall back
   to a synchronous textarea+execCommand trick that works basically
   everywhere. Logs on failure so it's not a complete black box. */
async function copyToClipboard(value) {
  const text = String(value ?? '');
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[copy] navigator.clipboard failed, falling back:', e?.message || e);
  }
  // Fallback — works without secure context and without focus.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[copy] execCommand fallback failed:', e?.message || e);
    return false;
  }
}

/* Read text from the clipboard. Returns the string or null on failure.
   Unlike copy, there's no reliable execCommand fallback for paste —
   modern browsers/Electron versions block it for security. So if the
   async API fails, we just return null and let the caller decide. */
async function pasteFromClipboard() {
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[paste] readText failed:', e?.message || e);
  }
  return null;
}

/* Small reusable "paste from clipboard" button.
   Calls onPaste(text) with whatever's in the clipboard. The caller
   decides what to do with it (replace, append, etc.). Shows a brief
   ✓ on success, ✕ on failure. */
function PasteButton({ onPaste, label, className = '' }) {
  const [state, setState] = useState(''); // '' | 'ok' | 'err'
  const click = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const text = await pasteFromClipboard();
    if (text && text.length > 0) {
      onPaste?.(text);
      setState('ok');
    } else {
      setState('err');
    }
    setTimeout(() => setState(''), 1500);
  };
  return (
    <button
      type="button"
      className={`ch-paste-btn${state === 'ok' ? ' ok' : ''}${state === 'err' ? ' err' : ''} ${className}`}
      onClick={click}
      aria-label={`Paste ${label || 'value'}`}
      title={
        state === 'ok' ? 'Pasted!'
        : state === 'err' ? 'Clipboard was empty or blocked'
        : `Paste ${label || 'value'} from clipboard`
      }
    >
      {state === 'ok' ? '✓' : state === 'err' ? '✕' : '📋 Paste'}
    </button>
  );
}

/* Small reusable "copy to clipboard" button.
   Shows a clipboard glyph by default, flips to a checkmark for 1.5s
   after a successful copy. `label` is used for the aria-label and
   tooltip so screen readers know what's being copied. */
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('[copy] both clipboard methods failed for value:', value);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      className={`ch-copy-btn${copied ? ' copied' : ''}`}
      onClick={copy}
      aria-label={`Copy ${label || 'value'}`}
      title={copied ? 'Copied!' : `Copy ${label || 'value'}`}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

/* Detect whether a message body is "emoji only" (just emojis, maybe
   with whitespace). Used to render single-emoji messages as a huge,
   bubble-less character like Slack / iMessage do.

   The regex permits:
   - whitespace
   - any Extended_Pictographic character (the emoji set)
   - ZWJ (U+200D) — used in family / multi-person sequences
   - variation selectors (U+FE0F) — emoji presentation modifier
   - skin-tone modifiers (U+1F3FB..U+1F3FF)
   - keycap base digits 0-9, * and # (used with the keycap modifier
     U+20E3 to form keycap emoji like 1️⃣)
   - the keycap modifier itself (U+20E3) */
function isEmojiOnly(text) {
  if (!text || !text.trim()) return false;
  return /^[\s0-9*#\u{200D}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}\p{Extended_Pictographic}]+$/u
    .test(text);
}

/* Count visible emojis in an emoji-only string. Uses Intl.Segmenter
   when available (proper grapheme clustering — counts 👨‍👩‍👧 as 1).
   Falls back to a crude code-point count if not. */
function countEmojiGraphemes(text) {
  const cleaned = String(text || '').replace(/\s/g, '');
  if (!cleaned) return 0;
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
      return Array.from(seg.segment(cleaned)).length;
    }
  } catch { /* fall through */ }
  return [...cleaned].length;
}

/* Map emoji-only message → big font size. Returns null when it's not
   an emoji-only message OR when there are too many emojis to enlarge
   tastefully (>10 just renders as normal text in a bubble). */
function getEmojiOnlySize(text) {
  if (!isEmojiOnly(text)) return null;
  const n = countEmojiGraphemes(text);
  if (n === 0)  return null;
  if (n <= 3)   return 96; // huge — 1-3 emojis
  if (n <= 6)   return 64; // big — small group
  if (n <= 10)  return 44; // bigger than normal but readable
  return null;             // too many — fall back to normal bubble
}

/* Split a string into runs of (text | url), turning each url into a
   clickable <a>. Keeps simple text bubbles linkable without pulling
   in a markdown library. The regex matches http(s)://… up to the
   next whitespace or quote character — good enough for chat. */
function renderTextWithLinks(text) {
  if (!text) return null;
  const urlRe = /(https?:\/\/[^\s<>"']+)/g;
  const parts = String(text).split(urlRe);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="ch-msg-link"
        >{part}</a>
      );
    }
    return part;
  });
}

/* Build initials from a display name. Handles 0/1/2+ word names and
   returns "?" when the name is missing. Used by the top-right avatar
   button so the chip is a friendly circle of letters instead of a
   raw identifying key. */
function getInitials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─────────────────────────────────────────────────────────────
   useChannelUnread — subscribe to a channel's recent messages
   and return a count of those newer than `lastReadMs` that
   weren't authored by the current user.

   Only subscribes when both channelId and userUid are set, so
   ChannelCard can pass `null` for channels the user hasn't joined
   (those can't be read by security rules anyway, and have no
   unread concept). limit(50) keeps the badge bounded at 50.
   ───────────────────────────────────────────────────────────── */
function useChannelUnread(channelId, lastReadMs, userUid) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!channelId || !userUid) { setCount(0); return; }
    const q = fsQuery(
      collection(db, 'channels', channelId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(q, (snap) => {
      const cutoff = lastReadMs || 0;
      let n = 0;
      snap.forEach(d => {
        const data = d.data();
        if (data.authorUid === userUid) return;
        const ms = data.createdAt?.toMillis?.() || 0;
        if (ms > cutoff) n++;
      });
      setCount(n);
    }, () => setCount(0));
  }, [channelId, userUid, lastReadMs]);
  return count;
}

/* ─── Founder-request "rooms" ──────────────────────────────────
   Surfaces a founderRequests doc as a chat room on THIS user's own
   Chat page, but only once it actually has a message on its thread
   (i.e. once the founder has reached out). This is a read of the
   existing founderRequests/{id}/messages data already used by the
   Settings "Your Requests" thread — no `channels` doc is ever
   created for it, so it doesn't become a real, symmetric channel.

   For a regular sender this is scoped to their own requests. For the
   founder (isFounderUser) it's every thread across every sender —
   so a chat the founder started (or was asked to two-way with)
   keeps showing up here as a room instead of disappearing once the
   two-way request is accepted/declined. */
function useFounderRequestRooms(uid, isFounderUser) {
  const [requests, setRequests] = useState([]);
  const [lastMsgs, setLastMsgs] = useState({});

  useEffect(() => {
    if (!uid) { setRequests([]); return; }
    const base = collection(db, 'founderRequests');
    const q = isFounderUser ? base : fsQuery(base, where('senderUid', '==', uid));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] founder request rooms listen failed:', err?.message || err);
    });
  }, [uid, isFounderUser]);

  useEffect(() => {
    const unsubs = requests.map((r) => {
      const q = fsQuery(
        collection(db, 'founderRequests', r.id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      return onSnapshot(q, (snap) => {
        const d0 = snap.docs[0];
        setLastMsgs(prev => ({ ...prev, [r.id]: d0 ? { id: d0.id, ...d0.data() } : null }));
      }, () => {});
    });
    return () => unsubs.forEach(u => u());
  }, [requests]);

  return useMemo(
    () => requests
      .filter(r => lastMsgs[r.id])
      .map(r => ({ ...r, lastMessage: lastMsgs[r.id] })),
    [requests, lastMsgs]
  );
}

/* ─── Two-way chat requests ─────────────────────────────────
   Founder-only: every founderRequests doc across ALL senders where
   twoWayStatus == 'requested' — surfaced in the Requests tab right
   alongside channel invitations, so the founder doesn't have to go
   to the Founder Dashboard just to accept/decline one. */
function useIncomingTwoWayRequests(isFounderUser) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!isFounderUser) { setRequests([]); return; }
    const q = fsQuery(collection(db, 'founderRequests'), where('twoWayStatus', '==', 'requested'));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] incoming two-way requests listen failed:', err?.message || err);
    });
  }, [isFounderUser]);
  return requests;
}

/* Regular sender's own view of a two-way request they've filed and are
   still waiting on — read-only here (accept/decline only ever happens
   on the founder's side), just so it shows up "sent" the same way a
   channel invite you sent shows up while pending. */
function useMySentTwoWayRequests(uid, isFounderUser) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!uid || isFounderUser) { setRequests([]); return; }
    const q = fsQuery(
      collection(db, 'founderRequests'),
      where('senderUid', '==', uid),
      where('twoWayStatus', '==', 'requested'),
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] my two-way requests listen failed:', err?.message || err);
    });
  }, [uid, isFounderUser]);
  return requests;
}

/* ─────────────────────────────────────────────────────────────
   Chat — discover & join channels.

   Layout:
   - Top bar: title + your identifying key (copy)
   - Filter row: case-insensitive search + type chips + "+ New"
   - Grid of channel cards (name, type, description, member count)
   - Click a card → opens an in-app overlay with the conversation

   Data model:
     /channels/{channelId} = {
       type: 'public' | 'private',
       name, description, ownerUid, memberUids[],
       createdAt, updatedAt
     }
     /channels/{channelId}/messages/{messageId} = {
       authorUid, authorName, text, createdAt
     }
   ───────────────────────────────────────────────────────────── */

export default function Chat() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  /* Founder gets a different view of founder-request "rooms" below —
     ALL threads across every sender, instead of just their own. */
  const founderUser = isFounder(user);

  /* ── Channel list state ────────────────────────────────── */
  const [publicChannels, setPublicChannels]   = useState([]);
  const [privateChannels, setPrivateChannels] = useState([]);
  const [channelsReady, setChannelsReady]     = useState(false);

  /* ── UI filter state ───────────────────────────────────── */
  const [query, setQuery]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | public | private

  /* ── Conversation overlay state ────────────────────────── */
  const [openChannelId, setOpenChannelId] = useState(null);

  /* ── Founder-request "rooms" — see useFounderRequestRooms above ── */
  const founderRequestRooms = useFounderRequestRooms(user?.uid, founderUser);
  const [openFounderRequestId, setOpenFounderRequestId] = useState(null);
  const openFounderRequest = useMemo(
    () => founderRequestRooms.find(r => r.id === openFounderRequestId) || null,
    [founderRequestRooms, openFounderRequestId]
  );

  /* ── Per-channel last-read timestamps (for unread badges) ──
     Persisted in the user's own kv store so it follows them
     across devices. Shape: { [channelId]: ms-since-epoch }.
     Defaults to {} so older messages don't show as unread until
     the user has actually opened the channel once. */
  const [lastReads, setLastReads] = useUserStoreKey('chat:last-reads', {});

  /* Open a channel AND mark it read at the same time. We use this
     in place of bare setOpenChannelId everywhere a card/invite
     opens a conversation. */
  const openAndMarkRead = useCallback((channelId) => {
    if (!channelId) { setOpenChannelId(null); return; }
    setOpenFounderRequestId(null);
    setOpenChannelId(channelId);
    setLastReads(prev => ({ ...(prev || {}), [channelId]: Date.now() }));
  }, [setLastReads]);

  /* Deep-link support — other pages (e.g. a ministry directory's
     "Chat" button) can navigate here with `state: { openChannelId }`
     to land straight in a specific conversation. Consumed once, then
     cleared from history state so back/refresh doesn't re-trigger it. */
  const location = useLocation();
  const navigateForDeepLink = useNavigate();
  useEffect(() => {
    const targetId = location.state?.openChannelId;
    if (!targetId) return;
    openAndMarkRead(targetId);
    navigateForDeepLink(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  /* Open a founder-request room — closes any open channel first, same
     one-at-a-time behavior as openAndMarkRead. */
  const openFounderRequestRoom = useCallback((requestId) => {
    setOpenChannelId(null);
    setOpenFounderRequestId(requestId);
  }, []);

  /* Mark-as-read callback for ConversationView — bumps the channel's
     lastRead timestamp whenever new messages stream in while the
     conversation is open, so the badge stays at 0 in real time. */
  const markChannelRead = useCallback((channelId) => {
    if (!channelId) return;
    setLastReads(prev => ({ ...(prev || {}), [channelId]: Date.now() }));
  }, [setLastReads]);

  /* ── Pending invitations — both directions ─────────────── */
  const { invites: incomingInvites } = useMyInvites();
  const { invites: sentInvites }     = useMySentInvites();

  /* ── Two-way founder-chat requests — see hooks above ───── */
  const incomingTwoWay = useIncomingTwoWayRequests(founderUser);
  const sentTwoWay     = useMySentTwoWayRequests(user?.uid, founderUser);

  const requestCount = incomingInvites.length + sentInvites.length
    + incomingTwoWay.length + sentTwoWay.length;

  const handleTwoWayAccept = useCallback(async (request) => {
    try {
      await respondToTwoWayRequest(request.id, true);
      setToast(`Two-way chat accepted for "${request.title}".`);
    } catch (err) {
      setToast(`Could not accept: ${err?.message || 'unknown error'}`);
    }
  }, []);

  const handleTwoWayDecline = useCallback(async (request) => {
    try {
      await respondToTwoWayRequest(request.id, false);
      setToast(`Two-way chat declined for "${request.title}".`);
    } catch (err) {
      setToast(`Could not decline: ${err?.message || 'unknown error'}`);
    }
  }, []);

  /* ── New-channel modal ─────────────────────────────────── */
  const [showNewChannel, setShowNewChannel] = useState(false);

  /* ── Toast ─────────────────────────────────────────────── */
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    /* Longer-lived toast when the message itself is long — diagnostic
       error messages need time to read. Capped at 15s. */
    const ms = Math.min(15_000, 3500 + Math.max(0, toast.length - 60) * 40);
    const t = setTimeout(() => setToast(''), ms);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Subscribe to public channels (any signed-in user) ─
     Filter out channels the current user has been banned from
     (owner removed them). Without this filter, banned channels
     would still appear in the list — the read RULE allows reading
     channel metadata, but the message rules block content access,
     so showing them in the list would just be a dead-end UX. */
  useEffect(() => {
    if (!user) return;
    const q = fsQuery(collection(db, 'channels'), where('type', '==', 'public'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !(c.bannedUids || []).includes(user.uid));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setPublicChannels(list);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] public channels listen failed:', err?.message || err);
    });
  }, [user]);

  /* ── Subscribe to private channels I'm a member of ────── */
  useEffect(() => {
    if (!user) return;
    const q = fsQuery(
      collection(db, 'channels'),
      where('type', '==', 'private'),
      where('memberUids', 'array-contains', user.uid),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        /* Hide a solo-invite 1:1 chat (from Contacts' "Chat" button)
           until the other person actually accepts — while it's still
           just me + a pending invite, it isn't a real chat room yet.
           It reappears automatically once memberUids grows to 2. */
        .filter(c => !(c.soloInvite && (c.memberUids?.length || 0) <= 1));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setPrivateChannels(list);
      setChannelsReady(true);
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] private channels listen failed:', err?.message || err);
      setChannelsReady(true);
    });
  }, [user]);

  /* ── Merge + filter for the grid ───────────────────────── */
  const allChannels = useMemo(
    () => [...privateChannels, ...publicChannels],
    [privateChannels, publicChannels]
  );

  /* True if the current user is a member of this channel. */
  const isJoined = useCallback(
    (c) => Boolean(user?.uid && c.memberUids?.includes(user.uid)),
    [user]
  );

  /* Two viewing modes:
     - Idle (no search): only show channels the user has joined.
       This keeps the page calm and intentional — no public-chat firehose.
     - Searching: reveal public channels matching the query so the user
       can discover and Join them. */
  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;

  const filteredChannels = useMemo(() => {
    return allChannels.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!isSearching) {
        // Idle mode — only show channels I've already joined
        return isJoined(c);
      }
      // Search mode — match by name OR description, case-insensitive
      const hay = `${c.name || ''} ${c.description || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [allChannels, typeFilter, isSearching, needle, isJoined]);

  /* ── Create a new channel ──────────────────────────────── */
  const createChannel = useCallback(async ({ name, description, type, invitees, memberKeys }) => {
    if (!user) return;
    /* On create the only member is the owner. For private channels,
       each invitee (picked via search, already resolved) or listed key
       (typed/pasted directly) becomes an INVITATION the other user
       must approve before they actually join. */
    const docRef = await addDoc(collection(db, 'channels'), {
      type,
      name:        name.trim(),
      description: (description || '').trim(),
      ownerUid:    user.uid,
      memberUids:  [user.uid],
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });

    const hasInvitees = invitees?.length || memberKeys?.length;
    if (hasInvitees) {
      const channelStub = {
        id:          docRef.id,
        name:        name.trim(),
        description: (description || '').trim(),
        ownerUid:    user.uid,
        memberUids:  [user.uid],
      };
      let sent = 0;
      let badKeys = 0;       // key didn't resolve to any user
      let permsFail = 0;     // Firestore rejected the invite (likely rules)
      let otherFail = 0;     // anything else
      let lastErrMsg = '';
      const invitedUids = new Set();

      const invite = async (uid, displayName) => {
        if (uid === user.uid || invitedUids.has(uid)) return;
        invitedUids.add(uid);
        try {
          await sendInvite({
            channel:       channelStub,
            inviteeUid:    uid,
            inviteeName:   displayName || 'Member',
            invitedByName: profile?.displayName || user.displayName,
          });
          sent++;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[chat] sendInvite failed:', e);
          lastErrMsg = e?.message || 'unknown error';
          const isPerms = e?.code === 'permission-denied'
            || /permission|insufficient/i.test(lastErrMsg);
          if (isPerms) permsFail++; else otherFail++;
        }
      };

      for (const p of (invitees || [])) {
        await invite(p.uid, p.displayName);
      }
      for (const key of (memberKeys || [])) {
        const p = await getProfileByKey(key);
        if (!p) { badKeys++; continue; }
        await invite(p.uid, p.displayName);
      }

      // Build a precise toast based on what actually went wrong
      const parts = [];
      if (sent > 0)       parts.push(`${sent} invitation${sent === 1 ? '' : 's'} sent`);
      if (badKeys > 0)    parts.push(`${badKeys} key${badKeys === 1 ? '' : 's'} didn't match a user`);
      if (permsFail > 0)  parts.push(`${permsFail} blocked by Firestore rules — re-publish docs/firestore.rules`);
      if (otherFail > 0)  parts.push(`${otherFail} failed (${lastErrMsg})`);
      setToast(
        `Channel "${name}" created.${parts.length ? ' ' + parts.join('; ') + '.' : ''}`
      );
    } else {
      setToast(`Channel "${name}" created.`);
    }

    setShowNewChannel(false);
    openAndMarkRead(docRef.id);
  }, [user, profile, openAndMarkRead]);

  /* ── Join a public channel (add self to memberUids) ───── */
  const joinChannel = useCallback(async (channel) => {
    if (!user?.uid || !channel) return;
    if (channel.memberUids?.includes(user.uid)) {
      // Already a member — just open it
      openAndMarkRead(channel.id);
      return;
    }
    try {
      await updateDoc(doc(db, 'channels', channel.id), {
        memberUids: [...(channel.memberUids || []), user.uid],
        updatedAt:  serverTimestamp(),
      });
      setToast(`Joined "${channel.name}".`);
      openAndMarkRead(channel.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[chat] join failed:', err);
      const isPerms = err?.code === 'permission-denied'
        || /permission|insufficient/i.test(err?.message || '');
      const msg = isPerms
        ? 'Join blocked by Firestore rules. Re-publish docs/firestore.rules in Firebase Console (Firestore → Rules → Publish), then try again.'
        : (err?.message || 'unknown error');
      setToast(`Could not join: ${msg}`);
    }
  }, [user, openAndMarkRead]);

  /* ── Accept / decline an incoming invitation ──────────── */
  const handleAccept = useCallback(async (invite) => {
    try {
      await acceptInvite(invite);
      setToast(`Joined "${invite.channelName}".`);
      openAndMarkRead(invite.channelId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[chat] accept failed:', err);
      const msg = err?.code === 'permission-denied'
        ? 'Accept blocked by Firestore rules. Re-publish docs/firestore.rules.'
        : (err?.message || 'unknown error');
      setToast(`Could not accept: ${msg}`);
    }
  }, [openAndMarkRead]);

  const handleDecline = useCallback(async (invite) => {
    try {
      await declineInvite(invite);
      setToast(`Declined invitation to "${invite.channelName}".`);
    } catch (err) {
      setToast(`Could not decline: ${err?.message || 'unknown error'}`);
    }
  }, []);

  const handleCancel = useCallback(async (invite) => {
    try {
      await cancelInvite(invite);
      setToast(`Cancelled invitation to ${invite.inviteeName || 'that user'}.`);
    } catch (err) {
      setToast(`Could not cancel: ${err?.message || 'unknown error'}`);
    }
  }, []);

  /* ── Profile viewer state ──────────────────────────────────
     `profileUid` holds the uid of whoever's profile is currently being
     viewed. If it matches the signed-in user's uid we render the
     editable MyProfileDialog; otherwise we render the read-only
     MemberProfileDialog. Setting it to null closes the dialog. */
  const [profileUid, setProfileUid] = useState(null);
  const closeProfileDialog = useCallback(() => setProfileUid(null), []);

  /* Resolve the open channel from either list. */
  const openChannel = useMemo(
    () => allChannels.find(c => c.id === openChannelId) || null,
    [allChannels, openChannelId]
  );

  /* Auto-kick: if the channel I was viewing has just disappeared from
     my channel lists (most commonly because the owner banned me from
     a public channel, or removed me from a private one), bounce me
     back to the list with a clear toast so I'm not staring at a
     blank screen wondering what happened. */
  const lastOpenIdRef = useRef(null);
  useEffect(() => {
    if (openChannelId && !openChannel && channelsReady && lastOpenIdRef.current === openChannelId) {
      setToast('You no longer have access to that chat.');
      setOpenChannelId(null);
    }
    lastOpenIdRef.current = openChannelId;
  }, [openChannelId, openChannel, channelsReady]);

  return (
    <div className="ch-root chat-page-root">
      <div className="app-bg" aria-hidden="true">
        <div className="orb o1" /><div className="orb o2" />
        <div className="orb o3" /><div className="orb o4" /><div className="orb o5" />
      </div>
      <NavRail />

      <PageTourHost pageId="chat" />

      <div className="app-topbar" data-tour="tour-topbar">
        <div className="app-logo">
          <MinistryBrand />
          <span className="app-tab-tag">Chat</span>
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

      <main className="ch-main">
        {openChannel ? (
          /* ─── Full-area conversation view (replaces the list) ─── */
          <ConversationView
            channel={openChannel}
            currentUid={user?.uid}
            currentName={profile?.displayName || user?.displayName}
            onBack={() => setOpenChannelId(null)}
            onToast={setToast}
            onMarkRead={markChannelRead}
            onShowProfile={setProfileUid}
          />
        ) : openFounderRequest ? (
          <FounderRequestConversationView
            request={openFounderRequest}
            currentUid={user?.uid}
            currentName={profile?.displayName || user?.displayName}
            viewerIsFounder={founderUser}
            onBack={() => setOpenFounderRequestId(null)}
            onToast={setToast}
            onMarkRead={markChannelRead}
          />
        ) : (
          <>
        {/* ─── Filter row ─── */}
        <div className="ch-filterbar">
          <div className="ch-search">
            <span className="ch-search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="ch-search-input"
              placeholder="Search channels by name or description…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="ch-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>

          <div className="ch-type-chips">
            {[
              { v: 'all',      l: 'All' },
              { v: 'public',   l: '🌐 Public' },
              { v: 'private',  l: '🔒 Private' },
              { v: 'requests', l: '📨 Requests', badge: requestCount },
            ].map(t => (
              <button
                key={t.v}
                type="button"
                className={`ch-chip${typeFilter === t.v ? ' on' : ''}`}
                onClick={() => setTypeFilter(t.v)}
              >
                {t.l}
                {t.badge > 0 && <span className="ch-chip-badge">{t.badge}</span>}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ch-btn ch-btn-accent"
            data-tour="tour-primary-action"
            onClick={() => setShowNewChannel(true)}
          >
            + New channel
          </button>
        </div>

        {/* ─── Body: Requests tab OR channel grid ─── */}
        {typeFilter === 'requests' ? (
          <RequestsView
            incoming={incomingInvites}
            sent={sentInvites}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onCancel={handleCancel}
            twoWayIncoming={incomingTwoWay}
            twoWaySent={sentTwoWay}
            onTwoWayAccept={handleTwoWayAccept}
            onTwoWayDecline={handleTwoWayDecline}
          />
        ) : (
          <div className="ch-grid-wrap">
            {founderRequestRooms.length > 0 && !isSearching && (
              <div className="ch-founder-rooms">
                <div className="ch-founder-rooms-title">
                  {founderUser ? '💬 Requester chats' : '📨 Messages from the Founder'}
                </div>
                <div className="ch-grid">
                  {founderRequestRooms.map(r => (
                    <FounderRequestCard
                      key={r.id}
                      request={r}
                      viewerIsFounder={founderUser}
                      onOpen={() => openFounderRequestRoom(r.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {!channelsReady ? (
              <div className="ch-empty">Loading channels…</div>
            ) : filteredChannels.length === 0 ? (
              <div className="ch-empty">
                {isSearching
                  ? `No channels match "${query}".`
                  : (
                    <>
                      <div className="ch-empty-title">You haven&apos;t joined any channels yet.</div>
                      <div className="ch-empty-sub">
                        Type in the search bar above to discover public channels,
                        or create your own with the <strong>+ New channel</strong> button.
                        {requestCount > 0 && (
                          <> Or check the <strong>📨 Requests</strong> tab — you have {requestCount} pending.</>
                        )}
                      </div>
                    </>
                  )}
              </div>
            ) : (
              <div className="ch-grid">
                {filteredChannels.map(c => (
                  <ChannelCard
                    key={c.id}
                    channel={c}
                    joined={isJoined(c)}
                    currentUid={user?.uid}
                    lastReadMs={lastReads?.[c.id] || 0}
                    onOpen={() => openAndMarkRead(c.id)}
                    onJoin={() => joinChannel(c)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

          </>
        )}

        {/* ─── New-channel modal (renders on top of either view) ─── */}
        {showNewChannel && (
          <NewChannelDialog
            onCreate={createChannel}
            onCancel={() => setShowNewChannel(false)}
          />
        )}

        {/* ─── Profile dialogs ─── */}
        {profileUid && profileUid === user?.uid && profile && (
          <MyProfileDialog
            profile={profile}
            onCancel={closeProfileDialog}
            onToast={setToast}
          />
        )}
        {profileUid && profileUid !== user?.uid && (
          <MemberProfileDialog
            uid={profileUid}
            onCancel={closeProfileDialog}
          />
        )}

        {toast && (
          <div className="ch-toast" role="status">{toast}</div>
        )}
      </main>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="📋 Page Settings"
        pageSettings={<ChatPageSettings />}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Chat Page Settings — the body rendered inside the Profile
   modal's "Page Settings" tab. Chat doesn't have bespoke settings
   yet, but it follows the same sub-tab pill pattern as
   Friends/Prayers so the "How to Use" guide has a real home and
   future settings can slot in beside it without restructuring
   anything. */
function ChatPageSettings() {
  const [activeSub, setActiveSub] = useState('general');
  const SUB_TABS = [
    { id: 'general', label: '⚙', name: 'General' },
    { id: 'howto',   label: '❓', name: 'How to Use' },
  ];

  return (
    <div className="ch-ps-root">
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
            No Chat-specific settings yet.
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', maxWidth:340, lineHeight:1.55 }}>
            Chat themes live per-channel (owner-only, in a channel's ⚙ Settings). This tab is the
            future home for chat-wide preferences.
          </div>
        </div>
      )}

      {/* ───────── ❓ How to Use (howto sub-tab) ───────── */}
      {activeSub === 'howto' && (
      <div className="pm-ps-section">
        <div className="ch-ps-howto-header">
          <div className="pm-ps-section-title">❓ How to Use the Chat Page</div>
          <a
            className="ch-ps-howto-download"
            href={chatGuideDocxUrl}
            download="Chat - How to Use.docx"
          >
            ⬇ Download as Word doc
          </a>
        </div>

        <div className="ch-ps-howto-feedback">
          <span className="ch-ps-howto-feedback-ic">🛠</span>
          <span>
            <b>Something not working?</b> Go to <b>Settings → Feedback &amp; Requests</b> and
            click <b>+ New Request</b> to submit a bug report — it goes straight to the Founder.
          </span>
        </div>

        <div className="ch-ps-howto-intro">
          A full walkthrough of everything on this page — finding and creating channels, sending
          messages and files, managing members, and picking a channel theme. Skim the headers
          below or read start to finish.
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🌐🔒 Public vs. Private Channels</div>
          <div className="ch-ps-howto-p">
            Every channel is one of the two. <b>🌐 Public</b> channels show up in search for anyone
            signed in, and can be joined with a single click. <b>🔒 Private</b> channels are
            invite-only — they never appear in search unless you've been invited.
          </div>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🔍 Finding & Joining Channels</div>
          <ul className="ch-ps-howto-list">
            <li>Use <b>Search channels by name or description…</b> at the top to find public
              channels — matches happen as you type.</li>
            <li>When the search bar is empty, the list shows only channels you've already
              joined. Use the <b>🌐 Public</b> / <b>🔒 Private</b> filter chips to narrow it down.</li>
            <li>A public channel you haven't joined shows a <b>+ Join</b> button on its card —
              click it to join and open the channel.</li>
          </ul>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">✦ Creating a Channel</div>
          <div className="ch-ps-howto-p">
            Click <b>+ New channel</b> and fill in a name (required), an optional description, and
            pick 🌐 Public or 🔒 Private. You can invite people right away by searching your
            Contacts or pasting their identifying key — each becomes a removable chip. Invited
            people get an invitation card waiting for them in their own 📨 Requests tab.
          </div>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">📨 Requests & Invitations</div>
          <ul className="ch-ps-howto-list">
            <li><b>Invitations to you</b> — shows the channel name, description, and who invited
              you; <b>✓ Accept</b> to join, <b>✕ Decline</b> to reject.</li>
            <li><b>Invitations you've sent</b> — shows a <b>Cancel invite</b> button for anything
              still awaiting a response.</li>
            <li>Inside an open channel, click <b>+ Invite</b> in the header to invite more people
              at any time, the same way.</li>
            <li>The Requests chip shows a badge with your pending count.</li>
          </ul>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">💬 Sending Messages</div>
          <ul className="ch-ps-howto-list">
            <li>Type in the box at the bottom and click <b>Send</b> (pressing Return does not
              send).</li>
            <li>🙂 opens the emoji picker — browse by category or search, then click to insert.</li>
            <li>📎 attaches a file of any kind — images show an inline preview before you send;
              other files show a filename + size card. Add an optional caption, or click ✕ to
              discard before sending.</li>
            <li>A message that's <i>only</i> emoji renders extra-large with no bubble.</li>
            <li>Links in a message are automatically made clickable.</li>
            <li>Double-click any attachment in the thread to open it full-screen.</li>
          </ul>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🗑 Deleting Messages</div>
          <div className="ch-ps-howto-p">
            Hover a message to reveal its 🗑 icon — you can always delete your own messages, and
            the channel owner can delete anyone's. Deleting asks for confirmation first and
            removes it for everyone. There's no message editing — delete and resend instead.
          </div>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">⚙ Channel Settings</div>
          <div className="ch-ps-howto-p">
            Open a channel and click the ⚙ gear in its header for:
          </div>
          <ul className="ch-ps-howto-list">
            <li><b>Members</b> — see everyone in the channel; the owner is badged "Owner." The
              owner can remove members or hand ownership to someone else with <b>Give Ownership</b>.</li>
            <li><b>Chat theme</b> — owner-only. Pick from a set of preset color themes (Default,
              Ocean, Sunset, Forest, Lavender, Rose, Amber, Slate, and more) — it changes the
              channel's background and accent colors for every member.</li>
            <li><b>Files & photos</b> — every attachment ever shared in the channel, newest first;
              click one to preview it, or delete it if you're the uploader or the owner.</li>
            <li>At the bottom: owners see <b>🗑 Delete Chat</b> (removes the channel for everyone);
              everyone else sees <b>🚪 Remove from Chat</b> (leaves the channel). Owners must hand
              off ownership before they can leave instead of delete.</li>
          </ul>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🔔 Unread Badges</div>
          <div className="ch-ps-howto-p">
            Channel cards show a badge with your unread message count; it clears the moment you
            open that channel. The 📨 Requests chip badges your pending invitation count separately.
          </div>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🔗 Integrations</div>
          <ul className="ch-ps-howto-list">
            <li><b>Contacts</b> — the 💬 Chat button on an accepted contact starts a private 1:1
              channel with them here; it stays hidden on their side until they accept.</li>
            <li>Only your accepted Contacts and people you've previously invited show up when
              searching for someone to invite — Chat doesn't search the full member directory.</li>
          </ul>
        </div>

        <div className="ch-ps-howto-block">
          <div className="ch-ps-howto-h">🛠 Troubleshooting</div>
          <ul className="ch-ps-howto-list">
            <li><b>Send</b> stays disabled until you've typed something or attached a file.</li>
            <li><b>"You no longer have access to that chat."</b> — you were removed from (or, for a
              public channel, banned from) the channel; it will no longer appear in your list.</li>
            <li>A rules-related error when joining or inviting usually means the app's security
              rules need to be re-published — that's a founder-side fix, so report it via
              Settings → Feedback &amp; Requests.</li>
            <li>No typing indicators, read receipts, message editing, threads/replies, or
              reactions yet — messaging is intentionally kept simple for now.</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  );
}

/* ─── Channel card ─────────────────────────────────────────
   Shape:
   - Joined channels: the whole card is a button → opens conversation
   - Public channels the user hasn't joined: card is non-clickable, with
     a Join button in the footer. Joining adds them to memberUids and
     opens the conversation.
   Private channels the user isn't in never appear here (Firestore rules
   wouldn't return them anyway). */
function ChannelCard({ channel, joined, currentUid, lastReadMs, onOpen, onJoin }) {
  const memberCount = channel.memberUids?.length || 0;
  const isPrivate = channel.type === 'private';
  const description = (channel.description || '').trim();
  const canJoin = !joined && !isPrivate;

  /* Subscribe to unread count — only for joined channels, since
     non-joined private channels can't be read at all and the badge
     only makes sense for "things you might be missing". */
  const unread = useChannelUnread(
    joined ? channel.id : null,
    lastReadMs,
    currentUid
  );

  /* Stop the Join button from also triggering the card's onOpen. */
  const handleJoin = (e) => {
    e.stopPropagation();
    onJoin?.();
  };

  const bodyContent = (
    <>
      {joined && unread > 0 && (
        <span
          className="ch-card-unread"
          title={`${unread} unread message${unread === 1 ? '' : 's'}`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      <div className="ch-card-head">
        <span className={`ch-card-icon ${isPrivate ? 'ch-card-icon-private' : 'ch-card-icon-public'}`}>
          {isPrivate ? '🔒' : '#'}
        </span>
        <span className="ch-card-name" title={channel.name}>{channel.name}</span>
      </div>
      <div className="ch-card-desc">
        {description || <span className="ch-card-desc-empty">No description</span>}
      </div>
      <div className="ch-card-foot">
        <span className={`ch-card-tag${isPrivate ? ' priv' : ' pub'}`}>
          {isPrivate ? 'Private' : 'Public'}
        </span>
        <span className="ch-card-members">
          {memberCount} member{memberCount === 1 ? '' : 's'}
        </span>
        {canJoin && (
          <button
            type="button"
            className="ch-card-join"
            onClick={handleJoin}
          >
            + Join
          </button>
        )}
      </div>
    </>
  );

  /* Joined → entire card opens the conversation.
     Unjoined public → card is a static tile (decorative div); only the
     Join button is interactive. */
  if (joined) {
    return (
      <button type="button" className="ch-card" onClick={onOpen}>
        {bodyContent}
      </button>
    );
  }
  return (
    <div className="ch-card ch-card-discover" role="group">
      {bodyContent}
    </div>
  );
}

/* ─── Founder-request "room" card ───────────────────────────
   Lightweight card for a founderRequests thread — not a real
   channel, just a preview of the founder's message so the user
   can jump into FounderRequestConversationView below. */
function FounderRequestCard({ request, viewerIsFounder, onOpen }) {
  const last = request.lastMessage;
  const fromFounder = last?.senderRole === 'founder';
  /* From the founder's side "You:" means the founder wrote it; from
     the requester's side "You:" means they wrote it — flip the label
     for whichever role is actually looking at the card. */
  const lastWasMine = viewerIsFounder ? fromFounder : !fromFounder;
  const preview = last?.text
    ? `${lastWasMine ? 'You: ' : (fromFounder ? 'Founder: ' : `${request.senderName || 'Member'}: `)}${last.text}`
    : 'No messages yet';
  const cardName = viewerIsFounder
    ? (request.senderName || 'Member')
    : request.title;

  return (
    <button type="button" className="ch-card ch-card-founder" onClick={onOpen}>
      <div className="ch-card-head">
        <span className="ch-card-icon ch-card-icon-founder">📨</span>
        <span className="ch-card-name" title={cardName}>{cardName}</span>
      </div>
      {viewerIsFounder && (
        <div className="ch-card-desc-sub" title={request.title}>{request.title}</div>
      )}
      <div className="ch-card-desc">{preview}</div>
      <div className="ch-card-foot">
        <span className="ch-card-tag ch-card-tag-founder">
          {viewerIsFounder ? 'Requester' : 'Founder'}
        </span>
        {request.twoWayStatus === 'accepted' && (
          <span className="ch-card-members">Two-way open</span>
        )}
      </div>
    </button>
  );
}

/* ─── Conversation view (inline, full-area) ────────────────
   Replaces the chat list when a channel is open. Same .ch-main
   container, same gradient orb background — no modal frame, no
   backdrop. The page becomes the chat.

   Subscribes to messages, handles send/leave/delete/add-member.
   Calls onMarkRead(channelId) whenever new messages stream in so
   the parent can clear the unread badge in real time. */
function ConversationView({ channel, currentUid, currentName, onBack, onToast, onMarkRead, onShowProfile }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const messagesEndRef          = useRef(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showSettings, setShowSettings]   = useState(false);

  /* Pending attachment state — set when the user picks a file via the
     paperclip button. Cleared after the file is sent or canceled. */
  const fileInputRef            = useRef(null);
  const composeInputRef         = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadPct, setUploadPct]     = useState(0);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState(null);

  /* Emoji picker visibility. Click the 😀 button to toggle. */
  const [showEmoji, setShowEmoji] = useState(false);


  /* Channel info panel (status, members, description) collapses by
     default so the chat itself owns the visual space. Click the
     "Info" button next to the channel name to expand it. */
  const [showInfo, setShowInfo] = useState(false);

  /* Insert an emoji at the current cursor position in the draft.
     If the input isn't focused (cursor unknown), appends to the end. */
  const insertEmoji = (emoji) => {
    const input = composeInputRef.current;
    if (!input) {
      setDraft(prev => (prev || '') + emoji);
      return;
    }
    const start = input.selectionStart ?? draft.length;
    const end   = input.selectionEnd   ?? draft.length;
    const next  = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    /* Move the caret to right after the inserted emoji so typing
       continues naturally. */
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emoji.length;
      try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };

  /* Attachment double-click → opens this lightbox-style preview. */
  const [previewAttachment, setPreviewAttachment] = useState(null);

  /* Generate / revoke an object URL for image previews so the user can
     see what they're about to send (without re-uploading just for a
     thumbnail). Done in an effect so we always clean up. */
  useEffect(() => {
    if (!pendingFile || !pendingFile.type?.startsWith('image/')) {
      setPendingPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pendingFile]);

  /* Subscribe to messages */
  useEffect(() => {
    const q = fsQuery(
      collection(db, 'channels', channel.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] messages listen failed:', err?.message || err);
    });
  }, [channel.id]);

  /* Mark the channel read whenever the message list changes (including
     when new messages arrive while we're sitting in the conversation).
     The parent uses this to keep the unread badge at 0 for the open
     channel. Also fires once on mount so the count clears immediately. */
  useEffect(() => {
    onMarkRead?.(channel.id);
  }, [channel.id, messages.length, onMarkRead]);

  /* Auto-scroll on new messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  /* Back-to-list on Escape (replaces the old "close modal on Esc") */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onBack(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!currentUid) return;
    /* Require either some text OR a pending file — empty messages
       are pointless and the server would just reject them. */
    if (!text && !pendingFile) return;
    setSending(true);
    try {
      let attachment = null;
      if (pendingFile) {
        setUploadPct(0);
        attachment = await uploadChatFile({
          channelId: channel.id,
          file:      pendingFile,
          onProgress: setUploadPct,
        });
      }
      await addDoc(collection(db, 'channels', channel.id, 'messages'), {
        authorUid:  currentUid,
        authorName: currentName || 'Member',
        text,
        attachment,                  // null for text-only messages
        createdAt:  serverTimestamp(),
      });
      setDraft('');
      setPendingFile(null);
      setUploadPct(0);
    } catch (err) {
      onToast(`Could not send: ${err?.message || 'unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  /* User clicked the paperclip — open the OS file picker. */
  const triggerFilePick = () => {
    if (sending) return;
    fileInputRef.current?.click();
  };

  /* OS file picker returned a file. Validate size, then queue it. */
  const onFileChosen = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!f) return;
    if (f.size > CHAT_FILE_MAX_BYTES) {
      onToast(`File is too large. Max ${formatBytes(CHAT_FILE_MAX_BYTES)}.`);
      return;
    }
    setPendingFile(f);
  };

  const clearPendingFile = () => {
    if (sending) return;
    setPendingFile(null);
    setUploadPct(0);
  };

  const addMember = async (person, key) => {
    /* Invites work for both public AND private channels now. For public
       channels it's just a friendly "come join" ping (the recipient
       could've joined freely anyway); for private channels it's the
       only way in. `person` is already resolved (picked via search);
       `key` is the raw identifying-key fallback and still needs a
       lookup. */
    const p = person || await getProfileByKey(key);
    if (!p) { onToast('No user with that identifying key.'); return; }
    if (channel.memberUids?.includes(p.uid)) {
      onToast(`${p.displayName} is already in this chat.`);
      return;
    }
    /* Send an INVITATION instead of force-adding. The recipient sees
       it on their Chat page and chooses Accept or Decline. */
    try {
      await sendInvite({
        channel,
        inviteeUid:    p.uid,
        inviteeName:   p.displayName || 'Member',
        invitedByName: currentName,
      });
      onToast(`Invitation sent to ${p.displayName}.`);
      setShowAddMember(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[chat] sendInvite failed:', err);
      const isPerms = err?.code === 'permission-denied'
        || /permission|insufficient/i.test(err?.message || '');
      const msg = isPerms
        ? 'Invite blocked by Firestore rules. Re-publish docs/firestore.rules in Firebase Console (the /invites/ block is new), then try again.'
        : (err?.message || 'unknown error');
      onToast(`Couldn't send invitation: ${msg}`);
      // Don't close the dialog — let them retry without re-typing
    }
  };

  const leaveChannel = async () => {
    if (channel.ownerUid === currentUid) {
      onToast(`Owners can't leave their own channel — transfer ownership first or delete it.`);
      return;
    }
    try {
      await updateDoc(doc(db, 'channels', channel.id), {
        memberUids: channel.memberUids.filter(uid => uid !== currentUid),
        updatedAt:  serverTimestamp(),
      });
      setShowSettings(false);
      onBack();
      onToast(`Removed from "${channel.name}".`);
    } catch (err) {
      onToast(`Could not leave: ${err?.message || 'unknown error'}`);
    }
  };

  const deleteChannel = async () => {
    if (channel.ownerUid !== currentUid) return;
    if (!window.confirm(`Delete "${channel.name}"? This removes the channel and all its messages for everyone.`)) return;
    try {
      await deleteDoc(doc(db, 'channels', channel.id));
      setShowSettings(false);
      onBack();
      onToast('Channel deleted.');
    } catch (err) {
      onToast(`Delete failed: ${err?.message || 'unknown error'}`);
    }
  };

  /* Delete a single message — author always allowed; channel owner
     allowed for any message (rule enforces this server-side too).
     We don't bother deleting the attachment from Storage here; the
     Storage rule wouldn't let a non-author do it anyway, so for
     consistency we just leave the blob and clean up the doc. Orphan
     cleanup can be done later via a Cloud Function if needed. */
  const isOwner = channel.ownerUid === currentUid;
  const deleteMessage = async (msg) => {
    if (!msg?.id) return;
    const ok = window.confirm(
      msg.authorUid === currentUid
        ? 'Delete your message?'
        : `Delete ${msg.authorName || 'this member'}’s message?`
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'channels', channel.id, 'messages', msg.id));
    } catch (err) {
      onToast(`Could not delete: ${err?.message || 'unknown error'}`);
    }
  };

  /* Owner-only: remove a member from the channel.

     For PUBLIC channels we also append the uid to a `bannedUids`
     array on the channel doc. The Firestore rules deny banned users
     from rejoining the channel (isSelfJoinPublic) AND from reading
     or posting messages — so removal sticks. Otherwise a removed
     user could just hit Join again.

     For PRIVATE channels we don't need the ban list: rejoining
     requires an invite, and the owner controls future invites. */
  const removeMember = async (memberUid, memberName) => {
    if (!isOwner)                       return;
    if (memberUid === channel.ownerUid) return; // can't remove yourself this way
    const ok = window.confirm(
      channel.type === 'public'
        ? `Remove ${memberName || 'this member'} from "${channel.name}"? They won't be able to rejoin unless you unban them.`
        : `Remove ${memberName || 'this member'} from "${channel.name}"?`
    );
    if (!ok) return;
    try {
      const newMembers = (channel.memberUids || []).filter(uid => uid !== memberUid);
      const update = {
        memberUids: newMembers,
        updatedAt:  serverTimestamp(),
      };
      if (channel.type === 'public') {
        const existing = Array.isArray(channel.bannedUids) ? channel.bannedUids : [];
        if (!existing.includes(memberUid)) {
          update.bannedUids = [...existing, memberUid];
        }
      }
      await updateDoc(doc(db, 'channels', channel.id), update);
      onToast(`${memberName || 'Member'} removed from "${channel.name}".`);
    } catch (err) {
      onToast(`Could not remove: ${err?.message || 'unknown error'}`);
    }
  };

  /* Owner-only: change the channel's color theme. Stored on the
     channel doc so every member sees the same theme. */
  const setChannelTheme = async (themeId) => {
    if (!isOwner) return;
    if (!CHAT_THEMES.some(t => t.id === themeId)) return;
    try {
      await updateDoc(doc(db, 'channels', channel.id), {
        theme:     themeId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      onToast(`Could not change theme: ${err?.message || 'unknown error'}`);
    }
  };

  /* Transfer ownership to another member. After this, the current user
     becomes a regular member (so their settings panel will start showing
     "Remove from Chat" instead of "Delete Chat"). */
  const transferOwnership = async (toUid, toName) => {
    if (channel.ownerUid !== currentUid) return;
    if (!toUid || toUid === currentUid) return;
    if (!window.confirm(`Make ${toName || 'this member'} the new owner of "${channel.name}"? You'll become a regular member.`)) return;
    try {
      await updateDoc(doc(db, 'channels', channel.id), {
        ownerUid:  toUid,
        updatedAt: serverTimestamp(),
      });
      onToast(`${toName || 'They'} are now the owner.`);
    } catch (err) {
      onToast(`Could not transfer ownership: ${err?.message || 'unknown error'}`);
    }
  };

  const memberCount = channel.memberUids?.length || 0;
  const activeTheme = getChatTheme(channel.theme);

  return (
    <section className="ch-conv" style={themeStyle(activeTheme)}>
      {/* Theme decorations — pure visual flair behind everything. */}
      <ThemeDecorations themeId={activeTheme.id} />

      {/* Header strip — back button, channel info, actions */}
      <div className="ch-conv-head">
        <button
          type="button"
          className="ch-conv-back"
          onClick={onBack}
          aria-label="Back to channels"
          title="Back to channels (Esc)"
        >
          <span className="ch-conv-back-arrow" aria-hidden="true">←</span>
          <span className="ch-conv-back-label">Channels</span>
        </button>

        <div className="ch-conv-info">
          <div className="ch-conv-title">
            <span className={`ch-conv-icon ${channel.type === 'private' ? 'ch-card-icon-private' : 'ch-card-icon-public'}`}>
              {channel.type === 'private' ? '🔒' : '#'}
            </span>
            <span className="ch-conv-name">{channel.name}</span>
            {/* Toggle button — collapses/expands the info panel below
                the header. Replaces the always-on meta line that used
                to live right under the title. */}
            <button
              type="button"
              className={`ch-conv-info-toggle${showInfo ? ' open' : ''}`}
              onClick={() => setShowInfo(v => !v)}
              aria-expanded={showInfo}
              aria-controls="ch-conv-info-panel"
              title={showInfo ? 'Hide channel info' : 'Show channel info'}
            >
              <span className="ch-conv-info-toggle-icon" aria-hidden="true">
                {showInfo ? '▴' : '▾'}
              </span>
              <span className="ch-conv-info-toggle-label">Info</span>
            </button>
          </div>
        </div>

        <div className="ch-conv-actions">
          {/* Anyone can send invites — quick action stays in the header. */}
          <button
            type="button"
            className="ch-btn ch-btn-ghost ch-btn-sm"
            onClick={() => setShowAddMember(true)}
          >+ Invite</button>

          {/* Settings (members, ownership, leave/delete) — lives behind a
              single gear button so the header stays uncluttered. */}
          <button
            type="button"
            className="ch-btn ch-btn-ghost ch-btn-sm ch-conv-settings-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Channel settings"
            title="Settings"
          >⚙</button>
        </div>
      </div>

      {/* Collapsible channel info panel — Status / Members / Description.
          Slides down when the user clicks the "Info" button in the
          header. Hidden by default so the chat owns the visual space. */}
      <div
        id="ch-conv-info-panel"
        className={`ch-conv-info-panel${showInfo ? ' open' : ''}`}
        aria-hidden={!showInfo}
      >
        <div className="ch-conv-info-inner">
          <div className="ch-conv-info-row">
            <span className="ch-conv-info-label">Status</span>
            <span className="ch-conv-info-value">
              {channel.type === 'public'
                ? <><span aria-hidden="true">🌐</span> Public</>
                : <><span aria-hidden="true">🔒</span> Private</>}
            </span>
          </div>
          <div className="ch-conv-info-row">
            <span className="ch-conv-info-label">Members</span>
            <span className="ch-conv-info-value">
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="ch-conv-info-row">
            <span className="ch-conv-info-label">Description</span>
            <span className="ch-conv-info-value">
              {channel.description
                ? channel.description
                : <span className="ch-conv-info-empty">No description.</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="ch-conv-messages">
        {messages.length === 0 ? (
          <div className="ch-messages-empty">No messages yet — say hi 👋</div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const groupWithPrev = prev?.authorUid === m.authorUid;
            return (
              <MessageRow
                key={m.id}
                msg={m}
                mine={m.authorUid === currentUid}
                showAuthor={!groupWithPrev}
                onShowProfile={onShowProfile}
                onPreviewAttachment={setPreviewAttachment}
                /* Author can always delete their own; channel owner
                   can delete anyone's. */
                canDelete={m.authorUid === currentUid || isOwner}
                onDelete={deleteMessage}
                onToast={onToast}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose — text input, attach button, send. The pending-file
          preview and upload progress sit above the input row when
          relevant. */}
      <form className="ch-conv-compose" onSubmit={sendMessage}>
        {/* Pending attachment preview */}
        {pendingFile && (
          <div className="ch-pending-attachment">
            {pendingPreviewUrl ? (
              <img className="ch-pending-thumb" src={pendingPreviewUrl} alt="" />
            ) : (
              <div className="ch-pending-thumb ch-pending-thumb-file">📄</div>
            )}
            <div className="ch-pending-info">
              <div className="ch-pending-name">{pendingFile.name}</div>
              <div className="ch-pending-size">{formatBytes(pendingFile.size)}</div>
              {sending && uploadPct > 0 && uploadPct < 1 && (
                <div className="ch-pending-progress">
                  <div
                    className="ch-pending-progress-bar"
                    style={{ width: `${Math.round(uploadPct * 100)}%` }}
                  />
                  <span className="ch-pending-progress-text">
                    Uploading… {Math.round(uploadPct * 100)}%
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="ch-btn ch-btn-ghost ch-btn-sm"
              onClick={clearPendingFile}
              disabled={sending}
              aria-label="Remove attachment"
              title="Remove attachment"
            >✕</button>
          </div>
        )}

        {/* Hidden file input — opened by the paperclip button */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={onFileChosen}
          /* No `accept` restriction — user can send any file
             (images, video, audio, PDFs, docs, etc.) */
        />

        <div className="ch-compose-row">
          <button
            type="button"
            className="ch-btn ch-btn-ghost ch-compose-attach"
            onClick={triggerFilePick}
            disabled={sending}
            aria-label="Attach a file"
            title="Attach a file"
          >📎</button>

          {/* Emoji picker toggle. Wrapped in a relative container so
              the popover anchors to it. */}
          <div className="ch-emoji-wrap">
            <button
              type="button"
              className="ch-btn ch-btn-ghost ch-compose-attach"
              onClick={() => setShowEmoji(v => !v)}
              disabled={sending}
              aria-label="Insert emoji"
              aria-pressed={showEmoji}
              title="Insert emoji"
            >🙂</button>
            {showEmoji && (
              <EmojiPicker
                onPick={insertEmoji}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>

          <input
            ref={composeInputRef}
            type="text"
            className="ch-compose-input"
            placeholder={pendingFile
              ? 'Add a caption (optional)…'
              : `Message in ${channel.name}`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={sending}
            autoFocus
          />
          <button
            type="submit"
            className="ch-btn ch-btn-accent"
            disabled={sending || (!draft.trim() && !pendingFile)}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      {/* Add-member sub-modal (still modal — it's a small focused dialog) */}
      {showAddMember && (
        <AddMemberDialog
          channel={channel}
          onAdd={addMember}
          onCancel={() => setShowAddMember(false)}
        />
      )}

      {/* Settings sub-modal — members, ownership transfer, files,
          destructive action. Also lets the owner remove members and
          delete any message via the embedded Files & Photos list. */}
      {showSettings && (
        <ChannelSettingsDialog
          channel={channel}
          currentUid={currentUid}
          onTransferOwnership={transferOwnership}
          onRemoveMember={removeMember}
          onSetTheme={setChannelTheme}
          onDelete={deleteChannel}
          onLeave={leaveChannel}
          onCancel={() => setShowSettings(false)}
          onShowProfile={onShowProfile}
          onPreviewAttachment={setPreviewAttachment}
          onDeleteMessage={deleteMessage}
        />
      )}

      {/* Attachment full-screen preview (opened by double-clicking
          any sent file/image/video/audio). Visible to whoever opens
          it — driven by the message's `attachment` field which is
          identical for every user reading the conversation. */}
      {previewAttachment && (
        <AttachmentPreviewDialog
          att={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </section>
  );
}

/* ─── Founder-request conversation view ────────────────────
   Same look as ConversationView (reuses .ch-conv* classes and
   MessageRow) but backed by founderRequests/{id}/messages instead
   of a real channels/{id}/messages subcollection. One-way by
   default — the founder can always post; the sender can only
   reply once twoWayStatus is 'accepted', and otherwise sees a
   "request two-way chat" prompt instead of a compose box. */
function FounderRequestConversationView({ request, currentUid, currentName, viewerIsFounder, onBack, onToast, onMarkRead }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const q = fsQuery(
      collection(db, 'founderRequests', request.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      // eslint-disable-next-line no-console
      console.warn('[chat] founder request messages listen failed:', err?.message || err);
    });
  }, [request.id]);

  /* Same "mark read as messages stream in" pattern as ConversationView
     — keeps the Chat nav-tab badge in sync while this thread is open. */
  useEffect(() => {
    onMarkRead?.(request.id);
  }, [request.id, messages.length, onMarkRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onBack(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  /* The founder can always post (one-way by default); the requester
     can only post once the founder has accepted their two-way ask. */
  const canCompose = viewerIsFounder || request.twoWayStatus === 'accepted';

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !currentUid) return;
    setSending(true);
    try {
      await sendRequestMessage(request.id, { role: viewerIsFounder ? 'founder' : 'user', text });
      setDraft('');
    } catch (err) {
      onToast(`Could not send: ${err?.message || 'unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const sendTwoWayRequest = async (e) => {
    e?.preventDefault();
    setRequesting(true);
    try {
      await requestTwoWayAccess(request.id, note);
      setNote('');
    } catch (err) {
      onToast(`Could not send request: ${err?.message || 'unknown error'}`);
    } finally {
      setRequesting(false);
    }
  };

  /* Sender-only: acknowledge a one-way message and wipe the whole
     thread — the room then disappears from both the sender's AND the
     founder's Chat page (both only show it while it has messages). */
  const handleConfirmReceived = async () => {
    if (!window.confirm("Confirm received? This deletes this chat for both you and the founder.")) return;
    setClearing(true);
    try {
      await clearRequestMessages(request.id);
      onBack();
    } catch (err) {
      onToast(`Could not clear chat: ${err?.message || 'unknown error'}`);
      setClearing(false);
    }
  };

  /* Either side of an accepted two-way chat can delete the whole thread —
     wipes the messages subcollection, so the room disappears from both
     Chat pages (same underlying operation as "Confirm Received"). */
  const handleDeleteTwoWayChat = async () => {
    if (!window.confirm('Delete this chat? This removes it for both you and the other side.')) return;
    setClearing(true);
    try {
      await clearRequestMessages(request.id);
      onBack();
    } catch (err) {
      onToast(`Could not delete chat: ${err?.message || 'unknown error'}`);
      setClearing(false);
    }
  };

  return (
    <section className="ch-conv">
      <div className="ch-conv-head">
        <button
          type="button"
          className="ch-conv-back"
          onClick={onBack}
          aria-label="Back to channels"
          title="Back to channels (Esc)"
        >
          <span className="ch-conv-back-arrow" aria-hidden="true">←</span>
          <span className="ch-conv-back-label">Channels</span>
        </button>

        <div className="ch-conv-info">
          <div className="ch-conv-title">
            <span className="ch-conv-icon ch-card-icon-founder">📨</span>
            <span className="ch-conv-name">
              {viewerIsFounder ? (request.senderName || 'Member') : request.title}
            </span>
          </div>
        </div>

        {request.twoWayStatus === 'accepted' && (
          <div className="ch-conv-actions">
            <button
              type="button"
              className="ch-btn ch-btn-ghost ch-btn-sm"
              onClick={handleDeleteTwoWayChat}
              disabled={clearing}
              aria-label="Delete chat"
              title="Delete this chat for both sides"
            >{clearing ? 'Deleting…' : '🗑 Delete'}</button>
          </div>
        )}
      </div>

      <div className="ch-conv-messages">
        {messages.length === 0 ? (
          <div className="ch-messages-empty">No messages yet.</div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const mine = m.senderUid === currentUid;
            const otherName = viewerIsFounder ? (request.senderName || 'Member') : 'Founder';
            return (
              <MessageRow
                key={m.id}
                msg={{
                  authorUid: m.senderUid,
                  authorName: mine ? (currentName || 'You') : otherName,
                  text: m.text,
                  createdAt: m.createdAt,
                }}
                mine={mine}
                showAuthor={!prev || prev.senderUid !== m.senderUid}
                canDelete={false}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {canCompose ? (
        <form className="ch-conv-compose" onSubmit={sendMessage}>
          <div className="ch-compose-row">
            <input
              type="text"
              className="ch-compose-input"
              placeholder={viewerIsFounder ? 'Message the requester…' : 'Message the founder…'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              disabled={sending}
            />
            <button
              type="submit"
              className="ch-btn ch-btn-accent"
              disabled={sending || !draft.trim()}
            >Send</button>
          </div>
        </form>
      ) : (
        <form className="ch-freq-twoway-form" onSubmit={sendTwoWayRequest}>
          {!viewerIsFounder && messages.length > 0 && (
            <div className="ch-freq-confirm-row">
              <button
                type="button"
                className="ch-btn ch-btn-ghost ch-btn-sm"
                onClick={handleConfirmReceived}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : '✓ Confirm Received'}
              </button>
            </div>
          )}
          <div className="ch-freq-twoway-note">
            {request.twoWayStatus === 'requested'
              ? 'Waiting on the founder to accept two-way chat…'
              : request.twoWayStatus === 'declined'
                ? 'Your two-way chat request was declined. You can ask again below.'
                : "You can read messages from the founder here, but can't reply directly — request two-way chat to start a conversation."}
          </div>
          {request.twoWayStatus !== 'requested' && (
            <div className="ch-compose-row">
              <input
                type="text"
                className="ch-compose-input"
                placeholder="Optional note for the founder…"
                value={note}
                onChange={e => setNote(e.target.value)}
                disabled={requesting}
              />
              <button
                type="submit"
                className="ch-btn ch-btn-ghost"
                disabled={requesting}
              >Request Two-Way Chat</button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

/* Render an attachment based on its type. Images/videos/audio play
   inline; documents render as a download card. Double-clicking any
   attachment opens the full-screen preview modal (handled by the
   parent through `onPreview`). The wrapper carries the dbl-click
   handler so it fires consistently across all attachment shapes. */
function Attachment({ att, onPreview }) {
  if (!att?.url) return null;

  const handleDoubleClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    onPreview?.(att);
  };
  const previewTitle = 'Double-click to preview';

  if (att.type === 'image') {
    return (
      <div
        className="ch-msg-att-wrap ch-msg-att-image-link"
        onDoubleClick={handleDoubleClick}
        title={previewTitle}
      >
        <img className="ch-msg-att-image" src={att.url} alt={att.fileName || 'image'} />
      </div>
    );
  }
  if (att.type === 'video') {
    return (
      <div
        className="ch-msg-att-wrap"
        onDoubleClick={handleDoubleClick}
        title={previewTitle}
      >
        <video
          className="ch-msg-att-video"
          src={att.url}
          controls
          preload="metadata"
        />
      </div>
    );
  }
  if (att.type === 'audio') {
    return (
      <div
        className="ch-msg-att-wrap"
        onDoubleClick={handleDoubleClick}
        title={previewTitle}
      >
        <audio className="ch-msg-att-audio" src={att.url} controls preload="metadata" />
      </div>
    );
  }
  // Generic file card. The CARD itself is a div (no single-click
  // navigation) so dbl-click always fires reliably. The ↓ button at
  // the right is the explicit single-click action to open/download —
  // it stops propagation so a single click on it doesn't also bubble
  // up and confuse the dbl-click counter.
  const openInNewTab = (e) => { e.stopPropagation(); };
  return (
    <div
      className="ch-msg-att-file ch-msg-att-wrap"
      onDoubleClick={handleDoubleClick}
      title={previewTitle}
    >
      <span className="ch-msg-att-file-icon">📄</span>
      <span className="ch-msg-att-file-info">
        <span className="ch-msg-att-file-name">{att.fileName || 'file'}</span>
        <span className="ch-msg-att-file-size">{formatBytes(att.fileSize)}</span>
      </span>
      <a
        className="ch-msg-att-file-arrow"
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        download={att.fileName}
        onClick={openInNewTab}
        onDoubleClick={openInNewTab}
        aria-label="Open / download file"
        title="Open / download"
      >↓</a>
    </div>
  );
}

/* Try to fetch a remote file as plain text and render it. Used for
   text/markdown/json/csv/code preview. Returns loading/error states
   gracefully so a flaky fetch never breaks the modal. */
function TextPreview({ url }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(t => { if (!cancelled) { setText(t); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e?.message || String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);
  if (loading) return <div className="ch-hint">Loading text…</div>;
  if (err)     return <div className="ch-error">Couldn’t load text: {err}</div>;
  return <pre className="ch-preview-text">{text}</pre>;
}

/* Full-screen preview shown when a user double-clicks any attachment
   in a message. Closes on backdrop click, ✕ button, or Escape.
   Renders inline:
     • images / video / audio  → native element
     • PDFs                    → <iframe src=url>
     • Office docs (docx, xlsx, pptx, ppt, doc, xls) hosted at a
       public http(s) URL → Google Docs Viewer iframe
     • text-like formats (txt, md, csv, json, html, source code,
       text/*) → fetched + rendered inline
     • everything else (or office-doc-with-data-url) → metadata card
       with an Open/Download button (the OS opens it in the right app). */
function AttachmentPreviewDialog({ att, onClose }) {
  /* Close on Escape so the preview behaves like every other modal. */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!att?.url) return null;

  const mime  = (att.mimeType || '').toLowerCase();
  const name  = (att.fileName || '').toLowerCase();
  const url   = att.url;
  const isHttpUrl = url.startsWith('http://') || url.startsWith('https://');

  /* Type detectors. We check both MIME and filename extension so
     things still work when the browser-reported MIME is generic
     (application/octet-stream). */
  const isPdf = mime.includes('pdf') || /\.pdf$/i.test(name);
  const isOfficeDoc =
    /officedocument|ms-word|ms-excel|ms-powerpoint|msword/.test(mime) ||
    /\.(docx?|xlsx?|pptx?)$/i.test(name);
  const isTextLike =
    mime.startsWith('text/') ||
    /\b(json|xml|javascript|typescript|csv|yaml|x-yaml|markdown)\b/.test(mime) ||
    /\.(txt|md|markdown|csv|tsv|json|xml|yml|yaml|html?|css|jsx?|tsx?|py|rb|go|rs|c|h|cpp|hpp|java|kt|swift|sh|bash|zsh|log|ini|toml|env)$/i.test(name);

  /* The inner body. */
  let body;
  if (att.type === 'image') {
    body = <img className="ch-preview-image" src={url} alt={att.fileName || 'image'} />;
  } else if (att.type === 'video') {
    body = (
      <video
        className="ch-preview-video"
        src={url}
        controls
        autoPlay
        preload="metadata"
      />
    );
  } else if (att.type === 'audio') {
    body = (
      <div className="ch-preview-audio-card">
        <div className="ch-preview-audio-icon" aria-hidden="true">🎵</div>
        <div className="ch-preview-audio-name">{att.fileName || 'Audio'}</div>
        <div className="ch-preview-audio-size">{formatBytes(att.fileSize)}</div>
        <audio src={url} controls autoPlay />
      </div>
    );
  } else if (isPdf) {
    body = (
      <iframe
        className="ch-preview-iframe"
        src={url}
        title={att.fileName || 'document preview'}
      />
    );
  } else if (isOfficeDoc && isHttpUrl) {
    /* Google's free document viewer renders Word/Excel/PowerPoint in
       an iframe. Requires the file to be publicly fetchable, which
       Firebase Storage download URLs are (the token in the URL
       authorizes anyone with the link). */
    const viewerSrc = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    body = (
      <iframe
        className="ch-preview-iframe"
        src={viewerSrc}
        title={att.fileName || 'document preview'}
      />
    );
  } else if (isTextLike) {
    body = (
      <div className="ch-preview-text-wrap">
        <TextPreview url={url} />
      </div>
    );
  } else {
    body = (
      <div className="ch-preview-file-card">
        <div className="ch-preview-file-icon" aria-hidden="true">📄</div>
        <div className="ch-preview-file-name">{att.fileName || 'File'}</div>
        <div className="ch-preview-file-meta">
          {att.mimeType || 'file'} · {formatBytes(att.fileSize)}
        </div>
        {isOfficeDoc && !isHttpUrl && (
          <div className="ch-hint" style={{ maxWidth: 360 }}>
            This Office document is stored inline (Firebase Storage isn’t
            available). Open it in Word / Excel / PowerPoint to view.
          </div>
        )}
        <a
          className="ch-btn ch-btn-accent ch-preview-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={att.fileName}
        >Open / Download</a>
      </div>
    );
  }

  return (
    <div className="ch-preview-backdrop" onClick={onClose}>
      <div className="ch-preview-window" onClick={e => e.stopPropagation()}>
        <div className="ch-preview-head">
          <div className="ch-preview-title" title={att.fileName}>
            {att.fileName || 'Attachment'}
            <span className="ch-preview-size">
              {att.fileSize ? ` · ${formatBytes(att.fileSize)}` : ''}
            </span>
          </div>
          <div className="ch-preview-actions">
            <a
              className="ch-btn ch-btn-ghost ch-btn-sm"
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              download={att.fileName}
              title="Download / open in new tab"
            >↓</a>
            <button
              type="button"
              className="ch-btn ch-btn-ghost ch-btn-sm"
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
            >✕</button>
          </div>
        </div>
        <div className="ch-preview-body">
          {body}
        </div>
      </div>
    </div>
  );
}

/* Renders the special "Studio share" card that appears inside chat
   messages when a Studio project was shared. Three variants:
     - message: "Just share" — informational card next to the inline
       audio attachment; not clickable.
     - copy:    "Send a copy" — recipient double-clicks to import +
       open in their Studio. Sender double-clicks to navigate to
       their own copy of the project.
     - live:    "Collaborate live" — double-click opens the shared
       project in the Studio for either user. */
function StudioShareCard({ share, mine, onToast }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!share?.kind) return null;

  const isMessage = share.kind === 'message';
  const isCopy    = share.kind === 'copy';
  const isLive    = share.kind === 'live';

  const trackText = `${share.trackCount || 0} track${(share.trackCount || 0) === 1 ? '' : 's'}`;

  const handleDoubleClick = async () => {
    if (busy) return;
    if (isMessage) return;
    setBusy(true);
    try {
      if (isLive && share.sharedId) {
        /* Recipient must explicitly accept before the shared project
           appears in their Studio sidebar. The sender is already in
           acceptedUids from creation, so acceptInvite is a no-op for
           them. The Studio's subscription will then pick the project
           up + the auto-open hook below opens it. */
        if (!mine) {
          await sharedStudioProjectService.acceptInvite(share.sharedId);
          onToast?.(`Joined collaboration on "${share.projectName || 'project'}".`);
        }
        sessionStorage.setItem('mt:open-shared', share.sharedId);
        navigate('/worship/production/multitrack');
      } else if (isCopy && share.shareId) {
        if (mine) {
          navigate('/worship/production/multitrack');
        } else {
          const project = await studioShareService.importShare(share.shareId);
          onToast?.(`Imported "${project?.name || share.projectName}" to your Studio.`);
          if (project?.id) sessionStorage.setItem('mt:open-personal', project.id);
          navigate('/worship/production/multitrack');
        }
      }
    } catch (err) {
      onToast?.(`Could not open: ${err?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const icon =
      isLive    ? '🤝'
    : isCopy    ? '📥'
    :             '🎚';
  const kindLabel =
      isLive    ? 'Collaborate live'
    : isCopy    ? (mine ? 'You sent a copy' : 'Sent you a copy')
    :             (mine ? 'You shared a Studio project' : 'Shared a Studio project');

  return (
    <div
      className={`ch-studio-share ch-studio-share-${share.kind}${isMessage ? '' : ' clickable'}`}
      onDoubleClick={handleDoubleClick}
      title={
        isMessage ? undefined
      : busy      ? 'Opening…'
      : isLive    ? 'Double-click to open this collaboration in your Studio'
      :             (mine ? 'Double-click to go to your Studio' : 'Double-click to import to your Studio')
      }
    >
      <div className="ch-studio-share-icon" aria-hidden="true">{icon}</div>
      <div className="ch-studio-share-info">
        <div className="ch-studio-share-label">{kindLabel}</div>
        <div className="ch-studio-share-name">{share.projectName || 'Studio project'}</div>
        <div className="ch-studio-share-meta">
          {trackText}
          {isMessage && <span className="ch-studio-share-hint"> · play below ↓</span>}
          {isLive && (
            <span className="ch-studio-share-hint">
              {mine
                ? ' · double-click to open'
                : ' · double-click to join + open'}
            </span>
          )}
          {isCopy && !mine && <span className="ch-studio-share-hint"> · double-click to import</span>}
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  msg, mine, showAuthor, onShowProfile, onPreviewAttachment,
  canDelete, onDelete, onToast,
}) {
  const time = msg.createdAt?.toDate
    ? msg.createdAt.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  /* Clicking the author opens that person's profile. For "You" rows we
     pass our own uid (msg.authorUid) too, so the page renders the
     editable MyProfileDialog instead of the read-only one. */
  const handleAuthor = () => onShowProfile?.(msg.authorUid);
  return (
    <div className={`ch-msg${mine ? ' mine' : ''}`}>
      {showAuthor && (
        <div className="ch-msg-author">
          <button
            type="button"
            className="ch-msg-author-btn"
            onClick={handleAuthor}
            title="View profile"
          >
            {mine ? 'You' : (msg.authorName || 'Member')}
          </button>
          {time && <span className="ch-msg-time"> · {time}</span>}
        </div>
      )}
      <div className="ch-msg-body">
        {msg.studioShare && (
          <StudioShareCard
            share={msg.studioShare}
            mine={mine}
            onToast={onToast}
          />
        )}
        {msg.attachment && (
          <Attachment att={msg.attachment} onPreview={onPreviewAttachment} />
        )}
        {msg.text && (() => {
          /* If this message has no attachment AND consists purely of
             emojis, render it big + bubble-less. Otherwise render the
             normal text bubble with link auto-detection. */
          const jumboSize = !msg.attachment ? getEmojiOnlySize(msg.text) : null;
          if (jumboSize) {
            return (
              <div
                className="ch-msg-emojis"
                style={{ fontSize: `${jumboSize}px` }}
              >
                {msg.text}
              </div>
            );
          }
          return (
            <div className="ch-msg-bubble">{renderTextWithLinks(msg.text)}</div>
          );
        })()}
        {canDelete && (
          <button
            type="button"
            className="ch-msg-delete"
            onClick={() => onDelete?.(msg)}
            aria-label="Delete message"
            title="Delete message"
          >🗑</button>
        )}
      </div>
    </div>
  );
}

/* New-channel modal — name, description, type, optional members. */
function NewChannelDialog({ onCreate, onCancel }) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [type, setType]               = useState('public');
  const [invitees, setInvitees]       = useState([]); // [{ uid, displayName }]
  const [keysText, setKeysText]       = useState('');
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState('');

  const addInvitee = (p) => {
    setInvitees(prev => prev.some(x => x.uid === p.uid) ? prev : [...prev, p]);
  };
  const removeInvitee = (uid) => {
    setInvitees(prev => prev.filter(x => x.uid !== uid));
  };

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Channel name is required.'); return; }
    setBusy(true);
    setErr('');
    try {
      const memberKeys = keysText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        type,
        invitees,
        memberKeys,
      });
    } catch (e) {
      setErr(e?.message || 'Failed to create channel.');
      setBusy(false);
    }
  }

  return (
    <div className="ch-modal-backdrop" onClick={onCancel}>
      <div className="ch-modal" onClick={e => e.stopPropagation()}>
        <div className="ch-modal-head">
          <span className="ch-modal-title">New channel</span>
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onCancel}>✕</button>
        </div>
        <form className="ch-modal-body" onSubmit={submit}>
          {err && <div className="ch-error">{err}</div>}

          <label className="ch-field">
            <span className="ch-field-lbl">Channel name</span>
            <input
              type="text"
              className="ch-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Worship Team"
              autoFocus
            />
          </label>

          <label className="ch-field">
            <span className="ch-field-lbl">Description (shown on the card)</span>
            <textarea
              className="ch-input ch-textarea-plain"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this channel for?"
            />
          </label>

          <div className="ch-field">
            <span className="ch-field-lbl">Type</span>
            <div className="ch-radio-group">
              <label className={`ch-radio${type === 'public' ? ' on' : ''}`}>
                <input type="radio" checked={type === 'public'} onChange={() => setType('public')} />
                <span><strong>🌐 Public</strong> — anyone signed in can join</span>
              </label>
              <label className={`ch-radio${type === 'private' ? ' on' : ''}`}>
                <input type="radio" checked={type === 'private'} onChange={() => setType('private')} />
                <span><strong>🔒 Private</strong> — invite-only by identifying key</span>
              </label>
            </div>
          </div>

          <label className="ch-field">
            <span className="ch-field-lbl">Send invitations</span>
            <PersonSearchBox
              excludeUids={invitees.map(p => p.uid)}
              onPick={addInvitee}
            />
            {invitees.length > 0 && (
              <div className="ch-person-chips">
                {invitees.map(p => (
                  <span key={p.uid} className="ch-person-chip">
                    <span className="ch-person-chip-name">{p.displayName || 'Member'}</span>
                    <button
                      type="button"
                      className="ch-person-chip-remove"
                      onClick={() => removeInvitee(p.uid)}
                      aria-label={`Remove ${p.displayName || 'Member'}`}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}
            <span className="ch-field-lbl">
              Or enter identifying keys directly
              <span className="ch-field-hint-inline"> — one per line</span>
            </span>
            <div className="ch-input-with-paste ch-input-with-paste-block">
              <textarea
                className="ch-input ch-textarea"
                rows={3}
                value={keysText}
                onChange={e => setKeysText(e.target.value)}
                placeholder="ABCD-EFGH&#10;JKMN-PQRS"
              />
              <PasteButton
                label="identifying key"
                onPaste={(text) => {
                  const cleaned = text.trim();
                  if (!cleaned) return;
                  /* Append on a new line if there's already content, so
                     you can paste multiple keys one after another. */
                  setKeysText(prev =>
                    prev.trim()
                      ? `${prev.replace(/\s+$/, '')}\n${cleaned}`
                      : cleaned
                  );
                }}
              />
            </div>
            <span className="ch-hint">
              {type === 'private'
                ? <>Each person will get an invitation they can <strong>Accept</strong> or <strong>Decline</strong> on their own Chat page. You can also leave this blank and invite people later from inside the channel.</>
                : <>Each person will get an invitation on their own Chat page — though since this channel is public, they can also just join it directly anytime. You can also leave this blank and invite people later from inside the channel.</>
              }
            </span>
          </label>

          <div className="ch-modal-actions">
            <button type="button" className="ch-btn ch-btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="ch-btn ch-btn-accent" disabled={busy}>
              {busy ? 'Creating…' : 'Create channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Add-member sub-modal (used inside the conversation overlay). */
function AddMemberDialog({ channel, onAdd, onCancel }) {
  const [picked, setPicked] = useState(null); // { uid, displayName } | null
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!picked && !key.trim()) { setErr('Search for a person, or enter an identifying key.'); return; }
    setBusy(true);
    setErr('');
    try {
      await onAdd(picked, key.trim());
      setPicked(null);
      setKey('');
    } catch (e) {
      setErr(e?.message || 'Failed to add.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ch-modal-backdrop" onClick={onCancel}>
      <div className="ch-modal" onClick={e => e.stopPropagation()}>
        <div className="ch-modal-head">
          <span className="ch-modal-title">Invite to {channel.name}</span>
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onCancel}>✕</button>
        </div>
        <form className="ch-modal-body" onSubmit={submit}>
          {err && <div className="ch-error">{err}</div>}
          <label className="ch-field">
            <span className="ch-field-lbl">Who to invite</span>
            {picked ? (
              <span className="ch-person-chip">
                <span className="ch-person-chip-name">{picked.displayName || 'Member'}</span>
                <button
                  type="button"
                  className="ch-person-chip-remove"
                  onClick={() => setPicked(null)}
                  aria-label={`Remove ${picked.displayName || 'Member'}`}
                >✕</button>
              </span>
            ) : (
              <PersonSearchBox
                excludeUids={channel.memberUids || []}
                onPick={setPicked}
                autoFocus
              />
            )}
          </label>
          <label className="ch-field">
            <span className="ch-field-lbl">
              Or enter their identifying key directly
            </span>
            <div className="ch-input-with-paste">
              <input
                type="text"
                className="ch-input"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="ABCD-EFGH"
                disabled={Boolean(picked)}
              />
              <PasteButton
                label="identifying key"
                onPaste={(text) => setKey(text.trim())}
              />
            </div>
            <span className="ch-hint">
              They'll receive an invitation on their Chat page and choose
              <strong> Accept</strong> or <strong>Decline</strong>.
            </span>
          </label>
          <div className="ch-modal-actions">
            <button type="button" className="ch-btn ch-btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="ch-btn ch-btn-accent" disabled={busy}>
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Channel settings dialog ───────────────────────────────
   Single place for the destructive / privileged actions:
   - Members list with role badges
   - Owners can hand off ownership to any other member
   - Owners see "Delete Chat" (red) at the bottom
   - Non-owners see "Remove from Chat" (red) at the bottom

   After an owner transfers ownership, they become a regular member —
   the bottom button flips from Delete to Remove automatically because
   the parent's `channel.ownerUid` updates via onSnapshot. */
function ChannelSettingsDialog({
  channel, currentUid,
  onTransferOwnership, onRemoveMember, onSetTheme,
  onDelete, onLeave, onCancel, onShowProfile,
  onPreviewAttachment, onDeleteMessage,
}) {
  const isOwner = channel.ownerUid === currentUid;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyTransfer, setBusyTransfer] = useState(null); // uid being promoted
  const [busyRemove, setBusyRemove]     = useState(null); // uid being removed
  const [busyDestructive, setBusyDestructive] = useState(false);

  /* Subscribe to the last 200 messages and keep only the ones with an
     attachment — that's the Files & Photos list. Re-renders in real
     time when files are sent or deleted. */
  const [attachments, setAttachments] = useState([]);
  useEffect(() => {
    if (!channel?.id) return;
    const q = fsQuery(
      collection(db, 'channels', channel.id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(200),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.attachment?.url);
      setAttachments(list);
    }, () => setAttachments([]));
  }, [channel?.id]);

  /* Fetch profile docs for every member uid in the channel. The profile
     read rule allows any signed-in user to read /users/{uid}, so this
     works for everyone (member or not). Fails silently per-user so a
     missing profile doesn't break the whole list. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const uids = channel.memberUids || [];
    (async () => {
      const list = await Promise.all(uids.map(async (uid) => {
        try {
          const p = await getProfileByUid(uid);
          return p || { uid, displayName: 'Member' };
        } catch {
          return { uid, displayName: 'Member' };
        }
      }));
      if (cancelled) return;
      // Owner first, then alphabetical
      list.sort((a, b) => {
        if (a.uid === channel.ownerUid) return -1;
        if (b.uid === channel.ownerUid) return 1;
        return (a.displayName || '').localeCompare(b.displayName || '');
      });
      setMembers(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [channel.memberUids, channel.ownerUid]);

  const handleTransfer = async (toUid, toName) => {
    setBusyTransfer(toUid);
    try { await onTransferOwnership(toUid, toName); }
    finally { setBusyTransfer(null); }
  };

  const handleRemoveMember = async (uid, name) => {
    setBusyRemove(uid);
    try { await onRemoveMember?.(uid, name); }
    finally { setBusyRemove(null); }
  };

  const handleDestructive = async () => {
    setBusyDestructive(true);
    try {
      if (isOwner) await onDelete();
      else         await onLeave();
    } finally {
      setBusyDestructive(false);
    }
  };

  return (
    <div className="ch-modal-backdrop" onClick={onCancel}>
      <div className="ch-modal ch-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="ch-modal-head">
          <span className="ch-modal-title">⚙ Settings · {channel.name}</span>
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onCancel}>✕</button>
        </div>

        <div className="ch-modal-body">
          {/* Members list */}
          <div className="ch-field">
            <span className="ch-field-lbl">
              Members ({channel.memberUids?.length || 0})
            </span>
            {loading ? (
              <div className="ch-hint">Loading members…</div>
            ) : (
              <ul className="ch-members-list">
                {members.map(m => {
                  const isThisOwner = m.uid === channel.ownerUid;
                  const isMe        = m.uid === currentUid;
                  const canPromote  = isOwner && !isThisOwner;
                  return (
                    <li key={m.uid} className="ch-member-row">
                      <div className="ch-member-info">
                        <button
                          type="button"
                          className="ch-member-name ch-member-name-btn"
                          onClick={() => onShowProfile?.(m.uid)}
                          title="View profile"
                        >
                          {m.displayName || 'Member'}
                          {isMe && <span className="ch-member-you"> (you)</span>}
                        </button>
                        {isThisOwner && (
                          <span className="ch-member-role">Owner</span>
                        )}
                        {m.identifyingKey && (
                          <span className="ch-member-key">{m.identifyingKey}</span>
                        )}
                      </div>
                      {canPromote && (
                        <button
                          type="button"
                          className="ch-btn ch-btn-ghost ch-btn-sm"
                          onClick={() => handleTransfer(m.uid, m.displayName)}
                          disabled={busyTransfer !== null || busyRemove !== null}
                        >
                          {busyTransfer === m.uid ? 'Transferring…' : 'Give Ownership'}
                        </button>
                      )}
                      {isOwner && !isThisOwner && (
                        <button
                          type="button"
                          className="ch-btn ch-btn-danger-ghost ch-btn-sm"
                          onClick={() => handleRemoveMember(m.uid, m.displayName)}
                          disabled={busyRemove !== null || busyTransfer !== null}
                          title="Remove this member from the channel"
                        >
                          {busyRemove === m.uid ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Chat theme picker — OWNER ONLY, positioned between the
              Members list and the Files & Photos list. Non-owners see
              no theme UI at all (they still get the themed look
              automatically, since that's driven by channel.theme on
              the channel doc — they just can't change it). */}
          {isOwner && (
            <div className="ch-field">
              <span className="ch-field-lbl">Chat theme</span>
              <div className="ch-theme-select-wrap">
                <span
                  className="ch-theme-select-swatch"
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(135deg, ${
                      getChatTheme(channel.theme).accent
                    } 0%, ${getChatTheme(channel.theme).secondary} 100%)`,
                  }}
                />
                <select
                  className="ch-input ch-theme-select"
                  value={channel.theme || 'default'}
                  onChange={(e) => onSetTheme?.(e.target.value)}
                  aria-label="Select chat theme"
                >
                  {CHAT_THEMES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <span className="ch-hint">
                Only you (the channel owner) can change this. Members
                see the theme but can't pick it.
              </span>
            </div>
          )}

          {/* ── Files & Photos ────────────────────────────────
              Every attachment shared in the channel, newest first.
              Click row → preview. Delete shows for the sender of the
              attachment, and for the channel owner. */}
          <div className="ch-field">
            <span className="ch-field-lbl">
              Files & photos ({attachments.length})
            </span>
            {attachments.length === 0 ? (
              <div className="ch-hint">No files shared yet.</div>
            ) : (
              <ul className="ch-files-list">
                {attachments.map(msg => {
                  const a = msg.attachment;
                  const canDelete = msg.authorUid === currentUid || isOwner;
                  return (
                    <li key={msg.id} className="ch-file-row">
                      <button
                        type="button"
                        className="ch-file-preview-btn"
                        onClick={() => onPreviewAttachment?.(a)}
                        title="Click to preview"
                      >
                        {a.type === 'image' && a.url ? (
                          <img
                            className="ch-file-thumb"
                            src={a.url}
                            alt={a.fileName || 'image'}
                          />
                        ) : (
                          <div className={`ch-file-thumb ch-file-thumb-${a.type || 'file'}`}>
                            {a.type === 'video' ? '🎬'
                              : a.type === 'audio' ? '🎵'
                              : '📄'}
                          </div>
                        )}
                        <div className="ch-file-meta">
                          <div className="ch-file-name" title={a.fileName}>
                            {a.fileName || 'file'}
                          </div>
                          <div className="ch-file-submeta">
                            {formatBytes(a.fileSize)} · {msg.authorName || 'Member'}
                          </div>
                        </div>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          className="ch-btn ch-btn-danger-ghost ch-btn-sm"
                          onClick={() => onDeleteMessage?.(msg)}
                          title="Delete this attachment"
                          aria-label="Delete"
                        >🗑</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Destructive action — bottom-anchored, red */}
        <div className="ch-modal-actions ch-settings-destructive">
          <button
            type="button"
            className="ch-btn ch-btn-danger"
            onClick={handleDestructive}
            disabled={busyDestructive}
          >
            {busyDestructive
              ? (isOwner ? 'Deleting…' : 'Removing…')
              : (isOwner ? '🗑 Delete Chat' : '🚪 Remove from Chat')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── My Profile dialog (editable) ──────────────────────────
   Opens when the current user clicks their own initials avatar
   or their "You" name in a message. Editable fields:
     • displayName
     • ministryName  (e.g. "Trinity Church Worship Team")
     • ministryType  (selected from MINISTRY_TYPES dropdown)
   Read-only: identifying key (copyable) and email. */
function MyProfileDialog({ profile, onCancel, onToast }) {
  const [displayName, setDisplayName]   = useState(profile?.displayName || '');
  const [ministryName, setMinistryName] = useState(profile?.ministryName || '');
  const [logo, setLogo]                 = useState(profile?.logo || '');
  const [logoErr, setLogoErr]           = useState('');
  /* Backwards-compatible init: if the profile was saved earlier as a
     single `ministryType` string, seed the multi-select with it. */
  const [ministryTypes, setMinistryTypes] = useState(
    Array.isArray(profile?.ministryTypes)
      ? profile.ministryTypes
      : profile?.ministryType
        ? [profile.ministryType]
        : []
  );
  const [bio, setBio]                   = useState(profile?.bio || '');
  /* Default to visible when no value is set, so existing profiles that
     pre-date this field stay in their previous (visible) state. Users
     who want privacy uncheck the box. */
  const [emailVisible, setEmailVisible] = useState(profile?.emailVisible !== false);
  const [phone, setPhone]               = useState(profile?.phone || '');
  const [phoneVisible, setPhoneVisible] = useState(profile?.phoneVisible !== false);
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');
  const [copied, setCopied]             = useState(false);

  /* Toggle one type in/out of the selected set. */
  const toggleType = (t) => {
    setMinistryTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const copyKey = async () => {
    if (!profile?.identifyingKey) return;
    const ok = await copyToClipboard(profile.identifyingKey);
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
    setBusy(true);
    setErr('');
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName:   displayName.trim(),
        ministryName:  ministryName.trim(),
        logo:          logo || '',
        ministryTypes: ministryTypes,
        bio:           bio.trim(),
        ...contactFields({ emailVisible, phone, phoneVisible }),
      });
      onToast?.('Profile saved.');
      onCancel();
    } catch (ex) {
      setErr(ex?.message || 'Failed to save profile.');
      setBusy(false);
    }
  };

  return (
    <div className="ch-modal-backdrop" onClick={onCancel}>
      <div className="ch-modal" onClick={e => e.stopPropagation()}>
        <div className="ch-modal-head">
          <span className="ch-modal-title">Your Profile</span>
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onCancel}>✕</button>
        </div>
        <form className="ch-modal-body" onSubmit={submit}>
          {err && <div className="ch-error">{err}</div>}

          {/* Initials + key + email — read-only context */}
          <div className="ch-profile-meta">
            <div className="ch-profile-meta-row">
              <div className={`ch-profile-avatar${profile?.avatar ? ' has-img' : ''}`}>
                {profile?.avatar ? <CustomAvatar avatar={profile.avatar} /> : getInitials(displayName || profile?.displayName)}
              </div>
              <div className="ch-profile-meta-text">
                {profile?.email && (
                  <div className="ch-profile-email">{profile.email}</div>
                )}
                {profile?.identifyingKey && (
                  <button
                    type="button"
                    className={`ch-keychip${copied ? ' ch-keychip-copied' : ''}`}
                    onClick={copyKey}
                    title="Click to copy your identifying key"
                  >
                    <span className="ch-keychip-label">Your key</span>
                    <span className="ch-keychip-value">{profile.identifyingKey}</span>
                    <span className="ch-keychip-action">{copied ? '✓' : '⧉'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Email visibility toggle — when off, other members won't
                see your email in their read-only profile view. */}
            {profile?.email && (
              <label className="ch-profile-toggle">
                <input
                  type="checkbox"
                  checked={emailVisible}
                  onChange={e => setEmailVisible(e.target.checked)}
                />
                <span className="ch-profile-toggle-text">
                  Show my email to other members
                </span>
              </label>
            )}
          </div>

          <label className="ch-field">
            <span className="ch-field-lbl">Phone number</span>
            <input
              type="tel"
              className="ch-input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. (555) 123-4567"
            />
          </label>

          {phone.trim() && (
            <label className="ch-profile-toggle">
              <input
                type="checkbox"
                checked={phoneVisible}
                onChange={e => setPhoneVisible(e.target.checked)}
              />
              <span className="ch-profile-toggle-text">
                Show my phone number to other members
              </span>
            </label>
          )}

          <label className="ch-field">
            <span className="ch-field-lbl">Display name</span>
            <input
              type="text"
              className="ch-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoFocus
            />
          </label>

          <label className="ch-field">
            <span className="ch-field-lbl">Ministry name</span>
            <input
              type="text"
              className="ch-input"
              value={ministryName}
              onChange={e => setMinistryName(e.target.value)}
              placeholder="e.g. Trinity Church Worship Team"
            />
          </label>

          <div className="ch-field">
            <span className="ch-field-lbl">
              Ministry logo
              <span className="ch-field-hint-inline">{' '}— shown in your header</span>
            </span>
            <div className="ch-logo-row">
              <div className="ch-logo-preview">
                {logo
                  ? <img src={logo} alt="Ministry logo preview" />
                  : <span className="ch-logo-placeholder" aria-hidden="true">⛪</span>}
              </div>
              <div className="ch-logo-actions">
                <label className="ch-btn ch-btn-ghost ch-btn-sm ch-logo-btn">
                  {logo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/*" onChange={onLogoPick} hidden />
                </label>
                {logo && (
                  <button
                    type="button"
                    className="ch-logo-remove"
                    onClick={() => { setLogo(''); setLogoErr(''); }}
                  >Remove</button>
                )}
              </div>
            </div>
            {logoErr && <div className="ch-error">{logoErr}</div>}
          </div>

          <div className="ch-field">
            <span className="ch-field-lbl">
              Type of ministry
              <span className="ch-field-hint-inline">
                {' '}— pick any that apply
              </span>
            </span>
            <div className="ch-ministry-chips">
              {MINISTRY_TYPES.map(t => {
                const on = ministryTypes.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    className={`ch-ministry-chip${on ? ' on' : ''}`}
                    onClick={() => toggleType(t)}
                    aria-pressed={on}
                  >
                    {on && <span aria-hidden="true">✓ </span>}
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="ch-field">
            <span className="ch-field-lbl">About you</span>
            <textarea
              className="ch-input ch-textarea-plain"
              rows={4}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="A short bio that other members will see — what you do, why you serve, anything else."
            />
          </label>

          <div className="ch-modal-actions">
            <button type="button" className="ch-btn ch-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="submit" className="ch-btn ch-btn-accent" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Member Profile dialog (read-only) ─────────────────────
   Opens when you click a member's name in the settings list, or
   another user's name in the messages list. Fetches the profile
   doc on mount; shows displayName/role/bio + the identifying key
   (so you can copy it to invite them somewhere). Email is omitted
   for privacy — only the user themselves sees their email. */
function MemberProfileDialog({ uid, onCancel }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const p = await getProfileByUid(uid);
        if (!cancelled) {
          setProfile(p || { uid, displayName: 'Member' });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setProfile({ uid, displayName: 'Member' });
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  return (
    <div className="ch-modal-backdrop" onClick={onCancel}>
      <div className="ch-modal" onClick={e => e.stopPropagation()}>
        <div className="ch-modal-head">
          <span className="ch-modal-title">
            {loading ? 'Loading profile…' : (profile?.displayName || 'Member')}
          </span>
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className="ch-modal-body">
          {loading ? (
            <div className="ch-hint">Loading…</div>
          ) : (() => {
            /* Normalize ministryTypes: support both the new array shape
               and any legacy single-string `ministryType` field. */
            const types = Array.isArray(profile?.ministryTypes)
              ? profile.ministryTypes
              : profile?.ministryType
                ? [profile.ministryType]
                : [];
            const empty = (v) => !v || (typeof v === 'string' && !v.trim());
            /* Treat missing `emailVisible` as `true` for backward-compat
               with profiles created before the toggle existed. */
            const emailShown = profile?.emailVisible !== false && profile?.email;
            const phoneShown = profile?.phoneVisible !== false && profile?.phone;
            const isEmptyProfile = empty(profile?.displayName)
              && empty(profile?.email)
              && empty(profile?.ministryName)
              && empty(profile?.bio)
              && types.length === 0;
            return (
              <>
                {/* Avatar + display name header */}
                <div className="ch-profile-meta">
                  <div className="ch-profile-meta-row">
                    <div className={`ch-profile-avatar${profile?.avatar ? ' has-img' : ''}`}>
                      {profile?.avatar ? <CustomAvatar avatar={profile.avatar} /> : getInitials(profile?.displayName)}
                    </div>
                    <div className="ch-profile-meta-text">
                      <div className="ch-profile-headname">
                        {profile?.displayName || 'Member'}
                      </div>
                      {emailShown && (
                        <div className="ch-profile-email">{profile.email}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Each piece of info shown with a clear title. We render
                    every section even when blank so the layout is
                    consistent — empty values show a faint "—" so it's
                    obvious nothing's been filled in. */}
                <div className="ch-profile-section">
                  <div className="ch-field-lbl">Display name</div>
                  <div className="ch-profile-value">
                    {profile?.displayName || <span className="ch-profile-empty">—</span>}
                  </div>
                </div>

                {/* Only show the Email section when this member has
                    chosen to make it visible. If hidden, the section is
                    omitted entirely (rather than showing "Hidden") so
                    other members don't even see that an email exists. */}
                {emailShown && (
                  <div className="ch-profile-section">
                    <div className="ch-field-lbl">Email</div>
                    <div className="ch-profile-value-row">
                      <div className="ch-profile-value">{profile.email}</div>
                      <CopyButton value={profile.email} label="email" />
                    </div>
                  </div>
                )}

                {phoneShown && (
                  <div className="ch-profile-section">
                    <div className="ch-field-lbl">Phone</div>
                    <div className="ch-profile-value-row">
                      <div className="ch-profile-value">{profile.phone}</div>
                      <CopyButton value={profile.phone} label="phone number" />
                    </div>
                  </div>
                )}

                <div className="ch-profile-section">
                  <div className="ch-field-lbl">Ministry name</div>
                  <div className="ch-profile-value">
                    {profile?.ministryName || <span className="ch-profile-empty">—</span>}
                  </div>
                </div>

                <div className="ch-profile-section">
                  <div className="ch-field-lbl">Type of ministry</div>
                  {types.length > 0 ? (
                    <div className="ch-profile-types">
                      {types.map(t => (
                        <span key={t} className="ch-profile-role">{t}</span>
                      ))}
                    </div>
                  ) : (
                    <div className="ch-profile-value">
                      <span className="ch-profile-empty">—</span>
                    </div>
                  )}
                </div>

                <div className="ch-profile-section">
                  <div className="ch-field-lbl">About</div>
                  {profile?.bio
                    ? <div className="ch-profile-bio">{profile.bio}</div>
                    : <div className="ch-profile-value"><span className="ch-profile-empty">—</span></div>}
                </div>

                <div className="ch-profile-section">
                  <div className="ch-field-lbl">Identifying key</div>
                  {profile?.identifyingKey ? (
                    <div className="ch-profile-value-row">
                      <div className="ch-profile-value ch-profile-mono">
                        {profile.identifyingKey}
                      </div>
                      <CopyButton value={profile.identifyingKey} label="identifying key" />
                    </div>
                  ) : (
                    <div className="ch-profile-value"><span className="ch-profile-empty">—</span></div>
                  )}
                </div>

                {isEmptyProfile && (
                  <div className="ch-hint">
                    This member hasn&apos;t filled in their profile yet.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ─── Invitation card ───────────────────────────────────────
   Shown in the "Pending invitations" strip at the top of Chat. */
function InvitationCard({ invite, onAccept, onDecline }) {
  const [busy, setBusy] = useState(null); // null | 'accept' | 'decline'

  const handle = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <div className="ch-invite-card">
      <div className="ch-invite-head">
        <span className="ch-invite-icon">🔒</span>
        <div className="ch-invite-text">
          <div className="ch-invite-name">{invite.channelName || '(unnamed channel)'}</div>
          <div className="ch-invite-from">
            Invited by <strong>{invite.invitedByName || 'Member'}</strong>
          </div>
        </div>
      </div>
      {invite.channelDescription && (
        <div className="ch-invite-desc">{invite.channelDescription}</div>
      )}
      <div className="ch-invite-actions">
        <button
          type="button"
          className="ch-btn ch-btn-accent ch-btn-sm"
          onClick={() => handle('accept', onAccept)}
          disabled={busy !== null}
        >
          {busy === 'accept' ? 'Joining…' : '✓ Accept'}
        </button>
        <button
          type="button"
          className="ch-btn ch-btn-ghost ch-btn-sm"
          onClick={() => handle('decline', onDecline)}
          disabled={busy !== null}
        >
          {busy === 'decline' ? 'Declining…' : '✕ Decline'}
        </button>
      </div>
    </div>
  );
}

/* ─── Requests view ─────────────────────────────────────────
   Shown when the "Requests" tab is active. Two sections:
   - Invitations TO you (you accept/decline)
   - Invitations FROM you (still pending; you can cancel)

   When the invitee accepts on their side, the underlying invite doc
   disappears (deleted by acceptInvite() in a writeBatch), so it
   automatically drops out of both lists. The accepting user
   simultaneously becomes a member of the channel — at which point
   the channel shows up in their Private tab. */
function RequestsView({
  incoming, sent, onAccept, onDecline, onCancel,
  twoWayIncoming, twoWaySent, onTwoWayAccept, onTwoWayDecline,
}) {
  const nothing = incoming.length === 0 && sent.length === 0
    && twoWayIncoming.length === 0 && twoWaySent.length === 0;
  return (
    <div className="ch-requests">
      {nothing ? (
        <div className="ch-empty">
          <div className="ch-empty-title">No pending requests</div>
          <div className="ch-empty-sub">
            Invitations you receive — and ones you've sent that are still
            awaiting a response — appear here. Once an invitee accepts,
            the channel moves into the <strong>🔒 Private</strong> tab.
          </div>
        </div>
      ) : (
        <>
          {/* INCOMING — addressed to me */}
          <section className="ch-req-section">
            <div className="ch-req-section-head">
              📥 Invitations to you
              {incoming.length > 0 && <span className="ch-req-count">{incoming.length}</span>}
            </div>
            {incoming.length === 0 ? (
              <div className="ch-req-empty">No one has invited you to anything right now.</div>
            ) : (
              <div className="ch-invites-list">
                {incoming.map(inv => (
                  <InvitationCard
                    key={inv.id}
                    invite={inv}
                    onAccept={() => onAccept(inv)}
                    onDecline={() => onDecline(inv)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* OUTGOING — invites I've sent that are still pending */}
          <section className="ch-req-section">
            <div className="ch-req-section-head">
              ✉ Invitations you've sent
              {sent.length > 0 && <span className="ch-req-count">{sent.length}</span>}
            </div>
            {sent.length === 0 ? (
              <div className="ch-req-empty">
                Nothing pending. Invite people from inside one of your private channels.
              </div>
            ) : (
              <div className="ch-invites-list">
                {sent.map(inv => (
                  <SentInviteCard
                    key={inv.id}
                    invite={inv}
                    onCancel={() => onCancel(inv)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Founder-only: two-way chat requests waiting on a decision */}
          {twoWayIncoming.length > 0 && (
            <section className="ch-req-section">
              <div className="ch-req-section-head">
                💬 Two-way chat requests
                <span className="ch-req-count">{twoWayIncoming.length}</span>
              </div>
              <div className="ch-invites-list">
                {twoWayIncoming.map(req => (
                  <TwoWayRequestCard
                    key={req.id}
                    request={req}
                    onAccept={() => onTwoWayAccept(req)}
                    onDecline={() => onTwoWayDecline(req)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Sender's own two-way request, still awaiting the founder */}
          {twoWaySent.length > 0 && (
            <section className="ch-req-section">
              <div className="ch-req-section-head">
                💬 Two-way chat requests you've sent
                <span className="ch-req-count">{twoWaySent.length}</span>
              </div>
              <div className="ch-invites-list">
                {twoWaySent.map(req => (
                  <SentTwoWayCard key={req.id} request={req} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* Card shown in the founder's "Two-way chat requests" section — a
   founderRequests doc with twoWayStatus == 'requested'. Mirrors
   InvitationCard's look, but Accept/Decline call respondToTwoWayRequest
   instead of the channel invite flow. */
function TwoWayRequestCard({ request, onAccept, onDecline }) {
  const [busy, setBusy] = useState(null); // null | 'accept' | 'decline'

  const handle = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  };

  return (
    <div className="ch-invite-card">
      <div className="ch-invite-head">
        <span className="ch-invite-icon">💬</span>
        <div className="ch-invite-text">
          <div className="ch-invite-name">{request.title || '(untitled request)'}</div>
          <div className="ch-invite-from">
            Requested by <strong>{request.senderName || 'Member'}</strong>
          </div>
        </div>
      </div>
      {request.twoWayNote && (
        <div className="ch-invite-desc">{request.twoWayNote}</div>
      )}
      <div className="ch-invite-actions">
        <button
          type="button"
          className="ch-btn ch-btn-accent ch-btn-sm"
          onClick={() => handle('accept', onAccept)}
          disabled={busy !== null}
        >
          {busy === 'accept' ? 'Accepting…' : '✓ Accept'}
        </button>
        <button
          type="button"
          className="ch-btn ch-btn-ghost ch-btn-sm"
          onClick={() => handle('decline', onDecline)}
          disabled={busy !== null}
        >
          {busy === 'decline' ? 'Declining…' : '✕ Decline'}
        </button>
      </div>
    </div>
  );
}

/* Card shown in the sender's own "sent" two-way section — read-only,
   there's no cancel action (firestore.rules only lets the sender move
   twoWayStatus INTO 'requested', not back out), just a status line. */
function SentTwoWayCard({ request }) {
  return (
    <div className="ch-invite-card">
      <div className="ch-invite-head">
        <span className="ch-invite-icon">💬</span>
        <div className="ch-invite-text">
          <div className="ch-invite-name">{request.title || '(untitled request)'}</div>
          <div className="ch-invite-from">
            <span className="ch-invite-status">Awaiting the founder's response</span>
          </div>
        </div>
      </div>
      {request.twoWayNote && (
        <div className="ch-invite-desc">{request.twoWayNote}</div>
      )}
    </div>
  );
}

/* Card shown in the "Invitations you've sent" section.
   Displays the channel + invitee, with a Cancel button. */
function SentInviteCard({ invite, onCancel }) {
  const [busy, setBusy] = useState(false);
  const handleCancel = async () => {
    setBusy(true);
    try { await onCancel(); } finally { setBusy(false); }
  };
  return (
    <div className="ch-invite-card">
      <div className="ch-invite-head">
        <span className="ch-invite-icon">🔒</span>
        <div className="ch-invite-text">
          <div className="ch-invite-name">{invite.channelName || '(unnamed channel)'}</div>
          <div className="ch-invite-from">
            Invited <strong>{invite.inviteeName || 'a user'}</strong>
            <span className="ch-invite-status"> · awaiting response</span>
          </div>
        </div>
      </div>
      {invite.channelDescription && (
        <div className="ch-invite-desc">{invite.channelDescription}</div>
      )}
      <div className="ch-invite-actions">
        <button
          type="button"
          className="ch-btn ch-btn-danger-ghost ch-btn-sm"
          onClick={handleCancel}
          disabled={busy}
        >
          {busy ? 'Cancelling…' : 'Cancel invite'}
        </button>
      </div>
    </div>
  );
}
