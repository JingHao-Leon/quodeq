import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionFilter, dimensionsButtonLabel } from './MapDimensionFilter.jsx';
import { t } from '../../../strings/index.js';

const ALL = ['performance', 'reliability', 'security'];

function renderFilter(selected = ALL) {
  const onToggle = vi.fn();
  const onShowOnly = vi.fn();
  render(<DimensionFilter allDimensions={ALL} selectedDimensions={new Set(selected)} onToggle={onToggle} onShowOnly={onShowOnly} />);
  return { onToggle, onShowOnly };
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { expanded: false }));

describe('dimensionsButtonLabel', () => {
  it('names the filter, the one dimension, or the first plus a count', () => {
    expect(dimensionsButtonLabel({ allDimensions: ALL, selectedDimensions: new Set(ALL) })).toBe(t('map.dimensions'));
    expect(dimensionsButtonLabel({ allDimensions: ALL, selectedDimensions: new Set(['security']) })).toBe('security');
    expect(dimensionsButtonLabel({ allDimensions: ALL, selectedDimensions: new Set(['security', 'performance']) }))
      .toBe(t('map.dimensionsMore', { name: 'performance', count: 1 }));
  });
});

describe('DimensionFilter', () => {
  it('clicking a name shows only that dimension and closes the menu', () => {
    const { onShowOnly, onToggle } = renderFilter();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: t('map.dimensionOnlyAria', { name: 'security' }) }));
    expect(onShowOnly).toHaveBeenCalledWith('security');
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t('map.allDimensions') })).not.toBeInTheDocument();
  });

  it('a checkbox toggles its dimension and keeps the menu open', () => {
    const { onToggle } = renderFilter();
    openMenu();
    fireEvent.click(screen.getByRole('checkbox', { name: t('map.dimensionToggleAria', { name: 'reliability' }) }));
    expect(onToggle).toHaveBeenCalledWith('reliability');
    expect(screen.getByRole('button', { name: t('map.allDimensions') })).toBeInTheDocument();
  });

  it('All dimensions clears the filter', () => {
    const { onShowOnly } = renderFilter(['security']);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: t('map.allDimensions') }));
    expect(onShowOnly).toHaveBeenCalledWith(null);
  });

  it('the last kept dimension cannot be unticked', () => {
    renderFilter(['security']);
    openMenu();
    expect(screen.getByRole('checkbox', { name: t('map.dimensionToggleAria', { name: 'security' }) })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: t('map.dimensionToggleAria', { name: 'reliability' }) })).toBeEnabled();
  });
});
