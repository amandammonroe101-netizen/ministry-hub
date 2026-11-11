import { useUserStoreKey } from '../../lib/userStore';

/* ─────────────────────────────────────────────────────────────
   Shared, editable label lists reused across Women's Ministry
   pages. All Women seeds and reads these today; the future Bible
   Studies and Mentorship Pairs pages will read/write the SAME
   keys once built, so nothing has to migrate later.

   Storage: womens:bible-studies / womens:mentors → array of
   { id, label }. Foreign-key strategy matches Children's bands
   (see childrens/bandsConfig.js): a woman's `bibleStudy` /
   `mentor` / `mentee` field stores the LABEL, not the id, so a
   record stays legible even if this list is edited later.

   `mentors` doubles as the name registry for BOTH the "Mentor"
   and "Mentee" fields — it's really just a shared list of people
   worth remembering the spelling of, not two separate concepts.
   ───────────────────────────────────────────────────────────── */

const makeItemId = () => 'wl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export function useBibleStudies() {
  return useUserStoreKey('womens:bible-studies', []);
}

export function useMentors() {
  return useUserStoreKey('womens:mentors', []);
}

/* Prayer Groups list — same foreign-key-by-label strategy as Bible
   Studies. The Prayer Groups page stores the full group records
   (leader, meeting info, request log) under this same key; a
   woman's `prayerGroup` field stores the group's LABEL. */
export function usePrayerGroups() {
  return useUserStoreKey('womens:prayer-groups', []);
}

export function makeListItem(label) {
  return { id: makeItemId(), label: (label || '').trim() };
}

/* ─────────────────────────────────────────────────────────────
   Meeting-schedule dropdown choices — shared by Bible Studies
   (a study's own Day/Time/How Often/Location) AND Life Stages'
   meeting groups (the same four fields on a group). Keeping one
   copy here means a Bible Study's schedule and a Meeting Group's
   schedule are always drawn from identical fixed lists, which
   matters once a group is linked to a study and the two need to
   cascade onto each other (see LifeStages.jsx's updateGroup and
   BibleStudies.jsx's DEFAULT_STUDY/OverviewTab).

   A value that predates these lists (or was typed in before they
   existed) is preserved by whichever page renders it, as a one-off
   extra <option> — see both pages' selects for that pattern.
   ───────────────────────────────────────────────────────────── */
export const MEETING_DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export const MEETING_TIMES = (() => {
  const out = [];
  for (let h = 6; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m === 30) continue;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push(`${h12}:${m === 0 ? '00' : '30'} ${period}`);
    }
  }
  return out;
})();

export const MEETING_FREQUENCIES = ['Weekly', 'Every other week', 'Monthly', 'Seasonally', 'One-time'];
export const CONTACT_FREQUENCIES = ['Weekly', 'Every other week', 'Monthly', 'As needed'];

/* ─────────────────────────────────────────────────────────────
   Life stages. A fixed set (not a user-editable list like Bible
   Studies/Mentors above) — AllWomen's `lifeStage` field and the
   Life Stages page both read this same array so the two pages
   can never drift out of sync.
   ───────────────────────────────────────────────────────────── */
export const LIFE_STAGES = [
  'Young Adult', 'Newly Married', 'Mom', 'Empty Nester', 'Widow',
];

export const LIFE_STAGE_META = {
  'Young Adult':   { icon: '🌱', short: 'college-age–mid 20s', blurb: 'College-age through mid-20s, finding their footing in faith and community.' },
  'Newly Married':  { icon: '💍', short: 'first years of marriage', blurb: 'First years of marriage — building a home and a shared spiritual life.' },
  'Mom':            { icon: '🤱', short: 'raising kids at home', blurb: 'Raising kids at home, from newborns through the teen years.' },
  'Empty Nester':   { icon: '🍂', short: 'kids grown and gone', blurb: 'Kids grown and gone — a season of rediscovery and deeper ministry involvement.' },
  'Widow':          { icon: '🕊️', short: 'life after losing a spouse', blurb: 'Navigating loss and life after the death of a spouse.' },
  'Single':         { icon: '🌷', short: 'any age or season', blurb: 'Single women of any age, walking with the church as their own household of faith.' },
  'All Ages':       { icon: '🌸', short: 'every stage combined', blurb: 'Every woman in the ministry, across every life stage, all in one place.' },
};

/* Life Stages (the page) renders ALL_AGES_STAGE followed by
   LIFE_STAGES + any custom stages — i.e. useLifeStages().stages —
   as one ordered journey, top to bottom, in list order, every
   entry styled and connected identically. Nothing is special-cased
   out of that sequence (Single included), so the journey always
   matches whatever stages a ministry has configured.

   ALL_AGES_STAGE itself is an always-present overview tab —
   deliberately NOT part of LIFE_STAGES/customStages (a woman's own
   lifeStage should never be "All Ages"), so it survives no matter
   what real stages get added or removed, even though on-page it's
   just the first item in the list, no different visually from the
   rest. */
export const ALL_AGES_STAGE = 'All Ages';

/* Single is NOT one of the sequential, age-based LIFE_STAGES above —
   it's an independent, checkbox-driven attribute (see AllWomen's
   `single` field) a woman can carry alongside whatever lifeStage she's
   actually in. It still gets its own pseudo-stage tab on the Life
   Stages page, pinned right after ALL_AGES_STAGE, so LIFE_STAGE_META's
   'Single' entry is kept around purely for that tab's icon/blurb. */
export const SINGLE_STAGE = 'Single';

/* Business rule: a woman's independent `single` checkbox should
   auto-clear the moment her lifeStage reaches "Newly Married" — she's
   no longer single once she's married, even though `single` is a
   separate field from `lifeStage`. Every place lifeStage gets SET
   (All Women's Life Stage select, Life Stages' "Confirm move", and
   the roster's "Move up Life Stage" button) should spread this patch
   into its update instead of writing `{ lifeStage }` directly, so the
   rule can't be bypassed by any one entry point. */
export function lifeStagePatchFor(newStage) {
  const patch = { lifeStage: newStage };
  if (newStage === 'Newly Married') patch.single = false;
  return patch;
}

/* Generic "customizable named stage set" engine — shared by Life
   Stages AND Faith Journey (and any future set like it). Both are
   the same shape: a fixed base list + base meta, layered with a
   ministry's overrides/custom additions/order/removals, persisted
   under four Firestore-backed keys (see callers below for the exact
   key names). Kept here as one implementation so the two customizer
   UIs (`StageSetSettings.jsx`) and the two stage lists can never
   drift out of sync in behavior. */
function useStageSet({ baseList, baseMeta, keys, idPrefix }) {
  const [overrides, setOverrides] = useUserStoreKey(keys.overrides, {});
  const [customStages, setCustomStages] = useUserStoreKey(keys.custom, []);
  const [order, setOrder] = useUserStoreKey(keys.order, []);
  const [removedBuiltins, setRemovedBuiltins] = useUserStoreKey(keys.removed, []);

  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const safeCustom = Array.isArray(customStages) ? customStages : [];
  const safeOrder = Array.isArray(order) ? order : [];
  const safeRemoved = Array.isArray(removedBuiltins) ? removedBuiltins : [];

  const naturalStages = [...baseList.filter(s => !safeRemoved.includes(s)), ...safeCustom.map(c => c.label)];
  const stages = safeOrder.length
    ? [...safeOrder.filter(s => naturalStages.includes(s)), ...naturalStages.filter(s => !safeOrder.includes(s))]
    : naturalStages;

  const getStageMeta = (stage) => {
    const base = baseMeta[stage];
    if (base) {
      const ov = safeOverrides[stage] || {};
      return { ...base, icon: ov.icon || base.icon, ...(ov.description ? { short: ov.description, blurb: ov.description } : {}) };
    }
    const custom = safeCustom.find(c => c.label === stage);
    if (custom) {
      const desc = custom.description || '';
      return { icon: custom.icon || '🌸', short: desc, blurb: desc };
    }
    return { icon: '🌸', short: '', blurb: '' };
  };

  const setStageDescription = (stage, description) => {
    if (baseMeta[stage]) {
      setOverrides(prev => {
        const base = prev && typeof prev === 'object' ? prev : {};
        return { ...base, [stage]: { ...(base[stage] || {}), description } };
      });
    } else {
      setCustomStages(prev => (Array.isArray(prev) ? prev : []).map(c => (c.label === stage ? { ...c, description } : c)));
    }
  };

  const setStageIcon = (stage, icon) => {
    if (baseMeta[stage]) {
      setOverrides(prev => {
        const base = prev && typeof prev === 'object' ? prev : {};
        return { ...base, [stage]: { ...(base[stage] || {}), icon } };
      });
    } else {
      setCustomStages(prev => (Array.isArray(prev) ? prev : []).map(c => (c.label === stage ? { ...c, icon } : c)));
    }
  };

  const addStage = (label, description = '') => {
    const trimmed = (label || '').trim();
    if (!trimmed || stages.includes(trimmed)) return;
    setCustomStages(prev => [...(Array.isArray(prev) ? prev : []), { id: idPrefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), label: trimmed, description, icon: '🌸' }]);
  };

  /* Accepts a stage NAME (not an id) so it works for both built-ins
     and custom stages with one call. Built-ins can't be spliced out
     of the base list const, so they're recorded in `removedBuiltins`
     instead and filtered out of `stages` above — same end result. */
  const removeStage = (stage) => {
    if (baseList.includes(stage)) {
      setRemovedBuiltins(prev => {
        const base = Array.isArray(prev) ? prev : [];
        return base.includes(stage) ? base : [...base, stage];
      });
    } else {
      setCustomStages(prev => (Array.isArray(prev) ? prev : []).filter(c => c.label !== stage));
    }
    setOrder(prev => (Array.isArray(prev) ? prev : []).filter(s => s !== stage));
  };

  /* Drag-to-reorder — indices are positions within `stages` (the
     already-merged, already-ordered list), so this always reorders
     relative to what's on screen right now. Persists the FULL
     resulting order, not just a delta, so it's stable even as
     stages get added/removed later. */
  const reorderStage = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= stages.length || toIndex < 0 || toIndex >= stages.length) return;
    const arr = [...stages];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    setOrder(arr);
  };

  return { stages, customStages: safeCustom, overrides: safeOverrides, getStageMeta, setStageDescription, setStageIcon, addStage, removeStage, reorderStage };
}

/* Life stage CUSTOMIZATION layer — lets a ministry override the
   built-in stages' descriptions and add their own extra stages,
   from the "Page Settings" tab on All Women / Life Stages. Four
   Firestore-backed pieces, all keyed by stage NAME (foreign-key-by-
   label, same strategy as Bible Studies/Mentors):

   - `womens:life-stage-overrides` → { [stageName]: { description, icon } }
   - `womens:custom-life-stages`   → [{ id, label, description, icon }]
   - `womens:life-stage-order`     → [stageName, …]
   - `womens:life-stage-removed`   → [stageName, …]

   `useLifeStages()` merges all four with the fixed base list so
   every Women's Ministry page (All Women, Stories, Communication,
   Engagement, Life Stages) can read one combined, always-in-sync
   stage list + description/icon lookup instead of the raw consts. */
export function useLifeStages() {
  return useStageSet({
    baseList: LIFE_STAGES,
    baseMeta: LIFE_STAGE_META,
    keys: {
      overrides: 'womens:life-stage-overrides',
      custom:    'womens:custom-life-stages',
      order:     'womens:life-stage-order',
      removed:   'womens:life-stage-removed',
    },
    idPrefix: 'wls',
  });
}

/* ─────────────────────────────────────────────────────────────
   Faith Journey. A second, independent "named stage set" — same
   idea as Life Stages (a customizable, ordered list a woman can be
   placed on), but tracking spiritual growth rather than age/family
   season. A woman can be anywhere on Life Stages AND anywhere on
   Faith Journey at once — the two are unrelated axes (e.g. a "Mom"
   can be "New Believer" or "Discipling Others"). Stored on her
   record as `faithJourney` (a stage NAME, mirrors `lifeStage`).
   ───────────────────────────────────────────────────────────── */
export const FAITH_JOURNEY = [
  'Seeking', 'New Believer', 'Growing', 'Discipling Others', 'Returning',
];

export const FAITH_JOURNEY_META = {
  'Seeking':           { icon: '🔍', short: 'exploring faith', blurb: "Exploring faith and the church, hasn't yet decided to follow Christ." },
  'New Believer':      { icon: '🌱', short: 'recently trusted Christ', blurb: 'Recently trusted Christ and is early in the journey of faith.' },
  'Growing':           { icon: '📖', short: 'growing in discipleship', blurb: 'Actively growing in discipleship, community, and the Word.' },
  'Discipling Others': { icon: '🤝', short: 'investing in others', blurb: 'Mature in faith and actively investing in and discipling others.' },
  'Returning':         { icon: '🕊️', short: 'coming back after time away', blurb: 'Returning to faith and community after a season away.' },
};

/* Same four-key customization strategy as Life Stages, under its
   own storage keys so the two never collide. */
export function useFaithJourney() {
  return useStageSet({
    baseList: FAITH_JOURNEY,
    baseMeta: FAITH_JOURNEY_META,
    keys: {
      overrides: 'womens:faith-journey-overrides',
      custom:    'womens:custom-faith-journey',
      order:     'womens:faith-journey-order',
      removed:   'womens:faith-journey-removed',
    },
    idPrefix: 'wfj',
  });
}

/* Per-stage info, editable from the Life Stages page. Keyed by
   stage name (not id) — same label-as-key approach as everything
   else in this file, safe because the stage list itself is fixed.
   Shape: { leader, careFocus, groups: [{ id, label, day, time,
   location, leader, bibleStudyId, leaderDeveloping }] }.

   `groups` are the stage's actual meeting groups — a stage often
   runs more than one (e.g. "Tuesday Morning Moms" AND "Thursday
   Night Moms"), so this is a list, not a single day/time/location.
   A woman's `lifeStageGroup` field stores a group's LABEL (same
   foreign-key-by-label strategy as Bible Studies/Mentors) — the
   Life Stages page is responsible for cascading a rename and
   clearing the assignment when a group is deleted.

   `bibleStudyId` is an id into the shared `womens:bible-studies`
   list (see useBibleStudies() above) — that list holds BOTH
   ministry-run studies (from the Bible Studies page, identified by
   a truthy `label`) and a woman's own plans built in My Involvement
   → Bible Study Builder (identified by a truthy `title`), so one
   dropdown/id naturally covers linking to either. `leaderDeveloping`
   is a fallback flag for "no study picked yet, the leader is still
   putting one together" — the two are mutually exclusive. */
export function useLifeStageInfo() {
  return useUserStoreKey('womens:life-stage-info', {});
}

const makeStageGroupId = () => 'wsg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

/* `startDate` (yyyy-mm-dd) + `frequency` (one of MEETING_FREQUENCIES,
   see LifeStages.jsx) describe the group's meeting cadence.

   `checklist` is the group's pre-meeting prep list — items are
   { id, label, done }, edited (added/removed/relabeled) in the
   group's Edit mode but checked off in View mode, since checking
   things off is a week-to-week task, not an editing task.

   `contactMode` ('whole' | 'individual') + `contactFrequency`
   describe how often the group's leader is expected to reach out —
   either one message/call to the group as a whole, or individual
   check-ins with each woman. */
const makeChecklistItemId = () => 'wsc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
export function makeChecklistItem(label) {
  return { id: makeChecklistItemId(), label: (label || '').trim(), done: false };
}

export function makeStageGroup(overrides) {
  return {
    id: makeStageGroupId(),
    label: '', day: '', time: '', location: '', leader: '',
    bibleStudyId: '', leaderDeveloping: false,
    startDate: '', frequency: '',
    checklist: [],
    contactMode: '', contactFrequency: '',
    ...overrides,
  };
}
