import { SparkleIcon } from '../../../components/CopyButton.jsx';
import { useSidePane, violationFixPlanSpec } from '../../side-pane/index.js';
import { t } from '../../../strings/index.js';

/** The fix-plan trigger as one of the detail's pills; the sparkle keeps it the AI action. */
export default function FixPlanButton({ v, principle }) {
  const { addWindow } = useSidePane();
  return (
    <button type="button" className="eval-pill-btn wb-fixplan"
      onClick={() => { const spec = violationFixPlanSpec(v, principle); if (spec) addWindow(spec); }}>
      <SparkleIcon />
      {t('violations.wbFixPlan')}
    </button>
  );
}
