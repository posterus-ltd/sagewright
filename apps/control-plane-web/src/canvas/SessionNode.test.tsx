import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogProvider } from '../components/ConfirmDialogProvider';
import { CanvasActionsContext, type CanvasActions } from './canvas-actions';
import { SessionNode } from './SessionNode';

// SessionPanel (rendered inside the node) opens an EventSource and fetches the task.
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener() {}
  close() {}
}

const setBorderColor = vi.fn();

const actions: CanvasActions = {
  removeSession: vi.fn(),
  setBorderColor,
  usedBorderColors: ['#3fb950', '#58a6ff'],
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ConfirmDialogProvider>
        <ReactFlowProvider>
          <CanvasActionsContext.Provider value={actions}>{children}</CanvasActionsContext.Provider>
        </ReactFlowProvider>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
};

const renderNode = (borderColor?: string) => {
  const props = { id: 't1', data: { sessionId: 't1', borderColor }, selected: false } as unknown as NodeProps;
  return render(<SessionNode {...props} />, { wrapper });
};

describe('SessionNode border color', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setBorderColor.mockClear();
    vi.stubGlobal('EventSource', FakeEventSource as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
    );
  });

  it('opens a popover offering the colors already in use on the canvas', async () => {
    renderNode();
    fireEvent.click(screen.getByLabelText('Border color'));
    expect(await screen.findByLabelText('Use color #3fb950')).toBeTruthy();
    expect(screen.getByLabelText('Use color #58a6ff')).toBeTruthy();
  });

  it('applies a used color when its swatch is clicked', async () => {
    renderNode();
    fireEvent.click(screen.getByLabelText('Border color'));
    fireEvent.click(await screen.findByLabelText('Use color #58a6ff'));
    expect(setBorderColor).toHaveBeenCalledWith('t1', '#58a6ff');
  });

  it('clears the color when reset is clicked', async () => {
    renderNode('#3fb950');
    fireEvent.click(screen.getByLabelText('Border color'));
    fireEvent.click(await screen.findByRole('button', { name: /reset to default/i }));
    expect(setBorderColor).toHaveBeenCalledWith('t1', undefined);
  });
});
