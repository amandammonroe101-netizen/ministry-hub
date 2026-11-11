import LifeStagesPageSettings from './LifeStagesPageSettings';
import FaithJourneyPageSettings from './FaithJourneyPageSettings';
import './LifeStagesPageSettings.css';

/* ─────────────────────────────────────────────────────────────
   Women's Ministry — combined "📋 Page Settings" tab content,
   rendered inside the shared profile avatar's modal (ProfileModal's
   `guide` prop) on both All Women and Life Stages.

   Stacks the two customizable named-stage-set panels — Life Stages
   and Faith Journey — under one shared tab so either page's profile
   circle can customize both lists identically. ───────────────────────────────────────────────────────────── */

export default function PageSettingsGuide({ lifeStages, faithJourney }) {
  return (
    <div className="wls-set-stack">
      <div className="wls-set-block">
        <div className="wls-set-block-title">🌱 Life Stages</div>
        <LifeStagesPageSettings lifeStages={lifeStages} />
      </div>
      <div className="wls-set-block">
        <div className="wls-set-block-title">✝️ Faith Journey</div>
        <FaithJourneyPageSettings faithJourney={faithJourney} />
      </div>
    </div>
  );
}
