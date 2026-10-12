import { useState } from 'react';
import { t } from '../../strings/index.js';

// One principle of a drafted standard: its name as a toggle, its requirements
// listed underneath while expanded. Expanded by default so the whole draft is
// readable without a click; collapsing is for long standards.
function PrincipleOutline({ principle }) {
  const [expanded, setExpanded] = useState(true);
  const requirements = principle.requirements || [];
  return (
    <li className="assistant-outline-principle">
      <button
        type="button"
        className="assistant-outline-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="assistant-outline-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="assistant-outline-principle-name">{principle.name}</span>
        <span className="assistant-outline-count">
          {t('assistant.outlineRequirements', { count: requirements.length })}
        </span>
      </button>
      {expanded && (
        <ul className="assistant-outline-requirements">
          {requirements.map((req) => (
            <li key={req.id} className="assistant-outline-requirement">
              <span className="assistant-outline-req-id">{req.id}</span>
              <span className="assistant-outline-req-text">{req.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The server-canonical outline of a drafted standard (principles and their
 * requirement ids and texts), rendered on the preview card so the user can
 * read the whole standard before Apply. Drafts made before the outline was
 * part of the summary carry no principles and render nothing here.
 */
export function StandardOutline({ principles }) {
  if (!Array.isArray(principles) || principles.length === 0) return null;
  return (
    <ul className="assistant-outline">
      {principles.map((principle, index) => (
        <PrincipleOutline key={`${index}-${principle.name}`} principle={principle} />
      ))}
    </ul>
  );
}
