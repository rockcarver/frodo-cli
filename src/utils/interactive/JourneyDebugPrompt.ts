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
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useEffect,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
} from '@inquirer/core';

import {
  JourneyDebugAggregator,
  type JourneyDebugEventEntry,
  type JourneySession,
  type JourneySessionStatus,
} from '../../ops/JourneyDebugAggregator';
import c from '../ColorTheme';

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
// The list row's trailing DETAIL cell (failure reason / last node) is the
// only column with no fixed right-hand neighbor to bound it, so a long raw
// AM exception message (confirmed live: a script-adapter failure's message
// alone ran past 190 chars once its identifiers were spelled out) would
// otherwise wrap the whole row across terminal lines. `compactFailureReason`
// already strips the noisy wrapper-class prefix; this is just the last-mile
// bound so one long outlier can't blow out list-view alignment -- the full,
// untruncated text is always still one Enter-key away in the detail view.
const MAX_DETAIL_COL_WIDTH = 60;

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

function renderListHeader(widths: ListColumnWidths): string {
  const cells = [
    '    ', // pin marker + cursor marker, blank
    padCell('STATUS', STATUS_COL_WIDTH),
    padCell('JOURNEY', widths.journey),
    padCell('USER', widths.user),
    padCell('AGE', widths.age),
    'DETAIL',
  ];
  return c.heading(cells.join(' '));
}

function renderListRow(
  session: JourneySession,
  isActive: boolean,
  widths: ListColumnWidths
): string {
  const now = Date.now();
  const pin = session.pinned ? '\u{1F4CC} ' : '  ';
  const cursor = isActive ? '› ' : '  ';

  const statusCell = statusColorFn(session.status)(
    padCell(session.status, STATUS_COL_WIDTH)
  );

  const treeNamePlain = session.treeName
    ? truncate(session.treeName, MAX_JOURNEY_COL_WIDTH)
    : '(unknown tree)';
  const treeCell = padCell(treeNamePlain, widths.journey);
  const journeyCell = session.treeName ? treeCell : c.muted(treeCell);

  const displayUser = session.userDisplayName ?? session.user;
  const userCell = c.muted(
    padCell(
      displayUser ? truncate(displayUser, MAX_USER_COL_WIDTH) : '',
      widths.user
    )
  );

  const ageCell = c.muted(
    padCell(formatElapsed(now - session.startedAt), widths.age)
  );

  const detailCell =
    session.status === 'failed' && session.failureReason
      ? c.muted(`- ${truncate(session.failureReason, MAX_DETAIL_COL_WIDTH)}`)
      : session.lastNode
        ? c.muted(`@ ${truncate(session.lastNode, MAX_DETAIL_COL_WIDTH)}`)
        : '';

  const line = [cursor + pin, statusCell, journeyCell, userCell, ageCell]
    .join(' ')
    .concat(detailCell ? ` ${detailCell}` : '');
  return isActive ? c.command(line) : line;
}

interface PropertyRow {
  label: string;
  value: string;
  /** Defaults to `c.emphasis` -- only `Failure` wants to stand out differently. */
  labelColor?: (text: unknown) => string;
}

function renderDetail(
  session: JourneySession,
  activeEventIndex: number
): string {
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
  if (session.failureReason) {
    properties.push({
      label: 'Failure',
      value: session.failureReason,
      labelColor: c.negative,
    });
  }

  const labelWidth = Math.max(...properties.map((p) => p.label.length)) + 1;
  const lines = properties.map((p) => {
    const colorFn = p.labelColor ?? c.emphasis;
    return `${colorFn(padCell(`${p.label}:`, labelWidth))} ${p.value}`;
  });

  lines.push('', c.emphasis('Recent events:'));
  const shown = session.events.slice(-MAX_DETAIL_EVENTS);
  const omitted = session.events.length - shown.length;
  if (omitted > 0) lines.push(c.muted(`  (${omitted} earlier events omitted)`));
  if (shown.length === 0) {
    lines.push(c.muted('  (none yet)'));
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
    lines.push(
      c.heading(
        `    ${padCell('TIME', elapsedWidth)} ${padCell('SRC', SRC_COL_WIDTH)} ${padCell('STEP', stepWidth)} ${padCell('TYPE', typeWidth)} OUTCOME`
      )
    );
    shown.forEach((event, index) => {
      const isActive = index === activeEventIndex;
      const cursor = isActive ? '› ' : '  ';
      const elapsedCell = c.muted(
        padCell(`+${formatElapsed(event.at - session.startedAt)}`, elapsedWidth)
      );
      const srcCell = c.muted(padCell(event.source, SRC_COL_WIDTH));
      const stepCell = padCell(
        truncate(event.step, MAX_STEP_COL_WIDTH),
        stepWidth
      );
      const typeCell = padCell(
        event.type ? truncate(event.type, MAX_TYPE_COL_WIDTH) : '',
        typeWidth
      );
      // `repeatCount` > 1 means `JourneyDebugAggregator`'s dedup collapsed a
      // run of exact repeats into this one row (see `dedupeAppend`) -- the
      // same "message repeated N times" convention syslog-style loggers
      // use, so a burst of identical noise takes one row instead of N.
      const repeatSuffix =
        event.repeatCount && event.repeatCount > 1
          ? c.muted(` (×${event.repeatCount})`)
          : '';
      const outcomeCell = `${event.outcome ?? ''}${repeatSuffix}`;
      const row =
        `  ${cursor}${elapsedCell} ${srcCell} ${stepCell} ${typeCell} ${outcomeCell}`.trimEnd();
      lines.push(isActive ? c.command(row) : row);
    });
  }
  return lines.join('\n');
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
  event: JourneyDebugEventEntry
): string {
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

  const labelWidth = Math.max(...properties.map((p) => p.label.length)) + 1;
  return properties
    .map((p) => `${c.emphasis(padCell(`${p.label}:`, labelWidth))} ${p.value}`)
    .join('\n');
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

const journeyDebugPromptImpl = createPrompt<void, JourneyDebugPromptConfig>(
  (config, done) => {
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
    const prefix = usePrefix({ status: done_ ? 'done' : 'idle' });

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
        if (viewMode === 'event') {
          if (key.name === 'escape') {
            setViewMode('detail');
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
        if (viewMode === 'detail') {
          if (key.name === 'escape') {
            setViewMode('list');
          } else if (isSpaceKey(key) && detailSession) {
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
        if (key.name === 'escape') {
          setDone(true);
          done();
        } else if (isEnterKey(key) && sessions.length) {
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

    // Same reasoning as the derived-state try/catch above: any of these
    // render helpers throwing (a malformed session, a raw event field that
    // doesn't stringify the way `formatRawValue` expects, ...) must not be
    // allowed to propagate out of the render call, or @inquirer/core's
    // `cycle()` rejects the whole prompt promise instead of just this one
    // frame. Falls back to a plain error line and keeps the prompt alive
    // for the next poll/keypress to re-render from, rather than exiting.
    try {
      if (derivedError) {
        throw new Error(derivedError);
      }

      if (viewMode === 'event' && detailSession && activeEvent) {
        return [
          `${prefix} ${c.heading('Event detail')}`,
          renderEventDetail(detailSession, activeEvent),
          '',
          c.muted('(↑↓ select another event · esc back to journey detail)'),
          warningLine,
        ]
          .filter(Boolean)
          .join('\n');
      }

      if (viewMode === 'detail' && detailSession) {
        return [
          `${prefix} ${c.heading('Journey detail')}`,
          renderDetail(detailSession, clampedEventIndex),
          '',
          c.muted(
            '(↑↓ select event · enter view event · space pin/unpin · esc back to list)'
          ),
          warningLine,
        ]
          .filter(Boolean)
          .join('\n');
      }

      const filterLabel = describeFilter(
        config,
        aggregator.getResolvedUserIdAlias()
      );

      if (sessions.length === 0) {
        return [
          `${prefix} ${c.heading('Debugging journeys')}`,
          c.muted(
            filterLabel
              ? `No journey activity matching [${filterLabel}] detected yet -- waiting for a match (or check the filter for a typo)...`
              : 'No journey activity detected yet -- waiting for a journey to start (this can take a few minutes)...'
          ),
          c.muted('(esc exit)'),
          warningLine,
        ]
          .filter(Boolean)
          .join('\n');
      }

      // Measured across every tracked session, not just the visible page --
      // otherwise columns would visibly resize every time paging brought a
      // wider (or narrower) value into view.
      const listWidths = computeListColumnWidths(sessions);
      const page = usePagination({
        items: sessions,
        active: clampedActive,
        renderItem: ({ item, isActive }) =>
          renderListRow(item, isActive, listWidths),
        pageSize: 15,
        loop: true,
      });

      return [
        `${prefix} ${c.heading('Debugging journeys')} ${c.muted(`(${sessions.length} tracked)`)}${filterLabel ? ` ${c.muted(`[${filterLabel}]`)}` : ''}`,
        renderListHeader(listWidths),
        page,
        c.muted(
          '(↑↓ navigate · enter drill-down · space pin/unpin · esc exit)'
        ),
        warningLine,
      ]
        .filter(Boolean)
        .join('\n');
    } catch (error) {
      return [
        `${prefix} ${c.heading('Debugging journeys')}`,
        c.negative(
          `Internal error rendering this view, will retry on the next update -- ${error instanceof Error ? error.message : String(error)}`
        ),
        c.muted('(esc exit)'),
        warningLine,
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
);

/**
 * Runs the interactive journey-debugging session until the user presses
 * Escape from the top-level list. Assumes `state`/credentials are already
 * set up by the caller (same convention as `frodo debug`'s other topics).
 */
export async function runJourneyDebugPrompt(
  config: JourneyDebugPromptConfig = {}
): Promise<void> {
  await journeyDebugPromptImpl(config);
}
