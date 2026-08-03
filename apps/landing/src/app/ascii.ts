/**
 * ASCII art assets for the landing page.
 *
 * The wordmark is rendered in the "ANSI Shadow" figlet style and split across
 * two lines — `SAGE` over `WRIGHT` — mirroring the name's etymology (sage +
 * -wright, a "craftsman of wisdom"). See alignment/VISION.md § "The Name".
 */

export const SAGE_BANNER = String.raw`
███████╗ █████╗  ██████╗ ███████╗
██╔════╝██╔══██╗██╔════╝ ██╔════╝
███████╗███████║██║  ███╗█████╗
╚════██║██╔══██║██║   ██║██╔══╝
███████║██║  ██║╚██████╔╝███████╗
╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝`;

export const WRIGHT_BANNER = String.raw`
██╗    ██╗██████╗ ██╗ ██████╗ ██╗  ██╗████████╗
██║    ██║██╔══██╗██║██╔════╝ ██║  ██║╚══██╔══╝
██║ █╗ ██║██████╔╝██║██║  ███╗███████║   ██║
██║███╗██║██╔══██╗██║██║   ██║██╔══██║   ██║
╚███╔███╔╝██║  ██║██║╚██████╔╝██║  ██║   ██║
 ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝`;

/** Box-drawing frame used to wrap a "terminal window" section. */
export const WINDOW_TITLE = '~/sagewright — fleet';

/** The work → validate → reflect core loop, drawn as an ASCII cycle. */
export const LOOP_DIAGRAM = String.raw`
   ┌───────────┐      ┌───────────────┐      ┌─────────────┐
   │   work    │ ───▶ │   validate    │ ───▶ │   reflect   │
   └───────────┘      └───────────────┘      └─────────────┘
         ▲                                          │
         └──────────────  ≤ 3 loops  ───────────────┘`;

/** A crontab motif — routine work scheduled to run on its own cadence. */
export const CRON_TABLE = String.raw`# schedule      cadence        recurring task
  0 9 * * 1-5   weekdays 9am   triage new issues     → label + assign
  0 */4 * * *   every 4 hours  bump dependencies     → open PR if green
  0 17 * * 5    fridays 17:00  weekly status report  → post to #eng
  15 3 * * *    nightly        prune stale branches  → cleanup + log`;

/**
 * An audience-fit spectrum. The sweet spot (█) is a contiguous high-fit zone —
 * ①  technical ninjas, ②  small teams, and ③  tech-driven enterprises. It is
 * flanked by weaker fits: vibe coders (░) only land it if they are technical
 * enough, and the broader enterprise (▓) is a strong multiplier rather than a
 * native fit. Split into bands so each can be coloured, sized so the labels and
 * number ticks line up over their bands in a monospace face. Widths (64 inner):
 * low 12 · peak 44 (ninjas 16 + teams 16 + tech-driven ent 12) · multiplier 8.
 */
export const SPECTRUM_LABELS =
  ' vibe coders technical ninjas  small teams       enterprises     ';
export const SPECTRUM_LOW = '░'.repeat(12);
export const SPECTRUM_PEAK = '█'.repeat(44);
export const SPECTRUM_MULT = '▓'.repeat(8);
export const SPECTRUM_TICKS =
  '                    1               2             3';
export const SPECTRUM_SWEET =
  '             └───────────── the sweet spot ─────────────┘';
export const SPECTRUM_LEGEND =
  ' █ sweet spot ①②③   ▓ multiplier —  especiallly if technical  ░ weak — broader enterprise';

/**
 * The runners/ directory tree — the extensibility story. A runner is just a
 * folder holding a Dockerfile and two scripts; dropping in a new one extends
 * the fleet with a new harness. Mirrors the real runners/ folder in this repo.
 */
export const RUNNERS_TREE = String.raw`runners/
├── claude-code/         built-in
├── codex/               built-in
├── opencode/            built-in
├── pi/                  built-in
└── your-harness/        ← add a folder, extend the fleet
    ├── Dockerfile         installs + configures any CLI harness
    ├── start-agent        how a task launches
    ├── continue-agent     how a session resumes
    └── SOUL.md            the runner's alignment`;

/** A streaming audit-log motif — every agent action is a persisted event. */
export const AUDIT_LOG = String.raw`
│ 14:02:31  spawn      runner#a1c   · repo:web
│ 14:02:48  tool.call  edit         · src/app.tsx
│ 14:03:10  validate   ok           · 142 tests pass
│ 14:03:55  git.push   branch       · fix/login-redirect
│ 14:03:58  pr.open    #482         · → in_review`;
