import type { SvgIconComponent } from '@mui/icons-material';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import ArchitectureRounded from '@mui/icons-material/ArchitectureRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CallMergeRounded from '@mui/icons-material/CallMergeRounded';
import CancelPresentationRounded from '@mui/icons-material/CancelPresentationRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteSweepRounded from '@mui/icons-material/DeleteSweepRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';

// Every action the session quick actions bar can host. The user picks which of
// these appear (and in what order) via the `sessionQuickActions` preference.
export enum SessionQuickAction {
  SURPRISE_ME = 'surprise-me',
  PLAN_SPEC = 'plan-spec',
  EXECUTE = 'execute',
  ACCEPT = 'accept',
  REJECT = 'reject',
  ESCAPE = 'escape',
  CLEAR_CONTEXT = 'clear-context',
  NEW_WORKTREE = 'new-worktree',
  CREATE_PR = 'create-pr',
  MIC = 'mic',
}

export enum SessionQuickActionKind {
  // Writes `input` to the agent PTY as if typed (prompts end with \r to submit).
  INPUT = 'input',
  // Toggles voice dictation; final transcripts are typed into the agent PTY.
  DICTATION = 'dictation',
}

export interface SessionQuickActionDescriptor {
  label: string;
  Icon: SvgIconComponent;
  kind: SessionQuickActionKind;
  input?: string;
}

// Runners run different agent TUIs (claude-code, codex, opencode, pi), so
// actions speak the common denominator: natural-language prompts submitted with
// Enter, plus the Enter/Esc keys every TUI uses for confirm/dismiss.
const ENTER = '\r';
const ESCAPE = '\u001b';

// Catalog order is also the order unlisted actions appear in the customize menu.
export const SESSION_QUICK_ACTION_CATALOG: Record<SessionQuickAction, SessionQuickActionDescriptor> = {
  [SessionQuickAction.SURPRISE_ME]: {
    label: 'Surprise me',
    Icon: AutoAwesomeRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `Surprise me — go and do something amazing based on the available context.${ENTER}`,
  },
  [SessionQuickAction.PLAN_SPEC]: {
    label: 'Plan a spec',
    Icon: ArchitectureRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `Plan a spec for this work before touching code: goals, approach, files to change, and risks.${ENTER}`,
  },
  [SessionQuickAction.EXECUTE]: {
    label: 'Execute',
    Icon: PlayArrowRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `Execute the plan now — do the work.${ENTER}`,
  },
  [SessionQuickAction.ACCEPT]: {
    label: 'Accept',
    Icon: CheckRounded,
    kind: SessionQuickActionKind.INPUT,
    input: ENTER,
  },
  [SessionQuickAction.REJECT]: {
    label: 'Reject',
    Icon: CloseRounded,
    kind: SessionQuickActionKind.INPUT,
    input: ESCAPE,
  },
  [SessionQuickAction.ESCAPE]: {
    label: 'Esc',
    Icon: CancelPresentationRounded,
    kind: SessionQuickActionKind.INPUT,
    input: ESCAPE,
  },
  [SessionQuickAction.CLEAR_CONTEXT]: {
    label: 'Clear local context',
    Icon: DeleteSweepRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `/clear${ENTER}`,
  },
  [SessionQuickAction.NEW_WORKTREE]: {
    label: 'New clean worktree',
    Icon: AccountTreeRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `Create a new clean git worktree off the default branch and continue working there.${ENTER}`,
  },
  [SessionQuickAction.CREATE_PR]: {
    label: 'Create pull request',
    Icon: CallMergeRounded,
    kind: SessionQuickActionKind.INPUT,
    input: `Commit the current changes, push the branch, and create a pull request with a clear title and description.${ENTER}`,
  },
  [SessionQuickAction.MIC]: {
    label: 'Dictate',
    Icon: MicRounded,
    kind: SessionQuickActionKind.DICTATION,
  },
};

export const DEFAULT_SESSION_QUICK_ACTIONS: SessionQuickAction[] = [
  SessionQuickAction.SURPRISE_ME,
  SessionQuickAction.PLAN_SPEC,
  SessionQuickAction.EXECUTE,
  SessionQuickAction.ACCEPT,
  SessionQuickAction.REJECT,
  SessionQuickAction.ESCAPE,
  SessionQuickAction.CLEAR_CONTEXT,
  SessionQuickAction.NEW_WORKTREE,
  SessionQuickAction.CREATE_PR,
  SessionQuickAction.MIC,
];

// Stored preferences may predate catalog changes — drop unknown ids and
// duplicates instead of letting stale localStorage break the bar.
export const sanitizeSessionQuickActions = (stored: SessionQuickAction[]): SessionQuickAction[] => {
  const known = new Set<string>(Object.values(SessionQuickAction));
  const seen = new Set<SessionQuickAction>();
  return stored.filter((action) => {
    if (!known.has(action) || seen.has(action)) return false;
    seen.add(action);
    return true;
  });
};
