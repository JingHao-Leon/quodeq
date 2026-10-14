import { createContext } from 'react';

/**
 * Whether code context blocks start open. A findings view that reads like a
 * document (a scoped Findings view: one card after another) opens them; a
 * list or a single detail keeps them closed until asked.
 */
export const CodeOpenByDefault = createContext(false);
