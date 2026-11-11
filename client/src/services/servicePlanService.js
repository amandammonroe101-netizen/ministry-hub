/* Service plans service — Firestore-backed.
   /users/{uid}/kv/service-plans → array of plan objects.
   Each plan embeds:
     items: [{ id, item_type, title, duration_min, notes, leader, setlist_id, sort_order }] */
import { requireUid, makeId, readList, writeList, wrap } from './_firestoreShim';

const KEY = 'service-plans';

async function mutatePlan(uid, id, mutator) {
  const list = await readList(uid, KEY);
  let updated = null;
  const next = list.map(p => {
    if (p.id !== id) return p;
    updated = mutator({
      ...p,
      items: Array.isArray(p.items) ? p.items : [],
      updated_at: new Date().toISOString(),
    });
    return updated;
  });
  await writeList(uid, KEY, next);
  return updated;
}

export const servicePlanService = {
  getAll: async () => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap([...list].sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')));
  },

  getOne: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    return wrap(list.find(p => p.id === id) || null);
  },

  create: async (data) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    const plan = {
      id:           makeId('plan'),
      name:         data.name || '',
      service_date: data.service_date || '',
      service_type: data.service_type || 'Sunday Morning',
      theme:        data.theme || '',
      notes:        data.notes || '',
      items:        [],
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };
    await writeList(uid, KEY, [plan, ...list]);
    return wrap(plan);
  },

  update: async (id, data) => {
    const uid = requireUid();
    const updated = await mutatePlan(uid, id, (p) => ({ ...p, ...data }));
    return wrap(updated);
  },

  delete: async (id) => {
    const uid = requireUid();
    const list = await readList(uid, KEY);
    await writeList(uid, KEY, list.filter(p => p.id !== id));
    return wrap({ id });
  },

  addItem: async (id, data) => {
    const uid = requireUid();
    const item = {
      id:           makeId('it'),
      item_type:    data.item_type || 'custom',
      title:        data.title || '',
      duration_min: data.duration_min ?? 5,
      notes:        data.notes || '',
      leader:       data.leader || '',
      setlist_id:   data.setlist_id || null,
      sort_order:   0,
    };
    // Return the whole hydrated plan (not just the new item) — callers
    // read `.items` off the response to refresh the timeline in one shot.
    const updated = await mutatePlan(uid, id, (p) => {
      item.sort_order = p.items.length;
      return { ...p, items: [...p.items, item] };
    });
    return wrap(updated);
  },

  updateItem: async (id, itemId, data) => {
    const uid = requireUid();
    await mutatePlan(uid, id, (p) => ({
      ...p,
      items: p.items.map(it => it.id === itemId ? { ...it, ...data } : it),
    }));
    return wrap({ id: itemId });
  },

  removeItem: async (id, itemId) => {
    const uid = requireUid();
    await mutatePlan(uid, id, (p) => ({
      ...p,
      items: p.items.filter(it => it.id !== itemId).map((it, i) => ({ ...it, sort_order: i })),
    }));
    return wrap({ id: itemId });
  },

  reorderItems: async (id, order) => {
    const uid = requireUid();
    await mutatePlan(uid, id, (p) => {
      const byId = new Map(p.items.map(it => [it.id, it]));
      const reordered = (order || [])
        .map((itemId, i) => byId.get(itemId) && { ...byId.get(itemId), sort_order: i })
        .filter(Boolean);
      const ordered = new Set(order || []);
      const tail = p.items.filter(it => !ordered.has(it.id));
      return { ...p, items: [...reordered, ...tail] };
    });
    return wrap({ id });
  },
};
