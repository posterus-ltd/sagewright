import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { type ReactElement } from 'react';

import { useResponsive } from '../common';
import { useEnumTranslation } from '../i18n';

/**
 * Exclusive single-choice toggle. On wide viewports it renders a standard MUI
 * ToggleButtonGroup showing every option; on dense (mobile/tablet) viewports it
 * collapses to a single button that cycles to the next option on click, saving
 * horizontal space.
 */
export const ResponsiveToggle = <T extends string>({
  value,
  enumName,
  enumType,
  onChange,
  size = 'small',
  ariaLabel,
}: {
  value: T;
  enumType: Record<string, T>;
  enumName: string;
  onChange: (value: T) => void;
  size?: 'small' | 'medium';
  ariaLabel?: string;
}): ReactElement => {
  const { dense } = useResponsive();
  const { t } = useEnumTranslation(enumName);
  const options = Object.values(enumType) as T[];

  if (dense) {
    const found = options.findIndex((o) => o === value);
    const index = found >= 0 ? found : 0;
    const current = options[index];
    if (current == null) return <></>;
    const next = options[(index + 1) % options.length] ?? current;
    return (
      <ToggleButton
        value={current}
        selected
        size={size}
        onClick={() => onChange(next)}
        aria-label={ariaLabel || t(current)}
      >
        {t(current)}
      </ToggleButton>
    );
  }

  return (
    <ToggleButtonGroup
      exclusive
      size={size}
      value={value}
      onChange={(_, v: T | null) => v != null && onChange(v)}
      aria-label={ariaLabel || t(value)}
    >
      {options.map((option) => (
        <ToggleButton key={option} value={option}>
          {t(option)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
