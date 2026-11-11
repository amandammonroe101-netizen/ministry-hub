import { useUserStoreKey } from '../../lib/userStore';

/* ─────────────────────────────────────────────────────────────
   Shared, editable label lists + hooks reused across Hospitality
   Ministry pages — same pattern as womens/womensListsConfig.js
   and childrens/bandsConfig.js.

   `hosts` (hospitality:hosts) is the central volunteer directory —
   every station page (Parking Lot, Greeters, Welcome Center,
   Ushers & Seating, Offering & Communion, Coffee & Snacks, Setup
   & Decor) and Scheduling assign FROM this same list by host id,
   so a host's name/photo/contact only ever lives in one place.

   `guests` (hospitality:guests) is the central first-time-visitor
   directory — Follow-Up Pipeline, First-Time Visitor Gifts, and
   Newcomer Connect Events all read/write the SAME records so a
   guest's pipeline stage, gift given, and event RSVPs stay in
   sync no matter which page you're on.
   ───────────────────────────────────────────────────────────── */

const makeId = (p) => p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

export function useHosts() {
  return useUserStoreKey('hospitality:hosts', []);
}

export function useGuests() {
  return useUserStoreKey('hospitality:guests', []);
}

export function makeListItem(label) {
  return { id: makeId('hl'), label: (label || '').trim() };
}

/* Fixed set of hospitality positions — Roles & Positions catalogs
   these, and every station page + Scheduling filters the shared
   host directory by the matching role key. A host's `roles` field
   stores an array of these KEYS (stable, unlike labels). */
export const ROLES = [
  { key: 'parking',   label: 'Parking Attendant', icon: '🅿️', path: '/hospitality/sunday/parking' },
  { key: 'greeter',   label: 'Greeter',            icon: '👋', path: '/hospitality/sunday/greeters' },
  { key: 'welcome',   label: 'Welcome Desk',       icon: 'ℹ️', path: '/hospitality/sunday/welcome-center' },
  { key: 'usher',     label: 'Usher',              icon: '🪑', path: '/hospitality/sunday/ushers' },
  { key: 'communion', label: 'Communion Prep',     icon: '🪙', path: '/hospitality/sunday/offering' },
  { key: 'coffee',    label: 'Coffee Host',        icon: '☕', path: '/hospitality/food/coffee' },
  { key: 'decor',     label: 'Setup & Decor',      icon: '🎀', path: '/hospitality/ops/setup' },
];

export const roleMeta = (key) => ROLES.find(r => r.key === key) || null;

/* Service-time / preference options offered on a host's "Service
   preference" dropdown — editable by the admin from Profile circle
   → Page Settings (see ServiceOptionsSettings.jsx) so every church's
   own service schedule can replace these defaults. */
export const DEFAULT_SERVICE_OPTIONS = ['9:00 AM', '11:00 AM', 'Either', 'Rotates'];
export function useServiceOptions() {
  return useUserStoreKey('hospitality:service-options', DEFAULT_SERVICE_OPTIONS);
}

/* Per-role notes/details (station map, script, protocol…), keyed
   by role key. Editable from Roles & Positions. */
export function useRoleInfo() {
  return useUserStoreKey('hospitality:role-info', {});
}

/* Onboarding trainees — In Training tracks shadow shifts + a
   standards checklist per trainee, optionally linked back to a
   full host record (see Women's Leaders `womanId` pattern) once
   they've been added to the host directory. */
export function useTrainees() {
  return useUserStoreKey('hospitality:trainees', []);
}

export const DEFAULT_TRAINING_LABELS = [
  'Background check',
  'Hospitality standards walkthrough',
  'Shadowed a full Sunday',
  'Signed off by team lead',
];

export const makeTrainingItem = (label) => ({ id: makeId('tr'), label, done: false, dueDate: '' });

export const today = () => new Date().toISOString().slice(0, 10);

/* First-time-visitor pipeline stages, in order. Every New Guests
   page reads/writes the SAME `stage` key on a shared guest record
   (Welcome Center's visitor-card capture creates guests at 'card'):
     card            → Card received at Welcome Center
     gift            → First-time-visitor gift delivered
     thank-you       → Thank-you note/message sent
     called          → Follow-up call/text made
     invited         → Invited to a Connect Event
     attending       → Attending a group/team */
export const GUEST_STAGES = [
  { key: 'card',      label: 'Card Received',    icon: '🎟️' },
  { key: 'gift',      label: 'Gift Delivered',   icon: '🎁' },
  { key: 'thank-you', label: 'Thank-You Sent',   icon: '💌' },
  { key: 'called',    label: 'Called',           icon: '📞' },
  { key: 'invited',   label: 'Invited to Connect', icon: '📨' },
  { key: 'attending', label: 'Attending Group',  icon: '🌱' },
];

export const stageMeta = (key) => GUEST_STAGES.find(s => s.key === key) || GUEST_STAGES[0];
export const stageIndex = (key) => Math.max(0, GUEST_STAGES.findIndex(s => s.key === key));
