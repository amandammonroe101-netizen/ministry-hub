import { useId, useState } from 'react';
import './Avatar.css';

/* ─────────────────────────────────────────────────────────────
   Custom avatar system — a Snapchat/Bitmoji-style SVG face the
   user can build per friend. Each `avatar` config is a small
   plain object stored on the friend doc:

     { bg, skin, hair, hairColor, eyes, mouth,
       facialHair, glasses, earrings, blush }

   `bg` is an index into BG_COLORS (a gradient pair); every other
   field is one of the option keys below. CustomAvatar renders the
   layered SVG; AvatarBuilder is the editor modal.
   ───────────────────────────────────────────────────────────── */

export const BG_COLORS = [
  ['#3730a3', '#6c3fc9'], ['#0f6e56', '#1d9e75'], ['#854f0b', '#d4720a'],
  ['#9d174d', '#c2326e'], ['#185fa5', '#378add'], ['#3c3489', '#7f77dd'],
  ['#0b7285', '#13b3c4'], ['#5f3dc4', '#9775fa'], ['#1f2937', '#4b5563'],
];

export const SKIN_TONES = [
  '#ffd9b8', '#f1c099', '#e0ac69', '#c68642', '#9a5f33', '#6b4423',
];

/* Natural hair shades only — black → brown → auburn → blonde → gray/white. */
export const HAIR_COLORS = [
  '#1a1614', '#2c1b12', '#4b3122', '#6b4423', '#8b5a2b',
  '#a9692e', '#caa14a', '#ddc07a', '#9b9b9b', '#e8e6e1',
];

export const HAIR_STYLES = [
  { key: 'bald',     label: 'Bald'     },
  { key: 'buzz',     label: 'Buzz'     },
  { key: 'short',    label: 'Short'    },
  { key: 'fade',     label: 'Fade'     },
  { key: 'spiky',    label: 'Spiky'    },
  { key: 'curly',    label: 'Curly'    },
  { key: 'mohawk',   label: 'Mohawk'   },
  { key: 'afro',     label: 'Afro'     },
  { key: 'bun',      label: 'Top knot' },
  { key: 'long',     label: 'Long'     },
  { key: 'bob',      label: 'Bob'      },
  { key: 'wavy',     label: 'Wavy'     },
  { key: 'ponytail', label: 'Ponytail' },
  { key: 'pigtails', label: 'Pigtails' },
  { key: 'braids',   label: 'Braids'   },
];

export const EYE_STYLES = [
  { key: 'round',  label: 'Round'  },
  { key: 'big',    label: 'Big'    },
  { key: 'lashes', label: 'Lashes' },
  { key: 'happy',  label: 'Happy'  },
  { key: 'sleepy', label: 'Chill'  },
  { key: 'wink',   label: 'Wink'   },
];

export const MOUTH_STYLES = [
  { key: 'smile',   label: 'Smile'   },
  { key: 'grin',    label: 'Grin'    },
  { key: 'lips',    label: 'Lips'    },
  { key: 'smirk',   label: 'Smirk'   },
  { key: 'neutral', label: 'Neutral' },
  { key: 'open',    label: 'Wow'     },
];

export const FACIAL_HAIR = [
  { key: 'none',     label: 'None'     },
  { key: 'stubble',  label: 'Stubble'  },
  { key: 'mustache', label: 'Mustache' },
  { key: 'beard',    label: 'Beard'    },
];

export const GLASSES = [
  { key: 'none',   label: 'None'   },
  { key: 'round',  label: 'Round'  },
  { key: 'square', label: 'Square' },
];

export const EARRINGS = [
  { key: 'none',  label: 'None'  },
  { key: 'studs', label: 'Studs' },
  { key: 'hoops', label: 'Hoops' },
];

export const BLUSH = [
  { key: 'none',  label: 'None'  },
  { key: 'blush', label: 'Blush' },
];

export const SHIRT_COLORS = [
  '#e23b4e', '#f0a838', '#2dd4a8', '#378add', '#9775fa',
  '#ec6f9e', '#3b3b46', '#f4f4f5', '#1d9e75', '#d4720a',
];

/* Mii-style backdrop options: a colored gradient, a flat colour, or
   the neutral studio gray. */
export const BG_STYLES = [
  { key: 'gradient', label: 'Gradient' },
  { key: 'flat',     label: 'Flat'     },
  { key: 'gray',     label: 'Studio'   },
];

/* Natural eye colors — brown / hazel / green / blue / gray. */
export const EYE_COLORS = [
  '#4a2c14', '#2e1c0f', '#6b4a2a', '#8a6b3f',
  '#4a7c59', '#3f6fb0', '#7a8a99', '#6b7280',
];

export const FACE_SHAPES = [
  { key: 'oval',   label: 'Oval'   },
  { key: 'round',  label: 'Round'  },
  { key: 'square', label: 'Square' },
  { key: 'heart',  label: 'Heart'  },
  { key: 'long',   label: 'Long'   },
];

export const EYEBROW_STYLES = [
  { key: 'soft',     label: 'Soft'     },
  { key: 'bold',     label: 'Bold'     },
  { key: 'straight', label: 'Straight' },
  { key: 'arched',   label: 'Arched'   },
  { key: 'thin',     label: 'Thin'     },
];

export const HAIRLINES = [
  { key: 'straight', label: 'Straight' },
  { key: 'peak',     label: 'Widow’s peak' },
  { key: 'receding', label: 'Receding' },
];

const GRAY_BG = ['#aeb4c2', '#878d9e'];

/* ─────────────────────────────────────────────────────────────
   Emoji avatars — instead of building a face, the user can drop a
   single emoji on the gradient backdrop. Stored as `avatar.emoji`;
   when present, CustomAvatar renders the emoji and skips the face
   layers entirely. A big categorized library to pick from.
   ───────────────────────────────────────────────────────────── */
export const EMOJI_CATEGORIES = [
  {
    label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫡','🤭','🫢','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃'],
  },
  {
    label: 'Gestures & People',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','🤝','💪','🦾','✍️','💅','🦵','🦶','👂','👃','🧠','🫀','👀','👁️','👄','🫦','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘'],
  },
  {
    label: 'Animals & Nature',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🌾','🌺','🌻','🌹','🥀','🌷','🌼','🌸','💐','🍄','🐚','🌍','🌙','⭐','🌟','✨','⚡','🔥','🌈','☀️','🌤️','⛅','🌧️','⛈️','❄️','💧','🌊'],
  },
  {
    label: 'Food & Drink',
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥙','🧆','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
  },
  {
    label: 'Activities & Travel',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🎣','🤿','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','🛶','🥊','🥋','🎯','🎮','🕹️','🎲','🧩','♟️','🎰','🎳','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🚁','✈️','🚀','🛸','⛵','🚤','🛳️','⚓','🚂','🚆','🗽','🗼','🏰','🏯','🎡','🎢','🎠','⛲','🏖️','🏝️','🏕️','⛺','🏠','🏡','🗻','🌋','🏔️','⛰️'],
  },
  {
    label: 'Symbols & Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗯️','♨️','⭐','🌟','✨','⚡','🔥','💎','🔔','🎵','🎶','✅','❌','⭕','🚫','💲','💵','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🎪','👑','💍','💄','👓','🕶️','🎓','🧢','👒','🎩','⛑️','📿','💼','🎁','🎈','🎉','🎊','🎀','🪄','🔮','🧸','♾️','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'],
  },
];

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap(c => c.emojis);

/* ── color helpers — lighten/darken a hex for skin volume ── */
const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const toHex = (r, g, b) => '#' + [r, g, b].map(x => clampByte(x).toString(16).padStart(2, '0')).join('');
/* amt > 0 lightens toward white, amt < 0 darkens toward black */
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return toHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}

/* Head silhouettes — all roughly fill the same box (x 25..75, y 19..71)
   so eyes/nose/mouth/ears stay aligned across shapes. */
const HEAD_PATHS = {
  oval:   'M50 19 C36 19 25.5 30 25.5 45 C25.5 60 38 71 50 71 C62 71 74.5 60 74.5 45 C74.5 30 64 19 50 19 Z',
  round:  'M50 19 C34 19 24 31 24 45 C24 60 35 71.5 50 71.5 C65 71.5 76 60 76 45 C76 31 66 19 50 19 Z',
  square: 'M50 19 C37 19 27 28 27 42 L27 53 C27 65 37 71 50 71 C63 71 73 65 73 53 L73 42 C73 28 63 19 50 19 Z',
  heart:  'M50 20 C34 20 25 31 25.5 44 C26 55 40 69 50 72 C60 69 74 55 74.5 44 C75 31 66 20 50 20 Z',
  long:   'M50 18 C38 18 29 29 29 45 C29 62 38 72.5 50 72.5 C62 72.5 71 62 71 45 C71 29 62 18 50 18 Z',
};

export const DEFAULT_AVATAR = {
  bg: 0,
  bgStyle: 'gradient',
  faceShape: 'oval',
  skin: SKIN_TONES[1],
  eyeColor: EYE_COLORS[0],
  hair: 'short',
  hairColor: HAIR_COLORS[1],
  hairline: 'straight',
  brows: 'soft',
  eyes: 'round',
  mouth: 'smile',
  facialHair: 'none',
  glasses: 'none',
  earrings: 'none',
  blush: 'none',
  shirt: SHIRT_COLORS[3],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

export function randomAvatar() {
  return {
    bg:         Math.floor(Math.random() * BG_COLORS.length),
    bgStyle:    pick(BG_STYLES).key,
    faceShape:  pick(FACE_SHAPES).key,
    skin:       pick(SKIN_TONES),
    eyeColor:   pick(EYE_COLORS),
    hair:       pick(HAIR_STYLES).key,
    hairColor:  pick(HAIR_COLORS),
    hairline:   pick(HAIRLINES).key,
    brows:      pick(EYEBROW_STYLES).key,
    eyes:       pick(EYE_STYLES).key,
    mouth:      pick(MOUTH_STYLES).key,
    facialHair: pick(FACIAL_HAIR).key,
    glasses:    pick(GLASSES).key,
    earrings:   pick(EARRINGS).key,
    blush:      pick(BLUSH).key,
    shirt:      pick(SHIRT_COLORS),
  };
}

/* Curated random looks so "Guy" / "Gal" feel coherent rather than
   fully random. They still just produce a normal avatar config —
   nothing is locked, the user can tweak any field afterward. */
export function presetAvatar(kind) {
  /* Only the truly gender-neutral traits are shared; every cue that
     reads as masculine vs feminine is fully diverged below so "Guy"
     and "Gal" come out unmistakably distinct. */
  const base = {
    bg:        Math.floor(Math.random() * BG_COLORS.length),
    bgStyle:   pick(BG_STYLES).key,
    skin:      pick(SKIN_TONES),
    eyeColor:  pick(EYE_COLORS),
    hairColor: pick(HAIR_COLORS),
  };
  if (kind === 'femme') {
    return {
      ...base,
      faceShape:  pick(['oval', 'round', 'heart']),
      hair:       pick(['long', 'bob', 'wavy', 'ponytail', 'pigtails', 'braids', 'bun']),
      hairline:   pick(['straight', 'peak']),
      brows:      pick(['thin', 'arched']),
      eyes:       pick(['lashes', 'big', 'happy']),
      mouth:      pick(['lips', 'lips', 'smile', 'smirk']),
      facialHair: 'none',
      glasses:    chance(0.18) ? pick(['round', 'square']) : 'none',
      earrings:   chance(0.75) ? pick(['studs', 'hoops']) : 'none',
      blush:      chance(0.7) ? 'blush' : 'none',
      shirt:      pick(['#ec6f9e', '#e23b4e', '#9775fa', '#f0a838', '#2dd4a8', '#378add']),
    };
  }
  return {
    ...base,
    faceShape:  pick(['square', 'long', 'oval']),
    hair:       pick(['buzz', 'short', 'fade', 'spiky', 'mohawk', 'afro', 'bald']),
    hairline:   pick(['straight', 'receding', 'peak']),
    brows:      pick(['bold', 'straight']),
    eyes:       pick(['round', 'sleepy', 'wink']),
    mouth:      pick(['smile', 'neutral', 'smirk', 'grin']),
    facialHair: chance(0.7) ? pick(['stubble', 'mustache', 'beard', 'beard']) : 'none',
    glasses:    chance(0.3) ? pick(['round', 'square']) : 'none',
    earrings:   'none',
    blush:      'none',
    shirt:      pick(['#378add', '#3b3b46', '#1d9e75', '#d4720a', '#2dd4a8', '#e23b4e']),
  };
}

/* ─────────────────────────────────────────────────────────────
   SVG layers
   ───────────────────────────────────────────────────────────── */
function backHair(style, hair) {
  switch (style) {
    case 'long':
      return <path d="M22 40 Q22 86 36 90 L36 50 Q40 26 50 26 Q60 26 64 50 L64 90 Q78 86 78 40 Q78 12 50 12 Q22 12 22 40 Z" fill={hair} />;
    case 'afro':
      return <circle cx="50" cy="40" r="34" fill={hair} />;
    case 'bob':
      return <path d="M22 44 Q22 72 33 76 L33 42 Q39 26 50 26 Q61 26 67 42 L67 76 Q78 72 78 44 Q78 14 50 14 Q22 14 22 44 Z" fill={hair} />;
    case 'wavy':
      return <path d="M19 42 Q19 78 29 86 Q33 76 31 68 Q37 84 43 84 L43 46 Q47 26 50 26 Q53 26 57 46 L57 84 Q63 84 69 68 Q67 76 71 86 Q81 78 81 42 Q81 12 50 12 Q19 12 19 42 Z" fill={hair} />;
    case 'ponytail':
      return (
        <g fill={hair}>
          <path d="M62 20 Q90 24 86 52 Q83 72 72 64 Q83 48 70 30 Z" />
        </g>
      );
    case 'pigtails':
      return (
        <g fill={hair}>
          <path d="M24 48 Q8 52 12 70 Q15 82 26 76 Q18 64 30 52 Z" />
          <path d="M76 48 Q92 52 88 70 Q85 82 74 76 Q82 64 70 52 Z" />
        </g>
      );
    case 'braids':
      return (
        <g fill={hair}>
          {[52, 59, 66, 73, 80].map((y, i) => <circle key={`l${i}`} cx={23 - (i % 2)} cy={y} r="4.6" />)}
          {[52, 59, 66, 73, 80].map((y, i) => <circle key={`r${i}`} cx={77 + (i % 2)} cy={y} r="4.6" />)}
        </g>
      );
    default:
      return null;
  }
}

/* Hair that frames the face in front of the ears — the signature
   of a longer style. */
function sideFrame(hair) {
  return (
    <g fill={hair}>
      <path d="M25 36 Q21 58 28 70 Q33 60 31 48 Q30 41 35 35 Z" />
      <path d="M75 36 Q79 58 72 70 Q67 60 69 48 Q70 41 65 35 Z" />
    </g>
  );
}

function femCap(hair) {
  return <path d="M26 44 C24 20 40 13 50 13 C60 13 76 20 74 44 C72 33 64 28 52 30 Q50 23 48 30 C36 28 28 33 26 44 Z" fill={hair} />;
}

function frontHair(style, hair) {
  switch (style) {
    case 'bald':
    case 'afro':
      return null;
    case 'buzz':
      return <path d="M26 44 C24 22 40 16 50 16 C60 16 76 22 74 44 C72 36 66 31 50 31 C34 31 28 36 26 44 Z" fill={hair} opacity="0.92" />;
    case 'short':
      return <path d="M26 47 C23 21 40 13 50 13 C60 13 77 21 74 47 C73 37 68 29 60 29 C57 33 43 33 40 29 C32 29 27 37 26 47 Z" fill={hair} />;
    case 'fade':
      return <path d="M29 41 C29 22 40 15 50 15 C60 15 71 22 71 41 C68 31 62 27 50 27 C38 27 32 31 29 41 Z" fill={hair} />;
    case 'spiky':
      return (
        <g fill={hair}>
          <path d="M28 44 C26 27 40 20 50 20 C60 20 74 27 72 44 C70 35 64 31 50 31 C36 31 30 35 28 44 Z" />
          <path d="M32 26 L35 12 L40 27 Z" />
          <path d="M42 24 L46 9 L50 26 Z" />
          <path d="M50 24 L54 9 L58 25 Z" />
          <path d="M60 26 L65 12 L68 28 Z" />
        </g>
      );
    case 'curly':
      return (
        <g fill={hair}>
          <circle cx="32" cy="30" r="10" /><circle cx="44" cy="22" r="11" />
          <circle cx="56" cy="22" r="11" /><circle cx="68" cy="30" r="10" />
          <circle cx="27" cy="40" r="8" /><circle cx="73" cy="40" r="8" />
        </g>
      );
    case 'mohawk':
      return <path d="M44 12 Q50 6 56 12 L56 36 Q50 33 44 36 Z" fill={hair} />;
    case 'bun':
      return (
        <g fill={hair}>
          <circle cx="50" cy="11" r="8" />
          <path d="M26 46 C24 22 40 15 50 15 C60 15 76 22 74 46 C72 37 66 30 50 30 C34 30 28 37 26 46 Z" />
        </g>
      );
    case 'long':
      return <path d="M26 47 C23 21 40 13 50 13 C60 13 77 21 74 47 C73 37 68 29 58 29 C56 33 44 33 42 29 C32 29 27 37 26 47 Z" fill={hair} />;
    case 'bob':
    case 'wavy':
    case 'ponytail':
    case 'pigtails':
    case 'braids':
      return <g>{sideFrame(hair)}{femCap(hair)}</g>;
    default:
      return null;
  }
}

/* one eye: white sclera + colored iris + dark pupil + catchlight */
function iris(cx, cy, color, r = 3.4) {
  const pupil = '#241a1f';
  return (
    <g key={`i${cx}`}>
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx} cy={cy} r={r * 0.5} fill={pupil} />
      <circle cx={cx + 1.1} cy={cy - 1.1} r={r * 0.28} fill="#fff" />
    </g>
  );
}

function eyesEl(style, eyeColor = EYE_COLORS[0]) {
  const dark = '#2b2233';
  if (style === 'round') {
    return (
      <g>
        {iris(40, 45, eyeColor)}
        {iris(60, 45, eyeColor)}
      </g>
    );
  }
  if (style === 'big') {
    return (
      <g>
        <ellipse cx="40" cy="45" rx="4.4" ry="5" fill="#fff" />
        <ellipse cx="60" cy="45" rx="4.4" ry="5" fill="#fff" />
        {iris(40, 45.3, eyeColor, 3.5)}
        {iris(60, 45.3, eyeColor, 3.5)}
      </g>
    );
  }
  if (style === 'lashes') {
    return (
      <g>
        {iris(40, 45, eyeColor)}
        {iris(60, 45, eyeColor)}
        <g stroke={dark} strokeWidth="1.4" strokeLinecap="round" fill="none">
          <path d="M35.6 43.4 L33 41.6" /><path d="M37 42 L35.4 40" />
          <path d="M64.4 43.4 L67 41.6" /><path d="M63 42 L64.6 40" />
        </g>
      </g>
    );
  }
  if (style === 'happy') {
    return (
      <g fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round">
        <path d="M35.5 46 Q40 41 44.5 46" />
        <path d="M55.5 46 Q60 41 64.5 46" />
      </g>
    );
  }
  if (style === 'sleepy') {
    return (
      <g fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round">
        <path d="M35.5 45 Q40 48 44.5 45" />
        <path d="M55.5 45 Q60 48 64.5 45" />
      </g>
    );
  }
  /* wink */
  return (
    <g>
      <path d="M35.5 45 Q40 41 44.5 45" fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round" />
      {iris(60, 45, eyeColor)}
    </g>
  );
}

const BROW_SHAPES = {
  soft:     { l: 'M35 38 Q40 35.5 45 38',   r: 'M55 38 Q60 35.5 65 38',   w: 2   },
  bold:     { l: 'M35 38 Q40 35.3 45 38',   r: 'M55 38 Q60 35.3 65 38',   w: 3.2 },
  straight: { l: 'M35 37.6 L45 37.6',       r: 'M55 37.6 L65 37.6',       w: 2.4 },
  arched:   { l: 'M35 38.6 Q40 33.4 45 38.6', r: 'M55 38.6 Q60 33.4 65 38.6', w: 2 },
  thin:     { l: 'M35.5 38 Q40 36 44.5 38',  r: 'M55.5 38 Q60 36 64.5 38',  w: 1.3 },
};

function browsEl(eyes, hair, style = 'soft') {
  if (eyes === 'happy') return null;
  const b = BROW_SHAPES[style] || BROW_SHAPES.soft;
  return (
    <g fill="none" stroke={hair} strokeWidth={b.w} strokeLinecap="round" opacity="0.88">
      <path d={b.l} />
      <path d={b.r} />
    </g>
  );
}

/* Forehead hairline modifier — overlaid on top of the styled hair so
   it works across every cut. `peak` adds a central point of hair,
   `receding` carves the temples back with skin. */
function hairlineEl(style, hair, skinFill) {
  if (style === 'peak') {
    return <path d="M45 29 Q50 41 55 29 Z" fill={hair} />;
  }
  if (style === 'receding') {
    return (
      <g fill={skinFill}>
        <path d="M28 29 Q37 29 35 41 Q31 35 28 32 Z" />
        <path d="M72 29 Q63 29 65 41 Q69 35 72 32 Z" />
      </g>
    );
  }
  return null;
}

function mouthEl(style) {
  const lip = '#9b4a44';
  if (style === 'smile') {
    return (
      <g>
        <path d="M42 57 Q50 64 58 57" fill="none" stroke={lip} strokeWidth="2.6" strokeLinecap="round" />
        {/* lower-lip body for a fuller, less line-art mouth */}
        <path d="M43.5 59 Q50 62.4 56.5 59" fill="none" stroke="rgba(204,91,114,0.55)" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }
  if (style === 'grin') {
    return (
      <g>
        <path d="M41 56 Q50 65 59 56 Z" fill="#7a2f2f" />
        <path d="M43.5 57.5 Q50 60 56.5 57.5 L55 56 Q50 57 45 56 Z" fill="#fff" />
        <path d="M42 61.5 Q50 66 58 61.5" fill="none" stroke="rgba(204,91,114,0.6)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    );
  }
  if (style === 'lips') {
    return (
      <g>
        <g fill="#cc5b72">
          <path d="M42 56 Q46 53 50 54.5 Q54 53 58 56 Q50 58.5 42 56 Z" />
          <path d="M42 56 Q50 63 58 56 Q50 59.5 42 56 Z" />
        </g>
        {/* glossy highlight on the lower lip */}
        <path d="M45 57.6 Q50 59 55 57.6" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    );
  }
  if (style === 'smirk') {
    return <path d="M43 59 Q50 60.5 57 55" fill="none" stroke={lip} strokeWidth="2.6" strokeLinecap="round" />;
  }
  if (style === 'neutral') {
    return <path d="M43 59 L57 59" fill="none" stroke={lip} strokeWidth="2.6" strokeLinecap="round" />;
  }
  /* open / wow */
  return <ellipse cx="50" cy="59" rx="5" ry="5.5" fill="#7a2f2f" />;
}

function facialHairEl(style, hair) {
  if (style === 'none') return null;
  if (style === 'stubble') {
    return <path d="M28 47 Q31 70 50 73 Q69 70 72 47 Q64 60 50 60 Q36 60 28 47 Z" fill={hair} opacity="0.22" />;
  }
  if (style === 'mustache') {
    return <path d="M43 54 Q50 58 57 54 Q53 52 50 53.5 Q47 52 43 54 Z" fill={hair} />;
  }
  /* beard */
  return <path d="M28 46 Q31 71 50 74 Q69 71 72 46 Q65 61 58 61 Q56 64 50 64 Q44 64 42 61 Q35 61 28 46 Z" fill={hair} />;
}

function glassesEl(style) {
  if (style === 'none') return null;
  const frame = '#2b2233';
  if (style === 'round') {
    return (
      <g fill="rgba(255,255,255,0.16)" stroke={frame} strokeWidth="2">
        <circle cx="40" cy="45" r="8" />
        <circle cx="60" cy="45" r="8" />
        <path d="M48 45 L52 45" stroke={frame} strokeWidth="2" fill="none" />
        <path d="M32 44 L26 42" stroke={frame} strokeWidth="2" fill="none" />
        <path d="M68 44 L74 42" stroke={frame} strokeWidth="2" fill="none" />
      </g>
    );
  }
  /* square */
  return (
    <g fill="rgba(255,255,255,0.16)" stroke={frame} strokeWidth="2">
      <rect x="31" y="39" width="16" height="12" rx="2.5" />
      <rect x="53" y="39" width="16" height="12" rx="2.5" />
      <path d="M47 44 L53 44" stroke={frame} strokeWidth="2" fill="none" />
      <path d="M31 43 L25 41" stroke={frame} strokeWidth="2" fill="none" />
      <path d="M69 43 L75 41" stroke={frame} strokeWidth="2" fill="none" />
    </g>
  );
}

function earringsEl(style) {
  if (style === 'none') return null;
  if (style === 'studs') {
    return (
      <g fill="#ffd24a" stroke="#caa14a" strokeWidth="0.5">
        <circle cx="26" cy="54" r="2" />
        <circle cx="74" cy="54" r="2" />
      </g>
    );
  }
  /* hoops */
  return (
    <g fill="none" stroke="#ffd24a" strokeWidth="1.8">
      <circle cx="26" cy="56" r="3.2" />
      <circle cx="74" cy="56" r="3.2" />
    </g>
  );
}

function blushEl(style) {
  if (style !== 'blush') return null;
  return (
    <g fill="#ff7a9e" opacity="0.34">
      <ellipse cx="36" cy="52" rx="4.6" ry="3" />
      <ellipse cx="64" cy="52" rx="4.6" ry="3" />
    </g>
  );
}

export function CustomAvatar({ avatar, className = '' }) {
  const gid = useId().replace(/:/g, '');
  const a = { ...DEFAULT_AVATAR, ...(avatar || {}) };
  const [c0, c1] = BG_COLORS[a.bg] || BG_COLORS[0];
  const [g0, g1] = a.bgStyle === 'gray' ? GRAY_BG : [c0, c1];
  const bgFill = a.bgStyle === 'flat' ? c1 : `url(#bg-${gid})`;
  const skin = a.skin;
  const skinLight = shade(skin, 0.13);
  const skinDark = shade(skin, -0.15);
  const skinShade = 'rgba(0,0,0,0.10)';
  const shirt = a.shirt || DEFAULT_AVATAR.shirt;
  const headPath = HEAD_PATHS[a.faceShape] || HEAD_PATHS.oval;
  const hairLight = shade(a.hairColor, 0.2);
  const hairFill = `url(#hair-${gid})`;
  const hasHair = a.hair !== 'bald';

  /* Emoji avatar — drop the chosen emoji on the gradient backdrop and
     skip every face layer. */
  if (a.emoji) {
    return (
      <svg viewBox="0 0 100 100" className={`cav ${className}`} role="img" aria-label="Avatar">
        <defs>
          <linearGradient id={`bg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={g0} />
            <stop offset="1" stopColor={g1} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={bgFill} />
        <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
          fontSize="58" style={{ userSelect: 'none' }}>{a.emoji}</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className={`cav ${className}`} role="img" aria-label="Avatar">
      <defs>
        <linearGradient id={`bg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={g0} />
          <stop offset="1" stopColor={g1} />
        </linearGradient>
        {/* soft upper-left sheen across the head — the Mii "plastic" look */}
        <radialGradient id={`sheen-${gid}`} cx="0.36" cy="0.28" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.30" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* skin volume — lit cheek/forehead fading to shadowed jaw + temples */}
        <radialGradient id={`skin-${gid}`} cx="0.5" cy="0.4" r="0.62">
          <stop offset="0" stopColor={skinLight} />
          <stop offset="0.68" stopColor={skin} />
          <stop offset="1" stopColor={skinDark} />
        </radialGradient>
        {/* hair volume — lit crown fading to base color */}
        <linearGradient id={`hair-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hairLight} />
          <stop offset="0.6" stopColor={a.hairColor} />
          <stop offset="1" stopColor={a.hairColor} />
        </linearGradient>
        {/* glossy strand-shine band on the crown */}
        <radialGradient id={`hairsheen-${gid}`} cx="0.42" cy="0.18" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="100" height="100" fill={bgFill} />

      {backHair(a.hair, hairFill)}

      {/* shoulders / shirt */}
      <ellipse cx="50" cy="112" rx="40" ry="30" fill={shirt} />
      <ellipse cx="50" cy="112" rx="40" ry="30" fill="rgba(255,255,255,0.10)" />
      <path d="M37 90 Q50 105 63 90 Q57 86 50 86 Q43 86 37 90 Z" fill="rgba(0,0,0,0.18)" />

      {/* chin contact shadow */}
      <ellipse cx="50" cy="73" rx="20" ry="8" fill="rgba(0,0,0,0.12)" />

      {/* neck */}
      <rect x="43" y="60" width="14" height="18" rx="6" fill={skin} />
      <rect x="43" y="60" width="14" height="6" fill="rgba(0,0,0,0.10)" />

      {/* ears */}
      <ellipse cx="27" cy="46" rx="5" ry="7" fill={skinDark} />
      <ellipse cx="73" cy="46" rx="5" ry="7" fill={skinDark} />

      {/* head — shaped silhouette with skin volume */}
      <path d={headPath} fill={`url(#skin-${gid})`} />
      {/* soft upper-left sheen highlight */}
      <path d={headPath} fill={`url(#sheen-${gid})`} />

      {blushEl(a.blush)}
      {facialHairEl(a.facialHair, a.hairColor)}
      {browsEl(a.eyes, a.hairColor, a.brows)}
      {eyesEl(a.eyes, a.eyeColor)}

      {/* nose */}
      <path d="M50 47 L47.5 53 Q50 55 52.5 53 Z" fill={skinShade} />

      {mouthEl(a.mouth)}
      {frontHair(a.hair, hairFill)}
      {hasHair && hairlineEl(a.hairline, hairFill, `url(#skin-${gid})`)}
      {hasHair && a.hair !== 'afro' && (
        <ellipse cx="46" cy="20" rx="15" ry="8" fill={`url(#hairsheen-${gid})`} />
      )}
      {earringsEl(a.earrings)}
      {glassesEl(a.glasses)}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Gender-scoped option subsets — each builder tab only exposes the
   traits that read for that gender. Neutral filters (backdrop,
   background, shirt, face shape, skin, hair color, hairline, eye
   color, glasses) appear in both tabs.
   ───────────────────────────────────────────────────────────── */
const byKeys = (list, keys) => list.filter(o => keys.includes(o.key));
const GENDER_OPTS = {
  masc: {
    hair:  byKeys(HAIR_STYLES,    ['bald', 'buzz', 'short', 'fade', 'spiky', 'curly', 'mohawk', 'afro']),
    eyes:  byKeys(EYE_STYLES,     ['round', 'big', 'sleepy', 'wink']),
    brows: byKeys(EYEBROW_STYLES, ['soft', 'bold', 'straight']),
    mouth: byKeys(MOUTH_STYLES,   ['smile', 'grin', 'smirk', 'neutral', 'open']),
  },
  femme: {
    hair:  byKeys(HAIR_STYLES,    ['short', 'curly', 'afro', 'bun', 'long', 'bob', 'wavy', 'ponytail', 'pigtails', 'braids']),
    eyes:  byKeys(EYE_STYLES,     ['round', 'big', 'lashes', 'happy', 'wink']),
    brows: byKeys(EYEBROW_STYLES, ['soft', 'thin', 'arched']),
    mouth: byKeys(MOUTH_STYLES,   ['smile', 'lips', 'smirk', 'grin', 'open']),
  },
};

function inferGender(a) {
  if (!a) return 'masc';
  if (a.emoji) return 'emoji';
  if (a.earrings && a.earrings !== 'none') return 'femme';
  if (a.blush === 'blush') return 'femme';
  if (a.eyes === 'lashes' || a.mouth === 'lips') return 'femme';
  if (['long', 'bob', 'wavy', 'ponytail', 'pigtails', 'braids', 'bun'].includes(a.hair)) return 'femme';
  return 'masc';
}

const coerceKey = (value, opts) => (opts.some(o => o.key === value) ? value : opts[0].key);

/* ─────────────────────────────────────────────────────────────
   AvatarBuilder — editor modal
   ───────────────────────────────────────────────────────────── */
export function AvatarBuilder({ initial, name, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...DEFAULT_AVATAR, ...(initial || {}) });
  const [gender, setGender] = useState(() => inferGender(initial));
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const opts = GENDER_OPTS[gender] || GENDER_OPTS.masc;

  /* Switching tabs filters the visible options and coerces any value
     that doesn't belong to the new gender to a valid one. The Emoji
     tab swaps the whole face out for a single emoji; switching back to
     Guy/Gal clears the emoji so the built face shows again. */
  function switchGender(g) {
    setGender(g);
    if (g === 'emoji') {
      setDraft(d => ({ ...d, emoji: d.emoji || ALL_EMOJIS[0] }));
      return;
    }
    setDraft(d => {
      const o = GENDER_OPTS[g];
      return {
        ...d,
        emoji:      undefined,
        hair:       coerceKey(d.hair, o.hair),
        eyes:       coerceKey(d.eyes, o.eyes),
        brows:      coerceKey(d.brows || 'soft', o.brows),
        mouth:      coerceKey(d.mouth, o.mouth),
        facialHair: g === 'masc' ? d.facialHair : 'none',
        earrings:   g === 'femme' ? d.earrings : 'none',
        blush:      g === 'femme' ? d.blush : 'none',
      };
    });
  }

  return (
    <>
      <div className="avb-overlay" onClick={onCancel} />
      <div className="avb-modal" role="dialog" aria-label="Customize avatar">
        <header className="avb-hd">
          <div className="avb-title">🎨 Build {name ? `${name}'s` : 'an'} avatar</div>
          <button className="avb-close" onClick={onCancel} aria-label="Close">✕</button>
        </header>

        <div className="avb-body">
          <div className="avb-preview">
            <div className="avb-preview-orb">
              <CustomAvatar avatar={draft} />
            </div>
            <div className="avb-tabs" role="tablist" aria-label="Avatar type">
              <button role="tab" aria-selected={gender === 'masc'}
                className={`avb-tab ${gender === 'masc' ? 'on' : ''}`}
                onClick={() => switchGender('masc')}>👨 Guy</button>
              <button role="tab" aria-selected={gender === 'femme'}
                className={`avb-tab ${gender === 'femme' ? 'on' : ''}`}
                onClick={() => switchGender('femme')}>👩 Gal</button>
              <button role="tab" aria-selected={gender === 'emoji'}
                className={`avb-tab ${gender === 'emoji' ? 'on' : ''}`}
                onClick={() => switchGender('emoji')}>😀 Emoji</button>
            </div>
            <button className="avb-surprise" onClick={() => setDraft(d => (
              gender === 'emoji'
                ? { ...d, emoji: ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)] }
                : { ...d, ...presetAvatar(gender) }
            ))}>
              🎲 Surprise me
            </button>
          </div>

          <div className="avb-controls">
            {gender === 'emoji' ? (
              <>
                <Section label="Backdrop">
                  <ChipRow options={BG_STYLES} value={draft.bgStyle || 'gradient'} onPick={v => set({ bgStyle: v })} />
                </Section>
                <Section label="Background">
                  <Swatches items={BG_COLORS.map((g, i) => ({ key: i, bg: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }))}
                    value={draft.bg} onPick={v => set({ bg: v })} />
                </Section>
                {EMOJI_CATEGORIES.map(cat => (
                  <Section key={cat.label} label={cat.label}>
                    <div className="avb-emoji-grid">
                      {cat.emojis.map(em => (
                        <button
                          key={em}
                          type="button"
                          className={`avb-emoji ${draft.emoji === em ? 'on' : ''}`}
                          onClick={() => set({ emoji: em })}
                          aria-label={`Emoji ${em}`}
                        >{em}</button>
                      ))}
                    </div>
                  </Section>
                ))}
              </>
            ) : (
            <>
            <Section label="Backdrop">
              <ChipRow options={BG_STYLES} value={draft.bgStyle || 'gradient'} onPick={v => set({ bgStyle: v })} />
            </Section>

            <Section label="Background">
              <Swatches items={BG_COLORS.map((g, i) => ({ key: i, bg: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }))}
                value={draft.bg} onPick={v => set({ bg: v })} />
            </Section>

            <Section label="Shirt">
              <Swatches items={SHIRT_COLORS.map(c => ({ key: c, bg: c }))}
                value={draft.shirt} onPick={v => set({ shirt: v })} />
            </Section>

            <Section label="Face shape">
              <ChipRow options={FACE_SHAPES} value={draft.faceShape || 'oval'} onPick={v => set({ faceShape: v })} />
            </Section>

            <Section label="Skin">
              <Swatches items={SKIN_TONES.map(c => ({ key: c, bg: c }))}
                value={draft.skin} onPick={v => set({ skin: v })} />
            </Section>

            <Section label="Hair">
              <ChipRow options={opts.hair} value={draft.hair} onPick={v => set({ hair: v })} />
            </Section>

            <Section label="Hair color">
              <Swatches items={HAIR_COLORS.map(c => ({ key: c, bg: c }))}
                value={draft.hairColor} onPick={v => set({ hairColor: v })} />
            </Section>

            <Section label="Hairline">
              <ChipRow options={HAIRLINES} value={draft.hairline || 'straight'} onPick={v => set({ hairline: v })} />
            </Section>

            <Section label="Eyebrows">
              <ChipRow options={opts.brows} value={draft.brows || 'soft'} onPick={v => set({ brows: v })} />
            </Section>

            <Section label="Eyes">
              <ChipRow options={opts.eyes} value={draft.eyes} onPick={v => set({ eyes: v })} />
            </Section>

            <Section label="Eye color">
              <Swatches items={EYE_COLORS.map(c => ({ key: c, bg: c }))}
                value={draft.eyeColor} onPick={v => set({ eyeColor: v })} />
            </Section>

            <Section label="Mouth">
              <ChipRow options={opts.mouth} value={draft.mouth} onPick={v => set({ mouth: v })} />
            </Section>

            {gender === 'masc' && (
              <Section label="Facial hair">
                <ChipRow options={FACIAL_HAIR} value={draft.facialHair} onPick={v => set({ facialHair: v })} />
              </Section>
            )}

            <Section label="Glasses">
              <ChipRow options={GLASSES} value={draft.glasses} onPick={v => set({ glasses: v })} />
            </Section>

            {gender === 'femme' && (
              <Section label="Earrings">
                <ChipRow options={EARRINGS} value={draft.earrings} onPick={v => set({ earrings: v })} />
              </Section>
            )}

            {gender === 'femme' && (
              <Section label="Cheeks">
                <ChipRow options={BLUSH} value={draft.blush} onPick={v => set({ blush: v })} />
              </Section>
            )}
            </>
            )}
          </div>
        </div>

        <footer className="avb-foot">
          <button className="app-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="app-btn primary" onClick={() => onSave(draft)}>✓ Save avatar</button>
        </footer>
      </div>
    </>
  );
}

function Section({ label, children }) {
  return (
    <div className="avb-section">
      <div className="avb-section-lbl">{label}</div>
      {children}
    </div>
  );
}

function Swatches({ items, value, onPick }) {
  return (
    <div className="avb-swatches">
      {items.map(it => (
        <button
          key={it.key}
          className={`avb-swatch ${value === it.key ? 'on' : ''}`}
          style={{ background: it.bg }}
          onClick={() => onPick(it.key)}
          aria-label="Option"
        />
      ))}
    </div>
  );
}

function ChipRow({ options, value, onPick }) {
  return (
    <div className="avb-chips">
      {options.map(o => (
        <button
          key={o.key}
          className={`avb-chip ${value === o.key ? 'on' : ''}`}
          onClick={() => onPick(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
