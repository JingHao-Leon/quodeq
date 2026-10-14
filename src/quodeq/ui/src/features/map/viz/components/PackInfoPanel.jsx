import { useMemo } from 'react';
import { LevelInfoPanel } from './galaxyViewInfo.jsx';
import { computeLevelInfo } from './packLevelInfo.js';

/**
 * The Circle Pack's info panel, top right: the open folder or the selected
 * file (`focusNode`, a pack circle under `root`), its View details opening
 * `onFileClick`, and, with `onClose` (a selected file), a × that clears it.
 */
export default function PackInfoPanel({ focusNode, root, onFileClick, onClose }) {
  const levelInfo = useMemo(() => computeLevelInfo(focusNode, root, onFileClick), [focusNode, root, onFileClick]);
  return <LevelInfoPanel levelInfo={levelInfo} onClose={onClose} />;
}
