import {
  ArrowForwardRounded,
  AutoAwesomeRounded,
  ChevronLeftRounded,
  PersonRounded,
} from '@mui/icons-material';
import { Box, ButtonBase, Typography } from '@mui/material';
import { SessionStatus } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { useMemo, useState, type FC } from 'react';

import { fonts, radius, type Palette } from '../theme/tokens';
import { clusterDisplayName, type StarNode } from './galaxy-graph-data';
import { starColor } from './star-appearance';

interface GalaxyWorkFeedProps {
  palette: Palette;
  nodes: StarNode[];
  selectedId: string | null;
  onSelectNode: (node: StarNode) => void;
}

const ATTENTION_ORDER: Partial<Record<SessionStatus, number>> = {
  [SessionStatus.NEEDS_ASSISTANCE]: 0,
  [SessionStatus.MAX_ITERATIONS]: 0,
  [SessionStatus.RUNNING]: 1,
  [SessionStatus.PUSHING]: 2,
  [SessionStatus.PROVISIONING]: 3,
  [SessionStatus.QUEUED]: 4,
};

// Priority for a star with nothing demanding attention — sorts to the bottom.
const SETTLED_PRIORITY = 10;

const workPriority = (node: StarNode): number =>
  ATTENTION_ORDER[node.status] ?? SETTLED_PRIORITY;

// Live = actively working or waiting on a human; drives the "N LIVE" tally and
// the collapsed pip.
const isLive = (node: StarNode): boolean =>
  workPriority(node) < SETTLED_PRIORITY;

const sortWork = (nodes: StarNode[]): StarNode[] =>
  [...nodes].sort(
    (a, b) =>
      workPriority(a) - workPriority(b) ||
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const activityLabel = (node: StarNode): string => {
  if (node.status === SessionStatus.NEEDS_ASSISTANCE)
    return 'Waiting for input';
  if (node.status === SessionStatus.MAX_ITERATIONS)
    return 'Reached iteration limit';
  if (node.status === SessionStatus.PUSHING) return 'Publishing changes';
  if (node.status === SessionStatus.PROVISIONING) return 'Preparing workspace';
  if (node.status === SessionStatus.QUEUED) return 'Queued to start';
  if (node.currentStepKey) return node.currentStepKey.replace(/[-_]/g, ' ');
  if (node.workflowStepKey) return node.workflowStepKey.replace(/[-_]/g, ' ');
  if (node.status === SessionStatus.RUNNING) return 'Building & validating';
  if (node.prUrl) return 'Ready for review';
  return node.status.replace(/_/g, ' ');
};

const WorkCard: FC<{
  node: StarNode;
  palette: Palette;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ node, palette, isSelected, onSelect }) => {
  const color = starColor(node.status, palette);
  const detail = node.prompt && node.prompt !== node.name ? node.prompt : null;

  return (
    <ButtonBase
      onClick={onSelect}
      aria-label={`Inspect ${node.name}`}
      sx={{
        width: '100%',
        minWidth: 0,
        alignItems: 'stretch',
        textAlign: 'left',
        borderRadius: `${radius}px`,
        border: `1px solid ${isSelected ? palette.accent : palette.border}`,
        bgcolor: isSelected ? `${palette.accent}12` : `${palette.surface}E8`,
        backdropFilter: 'blur(14px)',
        overflow: 'hidden',
        transition:
          'transform 160ms ease, border-color 160ms ease, background-color 160ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: palette.muted,
          bgcolor: palette.elevated,
        },
        '&.Mui-focusVisible': {
          outline: `2px solid ${palette.accent}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          width: 3,
          flexShrink: 0,
          bgcolor: color,
          boxShadow: `0 0 14px ${color}`,
        }}
      />
      <Box sx={{ p: 1.5, minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '50%',
              bgcolor: palette.elevated,
              border: `1px solid ${palette.border}`,
              color: palette.text,
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(node.createdByName ?? 'Unknown')}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{ fontSize: 12, fontWeight: 650, lineHeight: 1.2 }}
              noWrap
            >
              {node.createdByName ?? 'Unknown'}
            </Typography>
            <Typography
              sx={{ fontFamily: fonts.mono, fontSize: 9, color: palette.muted }}
              noWrap
            >
              {clusterDisplayName(node.clusterId)} ·{' '}
              {DateTime.fromISO(node.updatedAt).toRelative()}
            </Typography>
          </Box>
          <ArrowForwardRounded
            sx={{
              fontSize: 16,
              color: isSelected ? palette.accent : palette.muted,
            }}
          />
        </Box>

        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 650,
            lineHeight: 1.35,
            color: palette.text,
          }}
        >
          {node.name}
        </Typography>
        {detail && (
          <Typography
            sx={{
              mt: 0.5,
              fontSize: 11,
              lineHeight: 1.45,
              color: palette.muted,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {detail}
          </Typography>
        )}

        <Box
          sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          <Typography
            sx={{
              fontFamily: fonts.mono,
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color,
              flex: 1,
            }}
          >
            {activityLabel(node)}
          </Typography>
          {node.iteration !== null && (
            <Typography
              sx={{ fontFamily: fonts.mono, fontSize: 9, color: palette.muted }}
            >
              ITER {node.iteration}
            </Typography>
          )}
        </Box>
      </Box>
    </ButtonBase>
  );
};

type ExpandableButtonProps = {
  palette: Palette;
  isExpanded: boolean;
  toggleExpanded: () => void;
  workItemsCount: number;
  inFlightCount: number;
};

const ExpandableButton: FC<ExpandableButtonProps> = ({
  palette,
  isExpanded,
  toggleExpanded,
  workItemsCount,
  inFlightCount,
}) => (
  <Box
    component={ButtonBase}
    onClick={toggleExpanded}
    aria-label="Collapse work in orbit"
    aria-expanded={true}
    sx={{
      pointerEvents: 'auto',
      width: '100%',
      minHeight: 44,
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      mb: 1,
      px: 1.25,
      border: `1px solid ${palette.border}`,
      borderRadius: `${radius}px`,
      bgcolor: `${palette.surface}E8`,
      backdropFilter: 'blur(14px)',
      '&:hover': {
        bgcolor: palette.elevated,
        borderColor: palette.muted,
      },
      '&.Mui-focusVisible': {
        outline: `2px solid ${palette.accent}`,
        outlineOffset: 2,
      },
    }}
  >
    <AutoAwesomeRounded sx={{ fontSize: 15, color: palette.accent }} />
    <Typography
      sx={{
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: palette.text,
      }}
    >
      Work in orbit
    </Typography>
    <Typography
      sx={{
        ml: 'auto',
        fontFamily: fonts.mono,
        fontSize: 9,
        color: palette.muted,
      }}
    >
      {workItemsCount} TASKS · {inFlightCount} LIVE
    </Typography>
    <ChevronLeftRounded
      sx={{
        fontSize: 18,
        color: palette.muted,
        rotate: isExpanded ? '90deg' : '-90deg',
      }}
    />
  </Box>
);

export const GalaxyWorkFeed: FC<GalaxyWorkFeedProps> = ({
  nodes,
  palette,
  selectedId,
  onSelectNode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { workItems, inFlight } = useMemo(
    () => ({
      workItems: sortWork(nodes),
      inFlight: nodes.filter(isLive).length,
    }),
    [nodes],
  );

  return (
    <Box
      component="aside"
      aria-label="Team activity"
      sx={{
        position: 'absolute',
        zIndex: 18,
        top: { xs: 'auto', md: 116 },
        bottom: { xs: 12, md: isExpanded ? 56 : 'auto' },
        left: { xs: 12, md: 20 },
        right: { xs: isExpanded ? 12 : 'auto', md: 'auto' },
        width: { xs: 'auto', md: 320 },
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <ExpandableButton
        palette={palette}
        isExpanded={isExpanded}
        toggleExpanded={() => setIsExpanded((prev) => !prev)}
        workItemsCount={workItems.length}
        inFlightCount={inFlight}
      />

      {isExpanded && (
        <>
          {workItems.length > 0 ? (
            <Box
              sx={{
                pointerEvents: 'auto',
                // Fill the remaining panel height and scroll inside it, rather
                // than letting the card list overflow the fixed-height aside.
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: { xs: 'row', md: 'column' },
                gap: 1,
                overflowX: { xs: 'auto', md: 'hidden' },
                overflowY: { xs: 'hidden', md: 'auto' },
                pr: { md: 0.5 },
                pb: { xs: 0.5, md: 0 },
                scrollbarWidth: 'thin',
                '& > *': { flex: { xs: '0 0 280px', md: '0 0 auto' } },
              }}
            >
              {workItems.map((node) => (
                <WorkCard
                  key={node.id}
                  node={node}
                  palette={palette}
                  isSelected={selectedId === node.id}
                  onSelect={() => onSelectNode(node)}
                />
              ))}
            </Box>
          ) : (
            <Box
              sx={{
                pointerEvents: 'auto',
                p: 2,
                border: `1px solid ${palette.border}`,
                borderRadius: `${radius}px`,
                bgcolor: `${palette.surface}E8`,
              }}
            >
              <PersonRounded
                sx={{ color: palette.muted, fontSize: 18, mb: 0.5 }}
              />
              <Typography sx={{ fontSize: 12, color: palette.muted }}>
                No work matches this lens.
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
