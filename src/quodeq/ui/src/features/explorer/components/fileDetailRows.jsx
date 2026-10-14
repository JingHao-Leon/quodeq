import { useMemo } from 'react';
import { ComplianceCard } from './EvalCards.jsx';
import ViolationCard from './ViolationCard.jsx';
import { GroupHeader, LowConfidenceToggle, ROW_HEIGHT_PX, fileFindingKey } from './fileDetailWidgets.jsx';
import DeferredViolationList from './DeferredViolationList.jsx';
import { useFileDetailWindowSpecs } from './useFileDetailWindowSpecs.jsx';
import { ROW_KIND } from './findingListRows.js';
import { severityLabel } from '../../../strings/labels.js';
import { FINDING_TYPE } from '../../../vocab/findingType.js';

const capitalized = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * One row of a findings list built by useFileDetailFiltering: a severity or
 * compliance group header (`complianceTitle`), the low-confidence toggle, a
 * violation card (`onDismiss` absent: read-only) or a compliance card.
 */
export function renderFileDetailRow(item, { onDismiss, setLowConfExpanded, complianceTitle }) {
  switch (item.kind) {
    case ROW_KIND.SEV_HEADER:
      return <GroupHeader title={capitalized(severityLabel(item.sev))} count={item.count} />;
    case ROW_KIND.COMPLIANCE_HEADER:
      return <GroupHeader title={complianceTitle} count={item.count} />;
    case ROW_KIND.LOW_CONF_TOGGLE:
      return <LowConfidenceToggle count={item.count} expanded={item.expanded} onToggle={() => setLowConfExpanded((v) => !v)} />;
    case FINDING_TYPE.VIOLATION:
    case ROW_KIND.LOW_CONF_ROW:
      return <ViolationCard v={item.v} onDismiss={onDismiss} />;
    case FINDING_TYPE.COMPLIANCE:
      return <ComplianceCard c={item.c} principle={item.c.principle} index={0} />;
    default:
      return null;
  }
}

/**
 * The side panes' Report and Fix plan for a findings list: they print
 * reason, snippet and references, so they get the hydrated rows, not the
 * deferred ones the list was built from.
 */
export function useFindingsPaneSpecs(file, violationsBySeverity, activeFilter) {
  const hydratedFile = useMemo(() => ({ ...file, violationsBySeverity }), [file, violationsBySeverity]);
  useFileDetailWindowSpecs({ file: hydratedFile, activeFilter });
}

/**
 * The findings list itself, virtualized under the dashboard's scroll box:
 * `rows` in order, remounted on `resetKey`; `onDismiss` absent is read-only.
 */
export function FindingRowsList({ rows, resetKey, scrollElement, onDismiss, setLowConfExpanded, complianceTitle }) {
  return (
    <DeferredViolationList
      resetKey={resetKey}
      items={rows}
      scrollElement={scrollElement}
      rowHeights={ROW_HEIGHT_PX}
      findingKey={fileFindingKey}
      renderItem={(item) => renderFileDetailRow(item, { onDismiss, setLowConfExpanded, complianceTitle })}
    />
  );
}
