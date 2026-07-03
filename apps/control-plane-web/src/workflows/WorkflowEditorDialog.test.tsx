import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workflow } from '@sagewright/shared';

import { WorkflowEditorDialog } from './WorkflowEditorDialog';
import { EXAMPLE_WORKFLOW } from './example-workflow';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const WORKERS_RESPONSE = {
  workers: [
    {
      id: 'claude-code',
      image: 'sagewright-worker-claude-code:latest',
      name: 'Claude Code',
      description: '',
    },
    {
      id: 'opencode',
      image: 'sagewright-worker-opencode:latest',
      name: 'opencode',
      description: '',
    },
    {
      id: 'codex',
      image: 'sagewright-worker-codex:latest',
      name: 'Codex',
      description: '',
    },
  ],
  defaultImage: 'sagewright-worker-claude-code:latest',
};

const stubFetch = (
  overrides: (url: string, init?: RequestInit) => Response | null,
) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = overrides(url, init);
    if (custom) return custom;
    if (url === '/api/workers') return jsonResponse(WORKERS_RESPONSE);
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderDialog = (props: { workflow?: Workflow | null } = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const utils = render(
    <WorkflowEditorDialog
      open
      workflow={props.workflow ?? null}
      onClose={onClose}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, onClose };
};

const stepCard = (index: number) =>
  screen.getByTestId(`workflow-step-${index}`);

// Steps are collapsed by default; tests that need a field inside the body
// must expand the card first.
const expandStep = (index: number) => {
  fireEvent.click(
    within(stepCard(index)).getByRole('button', {
      name: `Toggle step ${index + 1}`,
    }),
  );
};

describe('WorkflowEditorDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on the Builder tab with steps collapsed to their name and meta icons', async () => {
    stubFetch(() => null);
    renderDialog();

    const builderTab = screen.getByRole('tab', { name: 'Builder' });
    expect(builderTab.getAttribute('aria-selected')).toBe('true');

    await waitFor(() => {
      expect(
        within(stepCard(0)).getByText(EXAMPLE_WORKFLOW.steps[0].name),
      ).toBeTruthy();
      expect(
        within(stepCard(1)).getByText(EXAMPLE_WORKFLOW.steps[1].name),
      ).toBeTruthy();
      expect(
        within(stepCard(2)).getByText(EXAMPLE_WORKFLOW.steps[2].name),
      ).toBeTruthy();
    });
    expect(within(stepCard(0)).getByTestId('step-kind-icon')).toBeTruthy();
    expect(within(stepCard(0)).queryByLabelText('Prompt')).toBeNull();
  });

  it('adds a work step and a loop-back step, both collapsed by default', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(2)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add work step' }));
    expect(within(stepCard(3)).getByText('New step')).toBeTruthy();
    expect(within(stepCard(3)).queryByLabelText('Prompt')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add loop-back check' }),
    );
    expect(within(stepCard(4)).getByText('Validate')).toBeTruthy();
    // A loop-back step's meta icon shows the loop-back target even collapsed.
    expect(within(stepCard(4)).getByTestId('step-loop-icon')).toBeTruthy();
  });

  it('clears a dangling loop-back reference when its target step is deleted', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(2)).toBeTruthy());

    // Step 1 ("Implement") is the loop-back target of step 2 ("Validate").
    fireEvent.click(
      within(stepCard(1)).getByRole('button', { name: /delete step/i }),
    );

    // Validate is now at index 1; its "Loop back to" select falls back to the sentinel.
    expandStep(1);
    const loopSelect = within(stepCard(1)).getByRole('combobox', {
      name: 'Loop back to',
    });
    expect(loopSelect.textContent).toMatch(/restart from step 1/i);
  });

  it('shows loop-back-only fields only when a step is a loop-back check', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(0)).toBeTruthy());
    expandStep(0);

    expect(within(stepCard(0)).queryByLabelText('Validate commands')).toBeNull();

    fireEvent.click(
      within(stepCard(0)).getByRole('button', { name: 'Loop-back check' }),
    );
    expect(within(stepCard(0)).getByLabelText('Validate commands')).toBeTruthy();

    fireEvent.click(
      within(stepCard(0)).getByRole('button', { name: 'Work step' }),
    );
    expect(within(stepCard(0)).queryByLabelText('Validate commands')).toBeNull();
  });

  it('expands a collapsed step to show its fields, then collapses it again', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(0)).toBeTruthy());

    expect(within(stepCard(0)).queryByLabelText('Prompt')).toBeNull();
    expect(within(stepCard(0)).getByText('Plan (BDD+SDD)')).toBeTruthy();
    expect(within(stepCard(0)).getByTestId('step-kind-icon')).toBeTruthy();
    expect(within(stepCard(0)).getByTestId('step-worker-icon')).toBeTruthy();

    expandStep(0);
    await waitFor(() =>
      expect(within(stepCard(0)).getByLabelText('Prompt')).toBeTruthy(),
    );

    expandStep(0);
    await waitFor(() =>
      expect(within(stepCard(0)).queryByLabelText('Prompt')).toBeNull(),
    );
  });

  it('shows a loop-back meta icon on a collapsed loop-back check step', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(2)).toBeTruthy());

    expect(within(stepCard(2)).getByTestId('step-loop-icon')).toBeTruthy();
    expect(within(stepCard(2)).queryByLabelText('Validate commands')).toBeNull();
  });

  it('disables Save until a new step has a prompt, then enables it', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(2)).toBeTruthy());
    expandStep(0);
    // Wait for the worker list to load so a newly added step gets a real
    // default workerImage instead of the empty-string fallback.
    await waitFor(() =>
      expect(
        within(stepCard(0)).getByRole('combobox', { name: 'Worker' })
          .textContent,
      ).toBe('Claude Code'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add work step' }));
    expect(
      (screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    expandStep(3);
    fireEvent.change(within(stepCard(3)).getByLabelText('Prompt'), {
      target: { value: 'Do the thing' },
    });
    expect(
      (screen.getByRole('button', { name: /^create$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('round-trips edits between the Builder and JSON tabs', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(0)).toBeTruthy());
    expandStep(0);

    fireEvent.change(within(stepCard(0)).getByLabelText('Prompt'), {
      target: { value: 'Updated goal text' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    expect(
      (screen.getByLabelText('Workflow JSON') as HTMLTextAreaElement).value,
    ).toContain('Updated goal text');

    fireEvent.change(screen.getByLabelText('Workflow JSON'), {
      target: {
        value: JSON.stringify({ ...EXAMPLE_WORKFLOW, maxIterations: 7 }),
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    expect(
      (screen.getByLabelText('Max iterations') as HTMLInputElement).value,
    ).toBe('7');
  });

  it('blocks switching back to the Builder tab while the JSON has a syntax error', async () => {
    stubFetch(() => null);
    renderDialog();
    await waitFor(() => expect(stepCard(0)).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    fireEvent.change(screen.getByLabelText('Workflow JSON'), {
      target: { value: '{ not valid json' },
    });

    expect(
      (screen.getByRole('tab', { name: 'Builder' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('creates a workflow with an added step and a chosen worker', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === 'POST' && url === '/api/workflows') {
        return jsonResponse({
          id: 'wf1',
          name: EXAMPLE_WORKFLOW.name,
          definition: EXAMPLE_WORKFLOW,
          enabled: true,
          createdBy: 'me',
          createdAt: '',
        });
      }
      return null;
    });
    renderDialog();
    await waitFor(() => expect(stepCard(2)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add work step' }));
    expandStep(3);
    fireEvent.change(within(stepCard(3)).getByLabelText('Prompt'), {
      target: { value: 'Do the codex thing' },
    });
    fireEvent.mouseDown(
      within(stepCard(3)).getByRole('combobox', { name: 'Worker' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Codex' }));

    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workflows',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/workflows' && init?.method === 'POST',
    );
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body.definition.steps).toHaveLength(4);
    expect(body.definition.steps[3]).toEqual({
      key: 'new-step',
      name: 'New step',
      goal: 'Do the codex thing',
      workerImage: 'sagewright-worker-codex:latest',
      kind: 'work',
    });
    expect(body.enabled).toBe(true);
  });

  it('seeds from an existing workflow in edit mode and saves via PUT', async () => {
    const editingWorkflow: Workflow = {
      id: 'wf9',
      name: EXAMPLE_WORKFLOW.name,
      definition: EXAMPLE_WORKFLOW,
      enabled: true,
      createdBy: 'me',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === 'PUT') return jsonResponse({ ...editingWorkflow });
      return null;
    });
    renderDialog({ workflow: editingWorkflow });
    await waitFor(() => expect(stepCard(0)).toBeTruthy());
    expandStep(0);

    fireEvent.change(within(stepCard(0)).getByLabelText('Name'), {
      target: { value: 'Plan the work' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workflows/wf9',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([url]) => url === '/api/workflows/wf9',
    );
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body.definition.steps[0].name).toBe('Plan the work');
  });
});
