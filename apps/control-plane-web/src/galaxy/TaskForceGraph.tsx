import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { DateTime } from 'luxon';
import R3fForceGraph, { type GraphMethods, type LinkObject, type NodeObject } from 'r3f-forcegraph';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';

import { fonts, type Palette } from '../theme/tokens';
import {
  clusterDisplayName,
  clusterSummaries,
  carrySimulationState,
  type SimulatedStarNode,
  type StarAnchor,
  type StarLink,
  type StarNode,
} from './galaxy-graph-data';
import { hashUnit } from './hash';
import { isActiveStatus, pulsePeriodMs, starColor, starOpacity, starSize } from './star-appearance';
import { statusGroupKey, type StatusGroupKey } from './status-legend';

const CLUSTER_FORCE_STRENGTH = 0.06;
const CORE_RADIUS = 2.4;
const HALO_SCALE = 6; // halo sprite diameter relative to the core radius
const HIT_AREA_SCALE = 3; // invisible raycast padding around the core
const PULSE_AMPLITUDE = 0.4;
// Ghosted, not gone: stars dimmed by the legend filter stay faintly in place so
// the constellation keeps its shape instead of reflowing.
const GHOST_OPACITY = 0.06;
const NAMEPLATE_LIFT = 44; // world units above the ring plane

// Nudges each node toward its cluster's fixed anchor point every tick, on top of
// the library's default charge/link forces — keeps each agent's stars grouped
// into a recognizable constellation instead of one undifferentiated blob.
// Typed against the ref's default {} generic (matches GraphMethods.d3Force's
// expected ForceFn) — node.anchor/x/y/z resolve via NodeObject's index signature.
const clusterForce = (strength: number) => {
  let nodes: NodeObject[] = [];
  const force = (alpha: number): void => {
    for (const n of nodes) {
      if (!n.anchor || n.x == null || n.y == null || n.z == null) continue;
      n.vx = (n.vx ?? 0) + (n.anchor.x - n.x) * strength * alpha;
      n.vy = (n.vy ?? 0) + (n.anchor.y - n.y) * strength * alpha;
      n.vz = (n.vz ?? 0) + (n.anchor.z - n.z) * strength * alpha;
    }
  };
  force.initialize = (ns: NodeObject[]): void => {
    nodes = ns;
  };
  return force;
};

// Soft radial glow shared by every star's halo sprite; tinted per node via the
// sprite material color. (three-forcegraph disposes it whenever a node object
// is retired — a re-upload of a 128px canvas, harmless.)
let cachedHaloTexture: CanvasTexture | null = null;
const haloTexture = (): CanvasTexture => {
  if (cachedHaloTexture) return cachedHaloTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  cachedHaloTexture = new CanvasTexture(canvas);
  return cachedHaloTexture;
};

const coreGeometry = new SphereGeometry(1, 20, 20);
const WHITE = new Color('#ffffff');

// Per-star handles for the frame loop (pulse) and restyling effects (legend
// dimming) — nodeThreeObject only runs at object creation, so live restyles go
// through this registry instead.
interface StarObjects {
  node: StarNode;
  group: Group;
  halo: Sprite;
  coreMaterial: MeshBasicMaterial;
  haloMaterial: SpriteMaterial;
  baseOpacity: number;
  baseHaloScale: number;
  pulsePeriod: number | null;
  phase: number;
}

interface TaskForceGraphProps {
  nodes: StarNode[];
  links: StarLink[];
  palette: Palette;
  isDark: boolean;
  hiddenGroups: ReadonlySet<StatusGroupKey>;
  selectedId: string | null;
  reducedMotion: boolean;
  onSelectNode: (node: StarNode) => void;
  onFocusCluster: (anchor: StarAnchor) => void;
  onFocusNode: (position: StarAnchor) => void;
}

export const TaskForceGraph: FC<TaskForceGraphProps> = ({
  nodes,
  links,
  palette,
  isDark,
  hiddenGroups,
  selectedId,
  reducedMotion,
  onSelectNode,
  onFocusCluster,
  onFocusNode,
}) => {
  const fgRef = useRef<GraphMethods>(undefined);
  const starsRef = useRef(new Map<string, StarObjects>());
  const hiddenGroupsRef = useRef(hiddenGroups);
  const hoverAnchorRef = useRef<Group>(null);
  const selectedAnchorRef = useRef<Group>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const glDomElement = useThree((state) => state.gl.domElement);

  // The poll rebuilds node objects every 5s; carrying the sim state over keeps
  // the constellations flying from where they were instead of re-settling.
  const prevNodesRef = useRef<SimulatedStarNode[]>([]);
  const graphData = useMemo(() => {
    const carried = carrySimulationState(prevNodesRef.current, nodes);
    prevNodesRef.current = carried;
    // Fresh link copies each time: the force engine rewrites source/target from
    // id strings into node-object references, which must re-resolve against the
    // newly carried node objects rather than point at retired ones.
    return { nodes: carried, links: links.map((l) => ({ ...l })) };
  }, [nodes, links]);

  const nodeById = useMemo(
    () => new Map<string, SimulatedStarNode>(graphData.nodes.map((n) => [n.id, n])),
    [graphData],
  );
  const clusters = useMemo(() => clusterSummaries(nodes), [nodes]);

  useEffect(() => {
    fgRef.current?.d3Force('cluster', clusterForce(CLUSTER_FORCE_STRENGTH));
  }, []);

  const applyBaseVisual = useCallback(
    (entry: StarObjects): void => {
      const ghosted = hiddenGroupsRef.current.has(statusGroupKey(entry.node.status));
      const base = ghosted ? GHOST_OPACITY : starOpacity(entry.node, Date.now());
      entry.baseOpacity = base;
      entry.coreMaterial.opacity = base;
      entry.haloMaterial.opacity = base * (isDark ? 0.9 : 0.55);
    },
    [isDark],
  );

  useEffect(() => {
    hiddenGroupsRef.current = hiddenGroups;
    for (const entry of starsRef.current.values()) applyBaseVisual(entry);
  }, [hiddenGroups, applyBaseVisual]);

  // IMPORTANT: identity-stable (only theme changes recreate it) — r3f-forcegraph
  // treats a new nodeThreeObject function as "flush and rebuild every object".
  const makeStar = useCallback(
    (n: NodeObject): Group => {
      const node = n as StarNode;
      const color = new Color(starColor(node.status, palette));
      const radius = CORE_RADIUS * Math.sqrt(starSize(node.isHub));

      // Unlit white-hot core against a status-tinted corona in dark mode; in
      // light mode the star reads as an atlas dot, so the core keeps full tint.
      const coreMaterial = new MeshBasicMaterial({
        color: isDark ? color.clone().lerp(WHITE, 0.5) : color,
        transparent: true,
      });
      const core = new Mesh(coreGeometry, coreMaterial);
      core.scale.setScalar(radius);

      const haloMaterial = new SpriteMaterial({
        map: haloTexture(),
        color,
        transparent: true,
        depthWrite: false,
        // Additive glow on the dark sky; alpha-blended soft dot on the light one
        // (additive over white is invisible).
        blending: isDark ? AdditiveBlending : NormalBlending,
      });
      const halo = new Sprite(haloMaterial);
      const baseHaloScale = radius * HALO_SCALE;
      halo.scale.setScalar(baseHaloScale);
      halo.raycast = () => undefined; // hover hits the hit-sphere, not the wide glow

      // Padded invisible hit target: at overview distance a core is only a few
      // pixels wide, far too small to hover or click reliably. colorWrite off
      // keeps it out of the frame but still visible to the raycaster.
      const hitArea = new Mesh(
        coreGeometry,
        new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      hitArea.scale.setScalar(radius * HIT_AREA_SCALE);

      const group = new Group();
      group.add(core, halo, hitArea);

      const entry: StarObjects = {
        node,
        group,
        halo,
        coreMaterial,
        haloMaterial,
        baseOpacity: 1,
        baseHaloScale,
        pulsePeriod: pulsePeriodMs(node.status),
        phase: hashUnit(node.id, 7) * Math.PI * 2,
      };
      applyBaseVisual(entry);
      starsRef.current.set(node.id, entry);
      return group;
    },
    [palette, isDark, applyBaseVisual],
  );

  const trackAnchor = useCallback(
    (id: string | null, anchor: Group | null): void => {
      if (!id || !anchor) return;
      const node = nodeById.get(id);
      if (node?.x != null) anchor.position.set(node.x, node.y ?? 0, node.z ?? 0);
    },
    [nodeById],
  );

  useFrame((state) => {
    fgRef.current?.tickFrame();

    const elapsedMs = state.clock.elapsedTime * 1000;
    for (const [id, entry] of starsRef.current) {
      // An orphaned group means the poll replaced or removed this star's object.
      if (!entry.group.parent) {
        starsRef.current.delete(id);
        continue;
      }
      if (entry.pulsePeriod === null || reducedMotion) continue;
      const wave = 0.5 + 0.5 * Math.sin((elapsedMs / entry.pulsePeriod) * Math.PI * 2 + entry.phase);
      entry.halo.scale.setScalar(entry.baseHaloScale * (1 + PULSE_AMPLITUDE * wave));
      entry.haloMaterial.opacity =
        entry.baseOpacity * (isDark ? 0.5 + 0.5 * wave : 0.35 + 0.3 * wave);
    }

    trackAnchor(hoveredId, hoverAnchorRef.current);
    trackAnchor(selectedId, selectedAnchorRef.current);
  });

  const handleNodeHover = useCallback(
    (n: NodeObject | null): void => {
      const node = n as SimulatedStarNode | null;
      setHoveredId(node?.id ?? null);
      if (node?.x != null && hoverAnchorRef.current) {
        hoverAnchorRef.current.position.set(node.x, node.y ?? 0, node.z ?? 0);
      }
      glDomElement.style.cursor = node ? 'pointer' : '';
    },
    [glDomElement],
  );

  const handlePointerOut = useCallback((): void => {
    setHoveredId(null);
    glDomElement.style.cursor = '';
  }, [glDomElement]);

  const handleNodeClick = useCallback(
    (n: NodeObject): void => {
      const node = n as SimulatedStarNode;
      onSelectNode(node);
      if (node.x != null) onFocusNode({ x: node.x, y: node.y ?? 0, z: node.z ?? 0 });
    },
    [onSelectNode, onFocusNode],
  );

  const linkColor = useCallback(() => palette.border, [palette]);
  const particleColor = useCallback(() => palette.info, [palette]);
  // Running steps carry light back and forth to their hub — the workflow reads
  // as alive at a glance. Settled links stay quiet.
  const particleCount = useCallback(
    (l: LinkObject) => (!reducedMotion && isActiveStatus((l as StarLink).targetStatus) ? 2 : 0),
    [reducedMotion],
  );

  const hoveredNode = hoveredId !== null ? (nodeById.get(hoveredId) ?? null) : null;

  return (
    <>
      {/* r3f only fires onPointerMove while the ray intersects the graph, so
          r3f-forcegraph never reports "hover ended" when the pointer moves into
          empty space. Pointer events bubble up the object tree — this wrapper
          catches the leave and clears the tooltip/cursor. */}
      <group onPointerOut={handlePointerOut}>
        <R3fForceGraph
          ref={fgRef}
          graphData={graphData}
          nodeThreeObject={makeStar}
          linkColor={linkColor}
          linkOpacity={0.3}
          linkWidth={0.4}
          linkDirectionalParticles={particleCount}
          linkDirectionalParticleWidth={1.4}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={particleColor}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        />
      </group>

      {/* Constellation nameplates — star-atlas annotations, one per agent. */}
      {clusters.map((cluster) => (
        <Html
          key={cluster.clusterId}
          position={[cluster.anchor.x, cluster.anchor.y + NAMEPLATE_LIFT, cluster.anchor.z]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <button
            type="button"
            onClick={() => onFocusCluster(cluster.anchor)}
            title={`Fly to ${clusterDisplayName(cluster.clusterId)}`}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              fontFamily: fonts.mono,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              color: palette.text,
            }}
          >
            <span style={{ fontSize: 11 }}>{clusterDisplayName(cluster.clusterId)}</span>
            <span style={{ fontSize: 9, color: palette.muted }}>
              {cluster.total}
              {cluster.live > 0 ? ` · ${cluster.live} live` : ''}
            </span>
            {/* hairline drop-tick pointing at the constellation */}
            <span style={{ width: 1, height: 14, background: palette.border }} />
          </button>
        </Html>
      ))}

      {/* Hover tooltip, tracking its star through the sim each frame. */}
      <group ref={hoverAnchorRef}>
        {hoveredNode && (
          <Html center zIndexRange={[12, 12]} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                background: palette.surface,
                color: palette.text,
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                padding: '6px 10px',
                whiteSpace: 'nowrap',
                transform: 'translateY(-24px)',
                fontFamily: fonts.sans,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{hoveredNode.name}</div>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: palette.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: starColor(hoveredNode.status, palette),
                    display: 'inline-block',
                  }}
                />
                {hoveredNode.status.replace(/_/g, ' ')} · {clusterDisplayName(hoveredNode.clusterId)} ·{' '}
                {DateTime.fromISO(hoveredNode.endedAt ?? hoveredNode.createdAt).toRelative()}
              </div>
            </div>
          </Html>
        )}
      </group>

      {/* Corner-bracket reticle locked on the selected star. */}
      <group ref={selectedAnchorRef}>
        {selectedId !== null && nodeById.has(selectedId) && (
          <Html center zIndexRange={[11, 11]} style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: 38, height: 38 }}>
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  style={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    ...(corner.includes('n')
                      ? { top: 0, borderTop: `1.5px solid ${palette.accent}` }
                      : { bottom: 0, borderBottom: `1.5px solid ${palette.accent}` }),
                    ...(corner.includes('w')
                      ? { left: 0, borderLeft: `1.5px solid ${palette.accent}` }
                      : { right: 0, borderRight: `1.5px solid ${palette.accent}` }),
                  }}
                />
              ))}
            </div>
          </Html>
        )}
      </group>
    </>
  );
};
