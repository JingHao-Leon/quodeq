import { SectionLabel } from '../../../components/terminal/index.js';

/** The run log's panel shell: band head, optional stats, body, optional foot. */
export default function RunLogPanel({ label, stats, className = '', children, foot }) {
  return (
    <section className={`qd-cards-panel rl-panel ${className}`}>
      <div className="qd-cards-panel__head">
        <SectionLabel>{label}</SectionLabel>
        {stats != null && <span className="run-history-panel__stats">{stats}</span>}
      </div>
      {children}
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  );
}
