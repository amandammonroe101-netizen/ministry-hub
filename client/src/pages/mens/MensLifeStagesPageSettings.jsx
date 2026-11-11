import StageSetSettings from '../womens/StageSetSettings';

/* ─────────────────────────────────────────────────────────────
   Men's Ministry — "Page Settings" tab content, rendered inside
   the shared profile avatar's modal (see ProfileModal's `guide`
   prop, relabeled to "🧭 Page Settings" from Life Stages).

   Lets this ministry customize the shared Life Stages list:
     - override a stage's description (shown in dropdowns/cards
       across All Men, Life Stages, and any future page)
     - add its own extra stages beyond the built-ins
     - reorder / remove stages

   All state lives in `useLifeStages()` (mensListsConfig.js) — this
   is a thin wrapper around the generic `StageSetSettings` panel,
   reused directly from Women's Ministry since it's fully generic
   (no Women's-specific copy or logic lives in that component),
   passed that hook's return value as the `lifeStages` prop.
   Mirrors LifeStagesPageSettings.jsx exactly. */

export default function MensLifeStagesPageSettings({ lifeStages }) {
  return (
    <StageSetSettings
      stageSet={lifeStages}
      itemNoun="stage"
      namePlaceholder='Stage name — e.g. "Caregiver"'
      hint="Customize the Life Stages used across Men's Ministry — change the description shown next to each stage, or add your own stages beyond the built-ins."
    />
  );
}
