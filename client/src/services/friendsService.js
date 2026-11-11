/* Friends service — Firestore-backed.
   Three top-level lists per user:
     friends            — array; each friend embeds timeline + events + prayers
     community-prayers  — array (shared prayer wall, but currently per-user)
     prayer-events      — array (events your friends invited you to)

   Per-friend children (timeline, events, prayers) embed under each friend
   doc so the page's `getFriendDetail` is a simple lookup. */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY_FRIENDS   = 'friends';
const KEY_COMMUNITY = 'community-prayers';
const KEY_EVENTS    = 'prayer-events';

/* ── helpers ─────────────────────────────────────────────── */
function ensureFriendShape(f) {
  return {
    id:                       f.id,
    name:                     f.name || '',
    role:                     f.role || '',
    church:                   f.church || '',
    initials:                 f.initials || (f.name || '').slice(0, 2).toUpperCase(),
    color_from:               f.color_from || '#3730a3',
    color_to:                 f.color_to   || '#6c3fc9',
    avatar:                   f.avatar || null,
    photo_url:                f.photo_url || '',
    tags:                     Array.isArray(f.tags) ? f.tags : [],
    is_online:                f.is_online ? 1 : 0,
    nickname:                 f.nickname || '',
    city:                     f.city || '',
    life_season:              f.life_season || '',
    life_update:              f.life_update || '',
    emotional_status:         f.emotional_status || 'peaceful',
    interests:                Array.isArray(f.interests) ? f.interests : [],
    birthday:                 f.birthday || '',
    last_contacted:           f.last_contacted || '',
    how_met:                  f.how_met || '',
    communication_frequency:  f.communication_frequency || 'weekly',
    reach_out_days:           Array.isArray(f.reach_out_days) ? f.reach_out_days : [],
    friend_status:            f.friend_status || '',
    notes:                    f.notes || '',
    timeline:                 Array.isArray(f.timeline) ? f.timeline : [],
    events:                   Array.isArray(f.events)   ? f.events   : [],
    prayers:                  Array.isArray(f.prayers)  ? f.prayers  : [],
    created_at:               f.created_at || new Date().toISOString(),
  };
}

export const friendsService = {
  /* ── Friend list ─────────────────────────────────────── */
  getFriends: async () => {
    const uid = requireUid();
    return wrap(await readList(uid, KEY_FRIENDS));
  },

  addFriend: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const friend = ensureFriendShape({ id: makeId('f'), ...data });
    await writeList(uid, KEY_FRIENDS, [friend, ...list]);
    return wrap(friend);
  },

  getFriendDetail: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    return wrap(list.find(f => f.id === id) || null);
  },

  updateFriend: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const next = list.map(f => f.id === id ? ensureFriendShape({ ...f, ...data }) : f);
    await writeList(uid, KEY_FRIENDS, next);
    return wrap(next.find(f => f.id === id) || null);
  },

  removeFriend: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    await writeList(uid, KEY_FRIENDS, list.filter(f => f.id !== id));
    return wrap({ id });
  },

  /* ── Per-friend prayers ──────────────────────────────── */
  addFriendPrayer: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const prayer = {
      id:         makeId('fp'),
      content:    data.content || '',
      category:   data.category || 'General',
      status:     data.status || 'active',
      is_urgent:  data.is_urgent ? 1 : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = list.map(f => f.id === id
      ? { ...f, prayers: [prayer, ...(f.prayers || [])] }
      : f);
    await writeList(uid, KEY_FRIENDS, next);
    return wrap(prayer);
  },

  updateFriendPrayer: async (id, pid, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const next = list.map(f => {
      if (f.id !== id) return f;
      return {
        ...f,
        prayers: (f.prayers || []).map(p => p.id === pid ? { ...p, ...data, updated_at: new Date().toISOString() } : p),
      };
    });
    await writeList(uid, KEY_FRIENDS, next);
    const updatedFriend = next.find(f => f.id === id);
    return wrap(updatedFriend?.prayers?.find(p => p.id === pid) || null);
  },

  /* ── Per-friend timeline & events ────────────────────── */
  addTimeline: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const entry = {
      id:         makeId('ft'),
      content:    data.content || '',
      entry_type: data.entry_type || 'note',
      dot_color:  data.dot_color || '#c4b5fd',
      created_at: new Date().toISOString(),
    };
    const next = list.map(f => f.id === id
      ? { ...f, timeline: [entry, ...(f.timeline || [])] }
      : f);
    await writeList(uid, KEY_FRIENDS, next);
    return wrap(entry);
  },

  addFriendEvent: async (id, data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_FRIENDS);
    const ev = {
      id:          makeId('fe'),
      title:       data.title || '',
      event_date:  data.event_date || '',
      event_type:  data.event_type || 'general',
      description: data.description || '',
      created_at:  new Date().toISOString(),
    };
    const next = list.map(f => f.id === id
      ? { ...f, events: [ev, ...(f.events || [])] }
      : f);
    await writeList(uid, KEY_FRIENDS, next);
    return wrap(ev);
  },

  /* ── Community prayer wall ───────────────────────────── */
  getCommunityPrayers: async () => {
    const uid = requireUid();
    return wrap(await readList(uid, KEY_COMMUNITY));
  },

  addCommunityPrayer: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_COMMUNITY);
    const row = {
      id:                makeId('cp'),
      friend_id:         data.friend_id || null,
      content:           data.content || '',
      category:          data.category || 'General',
      is_urgent:         data.is_urgent ? 1 : 0,
      praying_count:     1,
      user_is_praying:   1,
      created_at:        new Date().toISOString(),
    };
    await writeList(uid, KEY_COMMUNITY, [row, ...list]);
    return wrap(row);
  },

  togglePraying: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_COMMUNITY);
    const next = list.map(p => {
      if (p.id !== id) return p;
      const wasPraying = !!p.user_is_praying;
      return {
        ...p,
        user_is_praying: wasPraying ? 0 : 1,
        praying_count: Math.max(0, (p.praying_count || 0) + (wasPraying ? -1 : 1)),
      };
    });
    await writeList(uid, KEY_COMMUNITY, next);
    return wrap(next.find(p => p.id === id) || null);
  },

  /* ── Prayer events ───────────────────────────────────── */
  getEvents: async () => {
    const uid = requireUid();
    return wrap(await readList(uid, KEY_EVENTS));
  },

  addEvent: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_EVENTS);
    const ev = {
      id:              makeId('pe'),
      friend_id:       data.friend_id || null,
      title:           data.title || '',
      description:     data.description || '',
      location:        data.location || '',
      event_date:      data.event_date || '',
      event_time:      data.event_time || '',
      user_is_joining: 0,
      created_at:      new Date().toISOString(),
    };
    await writeList(uid, KEY_EVENTS, [ev, ...list]);
    return wrap(ev);
  },

  toggleJoining: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY_EVENTS);
    const next = list.map(e => e.id === id ? { ...e, user_is_joining: e.user_is_joining ? 0 : 1 } : e);
    await writeList(uid, KEY_EVENTS, next);
    return wrap(next.find(e => e.id === id) || null);
  },
};
