import Anthropic from '@anthropic-ai/sdk';

/* ─────────────────────────────────────────────────────────────
   involvementBriefing — real AI-generated daily summary for the
   My Involvement dashboard (Women's ministry). Distinct from
   lib/dailyBriefing.js, which is the offline/templated app-wide
   "what's new" popup — this one makes an actual Claude API call
   over the user's own mentors/mentees/studies/leading roles (plus
   any Bible studies she's building) and asks for a short, warm
   paragraph.

   Storage:
     ai:claude-api-key        → string, set in Settings
     womens:involvement-briefing → { date, text, generatedAt }
   ───────────────────────────────────────────────────────────── */

export const CLAUDE_API_KEY_STORAGE_KEY = 'ai:claude-api-key';
export const INVOLVEMENT_BRIEFING_KEY = 'womens:involvement-briefing';

const MODEL = 'claude-opus-4-7';

const todayKey = () => new Date().toISOString().slice(0, 10);

/** True if a cached briefing exists and was generated today. */
export function isBriefingFresh(cached) {
  return Boolean(cached && cached.date === todayKey() && cached.text);
}

const KIND_LABEL = {
  mentor: 'Mentors', mentee: 'Mentees', study: 'Studies & groups', leading: 'Leading & hosting',
};

function describeEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return 'She is not currently tracking any mentors, mentees, studies, or leadership roles.';
  return Object.entries(KIND_LABEL).map(([kind, label]) => {
    const items = list.filter(e => e.kind === kind && (e.status || 'active') !== 'completed');
    if (items.length === 0) return null;
    const bits = items.map(e => {
      const parts = [e.name || '(unnamed)'];
      if (e.focusArea) parts.push(`focus: ${e.focusArea}`);
      if (e.role) parts.push(`role: ${e.role}`);
      if (e.nextDate) parts.push(`next: ${e.nextDate}`);
      if (e.status === 'paused') parts.push('paused');
      return parts.join(', ');
    });
    return `${label}: ${bits.join(' | ')}`;
  }).filter(Boolean).join('\n');
}

function describeBibleStudies(bibleStudies) {
  const list = Array.isArray(bibleStudies) ? bibleStudies : [];
  if (list.length === 0) return 'No Bible studies drafted in the builder yet.';
  return list.map(s => {
    const sessionCount = Array.isArray(s.sessions) ? s.sessions.length : 0;
    return `"${s.title || 'Untitled study'}" (${s.theme || 'no theme'}) — ${sessionCount} session${sessionCount === 1 ? '' : 's'}, status: ${s.status || 'draft'}`;
  }).join('\n');
}

/** Builds a friendly, actionable error message from a Claude SDK error
 *  (or a plain Error, e.g. our own NO_API_KEY guard). Never string-match
 *  on error.message — branch on the SDK's typed exception classes. */
export function friendlyErrorMessage(error) {
  if (error?.code === 'NO_API_KEY') return error.message;
  if (error instanceof Anthropic.AuthenticationError) return 'That Claude API key was rejected — double-check it in Settings.';
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have permission for this request.";
  if (error instanceof Anthropic.RateLimitError) return 'Claude is rate-limited right now — try again in a moment.';
  if (error instanceof Anthropic.BadRequestError) return `Request was rejected: ${error.message}`;
  if (error instanceof Anthropic.APIError) return `Claude API error (${error.status}): ${error.message}`;
  return error?.message || 'Something went wrong generating the briefing.';
}

/** Makes the actual Claude call. Returns { text, date, generatedAt }. */
export async function generateInvolvementBriefing({ apiKey, entries, bibleStudies }) {
  if (!apiKey) {
    const err = new Error('Add a Claude API key in Settings to enable the AI briefing.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const prompt = [
    "Here is one woman's current ministry involvement, from her personal tracker:",
    '',
    '## Mentors, mentees, studies, and leadership roles',
    describeEntries(entries),
    '',
    '## Bible studies she is writing',
    describeBibleStudies(bibleStudies),
    '',
    'Write a short (3-5 sentence), warm, encouraging daily briefing paragraph summarizing where she stands today and what deserves attention soon (e.g. an upcoming check-in, a paused relationship worth revisiting, a study she should keep working on). Speak directly to her as "you". No headers, no bullet points — one flowing paragraph.',
  ].join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: 'You are a warm, concise ministry assistant helping a woman keep track of who she is discipling, being discipled by, and leading.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  return { text, date: todayKey(), generatedAt: Date.now() };
}
