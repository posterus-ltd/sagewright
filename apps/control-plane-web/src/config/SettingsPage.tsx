import {
  Box,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { isAdminRole } from '@sagewright/shared';
import { useMemo, type FC } from 'react';
import { useSearchParams } from 'react-router';

import { useMe } from '../api/hooks';
import { MainContainer } from '../components/MainContainer';
import {
  SETTINGS_SECTIONS,
  SettingsSectionId,
  type SettingsSection,
} from './settingsSections';

const SECTION_PARAM = 'section';
const NAV_WIDTH = 220;

export const SettingsPage: FC = () => {
  const { data: me } = useMe();
  const isAdmin = !!me && isAdminRole(me.role);
  const [searchParams, setSearchParams] = useSearchParams();

  // Non-admins never see admin-only sections — in the nav or by deep link.
  const sections = useMemo<SettingsSection[]>(
    () =>
      SETTINGS_SECTIONS.filter((section) => !section.isAdminOnly || isAdmin),
    [isAdmin],
  );

  const requested = searchParams.get(SECTION_PARAM);
  // Fall back to the first section for a missing, unknown, or forbidden id.
  const active =
    sections.find((section) => section.id === requested) ?? sections[0];

  const select = (id: SettingsSectionId): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(SECTION_PARAM, id);
        return next;
      },
      { replace: true },
    );
  };

  // sections always has at least the GitHub section; the guard satisfies the type.
  if (!active) return null;
  const ActiveSection = active.Component;

  return (
    <MainContainer>
      {/* Mobile: the nav collapses into a dropdown pinned above the content. */}
      <TextField
        select
        fullWidth
        size="small"
        label="Section"
        value={active.id}
        onChange={(e) => select(e.target.value as SettingsSectionId)}
        sx={{ display: { xs: 'flex', md: 'none' }, mb: 3 }}
      >
        {sections.map(({ id, label }) => (
          <MenuItem key={id} value={id}>
            {label}
          </MenuItem>
        ))}
      </TextField>

      {/* `gap` (not Stack spacing) so the md-only nav/divider leave no phantom
          margin once they're display:none on mobile. */}
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Box
          component="nav"
          aria-label="Settings"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: NAV_WIDTH,
            flexShrink: 0,
          }}
        >
          <Stack spacing={0.5}>
            {sections.map(({ id, label, Icon }) => {
              const isActive = id === active.id;
              return (
                <Button
                  key={id}
                  size="small"
                  variant="text"
                  color={isActive ? 'primary' : 'inherit'}
                  startIcon={<Icon fontSize="small" />}
                  onClick={() => select(id)}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </Stack>
        </Box>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ display: { xs: 'none', md: 'block' } }}
        />

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <ActiveSection />
        </Box>
      </Box>
    </MainContainer>
  );
};
