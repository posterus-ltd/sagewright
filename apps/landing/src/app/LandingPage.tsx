import { type FC, useEffect, useRef, useState } from 'react';

import { AsciiField } from './AsciiField';
import { ThemeToggle } from './ThemeToggle';
import {
  AUDIT_LOG,
  CRON_TABLE,
  LOOP_DIAGRAM,
  SAGE_BANNER,
  SPECTRUM_LABELS,
  SPECTRUM_LEGEND,
  SPECTRUM_LOW,
  SPECTRUM_MULT,
  SPECTRUM_PEAK,
  SPECTRUM_SWEET,
  SPECTRUM_TICKS,
  WINDOW_TITLE,
  RUNNERS_TREE,
  WRIGHT_BANNER,
} from './ascii';

const GITHUB_URL = 'https://github.com/posterus-ltd/sagewright';
const IMPRINT_URL = 'https://posterus.ventures/imprint';

interface Feature {
  readonly icon: string;
  readonly tag: string;
  readonly title: string;
  readonly body: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: '⏻',
    tag: 'remote',
    title: 'runs remotely — laptop closed, still shipping',
    body: 'Agents run in remote containers, not on your machine. Shut the lid and walk away — no terminals left open all day, no battery drain. Work keeps running and you reconnect from any device.',
  },
  {
    icon: '▶',
    tag: 'fleet',
    title: 'many agents, one control plane',
    body: 'Fan out routine work across repos. A fresh runner container spawns per task — credentials never leave the control plane.',
  },
  {
    icon: '⚙',
    tag: 'byoh',
    title: 'bring your own harness',
    body: 'Plug in your own harness, MCP servers, plugins, and model of choice. Your workflow and tooling — orchestrated and managed by the control plane.',
  },
  {
    icon: '◷',
    tag: 'sync',
    title: 'mobile-first & resumable',
    body: 'Every byte an agent emits is a persisted event log — scroll back through the full history of any session, mid-run or long after it ended.',
  },
  {
    icon: '↺',
    tag: 'loop',
    title: 'self-correcting agents',
    body: 'Each runner loops work → validate → reflect up to three times before eskalating to a human.',
  },
  {
    icon: '⎋',
    tag: 'open',
    title: 'no vendor lock-in',
    body: 'Open formats, your own models and harness, your own repos and infra. You deploy and run it yourself — just a multiplier.',
  },
];

/**
 * Where each audience lands on the fit spectrum. Ordered to match the bands of
 * the spectrum bar. The sweet spot is a contiguous high-fit zone — technical
 * ninjas (№1), small teams (№2), and tech-driven enterprises (№3). It is
 * flanked by weaker fits: vibe coders only if they are technical enough, and
 * the broader enterprise as a multiplier rather than a native fit.
 */
const AUDIENCES: readonly Feature[] = [
  {
    icon: '░',
    tag: 'vibe',
    title: 'vibe coders — only if you are technical',
    body: 'Not really the target. There is real setup — your own harness, models, and repos — and you drive a fleet of agents, not a hand-held wizard. The more technical you are, the better it fits; otherwise it is a stretch.',
  },
  {
    icon: '█',
    tag: 'ninjas',
    title: 'technical ninjas — sweet spot №1',
    body: 'Right in the sweet spot. Running in minutes and bent to your workflow — a flexible, powerful setup with full freedom over harness, models, and infra.',
  },
  {
    icon: '█',
    tag: 'teams',
    title: 'small teams — sweet spot №2',
    body: 'Also the sweet spot. A shared control plane that scales with the team instead of fighting it — powerful, flexible, and entirely yours. No platform org required, nothing to get locked into.',
  },
  {
    icon: '█',
    tag: 'tech-ent',
    title: 'tech-driven enterprises — sweet spot №3',
    body: 'Hard-core, tech-driven orgs land in the sweet spot too — same freedom over harness, models, and infra, plus governance and audit trails built in from day one.',
  },
  {
    icon: '▓',
    tag: 'scale',
    title: 'the broader enterprise — a strong multiplier',
    body: 'Outside the deeply technical core it is not the sweet spot, but still an amazing multiplier on existing internal efforts — dropping into the tools and processes a large org already runs on.',
  },
];

interface ChecklistItem {
  readonly id: string;
  readonly text: string;
}

/** The self-qualifying checklist in the "is it for you?" section, in order. */
const CHECKLIST: readonly ChecklistItem[] = [
  {
    id: 'remote',
    text: 'Run agents in the background, 24/7, on remote infra?',
  },
  {
    id: 'laptop-closed',
    text: 'Close your laptop whenever — be sure your agents keep working?',
  },
  { id: 'sandboxes', text: 'Run multiple agents in isolated sandboxes?' },
  { id: 'parallel', text: 'Work on multiple projects in parallel?' },
  { id: 'schedule', text: 'Schedule repetitive tasks?' },
  {
    id: 'workflows',
    text: 'Define reusable custom workflows/loops?',
  },
  {
    id: 'org-alignment',
    text: 'Share agentic alignment throughout your org?',
  },
  { id: 'mobile', text: 'Access your agents while on the go?' },
  { id: 'ownership', text: 'Own the capability and context?' },
  { id: 'no-lock-in', text: 'Avoid vendor lock-in?' },
  { id: 'mini-pc', text: 'You can spin up a mini-PC or run a VM?' },
  { id: 'docker-compose', text: 'You can run a docker-compose stack?' },
];

/** A "terminal window" chrome with a traffic-light title bar. */
const Window: FC<{ id?: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children,
}) => (
  <section id={id} className="window">
    <div className="window__bar">
      <span className="window__dots" aria-hidden="true">
        ● ● ●
      </span>
      <span className="window__title">{title}</span>
    </div>
    <div className="window__body">{children}</div>
  </section>
);

interface Screenshot {
  readonly addr: string;
  readonly src: string;
  readonly alt: string;
  readonly meta: string;
}

/** The product screenshots, shown as a scrolling gallery in the hero. */
const SHOTS: readonly Screenshot[] = [
  {
    addr: 'app.sagewright.dev/fleet',
    src: '/screenshots/canvas.png',
    alt: "The Sagewright control plane in the browser: a sidebar of tools beside two live agent sessions — 'opencode' and 'random harness' — running side by side, each a terminal with running/live status badges and Agent, Shell and Log tabs.",
    meta: 'the control plane · infinite canvas of live sessions',
  },
  {
    addr: 'app.sagewright.dev/galaxy',
    src: '/screenshots/work-galaxy.png',
    alt: 'The Galaxy view: 76 tasks mapped as glowing dots on a dark star-field, clustered by agent — opencode, claude-code, and unassigned — with a legend tallying active, done, and failed tasks over the last 30 days.',
    meta: 'the work galaxy · every task a star, clustered by agent',
  },
  {
    addr: 'app.sagewright.dev/session/opencode',
    src: '/screenshots/harness.png',
    alt: "A single agent session filling the screen: the opencode harness running inside a Sagewright runner, its 'ask anything' prompt set to Build with GPT-5.3, above a session path and MCP status line.",
    meta: '[byoh] · your own harness (opencode here), running inside a session',
  },
  {
    addr: 'app.sagewright.dev/workflows',
    src: '/screenshots/workflows.png',
    alt: "The visual workflow builder showing an implementation example: a 'Plan (BDD+SDD)' step on Claude Code chained into 'Implement' and 'Validate' steps on Opencode, wired on a canvas with an on-failure edge between them.",
    meta: 'custom workflows · mix harnesses per step, wire failure paths',
  },
  {
    addr: 'app.sagewright.dev/scheduled',
    src: '/screenshots/scheduled.png',
    alt: "The 'Edit scheduled task' dialog: a cron expression (0 9 * * *) with quick-select presets like 'Daily at 9am', a preview of the next three run times, and the prompt the agent will run headlessly.",
    meta: 'cron-scheduled headless runs · set them once and let them compound',
  },
  {
    addr: 'root@fleet:~ ❯ docker ps',
    src: '/screenshots/docker-ps.png',
    alt: 'Output of docker ps listing the running Sagewright fleet: an agentic-control-plane container, two sagewright-runner containers, and a postgres:16 container — each up and healthy with their ports.',
    meta: 'the running fleet · control plane, runners & postgres — each within a container',
  },
];

/**
 * A product screenshot dressed as the live app: its own window chrome
 * (traffic-lights + address + a pulsing "live" badge), a faint CRT scanline and
 * a slow accent scan-beam over the screen, and a muted meta caption below. The
 * frame stays dark in both themes so the dark UI reads as a running terminal
 * rather than looking broken on the light theme. Clones in the marquee pass
 * `alt=""` so assistive tech and tests only see one of each.
 *
 * When `onOpen` is provided the screen is a button that enlarges the shot in
 * the lightbox; clones omit it so only the real slides are interactive.
 */
const Shot: FC<Screenshot & { alt: string; onOpen?: () => void }> = ({
  addr,
  src,
  alt,
  meta,
  onOpen,
}) => {
  const screen = (
    <>
      <img className="shot__img" src={src} alt={alt} loading="lazy" />
      <span className="shot__scan" aria-hidden="true" />
    </>
  );
  return (
    <figure className="shot">
      <div className="shot__window">
        <div className="shot__bar">
          <span className="shot__dots" aria-hidden="true">
            ● ● ●
          </span>
          <span className="shot__addr">{addr}</span>
          <span className="shot__live" aria-hidden="true">
            <i className="shot__pulse" />
            live
          </span>
        </div>
        {onOpen ? (
          <button
            type="button"
            className="shot__screen shot__screen--btn"
            onClick={onOpen}
            aria-label={`Enlarge screenshot — ${addr}`}
          >
            {screen}
          </button>
        ) : (
          <div className="shot__screen">{screen}</div>
        )}
      </div>
      <figcaption className="shot__meta">{meta}</figcaption>
    </figure>
  );
};

/**
 * A full-screen overlay that shows one screenshot enlarged on a dark backdrop.
 * Close with the ✕ button, the Escape key, or a click on the backdrop; step
 * through the set with the ‹ › arrows or the Left/Right keys (wrapping at the
 * ends). On mount it locks body scroll and moves focus to the close button,
 * restoring both — including focus to the triggering thumbnail — on unmount.
 */
const Lightbox: FC<{
  shots: readonly Screenshot[];
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
}> = ({ shots, index, onClose, onNavigate }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shot = shots[index];
  const count = shots.length;
  const step = (delta: number) => onNavigate((index + delta + count) % count);

  useEffect(() => {
    const restoreFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `step` closes over `index`, so re-bind whenever the active shot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, onClose]);

  if (!shot) return null; // out-of-range index — nothing to show

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Screenshot — ${shot.addr}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="lightbox__close"
        onClick={onClose}
        aria-label="Close"
        ref={closeRef}
      >
        ✕
      </button>
      <button
        type="button"
        className="lightbox__nav lightbox__nav--prev"
        onClick={() => step(-1)}
        aria-label="Previous screenshot"
      >
        ‹
      </button>
      <figure className="lightbox__figure">
        <div className="lightbox__frame">
          <span className="lightbox__addr">{shot.addr}</span>
          <img className="lightbox__img" src={shot.src} alt={shot.alt} />
        </div>
        <figcaption className="lightbox__caption">{shot.meta}</figcaption>
        <p className="lightbox__counter">
          <span className="lightbox__dots" aria-hidden="true">
            {shots.map((s, i) => (
              <i
                key={s.src}
                className={
                  i === index ? 'lightbox__dot is-active' : 'lightbox__dot'
                }
              />
            ))}
          </span>
          {index + 1} of {count}
        </p>
      </figure>
      <button
        type="button"
        className="lightbox__nav lightbox__nav--next"
        onClick={() => step(1)}
        aria-label="Next screenshot"
      >
        ›
      </button>
    </div>
  );
};

/**
 * A hero marquee of the product screenshots. The track auto-scrolls right→left
 * continuously, pauses while hovered or dragged, and stays fully scrollable by
 * the user (trackpad/wheel, touch, or mouse-drag). The slide list is duplicated
 * so the scroll position can wrap seamlessly for an endless loop; the second
 * copy is `aria-hidden` with empty alt text so it is announced only once.
 */
const HeroGallery: FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const dragRef = useRef(false);
  const dragStart = useRef({ x: 0, left: 0 });
  // Set once a pointer-drag passes the slop threshold, so the click that ends
  // the drag doesn't also open the lightbox. Reset at the start of each press.
  const draggedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const SPEED = 0.4; // px/frame — gentle right-to-left drift
    const tick = () => {
      const half = track.scrollWidth / 2; // width of one (un-cloned) copy
      if (half > 0) {
        if (!hoverRef.current && !dragRef.current) track.scrollLeft += SPEED;
        if (track.scrollLeft >= half) track.scrollLeft -= half;
        else if (track.scrollLeft < 0) track.scrollLeft += half;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mouse drag-to-scroll for desktop; touch uses native scrolling.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = true;
    draggedRef.current = false;
    dragStart.current = { x: e.clientX, left: track.scrollLeft };
    // NB: capture is deferred until a real drag begins (see onPointerMove).
    // Capturing on every press retargets the following `click` to the gallery,
    // which would swallow the clicks that open a screenshot.
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const dx = e.clientX - dragStart.current.x;
    if (!draggedRef.current && Math.abs(dx) > 5) {
      draggedRef.current = true;
      // Now that it's a drag, capture so it keeps tracking if the pointer
      // leaves the strip. (Not implemented in jsdom — hence the guard.)
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        /* unsupported (e.g. jsdom) — drag still works without capture */
      }
    }
    track.scrollLeft = dragStart.current.left - dx;
  };
  const endDrag = () => {
    dragRef.current = false;
  };

  return (
    <>
      <div
        className="gallery"
        ref={trackRef}
        role="group"
        aria-label="Product screenshots — scroll to browse"
        onMouseEnter={() => (hoverRef.current = true)}
        onMouseLeave={() => {
          hoverRef.current = false;
          dragRef.current = false;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="gallery__track">
          {SHOTS.map((s, i) => (
            <div className="gallery__slide" key={s.src}>
              <Shot
                {...s}
                onOpen={() => {
                  // Suppress the click that merely ends a drag-to-scroll.
                  if (draggedRef.current) return;
                  setActiveIndex(i);
                }}
              />
            </div>
          ))}
          {SHOTS.map((s) => (
            <div
              className="gallery__slide"
              key={`clone-${s.src}`}
              aria-hidden="true"
            >
              <Shot {...s} alt="" />
            </div>
          ))}
        </div>
      </div>
      {activeIndex !== null && (
        <Lightbox
          shots={SHOTS}
          index={activeIndex}
          onClose={() => setActiveIndex(null)}
          onNavigate={setActiveIndex}
        />
      )}
    </>
  );
};

export const LandingPage: FC = () => (
  <>
    <AsciiField />
    <ThemeToggle />
    <main className="page">
      <Window title={WINDOW_TITLE}>
        <pre className="banner" aria-label="Sagewright">
          <span className="banner__sage">{SAGE_BANNER}</span>
          <span className="banner__wright">{WRIGHT_BANNER}</span>
        </pre>

        <p className="prompt">
          <span className="prompt__sigil">❯</span> craftsman of wisdom · builder
          of knowledge
          <span className="cursor" aria-hidden="true">
            █
          </span>
        </p>

        <p className="tagline">
          Right now, agentic coding is ad hoc: everyone on the team running
          their own agent, on their own laptop propped open so it doesn't sleep
          — hit-or-miss results, no org-wide setup, a different vendor lock-in
          behind every tool, and no durable place to put repetitive work.
        </p>

        <p className="tagline">
          Sagewright fixes that with a fleet of agents running in parallel — no
          local terminals to juggle. The control plane is a{' '}
          <span className="hl">higher-order harness</span> — a harness that
          orchestrates harnesses — that lives on a remote infra and is
          accessible from any browser, so you launch, watch and steer every
          agent from any device, anywhere.
        </p>

        <p className="tagline">
          Every run compounds your org's capability and context into a strategic
          asset you own — self-hosted and sovereign, yet model- and
          provider-agnostic, turning synthetic intelligence into a swappable
          commodity.
        </p>

        <p className="tagline tagline--opinion">
          Purposely <span className="hl">opinionated</span>. You'll love it or
          bounce within ten seconds —{' '}
          <a className="anchor-link" href="#is-it-for-you">
            check here
          </a>
          .
        </p>

        <a className="cta" href={GITHUB_URL} target="_blank" rel="noreferrer">
          ❯ open source — try it now
        </a>

        <HeroGallery />
      </Window>

      <Window title="README.md">
        <ul className="features">
          {FEATURES.map((f) => (
            <li className="feature" key={f.title}>
              <span className="feature__glyph">
                <span className="feature__icon">{f.icon}</span> [{f.tag}]
              </span>
              <div>
                <h2 className="feature__title">{f.title}</h2>
                <p className="feature__body">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Window>

      <Window title="who_is_it_for.sh">
        <p className="section-lead">
          <span className="hl">Who is it for?</span> The same{' '}
          <span className="hl">AI-native SDLC</span> enterprises run on — now
          within reach of small teams and solo builders too. The sweet spot is a
          contiguous band: technical ninjas, small teams, and tech-driven
          enterprises — people technical enough to set it up fast, who want a
          flexible, powerful workflow they fully own and are never locked into.
          Vibe coders fit only if they're technical enough; the broader
          enterprise gets a strong multiplier rather than a native fit.
        </p>

        <p className="prompt prompt--sm">
          <span className="prompt__sigil">❯</span> ./who_is_it_for.sh --rank
        </p>
        <pre
          className="spectrum"
          aria-label="audience fit, from vibe coders to enterprises"
        >
          {SPECTRUM_LABELS + '\n['}
          <span className="spectrum__low">{SPECTRUM_LOW}</span>
          <span className="spectrum__peak">{SPECTRUM_PEAK}</span>
          <span className="spectrum__mult">{SPECTRUM_MULT}</span>
          {']\n'}
          <span className="spectrum__sweet">
            {SPECTRUM_TICKS + '\n' + SPECTRUM_SWEET}
          </span>
          {'\n\n'}
          <span className="spectrum__legend">{SPECTRUM_LEGEND}</span>
        </pre>

        <ul className="features">
          {AUDIENCES.map((a) => (
            <li className="feature" key={a.title}>
              <span className="feature__glyph">
                <span className="feature__icon">{a.icon}</span> [{a.tag}]
              </span>
              <div>
                <h2 className="feature__title">{a.title}</h2>
                <p className="feature__body">{a.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Window>

      <Window title="scheduled.cron">
        <p className="section-lead">
          <span className="hl">Scheduled, recurring agents.</span> Put routine
          work on a cron and forget it — triage, dependency bumps, weekly
          reports, cleanups. Each run spins up a fresh runner and lands as a PR
          or an update while you&rsquo;re away.
        </p>

        <p className="prompt prompt--sm">
          <span className="prompt__sigil">❯</span> crontab -l
        </p>
        <pre className="audit">{CRON_TABLE}</pre>
        <p className="diagram__caption">
          Fully observable — every scheduled run lands in the same audit trail
          as everything else.
        </p>
      </Window>

      <Window title="the_core_loop.sh">
        <pre className="diagram">{LOOP_DIAGRAM}</pre>
        <p className="diagram__caption">
          The system enables anyone to define and run custom self-correcting
          loops.
        </p>
      </Window>

      <Window title="for_teams.sh">
        <p className="section-lead">
          An <span className="hl">AI-native SDLC</span> for teams and
          enterprises. Drive work from a chat prompt or a board ticket; finished
          work lands as GitHub PRs and ticket updates — in the tools your team
          already uses.
        </p>

        <p className="prompt prompt--sm">
          <span className="prompt__sigil">❯</span> tail -f
          ~/.sagewright/audit.log
        </p>
        <pre className="audit">{AUDIT_LOG}</pre>
        <p className="diagram__caption">
          Every action an agent takes is a persisted, replayable event — a
          complete audit trail for review, compliance, and debugging. Nothing
          happens off-the-record.
        </p>
      </Window>

      <Window title="security.model">
        <p className="section-lead">
          <span className="hl">Security by isolation.</span> Every agent runs
          in its own sandboxed runner container, separated from other agents and
          from the control plane runtime.
        </p>
        <p className="section-lead">
          A runner only sees whatever you mount as its work tree. If a repo,
          file path, or secret is not mounted into that sandbox, the agent
          cannot access it.
        </p>
        <p className="section-lead">
          This keeps the blast radius small: each task gets a bounded workspace
          with explicit inputs, clear audit logs, and no implicit access to the
          rest of your infrastructure.
        </p>
      </Window>

      <Window title="runners/">
        <p className="section-lead">
          <span className="hl">Extensible by design.</span> The control plane
          is harness-agnostic — a runner is just a Docker image it discovers
          and orchestrates. Extend the fleet&rsquo;s capabilities by creating a
          custom runner: one folder, a Dockerfile that installs any CLI
          harness, and two small scripts. No plugin API to learn, no fork to
          maintain — if it runs in a terminal, it can join the fleet.
        </p>

        <p className="prompt prompt--sm">
          <span className="prompt__sigil">❯</span> tree runners/
        </p>
        <pre className="audit">{RUNNERS_TREE}</pre>
        <p className="diagram__caption">
          Four harnesses ship built in — Claude Code, Codex, opencode, and Pi.
          Yours is a folder away.
        </p>

        <p className="section-lead">
          <span className="hl">Runner marketplace — coming soon.</span> Publish
          your runners and pull ready-made ones from the community — new
          harnesses, toolchains, and specialized agents, ready to drop into
          your fleet.
        </p>
      </Window>

      <Window title="quickstart.sh">
        <p className="section-lead">
          <span className="hl">Powered by Docker.</span> Control plane, runners,
          and Postgres all ship as containers — nothing to install on your
          machine.
        </p>

        <pre className="audit">❯ docker-compose up -d</pre>
        <p className="diagram__caption">
          That&rsquo;s it — you&rsquo;re one{' '}
          <span className="hl">docker-compose up -d</span> away from a running
          control plane. Self-hosted on your own remote infrastructure.
        </p>
      </Window>

      <Window id="is-it-for-you" title="is_it_for_you.sh">
        <p className="section-lead">
          <span className="hl">Is it for you?</span> Run through the checklist.
        </p>

        <ul className="checklist">
          {CHECKLIST.map((item) => (
            <li className="checklist__item" key={item.id}>
              <span className="checklist__box" aria-hidden="true">
                ☐
              </span>
              {item.text}
            </li>
          ))}
        </ul>

        <p className="section-lead">
          Answering yes to 50+% of these?{' '}
          <span className="hl">You definitely need to try Sagewright.</span>
        </p>
      </Window>

      <footer className="footer">
        <pre className="footer__rule" aria-hidden="true">
          ────────────────────────────────────────────────────
        </pre>
        <p className="footer__line">
          <span className="footer__brand">sagewright.dev</span> · a fleet of
          agents that reason &amp; build
        </p>
        <p className="footer__links">
          <a
            className="footer__link"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            ❯ github.com/posterus-ltd/sagewright
          </a>
          <span className="footer__sep" aria-hidden="true">
            {' · '}
          </span>
          <a
            className="footer__link"
            href={IMPRINT_URL}
            target="_blank"
            rel="noreferrer"
          >
            ❯ Impressum
          </a>
        </p>
      </footer>
    </main>
  </>
);
