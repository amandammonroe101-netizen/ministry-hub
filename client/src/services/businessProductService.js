/* Business Ministry — product catalog, Firestore-backed
   (one doc per product, scoped under its owning business).

   Storage layout:
     /users/{uid}/businesses/{businessId}/products/{productId}

   Same one-doc-per-item shape as studioProjectService / mealTrainService:
   photos, price tiers, variations, and bundle links all live on the
   product's own doc so one business's catalog can't crowd out another's.
   ─────────────────────────────────────────────────────────── */
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { requireUid, makeId, wrap } from './_firestoreShim';
import { deleteBlobAtPath } from '../lib/userStorage';

const COLL_NAME = 'products';

function productsCollRef(uid, businessId) {
  return collection(db, 'users', uid, 'businesses', businessId, COLL_NAME);
}
function productDocRef(uid, businessId, id) {
  return doc(db, 'users', uid, 'businesses', businessId, COLL_NAME, id);
}

export function defaultProduct(data = {}) {
  return {
    id:          makeId('prod'),
    name:        data.name || 'Untitled product',
    description: data.description || '',
    type:        data.type || 'physical',           // 'physical' | 'digital'
    binderId:    data.binderId ?? null,                // id into business.productBinders, or null
    tags:        data.tags || [],                     // [string]
    photos:      data.photos || [],                   // [{ id, url, path }]
    priceTiers:  data.priceTiers || [                  // [{ id, label, price, qty, ingredients }]
      { id: makeId('tier'), label: 'Retail', price: 0, qty: 1, ingredients: [] },
    ],
    /* Cost of goods lives per-tier now (each tier's ingredients sum to
       its own cost of goods), not as one product-wide number — a
       Wholesale case pack rarely costs the same per-unit to make as a
       single Retail item. `ingredients` here (top-level) is only used
       for bundle products, which have one price and no tiers. */
    ingredients: data.ingredients || [],                // [{ id, name, price }] — bundles only
    isBundle:        data.isBundle ?? false,
    bundleProductIds: data.bundleProductIds || [],      // [productId]
    bundlePrice:      data.bundlePrice ?? 0,
    /* Food & fulfillment details — surfaced on the form for food-type
       businesses (Bakery, Online Bakery, Cafe, Restaurant) but stored
       on every product regardless, so switching a business's category
       never loses data already entered. */
    allergens:           data.allergens || [],           // [string], e.g. 'Milk','Tree Nuts'
    dietaryTags:         data.dietaryTags || [],          // [string], e.g. 'Vegan','Gluten-Free'
    leadTime:            data.leadTime || '',             // free text, e.g. '48 hours', 'Same day'
    shelfLife:           data.shelfLife || '',            // free text, e.g. '3 days at room temp'
    storageInstructions: data.storageInstructions || '',  // free text
    servings:            data.servings || '',             // free text, e.g. 'Serves 8-10'
    fulfillmentMethods:  data.fulfillmentMethods || [],   // ['pickup' | 'delivery' | 'shipping']
    minOrderQty:         data.minOrderQty ?? null,
    seasonal:            data.seasonal ?? false,
    seasonalWindow:      data.seasonalWindow || '',       // free text, e.g. 'Oct - Dec'
    /* Standard hands-on prep time, in minutes — how long this item
       actually takes to make. Distinct from leadTime (fulfillment
       turnaround). Used by AI Pricing Research to weigh labor into
       its suggested markup. null = not set. */
    prepTimeMinutes:     data.prepTimeMinutes ?? null,
    /* Customization — flavor/filling/frosting/size choices offered on
       this product, plus custom-message and rush-order add-ons. */
    flavorOptions:       data.flavorOptions || [],         // [string]
    fillingOptions:      data.fillingOptions || [],        // [string]
    frostingOptions:     data.frostingOptions || [],       // [string]
    sizeOptions:         data.sizeOptions || [],            // [string]
    allowsCustomMessage: data.allowsCustomMessage ?? false,
    rushFee:             data.rushFee ?? 0,
    active:      data.active ?? true,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };
}

async function readProduct(uid, businessId, id) {
  const snap = await getDoc(productDocRef(uid, businessId, id));
  return snap.exists() ? snap.data() : null;
}

async function readAllProducts(uid, businessId) {
  const snap = await getDocs(productsCollRef(uid, businessId));
  return snap.docs.map(d => d.data());
}

export const businessProductService = {
  getAll: async (businessId) => {
    const uid = requireUid();
    const list = await readAllProducts(uid, businessId);
    return wrap(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  },

  getOne: async (businessId, id) => {
    const uid = requireUid();
    return wrap(await readProduct(uid, businessId, id));
  },

  create: async (businessId, data) => {
    const uid = requireUid();
    const product = defaultProduct(data);
    await setDoc(productDocRef(uid, businessId, product.id), product);
    return wrap(product);
  },

  update: async (businessId, id, data) => {
    const uid = requireUid();
    const cur = await readProduct(uid, businessId, id);
    if (!cur) return wrap(null);
    const next = { ...cur, ...data, updated_at: new Date().toISOString() };
    await setDoc(productDocRef(uid, businessId, id), next);
    return wrap(next);
  },

  delete: async (businessId, id) => {
    const uid = requireUid();
    const target = await readProduct(uid, businessId, id);
    (target?.photos || []).forEach(p => {
      if (p.path) deleteBlobAtPath(p.path).catch(() => {});
    });
    await deleteDoc(productDocRef(uid, businessId, id));
    return wrap({ id });
  },
};

/* Used by businessService.duplicate() to deep-copy every product in
 * one business's catalog into a freshly-created business. Photos are
 * shared by URL/path (not re-uploaded) — cheap, and safe since
 * neither business ever deletes the other's underlying blob. */
export async function copyAllProducts(uid, fromBusinessId, toBusinessId) {
  const products = await readAllProducts(uid, fromBusinessId);
  await Promise.all(products.map(p => {
    const copy = { ...p, id: makeId('prod') };
    return setDoc(productDocRef(uid, toBusinessId, copy.id), copy);
  }));
}
