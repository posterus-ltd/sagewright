import {
  AccountCircleRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  DarkModeRounded,
  AccountTreeRounded,
  DashboardRounded,
  GridViewRounded,
  InfoOutlined,
  LightModeRounded,
  LogoutRounded,
  ScheduleRounded,
  SearchRounded,
  HubRounded,
  SettingsBrightnessRounded,
  SettingsRounded,
  TerminalRounded,
  ViewQuiltRounded,
  WidthFullRounded,
  WidthNormalRounded,
} from '@mui/icons-material';
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import { useState, type FC, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/useAuth';
import { useIsDemo } from '../DemoModeProvider';
import { useUserPreferences } from '../preferences/UserPreferencesProvider';
import { useAppHeight } from '../theme/layout';
import { useThemeMode, ThemeMode } from '../theme/ThemeModeProvider';
import { fonts } from '../theme/tokens';
import { useCommandPalette } from './command-palette/CommandPaletteProvider';
import { shortcutLabel } from './command-palette/shortcut';

const EXPANDED = 240;
const COLLAPSED = 56;

const NAV = [
  {
    to: '/overview',
    label: 'Overview',
    icon: <DashboardRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/overview'),
  },
  {
    to: '/',
    label: 'Sessions',
    icon: <TerminalRounded fontSize="small" />,
    match: (p: string) => p === '/' || p.startsWith('/tasks'),
  },
  {
    to: '/canvas',
    label: 'Canvas',
    icon: <GridViewRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/canvas'),
  },
  {
    to: '/workspaces',
    label: 'Workspaces',
    icon: <ViewQuiltRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/workspaces'),
  },
  {
    to: '/galaxy',
    label: 'Galaxy',
    icon: <HubRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/galaxy'),
  },
  {
    to: '/scheduled',
    label: 'Scheduled Tasks',
    icon: <ScheduleRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/scheduled'),
  },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: <AccountTreeRounded fontSize="small" />,
    match: (p: string) => p.startsWith('/workflows'),
  },
];

interface RowProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  to?: string;
  title?: string;
  trailing?: ReactNode;
}

// One sidebar entry. Becomes an icon-only target with a tooltip when collapsed.
const Row: FC<RowProps> = ({
  icon,
  label,
  active,
  collapsed,
  onClick,
  to,
  title,
  trailing,
}) => {
  const inner = (
    <Box
      component={to ? Link : 'button'}
      to={to}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 1.5,
        width: '100%',
        px: 1.5,
        py: 1,
        border: 0,
        borderLeft: '2px solid',
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'action.selected' : 'transparent',
        color: active ? 'text.primary' : 'text.secondary',
        cursor: 'pointer',
        textDecoration: 'none',
        font: 'inherit',
        textAlign: 'left',
        transition: 'background-color 120ms, color 120ms',
        '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
        '& svg': { color: active ? 'primary.main' : 'inherit' },
      }}
    >
      <Box sx={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>
      {!collapsed && (
        <Box
          component="span"
          sx={{
            fontSize: 14,
            fontWeight: active ? 600 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {label}
        </Box>
      )}
      {!collapsed && trailing && (
        <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex' }}>
          {trailing}
        </Box>
      )}
    </Box>
  );
  return collapsed ? (
    <Tooltip title={title ?? label} placement="right">
      {inner}
    </Tooltip>
  ) : (
    inner
  );
};

const themeIcon = (mode: ThemeMode): ReactNode => {
  if (mode === ThemeMode.LIGHT) return <LightModeRounded fontSize="small" />;
  if (mode === ThemeMode.DARK) return <DarkModeRounded fontSize="small" />;
  return <SettingsBrightnessRounded fontSize="small" />;
};

const NEXT: Record<ThemeMode, ThemeMode> = {
  [ThemeMode.SYSTEM]: ThemeMode.LIGHT,
  [ThemeMode.LIGHT]: ThemeMode.DARK,
  [ThemeMode.DARK]: ThemeMode.SYSTEM,
};
const LABEL: Record<ThemeMode, string> = {
  [ThemeMode.SYSTEM]: 'System',
  [ThemeMode.LIGHT]: 'Light',
  [ThemeMode.DARK]: 'Dark',
};

export const Sidebar: FC = () => {
  const isDemo = useIsDemo();
  const appH = useAppHeight();
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openCommandPalette } = useCommandPalette();
  const { displayName, logout } = useAuth();
  const { mode, setMode } = useThemeMode();
  const {
    preference: fullWidthContent,
    updatePreference: setFullWidthContent,
  } = useUserPreferences('fullWidthContent', false);
  const { preference: collapsed, updatePreference: setCollapsed } =
    useUserPreferences('sidebarCollapsed', false);
  const [userAnchor, setUserAnchor] = useState<HTMLElement | null>(null);

  const signOut = (): void => {
    setUserAnchor(null);
    void logout();
    navigate('/login');
  };

  const settingsActive = location.pathname.startsWith('/settings');
  const aboutActive = location.pathname.startsWith('/about');

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? COLLAPSED : EXPANDED,
        flexShrink: 0,
        height: appH,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        transition: 'width 160ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Brand — a shell prompt. The one loud, terminal-native element. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 1,
          height: 56,
          px: collapsed ? 0 : 2,
          flexShrink: 0,
        }}
      >
        <Box
          component="span"
          sx={{
            color: 'primary.main',
            fontFamily: fonts.mono,
            fontWeight: 700,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ❯
        </Box>
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: '-0.02em',
                color: 'text.primary',
              }}
            >
              sagewright
            </Box>
            <Box
              component="span"
              sx={{
                ml: 0.5,
                width: 8,
                height: 16,
                bgcolor: 'primary.main',
                display: 'inline-block',
                animation: 'sagewright-blink 1.1s step-end infinite',
                '@keyframes sagewright-blink': { '50%': { opacity: 0 } },
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                },
              }}
            />
          </Box>
        )}
      </Box>
      <Divider />

      {/* Quick actions — opens the command palette (⌘+K / Ctrl+K) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', pt: 1 }}>
        <Row
          icon={<SearchRounded fontSize="small" />}
          label="Quick actions"
          title={`Quick actions (${shortcutLabel})`}
          collapsed={collapsed}
          onClick={() => openCommandPalette()}
          trailing={
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 11,
                lineHeight: 1.4,
                px: 0.75,
                py: 0.25,
                borderRadius: 0.75,
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                whiteSpace: 'nowrap',
              }}
            >
              {shortcutLabel}
            </Box>
          }
        />
      </Box>

      {/* Routes */}
      <Box sx={{ display: 'flex', flexDirection: 'column', py: 1, gap: 0.5 }}>
        {NAV.map((item) => (
          <Row
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={item.match(location.pathname)}
          />
        ))}
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Settings · about · user. The demo hides Settings + Sign-out (out of the
          showcase scope) and shows the identity chip as a plain, non-actionable row. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', py: 1, gap: 0.5 }}>
        {!isDemo && (
          <Row
            to="/settings"
            icon={<SettingsRounded fontSize="small" />}
            label="Settings"
            collapsed={collapsed}
            active={settingsActive}
          />
        )}
        <Row
          to="/about"
          icon={<InfoOutlined fontSize="small" />}
          label="About"
          collapsed={collapsed}
          active={aboutActive}
        />
        <Row
          icon={<AccountCircleRounded fontSize="small" />}
          label={displayName ?? 'Account'}
          title={displayName ?? 'Account'}
          collapsed={collapsed}
          onClick={isDemo ? undefined : (e) => setUserAnchor(e.currentTarget)}
        />
        <Divider sx={{ my: 0.5 }} />
        {/* Compact icon controls divided by rules: theme · width · collapse.
            Collapsed, the row holds only the expand button. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'end',
            gap: 0.5,
            px: 1.5,
            py: 0.5,
          }}
        >
          {!collapsed && (
            <>
              <Tooltip title={`Theme: ${LABEL[mode]}`} placement="top">
                <IconButton
                  size="small"
                  onClick={() => setMode(NEXT[mode])}
                  sx={{ color: 'text.secondary' }}
                >
                  {themeIcon(mode)}
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
              <Tooltip
                title={`Width: ${fullWidthContent ? 'Full' : 'Contained'}`}
                placement="top"
              >
                <IconButton
                  size="small"
                  onClick={() => setFullWidthContent(!fullWidthContent)}
                  sx={{ color: 'text.secondary' }}
                >
                  {fullWidthContent ? (
                    <WidthFullRounded fontSize="small" />
                  ) : (
                    <WidthNormalRounded fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
            </>
          )}
          <Tooltip
            title={collapsed ? 'Expand' : 'Collapse'}
            placement={collapsed ? 'right' : 'top'}
          >
            <IconButton
              size="small"
              onClick={() => setCollapsed(!collapsed)}
              sx={{ color: 'text.secondary' }}
            >
              {collapsed ? (
                <ChevronRightRounded fontSize="small" />
              ) : (
                <ChevronLeftRounded fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Menu
        anchorEl={userAnchor}
        open={Boolean(userAnchor)}
        onClose={() => setUserAnchor(null)}
      >
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
