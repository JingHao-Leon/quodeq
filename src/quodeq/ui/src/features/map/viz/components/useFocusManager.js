import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { focusTransformFor } from '../core/packCanvasGeometry.js';
import { isDrillableFolder } from '../core/fileTree.js';
import { dominantFolderPath } from '../core/dominantFolder.js';

function useFocusResetSync(resetKey, setFocus) {
  const prevResetKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== prevResetKey.current) {
      prevResetKey.current = resetKey;
      setFocus(null);
    }
  }, [resetKey]);
}

/** Once per resetKey, at the root, open the folder that holds most of the
 * files. The drill goes through `onDrillDown` like a user's, so the page's
 * breadcrumb follows; the ref keeps a later way back to the root there. */
function useOpenDominantFolder({ root, circles, resetKey, currentPath, onDrillDown }) {
  const openedFor = useRef(null);
  useEffect(() => {
    if (!circles.length || openedFor.current === resetKey) return;
    openedFor.current = resetKey;
    const path = currentPath ? null : dominantFolderPath(root?.data);
    if (path) onDrillDown?.(path);
  }, [circles, resetKey]);
}

/** Focus `next` without the zoom tween (a jump from outside: breadcrumb,
 * reset); the first focus on mount needs no skip, it is already snapped. */
function jumpTo(next, { setFocus, skipTransition, isMount }) {
  if (!isMount) skipTransition.current = true;
  setFocus(next);
  if (!isMount) requestAnimationFrame(() => { skipTransition.current = false; });
}

// Sync focus to currentPath
function useFocusPathSync({ currentPath, circles, setFocus, skipTransition, prevPathRef }) {
  useEffect(() => {
    if (currentPath === prevPathRef.current) return;
    const isMount = prevPathRef.current === null;
    prevPathRef.current = currentPath;
    if (!currentPath) {
      jumpTo(null, { setFocus, skipTransition, isMount });
      return;
    }
    const match = circles.find((c) => c.data.path === currentPath);
    if (match) jumpTo(match, { setFocus, skipTransition, isMount });
  }, [currentPath, circles]);
}

function useFocusTransform(focusNode) {
  return useMemo(() => {
    if (!focusNode) return { k: 1, tx: 0, ty: 0 };
    return focusTransformFor(focusNode);
  }, [focusNode]);
}

/**
 * Zoom out one level: focus the parent (or the root at the top) and report
 * the path that is now current.
 */
function focusParent(focusNode, { setFocus, onDrillDown, prevPathRef }) {
  const parent = focusNode?.parent;
  setFocus(parent || null);
  const parentPath = parent?.data?.path || '';
  onDrillDown?.(parentPath);
  prevPathRef.current = parentPath;
}

/** Drill into a folder circle and report the new current path. */
function focusFolder(c, { setFocus, onDrillDown, prevPathRef }) {
  setFocus(c);
  const path = c.data.path || '';
  onDrillDown?.(path);
  prevPathRef.current = path;
}

function useFocusHandlers({ focusNode, setFocus, onFileSelect, onDrillDown, prevPathRef }) {
  const handleClick = useCallback((e, c) => {
    e.stopPropagation();
    const nav = { setFocus, onDrillDown, prevPathRef };
    // The open folder itself never arrives here: the pointer ignores a hit
    // on it and the keyboard offers only its children.
    if (c.data.isFile) onFileSelect?.(c);
    else if (isDrillableFolder(c.data) && c !== focusNode) focusFolder(c, nav);
  }, [focusNode, onFileSelect, onDrillDown]);

  const handleBgClick = useCallback(() => {
    focusParent(focusNode, { setFocus, onDrillDown, prevPathRef });
  }, [focusNode, onDrillDown]);

  // A click outside every circle goes to the top of the project (Escape still goes up one level).
  const handleRootClick = useCallback(() => {
    if (!focusNode || focusNode.depth === 0) return;
    setFocus(null);
    onDrillDown?.('');
    prevPathRef.current = '';
  }, [focusNode, onDrillDown]);

  return { handleClick, handleBgClick, handleRootClick };
}

/** The node to focus in the current layout. `focus` may belong to an
 * earlier hierarchy (the root is rebuilt on every new tree and worker
 * reply); then the same path is looked up in the new circles. */
function useResolvedFocus(focus, root, circles) {
  return useMemo(() => {
    if (!focus) return root;
    if (focus.ancestors().at(-1) === root) return focus;
    return circles.find((c) => c.data.path === focus.data.path) || root;
  }, [focus, root, circles]);
}

/**
 * Focus state of the zoomable pack: which folder is open (kept in step with
 * `currentPath` and `resetKey`), the zoom transform that frames it, and the
 * click handlers that drill in, select files (`onFileSelect(circle)`), go to
 * the top (a miss) and zoom out one level (Escape).
 * @returns {{focusNode: object, transform: {k:number,tx:number,ty:number}, handleClick: Function, handleBgClick: Function, handleRootClick: Function, skipTransition: {current: boolean}}}
 */
export function useFocusManager({ root, circles, resetKey, currentPath, onDrillDown, onFileSelect }) {
  const [focus, setFocus] = useState(null);
  const skipTransition = useRef(true);
  const prevPathRef = useRef(null);

  useFocusResetSync(resetKey, setFocus);
  useFocusPathSync({ currentPath, circles, setFocus, skipTransition, prevPathRef });
  useOpenDominantFolder({ root, circles, resetKey, currentPath, onDrillDown });

  // Enable transitions after first paint
  useEffect(() => {
    requestAnimationFrame(() => { skipTransition.current = false; });
  }, []);

  const focusNode = useResolvedFocus(focus, root, circles);
  const transform = useFocusTransform(focusNode);
  const { handleClick, handleBgClick, handleRootClick } = useFocusHandlers({ focusNode, setFocus, onFileSelect, onDrillDown, prevPathRef });
  return { focusNode, transform, handleClick, handleBgClick, handleRootClick, skipTransition };
}
