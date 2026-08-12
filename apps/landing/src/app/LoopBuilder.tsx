import { type CSSProperties, type FC, useRef, useState } from 'react';

import {
  DEFAULT_ITERATIONS,
  DEFAULT_STAGES,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  STAGE_META,
  STAGE_PALETTE,
  addStage,
  clampIterations,
  loopSummary,
  moveStage,
  placeStages,
  removeStage,
  type LoopStage,
  type StageKind,
} from './loop-builder';

/** A stage's accent, exposed to CSS as `--box-color`. */
const boxStyle = (kind: StageKind): CSSProperties =>
  ({ '--box-color': STAGE_META[kind].color }) as CSSProperties;

/**
 * A working, backend-free builder for a custom self-correcting loop, embedded
 * in the landing page. The visitor composes a loop from stages — adding,
 * reordering, and removing them — and caps how many times it retries; the
 * diagram and the loop-back edge update live. It mirrors the control plane's
 * custom loops without running anything (see {@link loop-builder}).
 */
export const LoopBuilder: FC = () => {
  const [stages, setStages] = useState<readonly LoopStage[]>(() =>
    placeStages(DEFAULT_STAGES),
  );
  const [iterations, setIterations] = useState(DEFAULT_ITERATIONS);
  // Monotonic id source so a stage keeps a stable key across reorders/removes.
  const nextId = useRef(DEFAULT_STAGES.length);

  const add = (kind: StageKind): void => {
    setStages((current) => addStage(current, kind, nextId.current));
    nextId.current += 1;
  };
  const remove = (id: number): void =>
    setStages((current) => removeStage(current, id));
  const move = (id: number, dir: -1 | 1): void =>
    setStages((current) => moveStage(current, id, dir));
  const step = (delta: number): void =>
    setIterations((n) => clampIterations(n + delta));
  const reset = (): void => {
    setStages(placeStages(DEFAULT_STAGES));
    nextId.current = DEFAULT_STAGES.length;
    setIterations(DEFAULT_ITERATIONS);
  };

  const last = stages.length - 1;

  return (
    <>
      <p className="section-lead">
        <span className="hl">Compose your own loop.</span>{' '}
        <span className="hl">work → validate → reflect</span> is just the
        default. Add stages, reorder them, and cap the retries — and it becomes a
        loop any agent in your fleet can run. Every pass corrects itself: fail
        validation and it loops back, up to your cap, before escalating to a
        human.
      </p>

      <div className="lb">
        <div className="lb-palette">
          <span className="lb-palette__label">add stage:</span>
          {STAGE_PALETTE.map((kind) => {
            const meta = STAGE_META[kind];
            return (
              <button
                key={kind}
                type="button"
                className="lb-add"
                style={boxStyle(kind)}
                onClick={() => add(kind)}
                aria-label={`Add ${meta.label} stage`}
                title={meta.hint}
              >
                <span className="lb-add__glyph" aria-hidden="true">
                  {meta.glyph}
                </span>
                {meta.label}
              </button>
            );
          })}
          <button type="button" className="lb-reset" onClick={reset}>
            ↺ reset
          </button>
        </div>

        {stages.length === 0 ? (
          <p className="lb-empty">
            Empty loop — add a stage above to start building.
          </p>
        ) : (
          <>
            <ol
              className="lb-flow"
              aria-label={`Your loop: ${loopSummary(stages)}`}
            >
              {stages.map((stage, i) => {
                const meta = STAGE_META[stage.kind];
                return (
                  <li className="lb-flow__item" key={stage.id}>
                    <div className="lb-stage" style={boxStyle(stage.kind)}>
                      <div className="lb-stage__head">
                        <span className="lb-stage__glyph" aria-hidden="true">
                          {meta.glyph}
                        </span>
                        <span className="lb-stage__label">{meta.label}</span>
                        <span className="lb-stage__ctrl">
                          <button
                            type="button"
                            className="lb-ctrl-btn"
                            onClick={() => move(stage.id, -1)}
                            disabled={i === 0}
                            aria-label={`Move ${meta.label} earlier`}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="lb-ctrl-btn"
                            onClick={() => move(stage.id, 1)}
                            disabled={i === last}
                            aria-label={`Move ${meta.label} later`}
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            className="lb-ctrl-btn lb-ctrl-btn--danger"
                            onClick={() => remove(stage.id)}
                            aria-label={`Remove ${meta.label} stage`}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      <span className="lb-stage__hint">{meta.hint}</span>
                    </div>
                    {i < last && (
                      <span className="lb-arrow" aria-hidden="true">
                        ▶
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="lb-loopback" aria-hidden="true">
              <span className="lb-loopback__label">
                ↺ loops back on failure · up to {iterations} iteration
                {iterations === 1 ? '' : 's'}
              </span>
            </div>
          </>
        )}

        <div className="lb-config">
          <span className="lb-config__label">max iterations</span>
          <span
            className="lb-stepper"
            role="group"
            aria-label="Maximum iterations"
          >
            <button
              type="button"
              className="lb-stepper__btn"
              onClick={() => step(-1)}
              disabled={iterations <= MIN_ITERATIONS}
              aria-label="Fewer iterations"
            >
              ‹
            </button>
            <span className="lb-stepper__value" aria-live="polite">
              {iterations}
            </span>
            <button
              type="button"
              className="lb-stepper__btn"
              onClick={() => step(1)}
              disabled={iterations >= MAX_ITERATIONS}
              aria-label="More iterations"
            >
              ›
            </button>
          </span>
          <span className="lb-config__hint">
            retries the loop up to {iterations}× before it escalates to a human
          </span>
        </div>
      </div>

      <p className="diagram__caption">
        Every stage runs in the same sandboxed runner and lands in the same
        audit trail — compose the loop once and any agent in the fleet can run
        it.
      </p>
    </>
  );
};
