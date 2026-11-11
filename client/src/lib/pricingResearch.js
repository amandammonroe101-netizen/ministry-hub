/* ─────────────────────────────────────────────────────────────
   pricingResearch — free, built-in Retail / Wholesale / Bulk-case
   pricing suggestions for one product, plus a written summary of
   the reasoning. Runs entirely locally: no API key, no external
   call, no cost. Reads the product's title, cost of goods, prep
   time, and existing price tiers — the user never has to type
   anything to get a suggestion.

   The suggestions are grounded in standard, well-known pricing
   conventions for each business category (keystone/2x-3x retail
   markup, wholesale priced so a reseller can mark it up again,
   bulk/case priced for the deepest volume discount), keyed off
   the same BUSINESS_CATEGORIES used on the "My Businesses" page —
   then adjusted by:
     - what the product's own title says it actually is (a wedding
       cake and a cupcake are not priced the same, even in the same
       category, regardless of what price tiers either has on file)
     - how much hands-on prep time the product takes, as a stand-in
       for labor cost

   Local competitor pricing is not factored in — that's on the
   user to weigh in for themselves. */

/* multiplier applied to cost of goods; `note` is folded into the
   written summary to explain *why* that multiple was chosen. */
const CATEGORY_PRICING = {
  bakery:        { retail: 2.8, wholesale: 1.7, bulk: 1.35, note: 'bakery goods, where a 2.5–3x markup over ingredient cost is standard to cover labor, spoilage, and packaging' },
  'online-bakery': { retail: 2.8, wholesale: 1.7, bulk: 1.35, note: 'bakery goods, where a 2.5–3x markup over ingredient cost is standard to cover labor, spoilage, and packaging' },
  cafe:          { retail: 3.0, wholesale: 1.8, bulk: 1.4, note: 'cafe/beverage items, which typically carry a 3x-or-higher markup since prep time, cups/packaging, and overhead eat into thin per-item margins' },
  restaurant:    { retail: 3.0, wholesale: 1.8, bulk: 1.4, note: 'prepared food, which typically carries a 3x markup over ingredient cost to cover labor, overhead, and waste' },
  retail:        { retail: 2.2, wholesale: 1.4, bulk: 1.2, note: 'general retail goods, which usually follow "keystone" pricing — about 2x cost — with wholesale buyers paying closer to cost so they have room to mark it up again themselves' },
  'online-shop': { retail: 2.3, wholesale: 1.45, bulk: 1.2, note: 'online/Etsy-style goods, which usually follow "keystone" pricing — roughly 2–2.5x cost' },
  boutique:      { retail: 2.5, wholesale: 1.5, bulk: 1.25, note: 'apparel/boutique items, which typically markup 2–2.5x cost' },
  crafts:        { retail: 3.2, wholesale: 1.9, bulk: 1.5, note: 'handmade goods, where a higher 3x+ retail markup is standard to fairly value the maker\'s time and skill, not just materials' },
  photography:   { retail: 3.5, wholesale: 2.0, bulk: 1.6, note: 'creative/photography work, where pricing centers on time and expertise rather than materials, so markups run higher than physical-goods retail' },
  salon:         { retail: 3.2, wholesale: 1.9, bulk: 1.5, note: 'salon/beauty services, priced mainly on time and skill rather than product cost' },
  fitness:       { retail: 3.2, wholesale: 1.9, bulk: 1.5, note: 'fitness/wellness services, priced mainly on time and expertise rather than materials' },
  cleaning:      { retail: 2.6, wholesale: 1.6, bulk: 1.3, note: 'home-service work, priced to cover labor time plus supplies' },
  consulting:    { retail: 3.5, wholesale: 2.2, bulk: 1.8, note: 'consulting/freelance work, priced primarily on expertise and time rather than materials' },
  digital:       { retail: 4.0, wholesale: 2.2, bulk: 1.6, note: 'digital products, which carry near-zero marginal cost per copy, so pricing is driven by perceived value rather than cost — wholesale/bulk here represent reseller or multi-seat licensing discounts' },
  other:         { retail: 2.5, wholesale: 1.6, bulk: 1.3, note: 'this kind of product, using a standard 2.5x retail / 1.6x wholesale / 1.3x bulk cost multiple' },
};

const DEFAULT_PRICING = CATEGORY_PRICING.other;

/* Rough "what similar products typically sell for" range per
   category — a free stand-in for competitor price research. This is
   NOT derived from the product's own cost of goods; it's a baseline
   for a standard item of this type, then shifted by the same
   title/prep signals used for cost-based pricing above (a wedding
   cake shifts the whole range up, a cupcake shifts it down). */
const TYPICAL_MARKET_RANGE = {
  bakery:          { low: 18, high: 45 },
  'online-bakery': { low: 18, high: 45 },
  cafe:            { low: 4, high: 8 },
  restaurant:      { low: 12, high: 28 },
  retail:          { low: 15, high: 45 },
  'online-shop':   { low: 12, high: 40 },
  boutique:        { low: 25, high: 80 },
  crafts:          { low: 15, high: 60 },
  photography:     { low: 150, high: 500 },
  salon:           { low: 35, high: 120 },
  fitness:         { low: 40, high: 150 },
  cleaning:        { low: 80, high: 250 },
  consulting:      { low: 75, high: 250 },
  digital:         { low: 15, high: 75 },
  other:           { low: 20, high: 60 },
};
const DEFAULT_MARKET_RANGE = TYPICAL_MARKET_RANGE.other;

/* Title/description keyword reads — these are what let "wedding cake"
   and "cupcake" land on different pricing even inside the same
   category and even if neither has price tiers set yet. Adjustments
   stack if a title matches more than one pattern (e.g. "custom
   wedding cake"). */
const KEYWORD_MODIFIERS = [
  { pattern: /\b(wedding|tiered|multi-tier|custom order|bespoke)\b/i, retail: 0.6, wholesale: 0.35, bulk: 0.1, marketScale: 5, tag: 'a custom, labor-intensive piece' },
  { pattern: /\b(premium|deluxe|luxury|artisan|handcrafted|gourmet)\b/i, retail: 0.4, wholesale: 0.25, bulk: 0.1, marketScale: 1.7, tag: 'a premium/artisan item' },
  { pattern: /\b(cupcake|cookie|muffin|mini|bite-size|bite size|single|slice|sample)\b/i, retail: -0.5, wholesale: -0.25, bulk: -0.1, marketScale: 0.35, tag: 'a small, commodity-style item' },
  { pattern: /\b(bulk|wholesale|case pack)\b/i, retail: -0.2, wholesale: -0.1, bulk: -0.05, marketScale: 0.55, tag: 'already positioned as a bulk/wholesale item' },
];

/* Standard hands-on prep time, in minutes — a free stand-in for
   labor cost. Longer prep pushes the markup up (more of the price
   needs to cover time, not just ingredients/materials). */
function readPrepTimeAdjustment(prepTimeMinutes) {
  const m = Number(prepTimeMinutes) || 0;
  if (m <= 0) return { retail: 0, wholesale: 0, bulk: 0, marketScale: 1, label: '' };
  if (m <= 15) return { retail: -0.1, wholesale: -0.05, bulk: 0, marketScale: 0.85, label: `about ${m} min of hands-on prep — a quick item, so labor adds little to the price` };
  if (m <= 60) return { retail: 0, wholesale: 0, bulk: 0, marketScale: 1, label: `about ${m} min of hands-on prep` };
  if (m <= 180) {
    const hrs = (m / 60).toFixed(1).replace(/\.0$/, '');
    return { retail: 0.3, wholesale: 0.15, bulk: 0.05, marketScale: 1.4, label: `about ${hrs} hr of hands-on prep, so labor is weighed into the price` };
  }
  const hrs = (m / 60).toFixed(1).replace(/\.0$/, '');
  return { retail: 0.7, wholesale: 0.35, bulk: 0.1, marketScale: 2.2, label: `about ${hrs} hr of hands-on prep — a significant time investment that should be reflected in the price` };
}

const MIN_RETAIL_MULT = 1.3;
const MIN_WHOLESALE_MULT = 1.1;
const MIN_BULK_MULT = 1.02;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ingredientsTotal(ingredients) {
  return (ingredients || []).reduce((sum, i) => sum + (Number(i.price) || 0), 0);
}

/* Cost of goods now lives per price tier (each tier sums its own
 * ingredients) rather than as one product-wide number. For research
 * purposes we anchor off the Retail tier's cost of goods (or the
 * first tier's, if none is labeled Retail) — or, for bundles, the
 * sum of the bundle's own ingredients. */
function primaryCogs(product) {
  if (product?.isBundle) return round2(ingredientsTotal(product?.ingredients));
  const tiers = product?.priceTiers || [];
  const tier = tiers.find(t => /retail/i.test(t.label || '')) || tiers[0];
  return round2(ingredientsTotal(tier?.ingredients));
}

function readKeywordAdjustment(product) {
  const text = `${product?.name || ''} ${product?.description || ''}`;
  const tags = [];
  let retail = 0, wholesale = 0, bulk = 0, marketScale = 1;
  KEYWORD_MODIFIERS.forEach(mod => {
    if (mod.pattern.test(text)) {
      retail += mod.retail;
      wholesale += mod.wholesale;
      bulk += mod.bulk;
      marketScale *= mod.marketScale;
      tags.push(mod.tag);
    }
  });
  return { retail, wholesale, bulk, marketScale, tags };
}

/* Competitor price range + perceived-value positioning — a free
   stand-in for "what does the market/competitors charge, and does
   this product read as premium or budget". Uses dedicated
   multiplicative scale factors (not the additive cost-multiplier
   deltas above) so a wedding cake's competitor range moves as
   dramatically as a wedding cake actually should versus a cupcake's. */
function computeMarketResearch({ businessCategory, kw, prep, currentPrice, name }) {
  const range = TYPICAL_MARKET_RANGE[businessCategory] || DEFAULT_MARKET_RANGE;
  const scale = Math.min(10, Math.max(0.2, kw.marketScale * prep.marketScale));
  const low = round2(range.low * scale);
  const high = round2(range.high * scale);

  let positioning, note;
  if (currentPrice > 0) {
    if (currentPrice < low * 0.9) {
      positioning = 'Below market';
      note = `${name} is priced at $${currentPrice.toFixed(2)}, below the typical $${low.toFixed(2)}–$${high.toFixed(2)} competitors charge for this kind of product — that may be leaving margin on the table, or it's an intentional budget position.`;
    } else if (currentPrice > high * 1.1) {
      positioning = 'Above market (premium)';
      note = `${name} is priced at $${currentPrice.toFixed(2)}, above the typical $${low.toFixed(2)}–$${high.toFixed(2)} competitor range — consistent with a premium position, as long as the product/branding backs it up.`;
    } else {
      positioning = 'In line with market';
      note = `${name} is priced at $${currentPrice.toFixed(2)}, within the typical $${low.toFixed(2)}–$${high.toFixed(2)} competitor range for this kind of product.`;
    }
  } else {
    positioning = kw.tags.some(t => t.includes('custom') || t.includes('premium'))
      ? 'Premium (by product type)'
      : kw.tags.some(t => t.includes('commodity'))
        ? 'Budget (by product type)'
        : 'Mid-market (by product type)';
    note = `No price is set for ${name} yet, so positioning is estimated from its title alone — typical competitors charge $${low.toFixed(2)}–$${high.toFixed(2)} for this kind of product.`;
  }

  return { low, high, positioning, note };
}

/** Reads the product's title, cost of goods, prep time, and (if no
 *  cost of goods is on file) its existing price tiers, and returns
 *  { retail, wholesale, bulk, market, summary, generatedAt }. `bulk`
 *  is null when a bulk/case suggestion doesn't make sense for this
 *  product (min order of 5 or less — it isn't bought in volume).
 *  `market` is a free competitor-price-range + positioning read:
 *  { low, high, positioning, note }. Synchronous, free, and
 *  requires no API key. */
export function generatePricingResearch({ product, businessCategory }) {
  const base = CATEGORY_PRICING[businessCategory] || DEFAULT_PRICING;
  const name = product?.name || 'This product';
  const cogs = primaryCogs(product);

  const kw = readKeywordAdjustment(product);
  const prep = readPrepTimeAdjustment(product?.prepTimeMinutes);

  const retailMult = Math.max(MIN_RETAIL_MULT, base.retail + kw.retail + prep.retail);
  const wholesaleMult = Math.max(MIN_WHOLESALE_MULT, base.wholesale + kw.wholesale + prep.wholesale);
  const bulkMult = Math.max(MIN_BULK_MULT, base.bulk + kw.bulk + prep.bulk);

  const minOrderQty = Number(product?.minOrderQty) || 0;
  const suppressBulk = minOrderQty > 0 && minOrderQty <= 5;

  const titleNote = kw.tags.length
    ? ` Its title reads as ${kw.tags.join(' and ')}, which shifts the usual multiple for the category up or down accordingly.`
    : '';
  const prepNote = prep.label ? ` With ${prep.label}.` : '';
  const bulkNote = suppressBulk
    ? ` No bulk/case price is suggested — with a minimum order of ${minOrderQty}, this isn't typically bought in volume.`
    : '';

  // The price already on file (not the suggestion) — used to judge
  // whether the product currently reads as above/below/in line with
  // what competitors typically charge.
  const existingPrice = product?.isBundle
    ? Number(product?.bundlePrice) || 0
    : Number((product?.priceTiers || []).find(t => /retail/i.test(t.label || ''))?.price)
      || Number((product?.priceTiers || [])[0]?.price) || 0;
  const market = computeMarketResearch({ businessCategory, kw, prep, currentPrice: existingPrice, name });

  if (cogs > 0) {
    const retail = round2(cogs * retailMult);
    const wholesale = round2(cogs * wholesaleMult);
    const bulk = suppressBulk ? null : round2(cogs * bulkMult);
    const bulkSentence = suppressBulk ? '' : ` and bulk/case at ${bulkMult.toFixed(2)}x cost (~$${bulk.toFixed(2)}) to reward the largest volume orders`;
    const summary = `${name} is priced here off its $${cogs.toFixed(2)} cost of goods, using typical multiples for ${base.note}.${titleNote}${prepNote} That puts retail at ${retailMult.toFixed(2)}x cost (~$${retail.toFixed(2)}), wholesale at ${wholesaleMult.toFixed(2)}x cost (~$${wholesale.toFixed(2)}) for buyers who'll resell it${bulkSentence}.${bulkNote} Treat these as a starting point — adjust for your specific local competitors.`;
    return { retail, wholesale, bulk, market, summary, generatedAt: Date.now() };
  }

  // No cost of goods on file — anchor off the highest existing price
  // tier (or bundle price) instead, scaling wholesale/bulk down from
  // it using the same (title/prep-adjusted) ratios as the cost-based
  // path.
  const anchor = product?.isBundle
    ? Number(product?.bundlePrice) || 0
    : Math.max(0, ...(Array.isArray(product?.priceTiers) ? product.priceTiers.map(t => Number(t.price) || 0) : [0]));

  if (anchor > 0) {
    const retail = anchor;
    const wholesale = round2(anchor * (wholesaleMult / retailMult));
    const bulk = suppressBulk ? null : round2(anchor * (bulkMult / retailMult));
    const bulkSentence = suppressBulk ? '' : ` and bulk/case around $${bulk.toFixed(2)}`;
    const summary = `${name} has no cost of goods on file yet, so this anchors off its current $${anchor.toFixed(2)} price instead.${titleNote}${prepNote} Scaling down using the same ratios typical for ${base.note}, wholesale lands around $${wholesale.toFixed(2)}${bulkSentence}.${bulkNote} Add a cost of goods for a more grounded suggestion next time.`;
    return { retail, wholesale, bulk, market, summary, generatedAt: Date.now() };
  }

  return {
    retail: 0,
    wholesale: 0,
    bulk: suppressBulk ? null : 0,
    market,
    summary: `${name} doesn't have a cost of goods or an existing price yet — add one of those first so pricing research has something to anchor its suggestions to.`,
    generatedAt: Date.now(),
  };
}
