/**
 * The Violations page's workbench actions: open a finding's file, dismiss
 * one finding or every finding of its rule, restore or delete a dismissed
 * one, and the project-wide bulk restore/delete. A shared project is
 * read-only, so it gets no mutating handler at all (the buttons are absent).
 */
import { useCallback, useMemo } from 'react';
import { buildFileTree, treeNodeToFileObj } from '../../map/viz/index.js';
import { walkTree } from '../../../utils/treeWalk.js';
import { PROJECT_SOURCE } from '../../../vocab/projectSource.js';
import { useDismissByType } from './useDismissByType.js';

/** file path -> File page object, built on demand from the visible dimensions' file tree. */
function useFileObjects(dimensions) {
  const nodes = useMemo(() => {
    const byPath = new Map();
    walkTree(buildFileTree(dimensions), (n) => { if (n.isFile) byPath.set(n.path, n); return false; });
    return byPath;
  }, [dimensions]);
  const nodeOf = useCallback((file) => (file ? nodes.get(file) || null : null), [nodes]);
  const canOpenFile = useCallback((f) => !!nodeOf(f.file), [nodeOf]);
  const fileObjectFor = useCallback((f) => {
    const node = nodeOf(f.file);
    return node ? treeNodeToFileObj(node) : null;
  }, [nodeOf]);
  return { canOpenFile, fileObjectFor };
}

/**
 * @param {{visibleDimensions: Array, selectedProject: string, selectedSource: string, callbacks: Object, handlers: Object, readOnly?: boolean}} args
 *   `handlers` carries useDismissedFindings' handleRestore/handleDelete/handleRestoreAll/handleDeleteAll.
 * @returns {{actions: Object, error: ?string, notice: ?string}} the workbench actions and the dismiss-by-rule banners.
 */
export function useWorkbenchActions({ visibleDimensions, selectedProject, selectedSource, callbacks, handlers, readOnly = false }) {
  // A shared project, or a past day, is read-only: no dismissing, restoring or fix plans.
  const shared = selectedSource === PROJECT_SOURCE.SHARED || readOnly;
  const { dismissType, error, notice } = useDismissByType({ project: selectedProject, selectedSource, onReconcile: callbacks.onReconcile });
  const { canOpenFile, fileObjectFor } = useFileObjects(visibleDimensions);
  const { onFileClick, onDismissFinding } = callbacks;
  const actions = useMemo(() => ({
    readOnly,
    canOpenFile,
    onOpenFile: onFileClick ? (f) => { const obj = fileObjectFor(f); if (obj) onFileClick(obj); } : undefined,
    onDismiss: shared ? undefined : onDismissFinding,
    onDismissType: shared ? undefined : dismissType,
    onRestore: shared ? undefined : handlers.handleRestore,
    onDelete: shared ? undefined : handlers.handleDelete,
    onRestoreAll: shared ? undefined : handlers.handleRestoreAll,
    onDeleteAll: shared ? undefined : handlers.handleDeleteAll,
  }), [readOnly, shared, canOpenFile, fileObjectFor, onFileClick, onDismissFinding, dismissType,
    handlers.handleRestore, handlers.handleDelete, handlers.handleRestoreAll, handlers.handleDeleteAll]);
  return { actions, error, notice };
}
