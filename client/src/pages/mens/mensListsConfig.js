import { useUserStoreKey } from '../../lib/userStore';

/* ─────────────────────────────────────────────────────────────
   Men's Ministry — shared, editable label lists reused across
   Men's Ministry pages. All Men seeds and reads these today; the
   future Bible Studies and Mentorship Pairs pages will read/write
   the SAME keys once built, so nothing has to migrate later.
   Mirrors womensListsConfig.js — same foreign-key-by-label
   strategy: a man's `bibleStudy` / `mentor` / `mentee` /
   `accountabilityGroup` field stores the LABEL, not the id, so a
   record stays legible even if this list is edited later.
   ───────────────────────────────────────────────────────────── */

const makeItemId = () => 'ml_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export function useBibleStudies() {
  return useUserStoreKey('mens:bible-studies', []);
}

export function useMentors() {
  return useUserStoreKey('mens:mentors', []);
}

/* Accountability Groups list — same foreign-key-by-label strategy
   as Bible Studies. The Accountability Groups page stores the full
   group records (leader, meeting info, covenant log) under this
   same key; a man's `accountabilityGroup` field stores the group's
   LABEL. */
export function useAccountabilityGroups() {
  return useUserStoreKey('mens:accountability-groups', []);
}

export function makeListItem(label) {
  return { id: makeItemId(), label: (label || '').trim() };
}

/* ─────────────────────────────────────────────────────────────
   Life stages. A fixed set (not a user-editable list like Bible
   Studies/Mentors above) — AllMen's `lifeStage` field and the
   future Life Stages page both read this same array so the two
   pages can never drift out of sync.
   ───────────────────────────────────────────────────────────── */
export const LIFE_STAGES = [
  'Young Adult', 'Husband', 'Father', 'Empty Nester', 'Widower',
];

export const LIFE_STAGE_META = {
  'Young Adult':  { icon: '🌱', short: 'college-age–mid 20s', blurb: 'College-age through mid-20s, finding their footing in faith and community.' },
  'Husband':      { icon: '💍', short: 'first years of marriage', blurb: 'First years of marriage — building a home and leading a shared spiritual life.' },
  'Father':       { icon: '👨‍👦', short: 'raising kids at home', blurb: 'Raising kids at home, from newborns through the teen years.' },
  'Empty Nester': { icon: '🍂', short: 'kids grown and gone', blurb: 'Kids grown and gone — a season of rediscovery and deeper ministry involvement.' },
  'Widower':      { icon: '🕊️', short: 'life after losing a spouse', blurb: 'Navigating loss and life after the death of a spouse.' },
  'Single':       { icon: '🧭', short: 'any age or season', blurb: 'Single men of any age, walking with the church as their own household of faith.' },
  'All Ages':     { icon: '⛰', short: 'every stage combined', blurb: 'Every man in the ministry, across every life stage, all in one place.' },
};

/* Life Stages (the page) renders ALL_AGES_STAGE followed by
   LIFE_STAGES + any custom stages — same ordering rule as
   womensListsConfig. ALL_AGES_STAGE and SINGLE_STAGE are pinned
   pseudo-stages, not part of the sequential age-based journey. */
export const ALL_AGES_STAGE = 'All Ages';
export const SINGLE_STAGE = 'Single';

/* Business rule: a man's independent `single` checkbox should
   auto-clear the moment his lifeStage reaches "Husband" — mirrors
   lifeStagePatchFor in womensListsConfig.js. */
export function lifeStagePatchFor(newStage) {
  const patch = { lifeStage: newStage };
  if (newStage === 'Husband') patch.single = false;
  return patch;
}

/* Generic "customizable named stage set" engine — shared by Life
   Stages AND Faith Journey (and any future set like it). Mirrors
   womensListsConfig's useStageSet exactly, just under Men's own
   storage keys so the two ministries never collide. */
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
      return { icon: custom.icon || '⛰', short: desc, blurb: desc };
    }
    return { icon: '⛰', short: '', blurb: '' };
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
    setCustomStages(prev => [...(Array.isArray(prev) ? prev : []), { id: idPrefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), label: trimmed, description, icon: '⛰' }]);
  };

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

export function useLifeStages() {
  return useStageSet({
    baseList: LIFE_STAGES,
    baseMeta: LIFE_STAGE_META,
    keys: {
      overrides: 'mens:life-stage-overrides',
      custom:    'mens:custom-life-stages',
      order:     'mens:life-stage-order',
      removed:   'mens:life-stage-removed',
    },
    idPrefix: 'mls',
  });
}

/* ─────────────────────────────────────────────────────────────
   Faith Journey — same concept and stage names as Women's (a
   man can be anywhere on Life Stages AND anywhere on Faith
   Journey at once, tracked independently).
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

export function useFaithJourney() {
  return useStageSet({
    baseList: FAITH_JOURNEY,
    baseMeta: FAITH_JOURNEY_META,
    keys: {
      overrides: 'mens:faith-journey-overrides',
      custom:    'mens:custom-faith-journey',
      order:     'mens:faith-journey-order',
      removed:   'mens:faith-journey-removed',
    },
    idPrefix: 'mfj',
  });
}

/* Per-stage info, editable from the future Life Stages page. Same
   shape as womensListsConfig's useLifeStageInfo(). */
export function useLifeStageInfo() {
  return useUserStoreKey('mens:life-stage-info', {});
}

const makeStageGroupId = () => 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const makeChecklistItemId = () => 'msc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
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
