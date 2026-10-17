import { t } from '../strings/index.js';

/**
 * SharedReadOnlyBadge: "remote · read-only" note shown on a remote (team
 * repo) project's page headers, plus (when known) a "published by <name>"
 * sub line. Remote projects have no mutation routes on the backend
 * (dismiss/restore/delete/evaluate are local-only by design), so this is
 * purely informational: it tells the user why the action buttons they'd
 * normally see are gone. Display text says "remote"; the internal source
 * key stays 'shared'. It reads as header text (an accent dot and muted
 * mono text on the title line), not a boxed pill: pills are for actions.
 */
export default function SharedReadOnlyBadge({ publishedBy }) {
  return (
    <span className="badge-shared-readonly-group">
      <span className="shared-readonly-tag" title={t('common.remoteReadOnlyTitle')}>
        <span className="shared-readonly-tag__dot" aria-hidden="true" />
        {t('common.remoteReadOnly')}
      </span>
      {publishedBy && (
        <span className="badge-shared-readonly-pub">{t('common.publishedBy')} {publishedBy}</span>
      )}
    </span>
  );
}
