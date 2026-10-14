import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OffendingFilesSection, { FILES_SHOWN } from './OffendingFilesSection.jsx';
import { t } from '../strings/index.js';

const files = (n) => Array.from({ length: n }, (_, i) => ({ file: `src/f${i}.py`, total: n - i, major: n - i }));
const dataRows = () => screen.getAllByRole('row').slice(1);

describe('OffendingFilesSection', () => {
  it('shows the worst few, and every file one click away', () => {
    render(<OffendingFilesSection topFiles={files(FILES_SHOWN + 4)} />);
    expect(dataRows()).toHaveLength(FILES_SHOWN);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('overview.showAllFiles', { count: String(FILES_SHOWN + 4) })) }));
    expect(dataRows()).toHaveLength(FILES_SHOWN + 4);
  });

  it('opens a file, and renders nothing without files', () => {
    const onFileClick = vi.fn();
    const { container, unmount } = render(<OffendingFilesSection topFiles={files(2)} onFileClick={onFileClick} />);
    fireEvent.click(dataRows()[1]);
    expect(onFileClick).toHaveBeenCalledWith(expect.objectContaining({ file: 'src/f1.py' }));
    unmount();
    expect(container.firstChild).toBeNull();
    expect(render(<OffendingFilesSection topFiles={[]} />).container.firstChild).toBeNull();
  });
});
