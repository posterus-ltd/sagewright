import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoopBuilder } from './LoopBuilder';

/** The stage labels currently shown in the loop, in visual order. */
const stageLabels = (result: ReturnType<typeof render>): string[] =>
  within(result.getByLabelText(/^Your loop:/))
    .getAllByText(/^(work|validate|reflect|review|ship)$/)
    .map((el) => el.textContent ?? '');

describe('LoopBuilder', () => {
  it('renders the default work → validate → reflect loop', () => {
    const result = render(<LoopBuilder />);
    expect(result.getByText(/compose your own loop/i)).toBeTruthy();
    expect(stageLabels(result)).toEqual(['work', 'validate', 'reflect']);
  });

  it('adds a stage from the palette', () => {
    const result = render(<LoopBuilder />);
    fireEvent.click(result.getByRole('button', { name: /add ship stage/i }));
    expect(stageLabels(result)).toEqual([
      'work',
      'validate',
      'reflect',
      'ship',
    ]);
  });

  it('removes a stage', () => {
    const result = render(<LoopBuilder />);
    fireEvent.click(result.getByRole('button', { name: /remove work stage/i }));
    expect(stageLabels(result)).toEqual(['validate', 'reflect']);
  });

  it('reorders a stage', () => {
    const result = render(<LoopBuilder />);
    // Move `validate` one slot earlier, ahead of `work`.
    fireEvent.click(
      result.getByRole('button', { name: /move validate earlier/i }),
    );
    expect(stageLabels(result)).toEqual(['validate', 'work', 'reflect']);
  });

  it('caps the ends of the loop — the first cannot move earlier', () => {
    const result = render(<LoopBuilder />);
    expect(
      result.getByRole('button', { name: /move work earlier/i }),
    ).toHaveProperty('disabled', true);
  });

  it('steps the iteration cap within its bounds', () => {
    const result = render(<LoopBuilder />);
    const value = () => result.getByText(/^\d$/).textContent;
    expect(value()).toBe('3');
    fireEvent.click(result.getByRole('button', { name: /more iterations/i }));
    expect(value()).toBe('4');
    fireEvent.click(result.getByRole('button', { name: /more iterations/i }));
    // Clamped at the maximum (5).
    expect(
      result.getByRole('button', { name: /more iterations/i }),
    ).toHaveProperty('disabled', true);
    expect(value()).toBe('5');
  });

  it('shows an empty state once every stage is removed', () => {
    const result = render(<LoopBuilder />);
    for (const label of ['work', 'validate', 'reflect']) {
      fireEvent.click(
        result.getByRole('button', {
          name: new RegExp(`remove ${label} stage`, 'i'),
        }),
      );
    }
    expect(result.getByText(/empty loop/i)).toBeTruthy();
  });
});
