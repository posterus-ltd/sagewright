import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { type ReactElement } from 'react';

import { useResponsive } from '../common';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Exclusive single-choice toggle. On wide viewports it renders a standard MUI
 * ToggleButtonGroup showing every option; on dense (mobile/tablet) viewports it
 * collapses to a single button that cycles to the next option on click, saving
 * horizontal space.
 */
export const ResponsiveToggle = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'small',
}: {
  value: T;
  options: readonly ToggleOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: 'small' | 'medium';
}): ReactElement => {
  const { dense } = useResponsive();

  if (dense) {
    const found = options.findIndex((o) => o.value === value);
    const index = found >= 0 ? found : 0;
    const current = options[index];
    if (current == null) return <></>;
    const next = options[(index + 1) % options.length] ?? current;
    return (
      <ToggleButton
        value={current.value}
        selected
        size={size}
        onClick={() => onChange(next.value)}
        aria-label={ariaLabel}
      >
        {current.label}
      </ToggleButton>
    );
  }

  return (
    <ToggleButtonGroup
      exclusive
      size={size}
      value={value}
      onChange={(_, v: T | null) => v != null && onChange(v)}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <ToggleButton key={option.value} value={option.value}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
