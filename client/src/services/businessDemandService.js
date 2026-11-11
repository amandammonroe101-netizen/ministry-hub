/* Business Ministry — Demand Analysis: how much of each Inventory
   item is needed to fulfill every open order, versus how much is on
   hand right now. Nothing is stored for this feature — it's derived
   entirely from Orders (which products/tiers/qty were ordered) and
   Pricing's linked ingredients (see applyIngredientField in
   ProductPricing.jsx, which sets inventoryItemId + qtyUsed on an
   ingredient once it's linked to an Inventory item).
   ─────────────────────────────────────────────────────────── */
import { isPastOrder } from './businessOrderService';

/** Every ingredient a given order line item draws on, resolved from
 *  the *current* product/tier recipe rather than a snapshot — an
 *  open order hasn't been made yet, so what you're about to shop for
 *  should reflect today's recipe, not whatever it was when the order
 *  was placed. Bundles have one flat ingredient list; regular
 *  products are matched by tier label (order items don't carry a
 *  tier id, only its label — see defaultOrderItem). */
export function ingredientsForOrderItem(item, products) {
  const product = (products || []).find(p => p.id === item.productId);
  if (!product) return [];
  if (product.isBundle) return product.ingredients || [];
  const tier = (product.priceTiers || []).find(t => (t.label || 'Price') === item.tierLabel);
  return tier?.ingredients || [];
}

/** For every Inventory item linked to at least one ingredient used by
 *  an open (non-past) order, works out total qty needed, qty on
 *  hand, and the shortfall — plus exactly which open orders are
 *  driving that demand (each with how much of the item that one
 *  order needs), so the Demand Analysis dashboard can link straight
 *  back to Orders. Sorted worst shortfall first. Items with no
 *  demand from any open order simply don't appear. */
export function computeDemand({ products, orders, inventoryItems }) {
  const openOrders = (orders || []).filter(o => !isPastOrder(o));
  const byItem = new Map();

  function bucket(inventoryItemId) {
    if (!byItem.has(inventoryItemId)) {
      byItem.set(inventoryItemId, {
        item: (inventoryItems || []).find(i => i.id === inventoryItemId),
        needed: 0,
        orders: new Map(), // orderId -> { order, qty }
      });
    }
    return byItem.get(inventoryItemId);
  }

  openOrders.forEach(order => {
    (order.items || []).forEach(orderItem => {
      const orderQty = Number(orderItem.qty) || 0;
      if (orderQty <= 0) return;
      ingredientsForOrderItem(orderItem, products).forEach(ing => {
        if (!ing.inventoryItemId || !ing.qtyUsed) return;
        const qtyNeeded = Number(ing.qtyUsed) * orderQty;
        if (qtyNeeded <= 0) return;
        const b = bucket(ing.inventoryItemId);
        b.needed += qtyNeeded;
        const existing = b.orders.get(order.id) || { order, qty: 0 };
        existing.qty += qtyNeeded;
        b.orders.set(order.id, existing);
      });
    });
  });

  return Array.from(byItem.values())
    .filter(b => b.item) // the linked inventory item may since have been deleted
    .map(b => {
      const onHand = Number(b.item.quantity) || 0;
      const shortfall = Math.max(0, b.needed - onHand);
      return {
        item: b.item,
        needed: b.needed,
        onHand,
        shortfall,
        orders: Array.from(b.orders.values())
          .sort((a, c) => (c.order.created_at || '').localeCompare(a.order.created_at || '')),
      };
    })
    .sort((a, c) => c.shortfall - a.shortfall || c.needed - a.needed);
}
