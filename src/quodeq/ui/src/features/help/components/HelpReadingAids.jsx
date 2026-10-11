// Reading aids around a help section: the "on this page" list of its
// subheadings, and the previous / next links at its foot.
import { useEffect, useState } from 'react';
import { t } from '../../../strings/index.js';

// A heading counts as "being read" once it rises into the top quarter of the
// viewport; the last one past that line is the current one.
const SPY_ROOT_MARGIN = '0px 0px -75% 0px';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// Slug ids may start with a digit, which a `#id` selector rejects.
function byId(ref, id) {
  return ref.current?.querySelector(`[id="${id}"]`) ?? null;
}

function scrollBehavior() {
  return window.matchMedia?.(REDUCED_MOTION).matches ? 'auto' : 'smooth';
}

/**
 * Collects the rendered h3s of the section in `contentRef`, re-read whenever
 * `sectionId` changes. Ids come from rehypeHelpStructure.
 */
export function useSectionHeadings(contentRef, sectionId) {
  const [headings, setHeadings] = useState([]);
  useEffect(() => {
    const nodes = contentRef.current?.querySelectorAll('h3[id]') ?? [];
    setHeadings([...nodes].map((h) => ({ id: h.id, text: h.textContent })));
  }, [contentRef, sectionId]);
  return headings;
}

function useCurrentHeading(contentRef, headings) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    setCurrent(headings[0]?.id ?? null);
    if (typeof IntersectionObserver === 'undefined' || headings.length === 0) return undefined;
    const nodes = headings.map((h) => byId(contentRef, h.id)).filter(Boolean);
    const passed = new Set();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        // Above the line (or inside it) means read; below it means not yet.
        if (e.isIntersecting || e.boundingClientRect.top < 0) passed.add(e.target.id);
        else passed.delete(e.target.id);
      }
      const last = [...nodes].reverse().find((n) => passed.has(n.id));
      setCurrent(last?.id ?? headings[0].id);
    }, { rootMargin: SPY_ROOT_MARGIN });
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [contentRef, headings]);
  return current;
}

export function PageContents({ contentRef, headings }) {
  const current = useCurrentHeading(contentRef, headings);
  if (headings.length === 0) return null;
  const jump = (id) => {
    byId(contentRef, id)?.scrollIntoView?.({ behavior: scrollBehavior(), block: 'start' });
  };
  return (
    <nav className="help-toc" aria-label={t('help.onThisPage')}>
      <div className="help-toc__title">{t('help.onThisPage')}</div>
      {headings.map((h) => (
        <button
          key={h.id}
          type="button"
          className="help-toc__link"
          aria-current={h.id === current ? 'location' : undefined}
          onClick={() => jump(h.id)}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}

/**
 * @param {{prev?: {id: string, label: string}, next?: {id: string, label: string}, onSelect: Function}} props
 */
export function SectionPager({ prev, next, onSelect }) {
  return (
    <nav className="help-pager" aria-label={t('help.pagerLabel')}>
      {prev ? (
        <button type="button" className="help-pager__link" aria-label={`${t('help.previous')}: ${prev.label}`} onClick={() => onSelect(prev.id)}>
          <span className="help-pager__dir">{t('help.previous')}</span>
          <span className="help-pager__name">{prev.label}</span>
        </button>
      ) : <span />}
      {next && (
        <button type="button" className="help-pager__link help-pager__link--next" aria-label={`${t('help.next')}: ${next.label}`} onClick={() => onSelect(next.id)}>
          <span className="help-pager__dir">{t('help.next')}</span>
          <span className="help-pager__name">{next.label}</span>
        </button>
      )}
    </nav>
  );
}
