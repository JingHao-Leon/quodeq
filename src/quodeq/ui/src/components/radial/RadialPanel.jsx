import { SectionLabel } from '../terminal/index.js';
import PrinciplesRadial from './PrinciplesRadial.jsx';
import { t } from '../../strings/index.js';

/**
 * A radial of scores beside a score history: the dimension page's
 * principles, or the Overview's dimensions (`label` and `ariaLabel` name
 * what it plots). A point opens its item; `highlighted` lights one, and
 * `onHover` reports the one the pointer or keyboard is on.
 */
export default function RadialPanel({ radialPrinciples, onPrincipleClick, highlighted, onHover, label = null, ariaLabel = null }) {
  return (
    <div className="qd-top-right">
      <section className="run-history-panel--terminal panel" aria-label={ariaLabel || t('explorer.principlesRadialAria')}>
        <div className="run-history-panel__header">
          <SectionLabel>{label || t('explorer.principlesRadialLabel')} · {radialPrinciples.length}</SectionLabel>
          <span className="run-history-panel__stats">{t('explorer.scale010')}</span>
        </div>
        <div className="qd-radial">
          <PrinciplesRadial
            principles={radialPrinciples}
            onPrincipleClick={onPrincipleClick}
            highlighted={highlighted}
            onHover={onHover}
            ariaLabel={ariaLabel}
          />
        </div>
      </section>
    </div>
  );
}
