/**
 * The interactive tail behind `frodo debug oauth|saml|sync|all`.
 *
 * @remarks
 * The presentation shell for `DebugLogOps`'s event formatters: the
 * cli action injects a `readEvents` loader (the EntityPickers injection
 * pattern -- zero `src/ops` imports here), this prompt buffers events in
 * a capped ring, and renders them inside the shared frame design (Navigate
 * bar + framed panel + `frameStatusTitle`). Replaces the old passive
 * `debugTail()` print loop, which was Ctrl+C-only.
 *
 * Behavior: newest event at the BOTTOM (tail semantics -- the view is a
 * `tail -f`), capped at {@link MAX_TAIL_EVENTS} (drop-oldest). The cursor
 * rides the bottom while it carries the follow sentinel -1 (auto-follow);
 * scrolling up detaches it and pins the visible window to the reviewed
 * event -- new events append below, unseen, never yanking the view -- and
 * scrolling back to the bottom re-arms the follow. First poll replays only ~15s of
 * log backlog (frodo-lib's LogTailStream), so startup is never a flood.
 *
 * Keys: exactly `[⏶⏷] review` and `[ESC] exit` -- a passive tail has
 * nothing to pin, select, or conclude ("silence = key does nothing",
 * the same discipline as the pickers' hint). The first ESC opens the
 * double-ESC grace (ExitAll.ts); the second exits everything.
 */
import {
  createPrompt,
  ExitPromptError,
  isDownKey,
  isUpKey,
  useEffect,
  useKeypress,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core';
import c from '../ColorTheme';
import { armEscapeGrace, EXIT_ALL, EXIT_ALL_SIGNAL } from './ExitAll';
import {
  frameStatusTitle,
  navigationMenuItems,
  renderFramedBox,
  renderNavigationMenu,
  wrapLine,
} from './NavigationMenu';

/** The ring-buffer capacity: a busy tenant's ~15s `am-everything` backlog can exceed 200 events, but the cap means the panel always shows the LATEST 200 -- correct tail semantics. */
const MAX_TAIL_EVENTS = 200;

/** How many wrapped rows render at once (the visible window ending at the cursor). */
const PAGE_SIZE = 18;

const POLL_INTERVAL_MS = 5000;

/**
 * One tail event, ready to draw: the pre-formatted line (whatever
 * `formatDebugEvent` produced -- plain text by contract) and the source
 * event's timestamp, rendered muted as `HH:MM:SS` when present.
 * Defined in `utils/interactive` (shared vocabulary -- the cli action
 * imports this type to build its loader).
 */
export type TailEvent = {
  /** The source event's ISO timestamp, when the log API supplied one. */
  timestamp?: string;
  /** The pre-formatted, single-line event text. */
  line: string;
};

/** Loader injected by the cli action: one poll's worth of events, already mapped through the ops formatters. */
export type TailEventLoader = () => Promise<TailEvent[]>;

/** `frofo debug <topic>`'s prompt config -- labels resolved by the cli action (the alias the user typed survives nowhere else; see debug-tail-topic.ts). */
export interface DebugTailPromptConfig {
  topic: string;
  /** The connection alias or host part, e.g. `volker-dev`. */
  hostLabel: string;
  /** The normalized realm token, e.g. `alpha` (empty realm renders `root`). */
  realmLabel: string;
  /** The injected loader (see TailEventLoader). */
  readEvents: TailEventLoader;
}

/** Drops the date part of an ISO timestamp, keeping `HH:MM:SS` (log lines are a same-session stream; the date is noise). */
export function formatTailTimestamp(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  const time = iso.match(/[T ](\d{2}:\d{2}:\d{2})/);
  return time ? time[1] : iso;
}

/** One rendered panel row (shared shape with JourneyDebugPrompt). */
type PanelRow = { text: string; plain: string };

/**
 * Builds the panel rows for the visible window: `HH:MM:SS` muted prefix +
 * the event line, word-wrapped to the frame with continuation rows
 * indented past the timestamp column (wrapLine strips ANSI, so this only
 * receives plain lines -- the formatters' output is plain by contract).
 * `endIndex` bounds the window: rows for events `0..endIndex` inclusive,
 * returning at most the LAST `limit` visual rows of that slice (the tail
 * is the newest-at-bottom list, so the review window also slides at its
 * bottom edge -- never at the top, which would hide the re-follow path).
 * Pass `events.length - 1` for follow mode (or just omit it).
 */
export function buildTailRows(
  events: TailEvent[],
  limit: number = PAGE_SIZE,
  innerWidth: number = 116,
  endIndex: number = events.length - 1
): PanelRow[] {
  const TS_COL = 11; // 'HH:MM:SS' + one space -- continuation rows indent past it
  // Wrap every event first (cheap: at most MAX_TAIL_EVENTS short lines),
  // then take the last `limit` visual rows of the 0..endIndex slice.
  const allRows: PanelRow[] = [];
  for (const event of events.slice(0, endIndex + 1)) {
    const ts = c.muted(formatTailTimestamp(event.timestamp));
    const plainTs = formatTailTimestamp(event.timestamp);
    const rows = wrapLine(event.line, innerWidth - TS_COL);
    rows.forEach((part, index) => {
      const plain =
        index === 0 ? `${plainTs} ${part}` : `${' '.repeat(TS_COL)}${part}`;
      allRows.push({
        text:
          index === 0
            ? `${ts} ${part}`
            : `${c.muted(' '.repeat(TS_COL))}${part}`,
        plain,
      });
    });
  }
  return allRows.slice(-limit);
}

/** The ring-buffer append: newest at the end, drop-oldest past the cap (exported for the unit tests). */
export function appendTailEvent(
  buffer: TailEvent[],
  event: TailEvent,
  cap: number = MAX_TAIL_EVENTS
): TailEvent[] {
  const next = [...buffer, event];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * Follow-resume: after new events append, the cursor stays pinned to the
 * last row ONLY if it carries the follow sentinel (classic `tail -f`); a
 * detached cursor (reviewing history) stays put. Exported for the unit
 * tests.
 *
 * @param wasAtBottom Whether the cursor was in follow mode (-1) before the append.
 */
export function resolveFollowCursor(
  wasAtBottom: boolean,
  newBufferLength: number,
  lastIndexBefore: number
): number {
  return wasAtBottom ? -1 : Math.min(lastIndexBefore, newBufferLength - 1);
}

const debugTailPromptImpl = createPrompt<
  void | typeof EXIT_ALL,
  DebugTailPromptConfig
>((config, done) => {
  const [events, setEvents] = useState<TailEvent[]>([]);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [done_, setDone] = useState(false);
  const [escapeGraceOpen, setEscapeGraceOpen] = useState(false);
  const prefix = usePrefix({ status: done_ ? 'done' : 'idle' });

  // Cursor is an INDEX into the ring buffer. -1 means "at bottom"
  // (follow mode) -- resolved to the actual last index at render, so a
  // poll appending events never strands a stale numeric index.
  const [cursorIndex, setCursorIndex] = useState(-1);
  const cursorIndexRef = useRef(cursorIndex);
  cursorIndexRef.current = cursorIndex;

  // The double-ESC grace (ExitAll.ts -- same mechanism as the pickers
  // and the journey debugger): first ESC opens the window; second
  // exits all; expiry exits this prompt.
  const escapeGraceRef = useRef<ReturnType<typeof armEscapeGrace> | undefined>(
    undefined
  );
  useEffect(() => () => escapeGraceRef.current?.dispose(), []);

  const resolveExit = (exitAll: boolean) => {
    setEscapeGraceOpen(false);
    setDone(true);
    done(exitAll ? EXIT_ALL : undefined);
  };

  // Poll loop (JourneyDebugPrompt's useEffect pattern): 5s interval,
  // inFlight/cancelled guards, catch -> transient warning line. The
  // loader closure (stream + formatters) lives in the cli action.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const runPoll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const incoming = await config.readEvents();
        if (cancelled) return;
        setWarning(undefined);
        if (incoming.length > 0) {
          setEvents((previous) => {
            let next = previous;
            for (const event of incoming) {
              next = appendTailEvent(next, event);
            }
            // Follow semantics live in ONE place (`resolveFollowCursor`,
            // unit-tested): the follow sentinel (-1) keeps following --
            // staying -1 is what makes the render's `cursorIndex === -1`
            // check honest -- while a detached (reviewing) cursor keeps
            // its index, clamped against the ring's drop-oldest.
            setCursorIndex((cursorBefore) =>
              resolveFollowCursor(
                cursorBefore === -1,
                next.length,
                cursorBefore
              )
            );
            return next;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWarning(
            `debug: poll failed, will retry -- ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } finally {
        inFlight = false;
      }
    };
    void runPoll();
    const interval = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config.readEvents]);

  useKeypress((key) => {
    if (done_) return;
    if (key.name === 'escape') {
      if (escapeGraceRef.current) {
        const grace = escapeGraceRef.current;
        escapeGraceRef.current = undefined;
        grace.secondEscape();
        return;
      }
      setEscapeGraceOpen(true);
      escapeGraceRef.current = armEscapeGrace({
        onSecondEscape: () => resolveExit(true),
        onGraceExpire: () => resolveExit(false),
      });
      return;
    }
    // Any other key breaks the double-ESC streak.
    escapeGraceRef.current?.otherKey();
    escapeGraceRef.current = undefined;
    setEscapeGraceOpen(false);
    if (isUpKey(key) || isDownKey(key)) {
      // Clamp at the ends (no wrap -- same discipline as the pickers).
      // Functional update: fast repeated presses within one render
      // cycle must each move (see EscapableSelectPrompt's comment).
      setCursorIndex((previous) => {
        const last = events.length - 1;
        if (last < 0) return -1;
        const base = previous === -1 ? last : previous;
        const next = base + (isUpKey(key) ? -1 : 1);
        if (isUpKey(key)) {
          // Up DETACHES: from follow mode it lands on the (previously
          // bottom) last row; from a detached cursor it keeps moving up,
          // clamped at the top. The render pins the visible window to
          // this index, so new events append below, unseen.
          return Math.max(0, next);
        }
        // Moving DOWN past the last row returns to follow mode (-1) --
        // the user's intent is clearly "back to the tail". The extra
        // `last - 1` allowance covers the poll race: a poll may have
        // appended under the cursor between presses, leaving it one
        // short of the new bottom, and Down still means re-follow.
        return next >= last - 1 ? -1 : Math.max(0, next);
      });
    }
  });

  if (done_) {
    return `${prefix} Debug tail ended.`;
  }

  // Render (try/catch so one bad row can't reject the whole prompt --
  // same last-line-of-defense as JourneyDebugPrompt).
  try {
    // The follow sentinel IS the branch: -1 renders the newest window
    // (and no indicator); any numeric index renders the historical
    // window ending at the reviewed event, plus the reviewing indicator.
    const isFollowing = cursorIndex === -1;
    const rows = buildTailRows(
      events,
      PAGE_SIZE,
      116,
      isFollowing ? events.length - 1 : cursorIndex
    );
    const graceLine = escapeGraceOpen
      ? ({
          text: c.muted('esc again to exit all -- or wait to exit'),
          plain: 'esc again to exit all -- or wait to exit',
        } as PanelRow)
      : undefined;

    const panelLines: PanelRow[] = [];
    if (graceLine) panelLines.push(graceLine);
    if (rows.length === 0) {
      panelLines.push({
        text: c.muted('(connected -- waiting for events...)'),
        plain: '(connected -- waiting for events...)',
      });
    } else {
      panelLines.push(...rows);
    }
    if (warning) {
      panelLines.push({ text: c.warning(warning), plain: warning });
    }
    if (!isFollowing && rows.length > 0) {
      panelLines.push({
        text: c.muted('(reviewing history -- scroll down to re-follow)'),
        plain: '(reviewing history -- scroll down to re-follow)',
      });
    }

    return [
      renderNavigationMenu(
        navigationMenuItems({ escape: 'exit · [ESC]×2 exit all' })
      ),
      renderFramedBox({
        title: frameStatusTitle(
          `${prefix} Debugging ${config.topic}`,
          [
            `(${config.hostLabel} · ${config.realmLabel})`,
            // Detached cursor: the reviewed position rides the title (the
            // ambient-state convention), following renders no position.
            isFollowing ? undefined : `row ${cursorIndex + 1}/${events.length}`,
          ].filter((suffix): suffix is string => suffix !== undefined)
        ),
        lines: panelLines,
      }),
    ].join('\n');
  } catch (error) {
    return [
      renderNavigationMenu(
        navigationMenuItems({ escape: 'exit · [ESC]×2 exit all' })
      ),
      renderFramedBox({
        title: frameStatusTitle(`${prefix} Debugging ${config.topic}`),
        lines: [
          {
            text: c.negative(
              `Internal error rendering this view, will retry -- ${error instanceof Error ? error.message : String(error)}`
            ),
            plain: `Internal error rendering this view, will retry -- ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }),
    ].join('\n');
  }
});

/**
 * Runs the interactive debug tail until the user exits (ESC, 400ms grace)
 * or exits all the way out (fast double-ESC). Ctrl+C rejects with
 * ExitPromptError and resolves to a clean, silent exit (erase-on-conclude
 * has already restored the screen).
 */
export async function runDebugTailPrompt(
  config: DebugTailPromptConfig
): Promise<void> {
  try {
    const result = await debugTailPromptImpl(config, {
      clearPromptOnDone: true,
    });
    if (result === EXIT_ALL) throw EXIT_ALL_SIGNAL;
  } catch (error) {
    if (error instanceof ExitPromptError) return;
    throw error;
  }
}
