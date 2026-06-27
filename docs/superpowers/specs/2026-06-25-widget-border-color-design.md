# Per-Widget Border Color — Design

Date: 2026-06-25
Status: Approved (pending spec review)

## Goal

Allow users to configure a different border color for each widget (session node) on the canvas. The chosen color persists across reloads via the existing canvas-layout persistence path.

## Scope

- One border color per widget, chosen with a full color picker.
- New widgets get a random border color (from a curated palette) on creation.
- A quick-select row of colors already in use by other widgets on the canvas.
- Color stored as a raw color string (hex) on the per-widget placement.
- Persisted through the existing canvas-layout save flow (no new API or DB changes).
- Selecting a widget makes it glow (selection is a separate visual layer, not a border recolor).
- A reset action that clears the custom color back to the theme default.

Out of scope: theming/token-aware colors, multi-widget bulk color edits, background/fill color, border width/style, back-filling colors onto pre-existing widgets.

## Decisions

- **Color choice:** Full color picker (raw hex), not a fixed token palette.
- **Random default:** On creation, a widget is assigned a random color from a curated palette
  (8–12 distinct colors with decent contrast on both light and dark surfaces). The pick is random
  *from* that palette; the stored value is still a plain hex string. Curated rather than fully
  random hex, which regularly yields muddy or near-invisible borders and noisy used-color swatches.
- **Quick-select used colors:** The popover shows a row of swatches for the distinct `borderColor`
  values already in use across the canvas; clicking one applies it instantly.
- **Entry point:** A palette `IconButton` in the SessionNode header toolbar, opening an MUI `Popover`.
- **Picker implementation:** Native `<input type="color">` plus a hex `TextField` (zero new dependencies).
- **Selection behavior:** The border color is always visible (never overridden). Selecting a widget
  adds a soft glow halo (box-shadow) on top of the existing elevated shadow. The glow is tinted to
  the widget's own border color, falling back to the theme accent when no custom color is set.
- **Reset:** A "Reset to default" action clears `borderColor` (reverts to `divider`). It does not
  re-randomize.
- **Migration:** Pre-existing widgets with no stored `borderColor` keep rendering `divider` until
  edited; only newly added widgets get a random color. Saved layouts are not mutated on load.

## Data Model & Persistence

Add one optional field to `SessionPlacement` in `libs/shared/src/canvas-layout.schema.ts`:

```ts
export type SessionPlacement = {
  sessionId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  borderColor?: string; // hex string, e.g. "#3fb950"; absent = theme default
};
```

The full canvas layout is persisted as a JSON blob through the existing `PUT /api/canvas-layout`
endpoint, so `borderColor` rides the current save flow with **no API or DB schema changes**.

Two thread-through points:
1. Building React Flow nodes from `SessionPlacement` must copy `borderColor` into `data`.
2. Serializing nodes back to `SessionPlacement` on save must copy `data.borderColor` back out.

Also add `borderColor?: string` to `SessionNodeData` (in `apps/control-plane-web/src/canvas/canvas-actions.ts`).

## Random Default on Creation

- A curated palette constant (8–12 hex colors) lives alongside the canvas code (e.g.
  `apps/control-plane-web/src/canvas/border-colors.ts`).
- When a session is added to the canvas, assign `data.borderColor` = a random pick from the palette.
  The existing add path triggers `scheduleSave()`, so the color persists immediately.
- Randomness: pick by index from the palette. Avoid `Math.random()` only where it would break
  determinism concerns; a simple random index at add-time is fine here (user-driven, not replayed).

## Quick-Select Used Colors

- `CanvasBoard` holds all nodes, so it derives the distinct set of `borderColor` values currently in
  use and exposes it via the canvas-actions context (e.g. `usedBorderColors: string[]`).
- Each `SessionNode` popover renders these as a row of clickable swatches above the picker.
- The widget's own current color is marked active in the row.

## Rendering (`SessionNode.tsx`)

Current:

```tsx
borderColor: selected ? 'primary.main' : 'divider'
```

New logic:

- **Border color** (always): `data.borderColor ?? 'divider'`. Selection never overrides it.
- **Selection glow:** when `selected`, add a box-shadow halo tinted to the effective border color
  (custom color, or the theme accent when none), layered with the existing elevated shadow. When not
  selected, use the normal resting shadow.

## The Control (header popover)

- New palette `IconButton` in the SessionNode header toolbar, alongside edit/open/remove.
- Click opens an MUI `Popover` containing:
  - a row of **used-color** swatches (quick-select), with the current color marked active,
  - a native `<input type="color">` for picking,
  - a hex `TextField` for precise/paste entry, kept in sync with the color input,
  - a **Reset to default** button that clears `borderColor`.
- On change, update the node's `data.borderColor` via the canvas-actions context. This flips React
  Flow state → live re-render → existing debounced save fires (same path as drag/resize).

## Flow

1. Adding a session assigns a random `borderColor` from the palette → border renders → save fires.
2. User clicks the palette button → popover → picks a color (used-color swatch, picker, or hex).
3. Node `data.borderColor` updates → border re-renders live.
4. The node update triggers `scheduleSave()` → debounced `PUT` persists the full layout incl. `borderColor`.
5. On reload, `CanvasPage` reads `borderColor` from each `SessionPlacement` into node data → border restored.

## Testing

- **Schema:** `borderColor` is optional and round-trips through parse/serialize.
- **Node mapping:** placement → node data → placement preserves `borderColor`.
- **Random default:** adding a node assigns a `borderColor` drawn from the curated palette.
- **Used colors:** the derived used-color list is the distinct set of node border colors.
- **Component:** SessionNode renders `data.borderColor` as the border (or `divider` when none);
  selection adds a glow without changing the border color; reset clears the color back to `divider`.

## Affected Files

- `libs/shared/src/canvas-layout.schema.ts` — add `borderColor` to `SessionPlacement`.
- `apps/control-plane-web/src/canvas/border-colors.ts` — new curated palette + random-pick helper.
- `apps/control-plane-web/src/canvas/canvas-actions.ts` — add `borderColor` to `SessionNodeData`; setter; `usedBorderColors`.
- `apps/control-plane-web/src/canvas/CanvasPage.tsx` — thread `borderColor` placement ↔ node data both ways; assign random color on add; derive `usedBorderColors`.
- `apps/control-plane-web/src/canvas/SessionNode.tsx` — border render + selection glow + palette button + popover (used-color swatches, picker, hex, reset).
