import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SplitButton, type SplitButtonOption } from './SplitButton';

const defaultOptions: SplitButtonOption[] = [
  { id: 'opt-1', label: 'Option 1' },
  { id: 'opt-2', label: 'Option 2', description: 'A description' },
  { id: 'opt-3', label: 'Option 3', selected: true },
];

describe('SplitButton', () => {
  it('renders the primary label and calls onPrimary when clicked without opening the menu', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={defaultOptions}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('Run')).toBeTruthy();
    fireEvent.click(screen.getByText('Run'));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the menu with all option labels and descriptions when the caret is clicked', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={defaultOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));
    expect(screen.getByText('Option 1')).toBeTruthy();
    expect(screen.getByText('Option 2')).toBeTruthy();
    expect(screen.getByText('A description')).toBeTruthy();
  });

  it('calls onSelect with the option id and closes the menu when an option is clicked', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={defaultOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));
    fireEvent.click(screen.getByText('Option 1'));
    expect(onSelect).toHaveBeenCalledWith('opt-1');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables both buttons and does not fire onPrimary when disabled', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={defaultOptions}
        onSelect={onSelect}
        disabled
      />,
    );

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    buttons.forEach((btn) => expect(btn.disabled).toBe(true));
    fireEvent.click(screen.getByText('Run'));
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('marks the selected option with aria-selected when the menu is open', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={defaultOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));
    const selectedItem = screen.getByText('Option 3').closest('[aria-selected="true"]');
    expect(selectedItem).not.toBeNull();
  });

  it('renders a divider after an option flagged with divider', () => {
    const onPrimary = vi.fn();
    const onSelect = vi.fn();
    render(
      <SplitButton
        label="Run"
        onPrimary={onPrimary}
        options={[
          { id: 'opt-1', label: 'Option 1', divider: true },
          { id: 'opt-2', label: 'Option 2' },
        ]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'more options' }));
    expect(screen.getByRole('separator')).toBeTruthy();
  });
});
