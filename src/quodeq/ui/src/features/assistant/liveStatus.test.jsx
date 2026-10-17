import { it, expect } from 'vitest';
import { liveStatus } from './MessageList.jsx';

it('names the running tool, then the answer once text arrives', () => {
  const running = [{ role: 'user', text: 'why?' },
    { role: 'tool', name: 'get_report', kind: 'quodeq', status: 'running', args: { dimension: 'reliability' } }];
  expect(liveStatus(running)).toBe('Reading the reliability report…');
  expect(liveStatus([...running, { role: 'assistant', text: 'Fault' }])).toBe('Writing the answer…');
  expect(liveStatus([{ role: 'user', text: 'why?' }])).toBe('Consulting the project…');
});
