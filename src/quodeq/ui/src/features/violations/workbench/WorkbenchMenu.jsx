import CaptionLauncher from './CaptionLauncher.jsx';
import { t } from '../../../strings/index.js';

const CHECK = '✓ ';

function Options({ options, value, label, onPick }) {
  return (
    <>
      <span className="compare-dueltrigger__hint">{label}</span>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="menuitemradio" aria-checked={on}
            className={`compare-dueltrigger__item${on ? ' wb-menu__current' : ''}`}
            onClick={() => onPick(o.value)}>
            <span>{on ? CHECK : ''}{o.label}</span>
            {o.count != null && <span className="wb-menu__count">{o.count}</span>}
          </button>
        );
      })}
    </>
  );
}

/** A filter as the app's launcher: `label: value ▸`, a menu that ticks the current value. */
export default function WorkbenchMenu(props) {
  const { label, valueLabel, onPick } = props;
  const caption = t('violations.wbMenuButton', { label, value: valueLabel });
  return (
    <CaptionLauncher caption={caption}>
      {(close) => <Options options={props.options} value={props.value} label={label} onPick={(v) => { close(); onPick(v); }} />}
    </CaptionLauncher>
  );
}
