import { isDrillableFolder } from '../core/fileTree.js';
import { folderLines } from './levelInfoLines.js';
import { t } from '../../../../strings/index.js';
import { circlePath, circleTitle } from '../core/chainLabel.js';

/** Share of checks that passed, or null when nothing was checked. */
function complianceRate(d) {
  const total = d.violations + d.compliance;
  return total > 0 ? d.compliance / total : null;
}

/** How many direct children there are, folders and files together. */
function childCount(children) {
  const kids = children || [];
  const folders = kids.filter(isDrillableFolder).length;
  const files = kids.filter((c) => c.isFile || !c.children || c.children.length === 0).length;
  return folders + files;
}

/** Level-info panel data for the pack view's focused circle, or null. */
export function computeLevelInfo(focusNode, root, onFileClick) {
  const fn = focusNode;
  if (!fn || !fn.data) return null;
  const d = fn.data;
  const isRoot = fn === root;
  // The title is the circle's own name with its path underneath, as on the hover card; a file has no contents line.
  const path = isRoot ? null : circlePath(d);
  const shortName = isRoot ? d.name : circleTitle(d);
  const lines = folderLines({
    complianceRate: complianceRate(d),
    contents: childCount(d.children),
    violations: d.violations,
    severity: d.severity,
  });
  return {
    title: isRoot ? (d.name === '/' ? 'Project' : shortName) : shortName,
    path,
    lines: d.isFile ? lines.filter((l) => l.label !== t('map.contents')) : lines,
    detailAction: !isRoot ? () => onFileClick?.(d) : null,
  };
}
