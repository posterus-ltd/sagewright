import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useResponsive } from '../common';
import { ResponsiveToggle, type ToggleOption } from './ResponsiveToggle';

vi.mock('../common', () => ({
  useResponsive: vi.fn(),
}));

const mockResponsive = vi.mocked(useResponsive);

enum Fruit {
  APPLE = 'apple',
  BANANA = 'banana',
  CHERRY = 'cherry',
}

const OPTIONS: ToggleOption<Fruit>[] = [
  { value: Fruit.APPLE, label: 'Apple' },
  { value: Fruit.BANANA, label: 'Banana' },
  { value: Fruit.CHERRY, label: 'Cherry' },
];

describe('ResponsiveToggle', () => {
  beforeEach(() => {
    mockResponsive.mockReset();
  });

  describe('wide viewport', () => {
    beforeEach(() => mockResponsive.mockReturnValue({ dense: false }));

    it('renders every option', () => {
      render(
        <ResponsiveToggle
          value={Fruit.APPLE}
          options={OPTIONS}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Apple')).toBeTruthy();
      expect(screen.getByText('Banana')).toBeTruthy();
      expect(screen.getByText('Cherry')).toBeTruthy();
    });

    it('calls onChange with the clicked option value', () => {
      const onChange = vi.fn();
      render(
        <ResponsiveToggle
          value={Fruit.APPLE}
          options={OPTIONS}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByText('Banana'));
      expect(onChange).toHaveBeenCalledWith(Fruit.BANANA);
    });

    it('ignores clicks on the already-selected option (no deselect)', () => {
      const onChange = vi.fn();
      render(
        <ResponsiveToggle
          value={Fruit.APPLE}
          options={OPTIONS}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByText('Apple'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('dense viewport', () => {
    beforeEach(() => mockResponsive.mockReturnValue({ dense: true }));

    it('renders only the current option label', () => {
      render(
        <ResponsiveToggle
          value={Fruit.BANANA}
          options={OPTIONS}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByText('Banana')).toBeTruthy();
      expect(screen.queryByText('Apple')).toBeNull();
      expect(screen.queryByText('Cherry')).toBeNull();
    });

    it('cycles to the next option on click', () => {
      const onChange = vi.fn();
      render(
        <ResponsiveToggle
          value={Fruit.APPLE}
          options={OPTIONS}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByText('Apple'));
      expect(onChange).toHaveBeenCalledWith(Fruit.BANANA);
    });

    it('wraps around from the last option back to the first', () => {
      const onChange = vi.fn();
      render(
        <ResponsiveToggle
          value={Fruit.CHERRY}
          options={OPTIONS}
          onChange={onChange}
        />,
      );

      fireEvent.click(screen.getByText('Cherry'));
      expect(onChange).toHaveBeenCalledWith(Fruit.APPLE);
    });
  });
});
