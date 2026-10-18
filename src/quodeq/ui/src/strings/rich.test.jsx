import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('./index.js', () => ({ t: (key) => key }));
const { tRich, tSlots, renderCodeSpans } = await import('./rich.jsx');

function html(text) {
  return render(<p>{tRich(text)}</p>).container.firstChild.innerHTML;
}

describe('tRich', () => {
  it('returns plain text untouched', () => {
    expect(html('no markup here')).toBe('no markup here');
  });

  it('renders backtick spans as code', () => {
    expect(html('Add a `.quodeqignore` file')).toBe('Add a <code>.quodeqignore</code> file');
  });

  it('renders double-asterisk spans as strong', () => {
    expect(html('Turn on **Clean scan** now')).toBe('Turn on <strong>Clean scan</strong> now');
  });

  it('mixes both in one sentence', () => {
    expect(html('**Fix plan** or `quodeq review`')).toBe('<strong>Fix plan</strong> or <code>quodeq review</code>');
  });

  it('keeps a backtick inside bold literal', () => {
    expect(html('Press **Ctrl+`** to open')).toBe('Press <strong>Ctrl+`</strong> to open');
  });
});

describe('tSlots', () => {
  const slotsHtml = (text, slots) => render(<p>{tSlots(text, slots)}</p>).container.firstChild.innerHTML;

  it('swaps each placeholder for its node, keeping the sentence order', () => {
    expect(slotsHtml('{a} leads {b} by {gap}', { a: <b>A</b>, b: <i>B</i>, gap: '1.0' }))
      .toBe('<b>A</b> leads <i>B</i> by 1.0');
  });

  it('leaves a placeholder without a slot as written', () => {
    expect(slotsHtml('{a} and {missing}', { a: 'x' })).toBe('x and {missing}');
  });
});

describe('renderCodeSpans', () => {
  const codeHtml = (text) => render(<p>{renderCodeSpans(text)}</p>).container.firstChild.innerHTML;
  const chip = (code) => `<code class="code-chip">${code}</code>`;

  it('returns plain text untouched', () => {
    expect(renderCodeSpans('no code here')).toBe('no code here');
  });

  it('renders each backtick span as a chip', () => {
    expect(codeHtml('`open(url)` and `.navigate`')).toBe(`${chip('open(url)')} and ${chip('.navigate')}`);
  });

  it('lets a double-backtick span hold a backtick, trimming its padding', () => {
    expect(codeHtml('named `` `is mapped` `` here')).toBe(`named ${chip('`is mapped`')} here`);
  });

  it('keeps a run with no closer literal', () => {
    expect(codeHtml('a ```figure block, `x`')).toBe(`a \`\`\`figure block, ${chip('x')}`);
  });

  it('leaves double asterisks as written', () => {
    expect(codeHtml('words like "**MAJOR**"')).toBe('words like "**MAJOR**"');
  });
});
