import { standardBaseLabel } from '../hooks/useStandards.js';
import { relativeTime } from '../../../utils/relativeTime.js';
import { t } from '../../../strings/index.js';
import StandardSyncCell from './StandardSyncCell.jsx';
import StandardSyncActions from './StandardSyncActions.jsx';

/** A standard that exists only in the shared repository: plain row, one install action, no toggle. */
export default function StandardRemoteRow({ standard, sync }) {
  const baseLabel = standardBaseLabel(standard) || standard.type || t('standards.baseUnknown');
  return (
    <div className="standards-row standards-row--remote" role="row">
      <div className="standards-cell standards-cell--name">
        <span className="standards-row-name" title={standard.description || undefined}>{standard.name}</span>
        <span className="standards-row-subtitle">{t('projects.remoteOnlyPublished', { time: relativeTime(standard.publishedAt) })}</span>
      </div>
      <div className="standards-cell standards-cell--base">
        <span className={`standards-base-pill standards-base-pill--${standard.type || 'unknown'}`}>{baseLabel}</span>
      </div>
      <div className="standards-cell standards-cell--num standards-cell--principles">{standard.principleCount ?? ''}</div>
      <div className="standards-cell standards-cell--num">{standard.requirementCount ?? ''}</div>
      <div className="standards-cell standards-cell--version">{standard.version || ''}</div>
      <StandardSyncCell standard={standard} />
      <div className="standards-cell standards-cell--enabled" />
      <div className="standards-cell standards-cell--actions">
        <StandardSyncActions standard={standard} sync={sync} />
      </div>
    </div>
  );
}
