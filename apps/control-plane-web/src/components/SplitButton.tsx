import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { Button, ButtonGroup, Divider, ListItemText, Menu, MenuItem, type ButtonProps } from '@mui/material';
import { Fragment, useState, type FC, type ReactNode } from 'react';

export interface SplitButtonOption {
  id: string;
  label: string;
  description?: string;
  selected?: boolean;
  /** Render a divider after this option. */
  divider?: boolean;
}

export const SplitButton: FC<{
  label: string;
  onPrimary: () => void;
  options: SplitButtonOption[];
  onSelect: (id: string) => void;
  startIcon?: ReactNode;
  disabled?: boolean;
  size?: 'small' | 'medium';
  variant?: ButtonProps['variant'];
}> = ({
  label,
  onPrimary,
  options,
  onSelect,
  startIcon,
  disabled = false,
  size = 'medium',
  variant = 'contained',
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <ButtonGroup variant={variant} size={size} disabled={disabled}>
        <Button startIcon={startIcon} onClick={onPrimary}>
          {label}
        </Button>
        <Button
          aria-label="more options"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ px: 0.5 }}
        >
          <ArrowDropDownRounded />
        </Button>
      </ButtonGroup>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {options.map((option) => (
          <Fragment key={option.id}>
            <MenuItem
              selected={option.selected}
              aria-selected={option.selected ?? false}
              onClick={() => {
                onSelect(option.id);
                setMenuAnchor(null);
              }}
            >
              {option.description != null ? (
                <ListItemText primary={option.label} secondary={option.description} />
              ) : (
                option.label
              )}
            </MenuItem>
            {option.divider === true && <Divider />}
          </Fragment>
        ))}
      </Menu>
    </>
  );
};
