import StageSetSettings from './StageSetSettings';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — "Page Settings" tab content, rendered inside
   the shared profile avatar's modal (see ProfileModal's `guide`
   prop, relabeled to "📋 Page Settings" from All Women / Life
   Stages).

   Lets this ministry customize the shared Life Stages list:
     - override a stage's description (shown in dropdowns/cards
       across All Women, Stories, Communication, Life Stages)
     - add its own extra stages beyond the built-ins
     - reorder / remove stages

   All state lives in `useLifeStages()` (womensListsConfig.js) —
   this is a thin wrapper around the generic `StageSetSettings`
   panel (shared with Faith Journey's settings), passed that hook's
   return value as the `lifeStages` prop. */

export default function LifeStagesPageSettings({ lifeStages }) {
  return (
    <StageSetSettings
      stageSet={lifeStages}
      itemNoun="stage"
      namePlaceholder='Stage name — e.g. "Caregiver"'
      hint="Customize the Life Stages used across Women's Ministry — change the description shown next to each stage, or add your own stages beyond the built-ins."
    />
  );
}
