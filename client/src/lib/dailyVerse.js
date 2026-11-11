/* Daily verse — one encouraging Bible verse per calendar day.

   Behavior:
     • Generated "through AI" when Firebase AI Logic (Gemini) is
       available on the project. The model is asked for a single
       uplifting verse and returns { text, reference }.
     • Falls back to a curated, deterministic daily rotation when AI
       isn't reachable (API not enabled, offline, etc.) so a verse
       ALWAYS shows.
     • Cached in localStorage keyed by date, so opening the app many
       times in one day shows the SAME verse all day. A new day mints
       a fresh one.

   The splash (components/DailyVerseSplash) consumes useDailyVerse(). */

import { useEffect, useState } from 'react';
import { app } from './firebase';

const CACHE_KEY = 'daily-verse:v1';

function todayKey() {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86_400_000);
}

/* Curated fallback — used whenever AI generation isn't available. The
   day-of-year index makes the pick deterministic per day (stable if
   the cache is cleared) while still rotating through the year. */
const FALLBACK_VERSES = [
  { text: 'Trust in the Lord with all your heart, and do not lean on your own understanding.', reference: 'Proverbs 3:5' },
  { text: 'I can do all things through Christ who strengthens me.', reference: 'Philippians 4:13' },
  { text: 'The Lord is my shepherd; I shall not want.', reference: 'Psalm 23:1' },
  { text: 'Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.', reference: 'Joshua 1:9' },
  { text: 'And we know that in all things God works for the good of those who love him.', reference: 'Romans 8:28' },
  { text: 'Cast all your anxiety on him because he cares for you.', reference: '1 Peter 5:7' },
  { text: 'The Lord is close to the brokenhearted and saves those who are crushed in spirit.', reference: 'Psalm 34:18' },
  { text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.', reference: 'Philippians 4:6' },
  { text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles.', reference: 'Isaiah 40:31' },
  { text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.', reference: 'Jeremiah 29:11' },
  { text: 'Come to me, all you who are weary and burdened, and I will give you rest.', reference: 'Matthew 11:28' },
  { text: 'The Lord your God is with you, the Mighty Warrior who saves.', reference: 'Zephaniah 3:17' },
  { text: 'Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up.', reference: 'Galatians 6:9' },
  { text: 'This is the day that the Lord has made; let us rejoice and be glad in it.', reference: 'Psalm 118:24' },
  { text: 'God is our refuge and strength, an ever-present help in trouble.', reference: 'Psalm 46:1' },
  { text: 'Weeping may stay for the night, but rejoicing comes in the morning.', reference: 'Psalm 30:5' },
  { text: 'The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning.', reference: 'Lamentations 3:22-23' },
  { text: 'Be still, and know that I am God.', reference: 'Psalm 46:10' },
  { text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged.', reference: 'Joshua 1:9' },
  { text: 'When you pass through the waters, I will be with you; and when you pass through the rivers, they will not sweep over you.', reference: 'Isaiah 43:2' },
  { text: 'The Lord will fight for you; you need only to be still.', reference: 'Exodus 14:14' },
  { text: 'Delight yourself in the Lord, and he will give you the desires of your heart.', reference: 'Psalm 37:4' },
  { text: 'Give thanks to the Lord, for he is good; his love endures forever.', reference: 'Psalm 107:1' },
  { text: 'Therefore do not worry about tomorrow, for tomorrow will worry about itself.', reference: 'Matthew 6:34' },
  { text: 'For God so loved the world that he gave his one and only Son.', reference: 'John 3:16' },
  { text: 'Your word is a lamp for my feet, a light on my path.', reference: 'Psalm 119:105' },
  { text: 'Peace I leave with you; my peace I give you. Do not let your hearts be troubled.', reference: 'John 14:27' },
  { text: 'The name of the Lord is a fortified tower; the righteous run to it and are safe.', reference: 'Proverbs 18:10' },
  { text: 'He gives strength to the weary and increases the power of the weak.', reference: 'Isaiah 40:29' },
  { text: 'Rejoice in the Lord always. I will say it again: Rejoice!', reference: 'Philippians 4:4' },
  { text: 'Cast your cares on the Lord and he will sustain you; he will never let the righteous be shaken.', reference: 'Psalm 55:22' },
];

function curatedForToday() {
  const idx = dayOfYear() % FALLBACK_VERSES.length;
  return { ...FALLBACK_VERSES[idx], source: 'curated' };
}

/* Ask Gemini (via Firebase AI Logic) for a single verse. Returns null
   on any failure so the caller falls back to the curated list. The
   firebase/ai import is dynamic so a project without AI Logic enabled
   never pays the bundle/runtime cost beyond a caught error. */
async function generateViaAI(today) {
  if (!app) return null;
  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai');
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: 'gemini-2.0-flash' });

    const prompt =
      `Choose ONE short, uplifting Bible verse to encourage someone today (${today}). ` +
      `Vary your choice day to day. Respond with ONLY compact JSON in the form ` +
      `{"text":"<the full verse text>","reference":"<Book Chapter:Verse>"} ` +
      `— no commentary, no markdown, no code fences.`;

    /* Race the model call against a hard timeout so a slow/blocked
       network (common on locked-down church Wi-Fi, or when the AI API
       isn't reachable) can never leave the splash stuck on its loading
       dots. If we time out, we fall through to the curated verse. */
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI verse timed out')), 4000)),
    ]);
    const raw = result?.response?.text?.() || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed && parsed.text && parsed.reference) {
      return {
        text:      String(parsed.text).trim(),
        reference: String(parsed.reference).trim(),
        source:    'ai',
      };
    }
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dailyVerse] AI unavailable, using curated verse:', e?.message || e);
    return null;
  }
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.date === todayKey() && cached.text) return cached;
  } catch { /* ignore */ }
  return null;
}

/* Resolve today's verse: cache → AI → curated. Writes the chosen verse
   back to the cache so the rest of the day is stable. */
export async function getDailyVerse() {
  const cached = readCache();
  if (cached) return cached;

  const today = todayKey();
  const ai    = await generateViaAI(today);
  const verse = ai || curatedForToday();
  const out   = { date: today, ...verse };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

/* Hook for the splash. Seeds from cache synchronously (no flash when
   the day's verse already exists), otherwise resolves async. */
export function useDailyVerse() {
  const [verse, setVerse]     = useState(() => readCache());
  const [loading, setLoading] = useState(() => !readCache());

  useEffect(() => {
    if (verse) return;
    let alive = true;
    /* Hard backstop: never let the splash sit on its loading dots for
       more than 5s. If the verse hasn't resolved by then, show today's
       curated verse so the user always has something and can enter. */
    const backstop = setTimeout(() => {
      if (!alive) return;
      setVerse(prev => prev || curatedForToday());
      setLoading(false);
    }, 5000);
    getDailyVerse().then(v => {
      if (!alive) return;
      clearTimeout(backstop);
      setVerse(v);
      setLoading(false);
    });
    return () => { alive = false; clearTimeout(backstop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { verse, loading };
}
