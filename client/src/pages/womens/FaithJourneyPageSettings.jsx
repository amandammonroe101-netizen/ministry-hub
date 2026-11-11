import StageSetSettings from './StageSetSettings';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — "Faith Journey" settings content, rendered
   alongside Life Stages settings inside the shared profile
   avatar's modal (ProfileModal's `guide` prop).

   Lets this ministry customize the shared Faith Journey list:
     - override a step's description (shown in dropdowns/cards
       across All Women, Life Stages roster, etc.)
     - add its own extra steps beyond the built-ins
     - reorder / remove steps

   All state lives in `useFaithJourney()` (womensListsConfig.js) —
   this is a thin wrapper around the generic `StageSetSettings`
   panel (shared with Life Stages' settings), passed that hook's
   return value as the `faithJourney` prop. */

const FAITH_ICON_CHOICES = ['🔍', '🌱', '📖', '🤝', '🕊️', '✝️', '🙏', '✨', '💧', '🔥', '☀️', '🌸'];

export default function FaithJourneyPageSettings({ faithJourney }) {
  return (
    <StageSetSettings
      stageSet={faithJourney}
      itemNoun="faith journey step"
      iconChoices={FAITH_ICON_CHOICES}
      namePlaceholder='Step name — e.g. "Baptized"'
      hint="Customize the Faith Journey steps used across Women's Ministry — change the description shown next to each step, or add your own steps beyond the built-ins."
    />
  );
}
