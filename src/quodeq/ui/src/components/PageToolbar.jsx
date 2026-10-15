/**
 * PageToolbar: the one slim row a tool page opens with. The topbar
 * breadcrumb already names the page, so the row carries no title: the
 * page's facts on the left in small muted mono, its controls on the right.
 * At phone width the controls wrap below the facts. The page's name stays
 * as a heading for screen readers only.
 *
 * @param {object} props
 * @param {string} props.title  The page's name, the screen-reader heading.
 * @param {React.ReactNode} [props.subject]  What the page is open on when no
 *   breadcrumb names it (a standard, a dimension), in the text colour.
 * @param {React.ReactNode} [props.facts]  The counts line, e.g. "3429 open · 139 crit".
 * @param {React.ReactNode} [props.badge]  A node after the facts (e.g. SharedReadOnlyBadge).
 * @param {string} [props.className]  The page's own hook for layout rules.
 * @param {React.ReactNode} [props.children]  The page's controls.
 */
export default function PageToolbar({ title, subject, facts, badge, className = '', children }) {
  return (
    <div className={`page-toolbar${className ? ` ${className}` : ''}`}>
      <h1 className="sr-only">{title}</h1>
      <div className="page-toolbar__facts">
        {subject != null && <span className="page-toolbar__subject">{subject}</span>}
        {facts != null && <span>{facts}</span>}
        {badge}
      </div>
      {children && <div className="page-toolbar__controls">{children}</div>}
    </div>
  );
}
