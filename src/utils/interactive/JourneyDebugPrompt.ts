/**
 * The interactive list/drill-down view behind `frodo debug --topic journey`.
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
const MAX_DETAIL_EVENTS = 20;

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
      ? c.muted(`- ${session.failureReason}`)
      : session.lastNode
        ? c.muted(`@ ${session.lastNode}`)
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
    let elapsedWidth = 'ELAPSED'.length;
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
        `    ${padCell('ELAPSED', elapsedWidth)} ${padCell('STEP', stepWidth)} ${padCell('TYPE', typeWidth)} OUTCOME`
      )
    );
    shown.forEach((event, index) => {
      const isActive = index === activeEventIndex;
      const cursor = isActive ? '› ' : '  ';
      const elapsedCell = c.muted(
        padCell(`+${formatElapsed(event.at - session.startedAt)}`, elapsedWidth)
      );
      const stepCell = padCell(
        truncate(event.step, MAX_STEP_COL_WIDTH),
        stepWidth
      );
      const typeCell = padCell(
        event.type ? truncate(event.type, MAX_TYPE_COL_WIDTH) : '',
        typeWidth
      );
      const outcomeCell = event.outcome ?? '';
      const row =
        `  ${cursor}${elapsedCell} ${stepCell} ${typeCell} ${outcomeCell}`.trimEnd();
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
  const properties: PropertyRow[] = [{ label: 'Step', value: event.step }];
  if (event.type) properties.push({ label: 'Type', value: event.type });
  if (event.outcome)
    properties.push({ label: 'Outcome', value: event.outcome });
  properties.push({
    label: 'Elapsed',
    value: `+${formatElapsed(event.at - session.startedAt)}`,
  });
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

const journeyDebugPromptImpl = createPrompt<void, Record<string, never>>(
  (_config, done) => {
    const aggregator = useState(() => new JourneyDebugAggregator())[0];
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
        // Reset to this cycle's outcome only -- a warning is a transient
        // "something went wrong just now" signal, not a permanent banner.
        // Without this, a single early hiccup (e.g. one export failure)
        // would stay pinned on screen forever even once later polls
        // succeed cleanly.
        let latestWarning: string | undefined;
        await aggregator.poll((message) => {
          latestWarning = message;
        });
        if (!cancelled) {
          setWarning(latestWarning);
          setSessions(aggregator.getSessions());
        }
        inFlight = false;
      };
      void runPoll();
      const interval = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [aggregator]);

    // Re-resolved from `activeId` every render, not carried over as a raw
    // number -- this is what keeps the cursor glued to the same session
    // across a resort. Falls back to the top of the list if that session
    // is no longer tracked at all (e.g. evicted).
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

    useKeypress((key) => {
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
          setSelectedEventId(nextEvent.id ?? String(nextIndex));
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
          setSelectedEventId(activeEvent?.id ?? String(clampedEventIndex));
          setViewMode('event');
        } else if ((isUpKey(key) || isDownKey(key)) && shownEvents.length) {
          const offset = isUpKey(key) ? -1 : 1;
          const nextIndex =
            (clampedEventIndex + offset + shownEvents.length) %
            shownEvents.length;
          const nextEvent = shownEvents[nextIndex];
          setSelectedEventId(nextEvent.id ?? String(nextIndex));
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
    });

    if (done_) {
      return `${prefix} Journey debugging ended.`;
    }

    const warningLine = warning ? c.warning(warning) : '';

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

    if (sessions.length === 0) {
      return [
        `${prefix} ${c.heading('Debugging journeys')}`,
        c.muted(
          'No journey activity detected yet -- waiting for a journey to start (this can take a few minutes)...'
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
      `${prefix} ${c.heading('Debugging journeys')} ${c.muted(`(${sessions.length} tracked)`)}`,
      renderListHeader(listWidths),
      page,
      c.muted('(↑↓ navigate · enter drill-down · space pin/unpin · esc exit)'),
      warningLine,
    ]
      .filter(Boolean)
      .join('\n');
  }
);

/**
 * Runs the interactive journey-debugging session until the user presses
 * Escape from the top-level list. Assumes `state`/credentials are already
 * set up by the caller (same convention as `frodo debug`'s other topics).
 */
export async function runJourneyDebugPrompt(): Promise<void> {
  await journeyDebugPromptImpl({});
}
