import { useCallback, useMemo, useState } from 'react';
import PackCanvas from './PackCanvas.jsx';
import { usePackLayout } from '../core/usePackLayout.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../core/mapBadness.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import PackInfoPanel from './PackInfoPanel.jsx';
import { useFocusManager } from './useFocusManager.js';
import PackTooltip from './PackTooltip.jsx';
import FadeIn from '../../../../components/FadeIn.jsx';

// No activity data yet: one shared empty map keeps the paint memo stable.
// Read-only by convention (freezing a Map does not stop set()).
const NO_EDITS = new Map();
const CONTAINER_STYLE = { position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' };

/** Hover index tied to the circles and the open folder it was taken under:
 * a new tree (worker reply, new node) or a focus change (drill, Escape,
 * keyboard activation) reads as "no hover" until the pointer moves again,
 * so the tween never shows a ring or tooltip on a circle a click would not
 * select. */
function useHover(circles, focusNode) {
  const [state, setState] = useState({ circles: null, focusNode: null, index: null });
  const setHover = useCallback((index) => setState({ circles, focusNode, index }), [circles, focusNode]);
  const current = state.circles === circles && state.focusNode === focusNode;
  return [current ? state.index : null, setHover];
}

/**
 * The picked file: by path through `selection` when the page shares it (the
 * time-lapse keeps it), else held here. Returns the circle and its setter.
 */
function usePickedFile(circles, selection) {
  const [own, setOwn] = useState(null);
  const path = selection ? selection.path : own?.data.path ?? null;
  const picked = useMemo(() => (path ? circles.find((c) => c.data.isFile && c.data.path === path) || null : null), [circles, path]);
  const setPicked = useCallback((c) => (selection ? selection.onSelect(c ? c.data.path : null) : setOwn(c)), [selection]);
  return [picked, setPicked];
}

/** The picked file while it is still a file of the open folder in this tree, else null. */
function selectedIn(picked, focusNode, root) {
  if (!picked || picked.parent !== focusNode) return null;
  return picked.ancestors().at(-1) === root ? picked : null;
}

/* ---- Main orchestrator ---- */
/**
 * The Map's zoomable circle pack. `colorMode` is a PACK_COLOR_MODE (anything
 * else paints as concentration); `weights` are the severity weights of the
 * grade formula and `editsByPath` the activity per file path.
 */
export default function ZoomablePackView({
  node, colorMode = PACK_COLOR_MODE.CONCENTRATION, weights = DEFAULT_SEVERITY_WEIGHTS, editsByPath = NO_EDITS, dark = false,
  onDrillDown, onFileClick, showLabels = true, resetKey = 0, currentPath = '', selection,
}) {
  const { root, circles } = usePackLayout(node);
  // A file click selects the file: the panel shows it and its View details opens it.
  const [picked, setPicked] = usePickedFile(circles, selection);
  const focus = useFocusManager({ root, circles, resetKey, currentPath, onDrillDown, onFileSelect: setPicked });
  const [hover, setHover] = useHover(circles, focus.focusNode);
  const selected = selectedIn(picked, focus.focusNode, root);
  const handleBgClick = useCallback(() => { setPicked(null); focus.handleBgClick(); }, [focus.handleBgClick]);
  const handleRootClick = useCallback(() => { setPicked(null); focus.handleRootClick(); }, [focus.handleRootClick]);

  if (!node) return null;
  const ready = circles.length > 0;

  return (
    <div style={CONTAINER_STYLE}>
      {/* The layout can land after the page fade (worker reply, new tree),
          so the circles fade in on their own when a new root arrives. The
          wrapper stays mounted while a layout is pending so the fade
          restarts instead of resetting. */}
      <FadeIn restartKey={root} className="pack-fade">
        {ready && (
          <PackCanvas
            view={{ circles, transform: focus.transform, skipTransition: focus.skipTransition, focusNode: focus.focusNode, showLabels }}
            paintInputs={{ colorMode, weights, editsByPath, dark }}
            hoverState={{ hover, setHover, selected }}
            handlers={{ handleClick: focus.handleClick, handleBgClick, handleRootClick }}
          />        )}
      </FadeIn>
      {ready && <PackTooltip node={hover === null ? null : circles[hover]} />}
      {ready && <PackInfoPanel focusNode={selected || focus.focusNode} root={root} onFileClick={onFileClick} onClose={selected ? () => setPicked(null) : undefined} />}
    </div>
  );
}
