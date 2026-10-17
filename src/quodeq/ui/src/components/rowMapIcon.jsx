import { cloneElement } from 'react';
import { ICON_MAP } from '../constants/navigation.jsx';

// The sidebar's map glyph, a step smaller to sit in a row of text.
const ROW_ICON_SIZE = 14;

/** The map icon at the end of a place row (an area, a folder) that opens it in the Map. */
export const ROW_MAP_ICON = cloneElement(ICON_MAP, { width: ROW_ICON_SIZE, height: ROW_ICON_SIZE });
