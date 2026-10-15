import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ServerStatusRow, { SERVER_ROW_STATUS } from './ServerStatusRow.jsx';

const OFFLINE_HELP = <span>Start it with ollama serve</span>;

describe('ServerStatusRow', () => {
  it('names the server, its address and that it is running', () => {
    render(<ServerStatusRow title="Server" status={SERVER_ROW_STATUS.ONLINE} address="localhost:11434" />);
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('localhost:11434')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Running');
  });

  it('shows only the facts the server reported', () => {
    render(
      <ServerStatusRow title="Quodeq server" status={SERVER_ROW_STATUS.ONLINE} address="localhost:7863"
        facts={[['version', '1.13.1'], ['PID', undefined]]} />,
    );
    expect(screen.getByText('1.13.1')).toBeInTheDocument();
    expect(screen.queryByText('PID')).toBeNull();
  });

  it('offers the console only while running', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ServerStatusRow title="Server" status={SERVER_ROW_STATUS.ONLINE} address="x" onToggleConsole={onToggle} />,
    );
    fireEvent.click(screen.getByLabelText('Show console'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<ServerStatusRow title="Server" status={SERVER_ROW_STATUS.OFFLINE} address="x" onToggleConsole={onToggle} />);
    expect(screen.queryByLabelText('Show console')).toBeNull();
  });

  it('says how to start an unreachable server and that it checks again by itself', () => {
    render(
      <ServerStatusRow title="Server" status={SERVER_ROW_STATUS.OFFLINE} address="localhost:11434"
        offlineMessage={OFFLINE_HELP} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not reachable');
    expect(screen.getByText('Start it with ollama serve')).toBeInTheDocument();
    expect(screen.getByText('Checked again every few seconds.')).toBeInTheDocument();
  });

  it('shows checking, with no help and no console, before the first answer', () => {
    render(
      <ServerStatusRow title="Server" status={SERVER_ROW_STATUS.CHECKING} address="x"
        offlineMessage={OFFLINE_HELP} onToggleConsole={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Checking…');
    expect(screen.queryByText('Start it with ollama serve')).toBeNull();
    expect(screen.queryByLabelText('Show console')).toBeNull();
  });

  it('copies the address when it is clicked', () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ServerStatusRow title="Server" status={SERVER_ROW_STATUS.ONLINE} address="localhost:7863" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy address localhost:7863' }));
    expect(writeText).toHaveBeenCalledWith('localhost:7863');
  });

  it('passes consoleOpen and showDot through to the console button', () => {
    const { container } = render(
      <ServerStatusRow title="Server" status={SERVER_ROW_STATUS.ONLINE} address="x" onToggleConsole={() => {}} consoleOpen showDot />,
    );
    expect(screen.getByLabelText('Hide console')).toBeInTheDocument();
    expect(container.querySelector('.console-button__dot')).not.toBeNull();
  });
});
