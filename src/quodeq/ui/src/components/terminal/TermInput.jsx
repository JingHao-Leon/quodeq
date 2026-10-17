import { KEY } from '../../vocab/keyboard.js';

/**
 * TermInput — terminal-style text input prefixed with a shell prompt
 * (e.g. `$ grep -r [input...]`).
 *
 * @param {object} props
 * @param {string}  [props.prompt='$']
 * @param {string}  [props.command]          Static command shown between prompt and input (e.g. 'grep -r').
 * @param {string}  [props.placeholder]
 * @param {string}  props.value
 * @param {(next: string) => void} props.onChange
 * @param {() => void} [props.onSubmit]
 * @param {(e: KeyboardEvent) => void} [props.onKeyDown]  Extra key handler, run before Enter submits.
 * @param {(e: FocusEvent) => void} [props.onBlur]
 * @param {string}  [props.activeDescendant]  id of the active option of a list the input drives (aria-activedescendant).
 * @param {string}  [props.id]
 * @param {string}  [props.name]
 * @param {string}  [props.ariaLabel]
 * @param {boolean} [props.disabled]
 */
export default function TermInput({
  prompt = '$',
  command,
  placeholder,
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onBlur,
  activeDescendant,
  id,
  name,
  ariaLabel,
  disabled = false,
}) {
  return (
    <div className="term-input">
      <span className="term-input__prompt" aria-hidden="true">{prompt}</span>
      {command && <span className="term-input__command">{command}</span>}
      <input
        type="text"
        className="term-input__field"
        id={id}
        name={name}
        aria-label={ariaLabel || command || 'input'}
        aria-activedescendant={activeDescendant || undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (onKeyDown) onKeyDown(e);
          if (e.key === KEY.ENTER && onSubmit) onSubmit();
        }}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  );
}
