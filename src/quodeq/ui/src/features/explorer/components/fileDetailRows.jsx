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

const defaultViolation = (v, { onDismiss, readOnly }) => <ViolationCard v={v} onDismiss={onDismiss} readOnly={readOnly} />;
const defaultCompliance = (c) => <ComplianceCard c={c} principle={c.principle} index={0} />;

/**
 * One row of a findings list built by useFileDetailFiltering: a severity or
 * compliance group header (`complianceTitle`), the low-confidence toggle, a
 * violation card (no `onDismiss`: no dismiss; `readOnly`, a past run: no
 * fix plan either) or a compliance card. `renderViolation(v, opts)` and
 * `renderCompliance(c)` replace the File page's own cards.
 */
export function renderFileDetailRow(item, opts) {
  const { setLowConfExpanded, complianceTitle, renderViolation = defaultViolation, renderCompliance = defaultCompliance } = opts;
  switch (item.kind) {
    case ROW_KIND.SEV_HEADER:
      return <GroupHeader title={capitalized(severityLabel(item.sev))} count={item.count} />;
    case ROW_KIND.COMPLIANCE_HEADER:
      return <GroupHeader title={complianceTitle} count={item.count} />;
    case ROW_KIND.LOW_CONF_TOGGLE:
      return <LowConfidenceToggle count={item.count} expanded={item.expanded} onToggle={() => setLowConfExpanded((v) => !v)} />;
    case FINDING_TYPE.VIOLATION:
    case ROW_KIND.LOW_CONF_ROW:
      return renderViolation(item.v, { onDismiss: opts.onDismiss, readOnly: opts.readOnly ?? false });
    case FINDING_TYPE.COMPLIANCE:
      return renderCompliance(item.c);
    default:
      return null;
  }
}

/**
 * The side panes' Report and Fix plan for a findings list: they print
 * reason, snippet and references, so they get the hydrated rows, not the
 * deferred ones the list was built from.
 */
export function useFindingsPaneSpecs(file, violationsBySeverity, activeFilter, readOnly = false) {
  const hydratedFile = useMemo(() => ({ ...file, violationsBySeverity }), [file, violationsBySeverity]);
  useFileDetailWindowSpecs({ file: hydratedFile, activeFilter, readOnly });
}

/**
 * The findings list itself, virtualized under the dashboard's scroll box:
 * `rows` in order, remounted on `resetKey`, the cards as renderFileDetailRow
 * makes them.
 */
export function FindingRowsList({ rows, resetKey, scrollElement, onDismiss, setLowConfExpanded, complianceTitle, readOnly = false }) {
  return (
    <DeferredViolationList
      resetKey={resetKey}
      items={rows}
      scrollElement={scrollElement}
      rowHeights={ROW_HEIGHT_PX}
      findingKey={fileFindingKey}
      renderItem={(item) => renderFileDetailRow(item, { onDismiss, setLowConfExpanded, complianceTitle, readOnly })}
    />
  );
}
