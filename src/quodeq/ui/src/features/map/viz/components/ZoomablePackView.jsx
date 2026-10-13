import { useCallback, useRef, useState } from 'react';
import PackCanvas from './PackCanvas.jsx';
import { usePackLayout } from '../core/usePackLayout.js';
import { DEFAULT_SEVERITY_WEIGHTS } from '../core/mapBadness.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import PackInfoPanel from './PackInfoPanel.jsx';
import { useFocusManager } from './useFocusManager.js';
import { t } from '../../../../strings/index.js';
import { PERCENT } from '../../../../constants.js';
import MapTooltipSeverityRows from './MapTooltipSeverityRows.jsx';
import { clampTooltipToBox } from '../core/tooltipPlacement.js';
import FadeIn from '../../../../components/FadeIn.jsx';

// No activity data yet: one shared empty map keeps the paint memo stable.
// Read-only by convention (freezing a Map does not stop set()).
const NO_EDITS = new Map();
const CONTAINER_STYLE = { position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' };

/* ---- PackTooltip: tooltip ---- */
/** Tooltip position, clamped so it never runs off the container edge. */
function tooltipStyle(mousePos, containerRef) {
  const el = containerRef.current;
  return {
    position: 'absolute',
    ...clampTooltipToBox(mousePos.current.x, mousePos.current.y, el?.offsetWidth, el?.offsetHeight),
    pointerEvents: 'none',
    zIndex: 10,
  };
}

/** Per-severity rows, shown only for a node that actually has violations. */
function TooltipSeverityRows({ hd }) {
  if (!(hd.violations > 0)) return null;
  return <MapTooltipSeverityRows severity={hd.severity} />;
}

/** Tooltip of the picked circle: the circle a click would select. */
function PackTooltip({ circles, hover, mousePos, containerRef }) {
  if (hover === null || !circles[hover] || circles[hover].depth === 0) return null;
  const hd = circles[hover].data;
  const total = hd.violations + hd.compliance;
  return (
    <div className="map-tooltip" style={tooltipStyle(mousePos, containerRef)}>
      <div className="map-tooltip-title">{(hd.path || hd.name || '').replace(/\/$/, '')}</div>
      <div className="map-tooltip-row"><span>{t('map.violations')}</span><span>{hd.violations}</span></div>
      <TooltipSeverityRows hd={hd} />
      <div className="map-tooltip-row"><span>{t('map.compliance')}</span><span>{hd.compliance}</span></div>
      <div className="map-tooltip-row"><span>{t('map.rate')}</span><span>{total > 0 ? ((hd.compliance / total) * PERCENT).toFixed(0) + '%' : '—'}</span></div>
    </div>
  );
}

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

/* ---- Main orchestrator ---- */
/**
 * The Map's zoomable circle pack. `colorMode` is a PACK_COLOR_MODE (anything
 * else paints as concentration); `weights` are the severity weights of the
 * grade formula and `editsByPath` the activity per file path. `autoOpen`
 * false keeps the pack where `currentPath` puts it (no dominant-folder open).
 */
export default function ZoomablePackView({
  node, colorMode = PACK_COLOR_MODE.CONCENTRATION, weights = DEFAULT_SEVERITY_WEIGHTS, editsByPath = NO_EDITS, dark = false,
  onDrillDown, onFileClick, showLabels = true, resetKey = 0, currentPath = '', autoOpen = true,
}) {
  const mousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const { root, circles } = usePackLayout(node);
  const focus = useFocusManager({ root, circles, resetKey, currentPath, onDrillDown, onFileClick, autoOpen });
  const [hover, setHover] = useHover(circles, focus.focusNode);

  if (!node) return null;
  const ready = circles.length > 0;
  const trackMouse = (e) => {
    const r = containerRef.current?.getBoundingClientRect();
    if (r) mousePos.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={containerRef} style={CONTAINER_STYLE} onMouseMove={trackMouse}>
      {/* The layout can land after the page fade (worker reply, new tree),
          so the circles fade in on their own when a new root arrives. The
          wrapper stays mounted while a layout is pending so the fade
          restarts instead of resetting. */}
      <FadeIn restartKey={root} className="pack-fade">
        {ready && (
          <PackCanvas
            view={{ circles, transform: focus.transform, skipTransition: focus.skipTransition, focusNode: focus.focusNode, showLabels }}
            paintInputs={{ colorMode, weights, editsByPath, dark }}
            hoverState={{ hover, setHover }}
            handlers={{ handleClick: focus.handleClick, handleBgClick: focus.handleBgClick }}
          />        )}
      </FadeIn>
      {ready && <PackTooltip circles={circles} hover={hover} mousePos={mousePos} containerRef={containerRef} />}
      {ready && <PackInfoPanel focusNode={focus.focusNode} root={root} onFileClick={onFileClick} />}
    </div>
  );
}
