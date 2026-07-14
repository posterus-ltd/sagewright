import { CenterFocusWeakRounded, HubRounded } from '@mui/icons-material';
import {
  Box,
  ButtonBase,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import type { FC, ReactNode } from 'react';

import { fonts, radius, type Palette } from '../theme/tokens';
import { GalaxyScope, GalaxyView } from './galaxy-filters';
import { type StarNode } from './galaxy-graph-data';
import { GALAXY_TIME_WINDOWS, GalaxyTimeWindow } from './galaxy-time-window';
import { GalaxyWorkFeed } from './GalaxyWorkFeed';
import { STATUS_GROUPS, type StatusGroupKey } from './status-legend';

interface GalaxyHudProps {
  palette: Palette;
  timeWindow: GalaxyTimeWindow;
  onTimeWindowChange: (window: GalaxyTimeWindow) => void;
  view: GalaxyView;
  onViewChange: (view: GalaxyView) => void;
  scope: GalaxyScope;
  onScopeChange: (scope: GalaxyScope) => void;
  counts: Record<StatusGroupKey, number>;
  hiddenGroups: ReadonlySet<StatusGroupKey>;
  onToggleGroup: (key: StatusGroupKey) => void;
  taskCount: number;
  agentCount: number;
  onResetView: () => void;
  nodes: StarNode[];
  selectedId: string | null;
  onSelectNode: (node: StarNode) => void;
}

// Shared "instrument" chrome: a hairline glass panel in the corner of the field,
// annotated in the mono face like observatory telemetry.
const panelSx = (palette: Palette) =>
  ({
    pointerEvents: 'auto',
    bgcolor: `${palette.surface}E0`,
    border: `1px solid ${palette.border}`,
    borderRadius: `${radius}px`,
    backdropFilter: 'blur(10px)',
  }) as const;

const monoSx = (palette: Palette) =>
  ({
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: palette.muted,
  }) as const;

enum CornerPlacement {
  NW = 'nw',
  NE = 'ne',
  SW = 'sw',
  SE = 'se',
}

const CORNER_POSITION: Record<CornerPlacement, Record<string, number>> = {
  [CornerPlacement.NW]: { top: 16, left: 16 },
  [CornerPlacement.NE]: { top: 16, right: 16 },
  [CornerPlacement.SW]: { bottom: 16, left: 16 },
  [CornerPlacement.SE]: { bottom: 16, right: 16 },
};

const Corner: FC<{ placement: CornerPlacement; children: ReactNode }> = ({
  placement,
  children,
}) => (
  <Box
    sx={{
      position: 'absolute',
      zIndex: 20, // above the in-scene Html annotations (zIndexRange caps at 12)
      pointerEvents: 'none',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 1,
      ...CORNER_POSITION[placement],
      ...(placement === CornerPlacement.NW && {
        top: { xs: 12, md: 18 },
        left: { xs: 12, md: 20 },
        right: { xs: 12, md: 'auto' },
      }),
      ...(placement === CornerPlacement.NE && { top: 18, right: 20 }),
      ...(placement === CornerPlacement.SW && { bottom: 18, left: 20 }),
      ...(placement === CornerPlacement.SE && { bottom: 18, right: 20 }),
    }}
  >
    {children}
  </Box>
);

interface SegmentedProps<V extends string> {
  palette: Palette;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
}

// A HUD-styled exclusive toggle — the galaxy's equivalent of the Sessions
// page's ToggleButtonGroups.
const Segmented = <V extends string>({
  palette,
  value,
  options,
  onChange,
}: SegmentedProps<V>): ReactNode => (
  <Box sx={{ ...panelSx(palette), display: 'flex', p: 0.5, gap: 0.25 }}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <ButtonBase
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={active}
          sx={{
            ...monoSx(palette),
            px: 1.25,
            py: 0.5,
            borderRadius: `${radius - 2}px`,
            color: active ? palette.text : palette.muted,
            bgcolor: active ? palette.elevated : 'transparent',
            '&:hover': { color: palette.text },
            '&.Mui-focusVisible': { outline: `1px solid ${palette.accent}` },
          }}
        >
          {option.label}
        </ButtonBase>
      );
    })}
  </Box>
);

const VIEW_OPTIONS: readonly { value: GalaxyView; label: string }[] = [
  { value: GalaxyView.ACTIVE, label: 'Active' },
  { value: GalaxyView.ARCHIVED, label: 'Archived' },
];

const SCOPE_OPTIONS: readonly { value: GalaxyScope; label: string }[] = [
  { value: GalaxyScope.ALL, label: 'All' },
  { value: GalaxyScope.MINE, label: 'Mine' },
];

/** The galaxy's corner instruments: activity window, active/archived and
 *  mine/all lenses, status legend-as-filter, field summary, and view reset.
 *  Pure DOM overlaying the 3D canvas. */
export const GalaxyHud: FC<GalaxyHudProps> = ({
  palette,
  timeWindow,
  onTimeWindowChange,
  view,
  onViewChange,
  scope,
  onScopeChange,
  counts,
  hiddenGroups,
  onToggleGroup,
  taskCount,
  agentCount,
  onResetView,
  nodes,
  selectedId,
  onSelectNode,
}) => {
  const windowLabel =
    GALAXY_TIME_WINDOWS.find((w) => w.value === timeWindow)?.label ??
    timeWindow;
  const activeCount = counts.active;
  const attentionCount = counts.attention;

  return (
    <>
      <Corner placement={CornerPlacement.NW}>
        <Box
          sx={{
            width: { xs: '100%', md: 560 },
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 0.5 }}
          >
            <Box
              sx={{
                width: 34,
                height: 34,
                display: 'grid',
                placeItems: 'center',
                border: `1px solid ${palette.border}`,
                borderRadius: `${radius}px`,
                bgcolor: `${palette.surface}D8`,
                color: palette.accent,
                backdropFilter: 'blur(10px)',
              }}
            >
              <HubRounded sx={{ fontSize: 19 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  color: palette.text,
                  fontSize: { xs: 17, md: 20 },
                  fontWeight: 720,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
              >
                Galaxy
              </Typography>
              <Typography
                sx={{
                  ...monoSx(palette),
                  mt: 0.35,
                  fontSize: { xs: 8, md: 10 },
                }}
                noWrap
              >
                {activeCount > 0
                  ? `${activeCount} tasks building now`
                  : 'Fleet standing by'}
                {attentionCount > 0
                  ? ` · ${attentionCount} awaiting you`
                  : ` · ${taskCount} tasks mapped`}
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              overflowX: 'auto',
              pb: 0.25,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            <Segmented
              palette={palette}
              value={timeWindow}
              options={GALAXY_TIME_WINDOWS}
              onChange={onTimeWindowChange}
            />
            <Segmented
              palette={palette}
              value={view}
              options={VIEW_OPTIONS}
              onChange={onViewChange}
            />
            <Segmented
              palette={palette}
              value={scope}
              options={SCOPE_OPTIONS}
              onChange={onScopeChange}
            />
          </Box>
        </Box>
      </Corner>

      <Corner placement={CornerPlacement.NE}>
        <Box
          sx={{
            ...panelSx(palette),
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            p: 0.5,
            minWidth: 190,
          }}
        >
          {STATUS_GROUPS.map((group) => {
            const hidden = hiddenGroups.has(group.key);
            const color = palette[group.paletteKey];
            return (
              <ButtonBase
                key={group.key}
                onClick={() => onToggleGroup(group.key)}
                aria-pressed={!hidden}
                title={hidden ? 'Restore these stars' : 'Dim these stars'}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: `${radius - 2}px`,
                  opacity: hidden ? 0.45 : 1,
                  '&:hover': { bgcolor: palette.elevated },
                  '&.Mui-focusVisible': {
                    outline: `1px solid ${palette.accent}`,
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    // A dimmed group's swatch goes hollow — the lens is off.
                    bgcolor: hidden ? 'transparent' : color,
                    border: `1px solid ${color}`,
                    boxShadow: hidden ? 'none' : `0 0 6px ${color}80`,
                  }}
                />
                <Box
                  component="span"
                  sx={{ ...monoSx(palette), flex: 1, textAlign: 'left' }}
                >
                  {group.label}
                </Box>
                <Box
                  component="span"
                  sx={{
                    ...monoSx(palette),
                    color: palette.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {counts[group.key]}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Corner>

      {/* Self-positioning overlay — anchors against the galaxy container, so it
          is rendered bare rather than inside a Corner (which would reparent its
          absolute offsets and push it off-screen). */}
      <GalaxyWorkFeed
        palette={palette}
        nodes={nodes}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
      />

      <Corner placement={CornerPlacement.SW}>
        <Box
          sx={{
            ...panelSx(palette),
            ...monoSx(palette),
            display: { xs: 'none', md: 'block' },
            px: 1.25,
            py: 0.75,
          }}
        >
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'} · {agentCount}{' '}
          {agentCount === 1 ? 'agent' : 'agents'} ·{' '}
          {timeWindow === GalaxyTimeWindow.ALL
            ? 'all time'
            : `last ${windowLabel.toLowerCase()}`}
          {view === GalaxyView.ARCHIVED ? ' · archived' : ''}
          {scope === GalaxyScope.MINE ? ' · mine' : ''}
        </Box>
      </Corner>

      <Corner placement={CornerPlacement.SE}>
        <Tooltip title="Reset view" placement="left">
          <IconButton
            onClick={onResetView}
            aria-label="Reset view"
            size="small"
            sx={{
              ...panelSx(palette),
              display: { xs: 'none', md: 'inline-flex' },
              color: palette.muted,
              '&:hover': { color: palette.text, bgcolor: palette.elevated },
            }}
          >
            <CenterFocusWeakRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Corner>
    </>
  );
};
