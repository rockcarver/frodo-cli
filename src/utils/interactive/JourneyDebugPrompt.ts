/**
 * The interactive list/drill-down view behind `frodo debug journey`.
 *
 * @remarks
 * Built the same way `escapableSelect` (`EscapableSelectPrompt.ts`) is: a
 * small `@inquirer/core` `createPrompt` component, redrawn in place rather
 * than using an alternate-screen full-TUI approach. The one addition this
 * prompt needs beyond that pattern is `useEffect`-driven polling -- it owns
 * a `JourneyDebugAggregator` for its whole lifetime and refreshes it on a
 * 5-second interval (matching `frodo log tail`'s existing poll cadence),
 * re-rendering the list live as journeys start, progress, and finish.
 *
 * List and drill-down are two render modes of the *same* running prompt,
 * not two separate prompts -- `Enter` switches `viewMode` to `'detail'`,
 * `Escape` switches it back to `'list'` (never resolving the prompt), so
 * polling keeps running underneath a drill-down view exactly as it does
 * behind the list. The prompt only actually resolves (exits `frodo debug`)
 * on `Escape` from the top-level list.
 *
 * An empty session list is a normal, expected state -- it can take seconds
 * or minutes for a real journey to start -- and is rendered as a plain
 * waiting message, never as an error or a blank screen.
 */
import {
  createPrompt,
  ExitPromptError,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useEffect,
  useKeypress,
  usePagination,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core';
import {
  JourneyDebugAggregator,
  type JourneyDebugEventEntry,
  type JourneySession,
  type JourneySessionStatus,
} from '../../ops/JourneyDebugAggregator';
import c from '../ColorTheme';
import { armEscapeGrace, EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import {
  frameInnerWidth,
  frameStatusTitle,
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  stripAnsi,
  wrapLine,
} from './NavigationMenu';

/** `stripAnsi` as a single-argument helper for the panelRow discipline: every framed row carries its honest {text, plain} pair. */
function stripAnsiOf(text: string): string {
  return stripAnsi(text);
}

/** The list's measured columns share the same width budget as its frame. */
function clampListWidthToFrame(
  widths: ListColumnWidths,
  width: number
): ListColumnWidths {
  // Hand-rolled budget: markers(4) + status(9) + 5 separators + the three
  // measured columns + a 20-floor for DETAIL. Anything over the budget
  // comes off JOURNEY/USER (their caps are already applied upstream).
  const fixed = 4 + STATUS_COL_WIDTH + 5;
  const detailFloor = 20;
  const budget = frameInnerWidth(width) - fixed - detailFloor;
  const measured = widths.journey + widths.user + widths.age;
  if (measured <= budget) return widths;
  const overflow = measured - budget;
  const takeJourney = Math.min(overflow, widths.journey - 7);
  const journey = Math.max(7, widths.journey - takeJourney);
  const user = Math.max(4, widths.user - (overflow - takeJourney));
  return { journey, user, age: widths.age };
}

const POLL_INTERVAL_MS = 5000;
// Raised from an original 20 -- a long-running journey's event history is
// now less densely packed with am-core noise (most confirmed noise is
// suppressed pre-failure and consecutive repeats collapse into one row, see
// `JourneyDebugAggregator`'s dedup), but a bigger window is still worth it
// on its own for a journey with many real nodes (e.g. a long IDV flow).
const MAX_DETAIL_EVENTS = 40;

// How long a still-"running" session must go quiet before the detail view
// hints that it may be waiting on an external redirect (e.g. social login,
// SAML) -- confirmed live that AM logs nothing further at all once a
// redirect-style node is reached and the browser never returns, so there is
// no failure event to show, only silence. A few poll cycles' worth avoids
// flagging an ordinary short pause between node completions.
const QUIET_HINT_AFTER_MS = 3 * POLL_INTERVAL_MS;

// Fixed rather than measured from the live status values -- the status enum
// is small and known ahead of time (`abandoned`/`suspended`, its longest
// members, are both 9 chars), so the column never visually resizes as
// different statuses come and go, which measuring live would otherwise
// cause on every poll.
const STATUS_COL_WIDTH = 9;
// Fixed the same way STATUS_COL_WIDTH is -- only ever 'AM' or 'IDM'
// (JourneyDebugEventEntry.source), so there's nothing to measure live.
const SRC_COL_WIDTH = 3;
// Caps on the two genuinely unbounded columns (a custom tree name or a
// username can be arbitrarily long) -- past this, a single outlier would
// otherwise stretch the whole table wider than the terminal.
const MAX_JOURNEY_COL_WIDTH = 28;
const MAX_USER_COL_WIDTH = 26;
// Same reasoning, for the detail view's per-event table -- a custom
// scripted node's own generated type id (e.g. `designer-<32-char-hash>`)
// can run well past any well-known node type's name length.
const MAX_STEP_COL_WIDTH = 26;
const MAX_TYPE_COL_WIDTH = 32;
/** Truncates to `max` chars with a trailing ellipsis, never silently -- the reader can always tell a value was cut. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Pads plain (uncolored) text to `width` -- callers must pad *before* wrapping in a color function, since ANSI escape codes count toward `.length` and would otherwise throw the padding math off. */
function padCell(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

interface ListColumnWidths {
  journey: number;
  user: number;
  age: number;
}

/** Column widths for the list view, measured across every currently-tracked session (not just the visible page) so widths stay stable while paging/scrolling. */
function computeListColumnWidths(sessions: JourneySession[]): ListColumnWidths {
  const now = Date.now();
  let journey = 'JOURNEY'.length;
  let user = 'USER'.length;
  let age = 'AGE'.length;
  for (const session of sessions) {
    const treeText = truncate(
      session.treeName ?? '(unknown tree)',
      MAX_JOURNEY_COL_WIDTH
    );
    journey = Math.max(journey, treeText.length);
    const displayUser = session.userDisplayName ?? session.user;
    if (displayUser) {
      user = Math.max(user, truncate(displayUser, MAX_USER_COL_WIDTH).length);
    }
    age = Math.max(age, formatElapsed(now - session.startedAt).length);
  }
  return { journey, user, age };
}

function statusColorFn(
  status: JourneySessionStatus
): (text: unknown) => string {
  switch (status) {
    case 'finished':
      return c.positive;
    case 'failed':
      return c.negative;
    case 'abandoned':
    case 'suspended':
      // No live signal reliably distinguishes "genuinely suspended" from
      // "just running long" yet (see JourneyDebugAggregator's own remarks)
      // -- `suspended` is kept for forward-compatibility but nothing sets
      // it today.
      return c.warning;
    case 'running':
    default:
      return (text) => String(text);
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

function statusLabel(session: JourneySession): string {
  return statusColorFn(session.status)(session.status);
}

/** One panel body row: what draws plus its ANSI-free measure (renderFramedBox's row discipline). */
type PanelRow = { text: string; plain: string };

function renderListHeader(widths: ListColumnWidths): PanelRow {
  const cells = [
    '   ', // pin marker + cursor marker, including the joining space
    padCell('STATUS', STATUS_COL_WIDTH),
    padCell('JOURNEY', widths.journey),
    padCell('USER', widths.user),
    padCell('AGE', widths.age),
    'DETAIL',
  ];
  const plain = cells.join(' ');
  return { text: c.heading(plain), plain };
}

function renderListRow(
  session: JourneySession,
  isActive: boolean,
  widths: ListColumnWidths,
  width: number
): PanelRow {
  const now = Date.now();
  const pin = session.pinned ? '\u{1F4CC} ' : '  ';
  const cursor = isActive ? '› ' : '  ';
  // The leading cells are part of the MEASURED row (cursor + pin markers
  // included) -- a plain that omitted them would let the right wall drift.
  const marker = cursor + pin;

  const statusCell = statusColorFn(session.status)(
    padCell(session.status, STATUS_COL_WIDTH)
  );

  const treeNamePlain = truncate(
    session.treeName ?? '(unknown tree)',
    widths.journey
  );
  const treeCell = padCell(treeNamePlain, widths.journey);
  const journeyCell = session.treeName ? treeCell : c.muted(treeCell);

  const displayUser = session.userDisplayName ?? session.user;
  const userCell = c.muted(
    padCell(displayUser ? truncate(displayUser, widths.user) : '', widths.user)
  );

  const ageCell = c.muted(
    padCell(formatElapsed(now - session.startedAt), widths.age)
  );

  const detailWidth = Math.max(
    8,
    frameInnerWidth(width) -
      marker.length -
      STATUS_COL_WIDTH -
      widths.journey -
      widths.user -
      widths.age -
      4 -
      2
  );
  const detailText = (text: string) =>
    truncate(text.replace(/\s+/g, ' ').trim(), detailWidth);
  const detailCell =
    session.status === 'failed' && session.failureReason
      ? c.muted(`- ${detailText(session.failureReason)}`)
      : session.lastNode
        ? c.muted(`@ ${detailText(session.lastNode)}`)
        : '';

  const body = [statusCell, journeyCell, userCell, ageCell]
    .join(' ')
    .concat(detailCell ? ` ${detailCell}` : '');
  const line = `${marker}${body}`;
  return { text: isActive ? c.command(line) : line, plain: stripAnsi(line) };
}

interface PropertyRow {
  label: string;
  value: string;
  /** Defaults to `c.emphasis` -- only `Failure` wants to stand out differently. */
  labelColor?: (text: unknown) => string;
}

/**
 * Property rows for the two detail views: `Label:` in the label color
 * followed by the value, wrapped to the frame's inner width when the
 * value runs long (a raw AM exception message alone confirmed live past
 * 190 chars) -- one PanelRow per VISUAL row, continuation lines indented
 * past the label column. wrapLine strips ANSI before measuring, so the
 * wrap goes over the plain value and the drawn text re-colors per row
 * (continuation rows render plain -- losing a colored value's ANSI on
 * its wrapped tail is the accepted trade for honest walls).
 */
function propertyPanelRows(
  properties: PropertyRow[],
  width: number
): PanelRow[] {
  const innerWidth = frameInnerWidth(width);
  const labelWidth = Math.min(
    innerWidth - 2,
    Math.max(...properties.map((p) => p.label.length)) + 1
  );
  const rows: PanelRow[] = [];
  for (const p of properties) {
    const label = padCell(truncate(`${p.label}:`, labelWidth), labelWidth);
    const colorFn = p.labelColor ?? c.emphasis;
    const valueWidth = innerWidth - label.length - 1;
    const wrapped = wrapPanelText(p.value, valueWidth);
    wrapped.forEach((part, index) => {
      const plain =
        index === 0 ? `${label} ${part}` : `${' '.repeat(labelWidth)} ${part}`;
      rows.push({
        text: index === 0 ? `${colorFn(label)} ${part}` : c.muted(plain),
        plain,
      });
    });
  }
  return rows;
}

/** Keep log line breaks and stack indentation without letting tabs escape the frame. */
function wrapPanelText(text: string, width: number): string[] {
  return stripAnsi(text)
    .replace(/\t/g, '    ')
    .split(/\r\n|\r|\n/)
    .flatMap((line) => {
      const indent = /^\s*/.exec(line)?.[0].length ?? 0;
      return wrapLine(indent >= width ? line.trimStart() : line, width);
    });
}

function renderDetail(
  session: JourneySession,
  activeEventIndex: number,
  width: number
): PanelRow[] {
  const now = Date.now();

  const properties: PropertyRow[] = [
    { label: 'Transaction', value: session.transactionId },
    { label: 'Journey', value: session.treeName ?? c.muted('(unknown)') },
    {
      label: 'Status',
      value: `${statusLabel(session)}${session.pinned ? c.muted(' (pinned)') : ''}`,
    },
  ];
  if (session.user) {
    const userValue =
      session.userDisplayName && session.userDisplayName !== session.user
        ? `${session.userDisplayName} ${c.muted(`(${session.user})`)}`
        : session.user;
    properties.push({ label: 'User', value: userValue });
  }
  properties.push({
    label: 'Started',
    value: `${formatElapsed(now - session.startedAt)} ago`,
  });
  // A still-`running` session gone quiet a while (e.g. waiting on an
  // external redirect that never comes back -- AM logs nothing further at
  // all in that case, only silence) gets flagged right on this row rather
  // than a separate explanatory paragraph: the warning color plus the
  // actual abandoned-after duration is the whole useful signal.
  const quietMs = now - session.lastEventAt;
  const isQuiet = session.status === 'running' && quietMs > QUIET_HINT_AFTER_MS;
  const lastActivityText = `${formatElapsed(quietMs)} ago`;
  const abandonSuffix =
    isQuiet && session.abandonedAfterMinutes !== undefined
      ? c.muted(
          ` (abandons after ~${session.abandonedAfterMinutes}m of inactivity)`
        )
      : '';
  properties.push({
    label: 'Last activity',
    value: `${isQuiet ? c.warning(lastActivityText) : lastActivityText}${abandonSuffix}`,
  });
  properties.push({ label: 'Nodes visited', value: String(session.nodeCount) });
  // Only shown when nonzero -- otherwise it's ambiguous from the outside
  // whether a clean "Recent events" list means nothing needed filtering, or
  // something did and you just can't tell (confirmed live: comparing a
  // quiet tenant against a noisy one raised exactly this question).
  if (session.suppressedNoiseCount) {
    properties.push({
      label: 'Noise filtered',
      value: c.muted(
        `${session.suppressedNoiseCount} am-core line(s) held back as routine noise (shown automatically if this session fails)`
      ),
    });
  }
  if (session.failureReason) {
    properties.push({
      label: 'Failure',
      value: session.failureReason,
      labelColor: c.negative,
    });
  }

  const lines: PanelRow[] = propertyPanelRows(properties, width);

  lines.push(
    { text: '', plain: '' },
    { text: c.emphasis('Recent events:'), plain: 'Recent events:' }
  );
  const shown = session.events.slice(-MAX_DETAIL_EVENTS);
  const omitted = session.events.length - shown.length;
  if (omitted > 0)
    lines.push({
      text: c.muted(`  (${omitted} earlier events omitted)`),
      plain: `  (${omitted} earlier events omitted)`,
    });
  if (shown.length === 0) {
    lines.push({ text: c.muted('  (none yet)'), plain: '  (none yet)' });
  } else {
    // Column widths measured across just the shown (already-capped) slice
    // -- unlike the list view's widths, this never scrolls, so there's no
    // "widths jump" concern to justify measuring anything wider.
    // 'TIME', not 'ELAPSED' -- a typical value ('+0s', '+15s') is much
    // narrower than the 7-char header 'ELAPSED' would force the column to,
    // leaving distracting blank space ahead of every other column.
    let elapsedWidth = 'TIME'.length;
    let stepWidth = 'STEP'.length;
    let typeWidth = 'TYPE'.length;
    for (const event of shown) {
      elapsedWidth = Math.max(
        elapsedWidth,
        `+${formatElapsed(event.at - session.startedAt)}`.length
      );
      stepWidth = Math.max(
        stepWidth,
        truncate(event.step, MAX_STEP_COL_WIDTH).length
      );
      if (event.type) {
        typeWidth = Math.max(
          typeWidth,
          truncate(event.type, MAX_TYPE_COL_WIDTH).length
        );
      }
    }
    lines.push({
      text: c.heading(
        `    ${padCell('TIME', elapsedWidth)} ${padCell('SRC', SRC_COL_WIDTH)} ${padCell('STEP', stepWidth)} ${padCell('TYPE', typeWidth)} OUTCOME`
      ),
      plain: `    ${padCell('TIME', elapsedWidth)} ${padCell('SRC', SRC_COL_WIDTH)} ${padCell('STEP', stepWidth)} ${padCell('TYPE', typeWidth)} OUTCOME`,
    });
    shown.forEach((event, index) => {
      const isActive = index === activeEventIndex;
      const cursor = isActive ? '› ' : '  ';
      // Cells composed PLAIN first: the prefix doubles as the wrap
      // continuation indent below, so it must be honest (cursor included)
      // and ANSI-free -- then colored per row.
      const elapsedPlain = padCell(
        `+${formatElapsed(event.at - session.startedAt)}`,
        elapsedWidth
      );
      const srcPlain = padCell(event.source, SRC_COL_WIDTH);
      const stepPlain = padCell(
        truncate(event.step, MAX_STEP_COL_WIDTH),
        stepWidth
      );
      const typePlain = padCell(
        event.type ? truncate(event.type, MAX_TYPE_COL_WIDTH) : '',
        typeWidth
      );
      const prefixPlain = `  ${cursor}${elapsedPlain} ${srcPlain} ${stepPlain} ${typePlain}`;
      // `repeatCount` > 1 means `JourneyDebugAggregator`'s dedup collapsed a
      // run of exact repeats into this one row (see `dedupeAppend`) -- the
      // same "message repeated N times" convention syslog-style loggers
      // use, so a burst of identical noise takes one row instead of N.
      const outcomePlain = `${event.outcome ?? ''}${
        event.repeatCount && event.repeatCount > 1
          ? ` (×${event.repeatCount})`
          : ''
      }`;
      // OUTCOME has no fixed width -- a long failure reason (a live
      // tree-completed row confirmed past 190 chars) WRAPS past the fixed
      // columns instead of crossing the frame's right wall, continuation
      // rows indented to the outcome column start (same honesty rule as
      // propertyPanelRows above; continuation rows render muted).
      const outcomeWidth = Math.max(
        10,
        frameInnerWidth(width) - prefixPlain.length - 1
      );
      wrapPanelText(outcomePlain, outcomeWidth).forEach((part, partIndex) => {
        const plain =
          partIndex === 0
            ? `${prefixPlain} ${part}`.trimEnd()
            : `${' '.repeat(prefixPlain.length + 1)}${part}`;
        lines.push({
          text:
            partIndex === 0
              ? isActive
                ? c.command(plain)
                : plain
              : c.muted(plain),
          plain,
        });
      });
    });
  }
  return lines;
}

/** Turns a camelCase raw-field key into a human label, e.g. `authIndexValue` -> `Auth Index Value`. */
function prettifyKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatRawValue(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * The per-event drill-down -- reached by selecting a row in `renderDetail`'s
 * event table and pressing Enter. `event.raw` (whatever extra fields were
 * present on the source log event, see `JourneyDebugAggregator.ingest()`)
 * is what makes this worth a separate screen instead of just widening the
 * table; the step/type/outcome/elapsed already visible there are repeated
 * here too so this view is self-contained.
 */
function renderEventDetail(
  session: JourneySession,
  event: JourneyDebugEventEntry,
  width: number
): PanelRow[] {
  const properties: PropertyRow[] = [
    { label: 'Step', value: event.step },
    { label: 'Source', value: event.source },
  ];
  if (event.type) properties.push({ label: 'Type', value: event.type });
  if (event.outcome)
    properties.push({ label: 'Outcome', value: event.outcome });
  properties.push({
    label: 'Elapsed',
    value: `+${formatElapsed(event.at - session.startedAt)}`,
  });
  if (event.repeatCount && event.repeatCount > 1) {
    properties.push({
      label: 'Repeated',
      value: `${event.repeatCount} times (shown once, most recent timestamp)`,
    });
  }
  if (event.raw) {
    for (const [key, value] of Object.entries(event.raw)) {
      properties.push({
        label: prettifyKey(key),
        value: formatRawValue(value),
      });
    }
  }

  return propertyPanelRows(properties, width);
}

type ViewMode = 'list' | 'detail' | 'event';

// Pulled out of the render body (see the try/catch around its call site
// below) so a bad session/event shape can't throw mid-render and take the
// whole prompt down with it -- every field here is derived, cheaply
// recomputable state, never a source of truth itself.
interface DerivedPromptState {
  clampedActive: number;
  detailSession: JourneySession | undefined;
  shownEvents: JourneyDebugEventEntry[];
  clampedEventIndex: number;
  activeEvent: JourneyDebugEventEntry | undefined;
}

const EMPTY_DERIVED_STATE: DerivedPromptState = {
  clampedActive: 0,
  detailSession: undefined,
  shownEvents: [],
  clampedEventIndex: 0,
  activeEvent: undefined,
};

function computeDerivedState(
  sessions: JourneySession[],
  activeId: string | undefined,
  detailId: string | undefined,
  selectedEventId: string | undefined
): DerivedPromptState {
  const activeIndex = activeId
    ? sessions.findIndex((s) => s.transactionId === activeId)
    : -1;
  const clampedActive = sessions.length
    ? Math.min(Math.max(activeIndex, 0), sessions.length - 1)
    : 0;
  const detailSession = detailId
    ? sessions.find((s) => s.transactionId === detailId)
    : undefined;
  const shownEvents = detailSession
    ? detailSession.events.slice(-MAX_DETAIL_EVENTS)
    : [];
  const eventIndex = selectedEventId
    ? shownEvents.findIndex((e) => e.id === selectedEventId)
    : -1;
  const clampedEventIndex = shownEvents.length
    ? Math.min(Math.max(eventIndex, 0), shownEvents.length - 1)
    : 0;
  const activeEvent = shownEvents[clampedEventIndex];
  return {
    clampedActive,
    detailSession,
    shownEvents,
    clampedEventIndex,
    activeEvent,
  };
}

/** `frodo debug journey`'s `-i/--journey-id`/`-u/--user-id` options, threaded straight through to `JourneyDebugAggregator`'s own filter -- see its remarks for matching semantics. */
export interface JourneyDebugPromptConfig {
  journeyId?: string;
  userId?: string;
}

/** A short, muted-rendered label describing an active `-i/-u` filter, or `undefined` when neither is set -- shown in the list header/empty-state so a typo'd filter value reads as "nothing matches this filter" rather than looking like a stuck or broken debugger. */
function describeFilter(
  config: JourneyDebugPromptConfig,
  resolvedUserIdAlias?: string
): string | undefined {
  const parts: string[] = [];
  if (config.journeyId) parts.push(`journey~"${config.journeyId}"`);
  if (config.userId) {
    // Surfaces the username<->uuid resolution once it lands (see
    // JourneyDebugAggregator's own remarks) so the filter's extra reach
    // is visible, not a silent, hard-to-trust widening.
    parts.push(
      resolvedUserIdAlias
        ? `user~"${config.userId}"→"${resolvedUserIdAlias}"`
        : `user~"${config.userId}"`
    );
  }
  return parts.length ? parts.join(', ') : undefined;
}

const journeyDebugPromptImpl = createPrompt<
  void | typeof EXIT_ALL,
  JourneyDebugPromptConfig
>((config, done) => {
  const aggregator = useState(() => new JourneyDebugAggregator(config))[0];
  const [sessions, setSessions] = useState<JourneySession[]>([]);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  // Tracked by transactionId, not array index -- `sessions` is freshly
  // sorted by most-recent-activity on every poll, so a plain index would
  // silently start pointing at a different row the instant any other
  // session's activity resorted the list out from under it. Confirmed
  // live: this could pin/drill into the wrong session if a poll landed
  // between rendering and a keypress.
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  // Same stable-key reasoning as `activeId` above, keyed off the event's
  // own raw log-event `_id` (see `JourneyDebugEventEntry.id`) rather than
  // its position in the (fixed, non-resorting, but window-sliding as new
  // events arrive) `shown` slice.
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    undefined
  );
  const [done_, setDone] = useState(false);
  const terminalWidth = () =>
    process.stdout.isTTY && process.stdout.columns
      ? Math.max(40, process.stdout.columns)
      : 120;
  const [width, setWidth] = useState(terminalWidth);
  useEffect(() => {
    const onResize = () => setWidth(terminalWidth());
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);
  const prefix = usePrefix({ status: done_ ? 'done' : 'idle' });

  // The double-ESC grace (see ExitAll.ts and EscapableSelectPrompt --
  // same mechanism, one instance per view here): the first ESC opens a
  // short window instead of acting; a second ESC inside it resolves the
  // prompt with EXIT_ALL (exit-all unwinds to the shell from ANY view);
  // an expired window performs the CURRENT view's single-ESC action
  // (event -> detail -> list -> exit). The callbacks are created fresh
  // inside this render pass's keypress closure, so the viewMode they
  // capture is the one on screen when the grace armed -- never stale.
  const escapeGraceRef = useRef<ReturnType<typeof armEscapeGrace> | undefined>(
    undefined
  );
  // True while the grace window is open: the view renders the exit-all
  // hint inside the panel so the gesture is discoverable.
  const [escapeGraceOpen, setEscapeGraceOpen] = useState(false);

  // Grace teardown on unmount: a timer firing after the prompt resolved
  // would call a stale handler (the prompt's hooks are gone).
  useEffect(() => () => escapeGraceRef.current?.dispose(), []);

  /** Cancels any open grace (every non-ESC key breaks the streak). */
  const cancelEscapeGrace = () => {
    escapeGraceRef.current?.otherKey();
    escapeGraceRef.current = undefined;
    setEscapeGraceOpen(false);
  };

  /** First ESC from the CURRENT view: arm the grace window. */
  const armViewEscapeGrace = () => {
    setEscapeGraceOpen(true);
    escapeGraceRef.current = armEscapeGrace({
      onSecondEscape: () => {
        setEscapeGraceOpen(false);
        setDone(true);
        done(EXIT_ALL);
      },
      onGraceExpire: () => {
        setEscapeGraceOpen(false);
        // The single-ESC action of the view on screen when the grace
        // armed -- recreated per render, so this closure is current.
        if (viewMode === 'event') setViewMode('detail');
        else if (viewMode === 'detail') setViewMode('list');
        else {
          setDone(true);
          done();
        }
      },
    });
  };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const runPoll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        // Reset to this cycle's outcome only -- a warning is a
        // transient "something went wrong just now" signal, not a
        // permanent banner. Without this, a single early hiccup (e.g.
        // one export failure) would stay pinned on screen forever
        // even once later polls succeed cleanly.
        let latestWarning: string | undefined;
        await aggregator.poll((message) => {
          latestWarning = message;
        });
        if (!cancelled) {
          setWarning(latestWarning);
          setSessions(aggregator.getSessions());
        }
      } catch (error) {
        // aggregator.poll() itself is documented never to throw, but
        // this is the last line of defense before an uncaught
        // rejection from this `void`-called, un-awaited function would
        // otherwise go completely unhandled -- confirmed live that a
        // long-running debug session left open against real traffic
        // went totally unresponsive to every key except Escape (which
        // resolves the prompt directly and needs no re-render to be
        // visible, unlike every other key, which only updates state
        // for a re-render this same interval loop drives).
        if (!cancelled) {
          setWarning(
            `debug: unexpected error, will retry -- ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } finally {
        // In `finally`, not just as the last line of the try block --
        // otherwise an exception above would leave this stuck `true`
        // forever, silently no-op-ing every future poll via the guard
        // at the top even once the error itself stopped recurring.
        inFlight = false;
      }
    };
    void runPoll();
    const interval = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aggregator]);

  // Computed through a try/catch, not inline -- @inquirer/core's own
  // render loop wraps the whole render call in exactly one try/catch and
  // *rejects the entire prompt* on any exception (confirmed by reading
  // its source, create-prompt.js): the promise settles, cleanup runs
  // (readline listeners removed, terminal restored), and whatever key
  // the user happened to press right around then just goes to their
  // now-restored shell -- easily mistaken for "Escape got me out",
  // when actually the app had already silently exited via a rejected
  // promise. Confirmed live: a long-running session against real
  // admin-console traffic became unresponsive to every key this way.
  // useKeypress below needs `clampedActive`/`shownEvents`/etc for its
  // closure, so if computing them throws, useKeypress must still be
  // reached with *some* (degraded) values -- never skipped -- since a
  // render pass that never reaches useKeypress leaves its internal
  // keypress-handler ref stale, and every later render hitting the same
  // throw at the same point means it never gets refreshed again.
  // A caught error is carried in this plain local, not via setState --
  // setState synchronously re-enters render() (confirmed by reading
  // use-state.js), so calling it from within the render pass itself
  // (as opposed to from inside the useKeypress callback below, which is
  // an event handler and batches updates safely) risks reentrant/
  // recursive rendering. The error surfaces via the plain fallback
  // return near the bottom of this same render pass instead.
  let derived: DerivedPromptState;
  let derivedError: string | undefined;
  try {
    derived = computeDerivedState(
      sessions,
      activeId,
      detailId,
      selectedEventId
    );
  } catch (error) {
    derived = EMPTY_DERIVED_STATE;
    derivedError = error instanceof Error ? error.message : String(error);
  }
  const {
    clampedActive,
    detailSession,
    shownEvents,
    clampedEventIndex,
    activeEvent,
  } = derived;

  useKeypress((key) => {
    try {
      if (done_) return;
      if (key.name === 'escape') {
        // Two-stage escape (see ExitAll.ts): second ESC inside the
        // window exits all the way out; expiry performs this view's
        // single-ESC action (armed in armViewEscapeGrace above).
        if (escapeGraceRef.current) {
          const grace = escapeGraceRef.current;
          escapeGraceRef.current = undefined;
          grace.secondEscape();
          return;
        }
        armViewEscapeGrace();
        return;
      }
      // Any other key breaks the double-ESC streak (consecutive
      // presses only -- the mouse double-click analogy).
      cancelEscapeGrace();
      if (viewMode === 'event') {
        if ((isUpKey(key) || isDownKey(key)) && shownEvents.length) {
          const offset = isUpKey(key) ? -1 : 1;
          const nextIndex =
            (clampedEventIndex + offset + shownEvents.length) %
            shownEvents.length;
          const nextEvent = shownEvents[nextIndex];
          setSelectedEventId(nextEvent.id);
        }
        return;
      }
      if (viewMode === 'detail') {
        if (isSpaceKey(key) && detailSession) {
          aggregator.togglePin(detailSession.transactionId);
          setSessions(aggregator.getSessions());
        } else if (isEnterKey(key) && shownEvents.length) {
          setSelectedEventId(activeEvent?.id);
          setViewMode('event');
        } else if ((isUpKey(key) || isDownKey(key)) && shownEvents.length) {
          const offset = isUpKey(key) ? -1 : 1;
          const nextIndex =
            (clampedEventIndex + offset + shownEvents.length) %
            shownEvents.length;
          const nextEvent = shownEvents[nextIndex];
          setSelectedEventId(nextEvent.id);
        }
        return;
      }
      // list mode
      if (isEnterKey(key) && sessions.length) {
        setDetailId(sessions[clampedActive].transactionId);
        setSelectedEventId(undefined);
        setViewMode('detail');
      } else if (isSpaceKey(key) && sessions.length) {
        aggregator.togglePin(sessions[clampedActive].transactionId);
        setSessions(aggregator.getSessions());
      } else if ((isUpKey(key) || isDownKey(key)) && sessions.length) {
        const offset = isUpKey(key) ? -1 : 1;
        const nextIndex =
          (clampedActive + offset + sessions.length) % sessions.length;
        setActiveId(sessions[nextIndex].transactionId);
      }
    } catch (error) {
      // Safe to setState here (unlike the two render-pass try/catches
      // above/below) -- this callback runs inside @inquirer/core's own
      // withUpdates() batching, the same mechanism every other
      // setState call in this handler already relies on.
      setWarning(
        `debug: unexpected error handling key, ignoring -- ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  if (done_) {
    return `${prefix} Journey debugging ended.`;
  }

  const warningLine = warning ? c.warning(warning) : '';

  /**
   * One panel body row from a rendered (colored) string -- plain
   * mirrors it ANSI-free so `renderFramedBox`'s measure stays honest.
   * `stripAnsi` is imported for exactly this discipline.
   */
  const panelRow = (row: string): { text: string; plain: string } => ({
    text: row,
    plain: stripAnsiOf(row),
  });
  const renderPanel = (
    title: ReturnType<typeof frameStatusTitle>,
    lines: PanelRow[]
  ) =>
    renderFramedBox({
      title:
        stripAnsi(title.text).length > width - 4
          ? truncate(stripAnsi(title.text), width - 4)
          : title,
      lines: lines.flatMap((row) => {
        if (
          !/[\r\n\t]/.test(row.plain) &&
          row.plain.length <= frameInnerWidth(width)
        ) {
          return [row];
        }
        const wrapped = wrapPanelText(row.text, frameInnerWidth(width));
        return wrapped.map(panelRow);
      }),
      width,
    });

  // The grace hint renders INSIDE the panel (first line, like the
  // pickers) so the gesture's second half is obvious.
  const graceLine = escapeGraceOpen
    ? panelRow(c.muted('esc again to exit all -- or wait to go back'))
    : undefined;

  // Same reasoning as the derived-state try/catch above: any of these
  // render helpers throwing (a malformed session, a raw event field that
  // doesn't stringify the way `formatRawValue` expects, ...) must not be
  // allowed to propagate out of the render call, or @inquirer/core's
  // `cycle()` rejects the whole prompt promise instead of just this one
  // frame. Falls back to a framed error panel and keeps the prompt alive
  // for the next poll/keypress to re-render from, rather than exiting.
  try {
    if (derivedError) {
      throw new Error(derivedError);
    }

    if (viewMode === 'event' && detailSession && activeEvent) {
      const panelLines = [];
      if (graceLine) panelLines.push(graceLine);
      panelLines.push(...renderEventDetail(detailSession, activeEvent, width));
      return [
        renderNavigationMenu(
          navigationMenuItems({ escape: 'back · [ESC]×2 exit all' }),
          width
        ),
        renderPanel(frameStatusTitle(`${prefix} Event detail`), panelLines),
        warningLine,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (viewMode === 'detail' && detailSession) {
      const panelLines = [];
      if (graceLine) panelLines.push(graceLine);
      panelLines.push(...renderDetail(detailSession, clampedEventIndex, width));
      return [
        renderNavigationMenu(
          navigationMenuItems({
            enter: 'view event',
            space: 'pin/unpin',
            escape: 'back · [ESC]×2 exit all',
          }),
          width
        ),
        renderPanel(frameStatusTitle(`${prefix} Journey detail`), panelLines),
        warningLine,
      ]
        .filter(Boolean)
        .join('\n');
    }

    const filterLabel = describeFilter(
      config,
      aggregator.getResolvedUserIdAlias()
    );

    const title = frameStatusTitle(`${prefix} Debugging journeys`, [
      ...(sessions.length ? [`(${sessions.length} tracked)`] : []),
      ...(filterLabel ? [`[${filterLabel}]`] : []),
    ]);

    if (sessions.length === 0) {
      const waitingLine = filterLabel
        ? `No journey activity matching [${filterLabel}] detected yet -- waiting for a match (or check the filter for a typo)...`
        : 'No journey activity detected yet -- waiting for a journey to start...';
      return [
        renderNavigationMenu(
          navigationMenuItems({ escape: 'exit · [ESC]×2 exit all' }),
          width
        ),
        renderPanel(title, [
          ...(graceLine ? [graceLine] : []),
          panelRow(c.muted(waitingLine)),
          ...(warningLine ? [panelRow(warningLine)] : []),
        ]),
      ]
        .filter(Boolean)
        .join('\n');
    }

    // Measured across every tracked session, not just the visible page --
    // otherwise columns would visibly resize every time paging brought a
    // wider (or narrower) value into view. Then clamped to the frame:
    // the DETAIL cell truncates harder when the measured columns eat the
    // budget (its floor lives in clampListWidthToFrame).
    const listWidths = clampListWidthToFrame(
      computeListColumnWidths(sessions),
      width
    );
    const page = usePagination({
      items: sessions,
      active: clampedActive,
      // usePagination composes STRINGS; the drawn side of the row is
      // what lands in the page -- the plain measure is taken per row
      // below (panelRow), keeping the honest {text, plain} discipline.
      renderItem: ({ item, isActive }) =>
        renderListRow(item, isActive, listWidths, width).text,
      pageSize: 15,
      loop: true,
    });

    const panelLines = [];
    if (graceLine) panelLines.push(graceLine);
    panelLines.push(renderListHeader(listWidths));
    for (const row of page.split('\n')) {
      panelLines.push(panelRow(row));
    }
    if (warningLine) panelLines.push(panelRow(warningLine));

    return [
      renderNavigationMenu(
        navigationMenuItems({
          enter: 'drill down',
          space: 'pin/unpin',
          escape: 'exit · [ESC]×2 exit all',
        }),
        width
      ),
      renderPanel(title, panelLines),
    ]
      .filter(Boolean)
      .join('\n');
  } catch (error) {
    return [
      renderNavigationMenu(
        navigationMenuItems({ escape: 'exit · [ESC]×2 exit all' }),
        width
      ),
      renderPanel(frameStatusTitle(`${prefix} Debugging journeys`), [
        ...(graceLine ? [graceLine] : []),
        panelRow(
          c.negative(
            `Internal error rendering this view, will retry on the next update -- ${error instanceof Error ? error.message : String(error)}`
          )
        ),
        ...(warningLine ? [panelRow(warningLine)] : []),
      ]),
    ]
      .filter(Boolean)
      .join('\n');
  }
});

/**
 * Runs the interactive journey-debugging session until the user backs out
 * (single ESC from the top-level list, 400ms grace) or exits all the way
 * out (fast double-ESC from any view). Assumes `state`/credentials are
 * already set up by the caller (same convention as `frodo debug`'s other
 * topics).
 */
export async function runJourneyDebugPrompt(
  config: JourneyDebugPromptConfig = {}
): Promise<void> {
  // Erase-on-conclude: the whole debug session (list, drill-ins, the
  // final "Journey debugging ended." line) disappears when the user
  // leaves -- the debug transcript is a live view, not an artifact to
  // keep in scrollback. Same every-exit-path guarantee as the other
  // prompts (see EscapableSelectPrompt's wrapper comment).
  try {
    const result = await journeyDebugPromptImpl(config, {
      clearPromptOnDone: true,
    });
    // Double-ESC resolved with the exit-all sentinel: throw the unwind
    // signal so app.ts's top-level handler exits the whole session
    // cleanly (same convention as the pickers' wrappers).
    if (result === EXIT_ALL) throw EXIT_ALL_SIGNAL;
  } catch (error) {
    // Ctrl+C (SIGINT) rejects the prompt with @inquirer/core's
    // ExitPromptError; with erase-on-conclude having already restored the
    // screen, the clean exit is silence -- not app.ts's error print +
    // exit 1 (same treatment as PromptGate's gap-fill wrappers, which
    // degrade ExitPromptError instead of surfacing it).
    if (error instanceof ExitPromptError) return;
    throw error;
  }
}
