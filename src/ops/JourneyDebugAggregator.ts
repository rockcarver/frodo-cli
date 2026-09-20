/**
 * Session-aggregating engine behind `frodo debug journey`'s
 * interactive list.
 *
 * @remarks
 * Turns a stream of raw `am-authentication` log events (via
 * `frodo.cloud.log.createLogTailStream()` -- the same deduped `tail()`
 * wrapper `frodo log tail`/`frodo debug`'s other topics also use, so
 * `tail()`'s own documented redelivery behavior is handled once, centrally,
 * in frodo-lib rather than by every consumer) into a live
 * `Map<sessionKey, JourneySession>`.
 *
 * Grouping is *not* simply "by `transactionId`" -- confirmed live against a
 * real `MultiplePushDevicesExample` login that AM assigns a genuinely
 * different `transactionId` to each polling leg of a wait-node-based flow
 * (Select Push Device / Send Push / Wait For Push / Verify Push each got
 * their own), which without correlation showed up as four separate,
 * unrelated-looking sessions for one real login attempt. Every leg's events
 * do, however, carry the flow's very first event id in `trackingIds` --
 * `resolveSessionKey()` uses that (transitively, via `trackingIndex`) to
 * fold every later transactionId back onto the session's original key, so a
 * plain non-polling tree (the common case, still keyed by its one and only
 * `transactionId`) and a polling one are both handled by the same path.
 *
 * Deliberately tolerant of "nothing happening yet": a real admin session can
 * easily sit at zero running journeys for minutes until someone actually
 * starts one, and every method here treats that as a normal empty state,
 * never an error. Likewise, a transient `tail()`/export/settings-read
 * failure is swallowed and retried on the next poll rather than surfaced as
 * a hard failure -- nothing in here throws.
 *
 * Also polls `am-core` and `idm-access` (see `debugTailStream`) for lines
 * correlated to an already-tracked session by transaction id, since AM's
 * `am-authentication` audit model only ever records `*-COMPLETED` events
 * (no "node started" event exists at any level) -- a node that throws
 * mid-execution, or a node's own IDM REST call that fails, leaves nothing
 * on the audit trail beyond the tree's own terminal failure. `am-core` is
 * where AM actually logs the failing node's own error messages (confirmed
 * live against a real `ScriptedDecisionNode` failure: separate lines for
 * `"error evaluating the script"`, `"An error occurred during scripted
 * node processing"`, and a `ThreadPoolScriptEvaluator`-logged summary,
 * each carrying the same underlying Java stack trace as `exception`).
 * `idm-access` is where a *failed* IDM call a node made shows up (e.g. the
 * same test's `openidm.patch()` against a nonexistent managed object,
 * confirmed live as a `PATCH` with `response.status: 'FAILED'` and a
 * `404` detail) -- correlated the same way, but filtered on
 * `response.status` instead of a log level (see `ingestIdmAccessEvent()`'s
 * own remarks on why).
 *
 * Neither source's own `transactionId` lines up with the journey's the way
 * it looks like it should at first -- confirmed live that even the
 * journey's *own* `am-authentication` transactionId can already be
 * `<uuid>/0` (not the bare `<uuid>` it's tempting to assume), with an
 * internal AM lookup on the very same request logged one or more segments
 * deeper still (`<uuid>/0/0/0`), and the `idm-access` call itself deeper
 * still again. There's no fixed number of segments that reliably separates
 * "the session's id" from "the nesting", so `resolveDebugSessionKey()`
 * walks upward one path segment at a time -- trying the id exactly as
 * given first, since that's the common single-node-failure case -- rather
 * than assuming any specific depth. Deliberately never starts a new
 * session by itself (only `ingest()`'s node/tree events can, via
 * `resolveSessionKey()`) and only surfaces WARN/ERROR/FATAL am-core lines
 * -- INFO/DEBUG-level am-core traffic is high-volume and mostly irrelevant
 * to a specific journey's own failure. `idm-core` (IDM's *own*
 * debug-level source, the analogue of `am-core`) is deliberately never
 * polled at all -- confirmed live its lines carry no transactionId
 * whatsoever (plain `java.util.logging` text), so there would be nothing
 * to correlate it by.
 *
 * Abandoned-detection deliberately goes after the realm's own
 * authentication-session lifetime settings
 * (`authenticationSessionsMaxDuration`/`suspendedAuthenticationTimeout`, via
 * `frodo.authn.settings.readAuthenticationSettings()`) rather than any
 * node-type heuristic -- a hand-scripted flow is bound by the same
 * realm-wide limit as a marketplace IDV node, so node type alone can't
 * reliably predict abandonment. A per-tree `UpdateJourneyTimeoutNode`
 * override is folded in by reading the journey's own cached definition
 * (`frodo.authn.journey.exportJourney()`) -- confirmed live that this
 * override is only ever knowable from the static definition, never from the
 * runtime event stream itself (a real test journey using the node produced
 * an `AM-NODE-LOGIN-COMPLETED` event with no timeout data at all).
 */
import { frodo, state } from '@rockcarver/frodo-lib';
import type { LogEventSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/LogApi';

import {
  compactFailureReason,
  type DebugLogPayload,
  decodeHtmlEntities,
  getAuditPayload,
  getDebugLogPayload,
} from './DebugLogOps';

const { createLogTailStream } = frodo.cloud.log;
const { exportJourney } = frodo.authn.journey;
const { readAuthenticationSettings } = frodo.authn.settings;
const { getServiceAccount } = frodo.cloud.serviceAccount;
const { resolveIdentity, queryManagedObjects } = frodo.idm.managed;
const { getRealmName } = frodo.utils;

// The well-known internal tree AM itself uses for JWT-bearer service-account
// login (confirmed live against `volker-dev`) -- its `principal` is a raw
// service-account UUID, not a human-readable identity, so it's the one case
// where resolving `user` to a display name via `getServiceAccount()` is
// worth the extra lookup.
const SERVICE_ACCOUNT_INTERNAL_TREE = 'FRServiceAccountInternal';

// `am-core` levels worth surfacing on an already-tracked session -- see
// this file's own top-level remarks. INFO/DEBUG/TRACE am-core traffic is
// high-volume and mostly irrelevant to one specific journey's failure, so
// it's never even considered here.
const DEBUG_LEVELS_TO_SURFACE = new Set(['WARN', 'ERROR', 'FATAL']);

/**
 * `am-core` WARN chatter observed live (2026-09-20) on a real, entirely
 * *successful* `FRLogin` run against the `volker-dev` tenant -- confirmed to
 * have nothing to do with any specific node's own correctness (the tree
 * finished fine), just AM logging routine internal repository/config lookups
 * on every run regardless of outcome. Log level alone (`DEBUG_LEVELS_TO_SURFACE`)
 * isn't a reliable noise signal, since AM logs this at WARN too.
 *
 * Deliberately narrow and substring-matched against the *exact* observed
 * message text, never a broad heuristic like "any IdServicesImpl WARN" --
 * this list should only grow from further live confirmation, not
 * speculation about what else might be noise.
 *
 * IMPORTANT caveat: the first five entries below are only confirmed against
 * one tenant (`volker-dev`) so far, not cross-tenant. The standing bar for
 * calling something genuine, safe-to-suppress platform noise (rather than
 * something tied to one tenant's own config/data) is seeing it recur
 * identically across *multiple* different AIC tenants -- that hasn't been
 * done yet for those five, so treat them as provisional until it has been.
 * `SSOTokenFactory` below has cleared that bar: confirmed live (2026-09-21)
 * with byte-identical logger/message text on both `volker-dev` and
 * `frodo-dev`, each time during an otherwise entirely successful `FRLogin`
 * run (a stale/expired session lookup at the very start of a fresh login,
 * unrelated to the eventual outcome either time).
 */
const CONFIRMED_NOISE_PATTERNS: ReadonlyArray<{
  logger: string;
  messageIncludes: string;
}> = [
  { logger: 'IdServicesImpl', messageIncludes: 'Not a valid entry:' },
  { logger: 'IdServicesImpl', messageIncludes: 'of type user not found.' },
  {
    logger: 'TokenStoreUtils',
    messageIncludes: 'Could not get list of auth modules from authentication',
  },
  {
    logger: 'ScriptedNodeHelper',
    messageIncludes:
      'Found an action result from scripted node, but it was not an Action object',
  },
  {
    logger: 'ValidGotoUrlExtractor',
    messageIncludes:
      'Unable to retrieve instance of the ValidationServiceConfig for realm',
  },
  {
    logger: 'SSOTokenFactory',
    messageIncludes: 'Failed to create SSO Token: Invalid session ID',
  },
];

/** Whether an `am-core` line matches a `CONFIRMED_NOISE_PATTERNS` entry -- see that constant's own remarks. `shortLogger` is the already-shortened last-FQCN-segment form `ingestAmCoreEvent` computes, matching how the pattern list's `logger` values are written. */
function isConfirmedNoise(
  shortLogger: string | undefined,
  message: string | undefined
): boolean {
  if (!shortLogger || !message) return false;
  return CONFIRMED_NOISE_PATTERNS.some(
    (pattern) =>
      pattern.logger === shortLogger &&
      message.includes(pattern.messageIncludes)
  );
}

// Matches a bare managed-object uuid (confirmed live: AIC's own `_id` values,
// e.g. `03f4f90e-d1fa-433d-bc67-6349a8a6ca77`) -- used to decide which
// direction to resolve a `-u/--user-id` filter value in, see
// `resolveUserIdAlias()`.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JourneySessionStatus =
  'running' | 'suspended' | 'finished' | 'failed' | 'abandoned';

/**
 * One entry in a session's event history, kept structured (not a
 * pre-formatted string) so the UI can render it as real table columns
 * rather than parsing text back apart. The three event kinds this ever
 * gets built from -- node-completed, tree-completed, and a bare
 * login-completed (e.g. a nested internal service call sharing this
 * transaction's id) -- don't share a uniform shape, so `type`/`outcome`
 * mean something slightly different depending on `step`; see `ingest()`.
 */
export interface JourneyDebugEventEntry {
  at: number;
  /**
   * A per-session sequence number (assigned at ingestion, see
   * `ingest()`), not the raw log event's own id -- confirmed live that
   * `tail()`-sourced events never carry one at all (unlike `fetch()`'s),
   * so an earlier version of this field that preferred the raw id left
   * it permanently `undefined` in the real interactive command, which
   * silently broke event selection: the UI's fallback selection key was
   * never actually attached to anything to find again on the next
   * render, so the cursor could never move off the first row. Always
   * present and always unique within one session, regardless of the
   * source event's own shape.
   */
  id: string;
  /** Which system actually emitted this event -- 'AM' for everything from `ingest()` (the `am-authentication` audit trail) and `ingestAmCoreEvent()`; 'IDM' for `ingestIdmAccessEvent()`. Lets the UI show a SRC column so a mixed-source event history (a failure that spans an AM node and the IDM call it made) reads at a glance instead of requiring a drill-down into each row to tell them apart. */
  source: 'AM' | 'IDM';
  /** Node display name for a node event; a short fixed label ('Tree completed', 'Login') otherwise. */
  step: string;
  /** Node type for a node event; the AM result word (SUCCESSFUL/FAILED) for a tree-completed or login event. */
  type?: string;
  /** Node outcome for a node event; the (failure-enriched, see `session.failureReason`) result detail for a tree-completed event; `as <principal>` for a login event. */
  outcome?: string;
  /** Extra raw fields for this one event, shown in the UI's per-event drill-down -- whatever's actually present varies by event kind (see `ingest()`), so this is a plain bag rather than a fixed shape. */
  raw?: Record<string, unknown>;
  /**
   * How many consecutive times (including this one) an event with the same
   * `source`/`step`/`type`/`outcome` occurred in a row -- see
   * `dedupeAppend()`. Absent/`1` means it occurred once; the UI renders
   * `(×N)` for anything higher, the same convention syslog-style loggers use
   * ("message repeated N times") rather than showing every identical line
   * as its own row. `at` is kept updated to the *latest* occurrence's
   * timestamp when this increments, so the displayed elapsed time reflects
   * when the run last hit this state, not when it first did.
   */
  repeatCount?: number;
}

export interface JourneySession {
  transactionId: string;
  treeName?: string;
  status: JourneySessionStatus;
  /** Raw principal/userId as it appears on the log event -- for `FRServiceAccountInternal` this is a service-account UUID, not human-readable (see `userDisplayName`). */
  user?: string;
  /** Resolved human-readable name for `user`, when it's a service-account UUID (`FRServiceAccountInternal` only) and resolution has succeeded. Falls back to `user` itself when absent. */
  userDisplayName?: string;
  startedAt: number;
  lastEventAt: number;
  /**
   * When the session first became terminal (finished/failed/abandoned), if
   * it currently is. For finished/failed this equals `lastEventAt` (the
   * terminal event itself); for abandoned it can be long after
   * `lastEventAt`, since abandonment is only detected on a later sweep once
   * the effective threshold has elapsed -- eviction's grace window is
   * measured from here, not from `lastEventAt`, so a long-running journey
   * that finally gets tagged abandoned isn't evicted in the very same
   * sweep that tagged it.
   */
  terminalAt?: number;
  /** The effective abandoned-after duration (realm base combined with any per-tree override) computed for this session as of the last sweep -- set only once a sweep has actually run with a resolved realm/tree lookup, so the UI can cite an accurate number instead of guessing. */
  abandonedAfterMinutes?: number;
  nodeCount: number;
  lastNode?: string;
  /** The outcome `lastNode` completed with -- e.g. a redirect-bound outcome like `socialAuthentication` right before the tree goes quiet or fails, since AM's own audit log never names whatever node comes next for that outcome (confirmed live: a generic tree-level failure like "Node processing failed" carries no node id at all). */
  lastNodeOutcome?: string;
  failureReason?: string;
  pinned: boolean;
  /** Human-readable event history for drill-down, oldest first -- capped, see `MAX_EVENTS_PER_SESSION`. */
  events: JourneyDebugEventEntry[];
  /**
   * How many confirmed-noise `am-core` lines are currently being held back
   * from `events` for this session -- see `bufferSuppressedNoise()`. Exists
   * so the UI can show *that* filtering happened instead of leaving it
   * ambiguous whether a clean event list means "nothing to filter" or
   * "something was filtered and you can't tell" (confirmed live: those two
   * cases are otherwise indistinguishable from the outside, e.g. comparing
   * a quiet tenant against a noisy one). Reset to 0 once
   * `flushSuppressedNoise()` moves everything into `events` on failure,
   * since nothing is being held back anymore at that point. Absent/`0` for
   * a session that has never had anything suppressed.
   */
  suppressedNoiseCount?: number;
}

// Realm default when the setting can't be read at all (matches the live
// AIC default observed this session, `authenticationSessionsMaxDuration: 5`
// minutes) -- used only as a last-resort fallback, never assumed silently
// correct when the real value is reachable.
const FALLBACK_SESSION_MINUTES = 5;

// How long a completed (finished/failed/abandoned) session stays visible in
// the list after its last event before being dropped, unless pinned.
const EVICT_AFTER_COMPLETION_MS = 10 * 60 * 1000;

// Hard cap on total tracked sessions, regardless of pin state -- the last
// line of defense against unbounded memory growth on a long-running debug
// session. Non-pinned, oldest-by-last-activity sessions are evicted first;
// if every tracked session is pinned and the cap is still exceeded, the
// oldest pinned ones go too (a deliberate safety valve, not a bug).
const MAX_TRACKED_SESSIONS = 500;

// Cap on stored per-session event history -- a long-running IDV/magic-link
// journey could otherwise accumulate an unbounded number of node events.
const MAX_EVENTS_PER_SESSION = 200;

// Cap on a session's rolling buffer of confirmed-noise am-core lines held
// back from `session.events` (see `bufferSuppressedNoise`) -- only ever
// flushed into the real event history if the session goes on to fail, so
// this just bounds how much *pre-failure* context a failure explanation can
// pull in, not overall memory for a long successful run (which never
// accumulates anything here beyond this cap either).
const MAX_SUPPRESSED_NOISE = 15;

// How long to wait before retrying a failed journey-definition export or
// realm-settings read, so a permission/transient error doesn't turn into a
// retry storm every 5-second poll cycle.
const FAILED_LOOKUP_RETRY_MS = 60 * 1000;

interface JourneyDefinitionCacheEntry {
  /**
   * Raw `UpdateJourneyTimeoutNode` configs found in the tree, kept
   * unresolved (not pre-combined with the realm base) because a `MODIFY`
   * operation is a delta applied to the realm's own base duration, and the
   * realm settings are fetched independently/lazily -- both pieces are only
   * safely combined together at sweep time, once each is actually known.
   */
  overrides: UpdateJourneyTimeoutNodeConfig[];
  /** Whether the tree contains any node that can suspend the session (e.g. Email Suspend) -- best-effort, used only to widen the abandoned-after grace window, never to assert a session is currently suspended. */
  canSuspend: boolean;
  lastAttemptAt: number;
  resolved: boolean;
}

interface ServiceAccountCacheEntry {
  /** Absent when resolution has been tried and definitively found no such service account (e.g. a 404) -- distinct from not-yet-attempted, which isn't cached at all. */
  name?: string;
  lastAttemptAt: number;
  resolved: boolean;
}

interface RealmSettingsCacheEntry {
  authenticationSessionsMaxDuration?: number;
  suspendedAuthenticationTimeout?: number;
  lastAttemptAt: number;
  resolved: boolean;
}

type UpdateJourneyTimeoutNodeConfig = {
  operation?: 'SET' | 'MODIFY';
  value?: number;
};

/**
 * Narrows which tracked sessions `getSessions()` returns -- e.g.
 * `frodo debug journey`'s `-i/--journey-id`/`-u/--user-id` options. Both
 * fields are case-insensitive substring matches (not exact), the same
 * forgiving convention the MCP server's own `cloud.log.searchEvents`
 * principal filter already uses -- a user debugging live rarely has the
 * exact, full tree name or principal UUID memorized or copy-pasted.
 * Filtering happens only in `getSessions()`, not at ingestion: every
 * session is still tracked, cached, swept, and evicted normally regardless
 * of whether it currently matches, so a `userId` filter (whose match target
 * often isn't known until partway through a run -- see `ingest()`'s own
 * remarks on `user` enrichment) doesn't have to guess at session-creation
 * time whether a not-yet-resolved user will turn out to match.
 *
 * `userId` specifically also gets a best-effort username<->uuid resolution
 * (see `resolveUserIdAlias()`) -- confirmed live against `volker-dev` that
 * which form a session's `user` actually holds is genuinely inconsistent:
 * a plain password login's `principal` is the human `userName` (e.g.
 * `"amos"`), while `FRServiceAccountInternal`'s is a raw managed-object
 * uuid. A user who only has one of the two forms in hand (e.g. a uuid
 * copied from an unrelated error, or a username from a support ticket)
 * would otherwise get zero matches against a session recorded in the other
 * form.
 */
export interface JourneyDebugFilter {
  /** Matched against `JourneySession.treeName`. */
  journeyId?: string;
  /** Matched against `JourneySession.user` and `userDisplayName` -- either matching is enough. */
  userId?: string;
}

/**
 * Live-updating session aggregator for one `frodo debug journey`
 * run. Owns the deduped tail stream (see `createLogTailStream()` in
 * frodo-lib -- cookie-tracking and redelivery-dedup both live there now,
 * not here), the session map, the per-tree journey-definition cache, and
 * the realm authentication-settings cache. Call `poll()` on an interval
 * (the UI layer owns the timer) and read `getSessions()` after each call to
 * re-render.
 */
export class JourneyDebugAggregator {
  private sessions = new Map<string, JourneySession>();
  private treeCache = new Map<string, JourneyDefinitionCacheEntry>();
  private serviceAccountCache = new Map<string, ServiceAccountCacheEntry>();
  private realmSettings: RealmSettingsCacheEntry | undefined;
  private tailStream = createLogTailStream('am-authentication');
  /**
   * `am-core` and `idm-access` polled as one combined stream (`tail()`'s
   * `source` param accepts a comma-joined list, same as `frodo debug all`'s
   * `am-everything,idm-everything`) -- both are correlated
   * to an already-tracked session the same way (see
   * `resolveDebugSessionKey()`), so one stream/cookie is simpler than two.
   * `ingestDebugEvent()` tells the two payload shapes apart per event (see
   * `DebugLogPayload`'s own remarks). A separate stream from `tailStream`
   * above so a failure polling one never blocks the other -- `poll()`
   * wraps each in its own try/catch for the same reason.
   */
  private debugTailStream = createLogTailStream('am-core,idm-access');
  /**
   * Maps any correlation id seen so far (a `transactionId`, or one of an
   * event's `trackingIds`) to the session-key it belongs to -- see
   * `resolveSessionKey()`. The reverse index, `sessionAliases`, exists
   * purely so eviction/the hard cap can remove a session's entries here
   * too instead of leaking them for the rest of the debug run.
   */
  private trackingIndex = new Map<string, string>();
  private sessionAliases = new Map<string, Set<string>>();
  /** Next `JourneyDebugEventEntry.id` to assign per session key -- see that field's own remarks. Cleaned up alongside `trackingIndex`/`sessionAliases` on eviction. */
  private eventSeqCounters = new Map<string, number>();
  /** Per-session rolling buffer of confirmed-noise `am-core` lines held back from `session.events`, see `bufferSuppressedNoise()`/`flushSuppressedNoise()`. Cleaned up alongside the maps above on eviction. */
  private suppressedNoiseBuffer = new Map<string, JourneyDebugEventEntry[]>();

  /** The `-u/--user-id` filter's resolved counterpart (uuid if given a username, username if given a uuid) once `resolveUserIdAlias()` succeeds -- a one-shot, best-effort, fire-and-forget lookup (there's exactly one filter value for the aggregator's whole lifetime, so no map-based cache like the tree/service-account caches below is needed). `undefined` until/unless resolution succeeds; matching still falls back to the literal filter value regardless. */
  private resolvedUserIdAlias: string | undefined;

  constructor(private readonly filter: JourneyDebugFilter = {}) {
    if (this.filter.userId) this.resolveUserIdAlias(this.filter.userId);
  }

  /**
   * Best-effort username<->uuid resolution for a `-u/--user-id` filter
   * value -- see `JourneyDebugFilter`'s own remarks for why this exists.
   * Fire-and-forget: never awaited, never throws, and a failure (including
   * simply not finding a match) just leaves `resolvedUserIdAlias`
   * `undefined`, degrading to literal-only matching rather than breaking
   * the filter.
   */
  private resolveUserIdAlias(userId: string): void {
    const realm = getRealmName(state.getRealm());
    if (UUID_REGEX.test(userId)) {
      // uuid given -- resolve to the username (or service-account/admin
      // name) it belongs to. Deliberately never throws or warns on "not
      // found"/permission errors: this is a nice-to-have widening of an
      // already-working literal filter, not a correctness-critical path.
      resolveIdentity(userId, realm)
        .then((identity) => {
          if (identity.username) this.resolvedUserIdAlias = identity.username;
        })
        .catch(() => undefined);
      return;
    }
    // A double-quote would break out of the CREST filter string below --
    // same filter-injection caution `cloud.log.searchEvents` already takes
    // (see its own remarks) -- so just skip the reverse-lookup enhancement
    // for a value that could never legally be a userName anyway.
    if (userId.includes('"')) return;
    queryManagedObjects(`${realm}_user`, `userName eq "${userId}"`, ['_id'], 1)
      .then((results) => {
        const id = results?.[0]?._id;
        if (typeof id === 'string') this.resolvedUserIdAlias = id;
      })
      .catch(() => undefined);
  }

  /** The resolved counterpart of the `-u/--user-id` filter value, if resolution has completed -- lets the UI show that the filter got "smarter" than a literal match (e.g. `-u amos` resolving to Amos's uuid) instead of silently widening it with no visible feedback. */
  getResolvedUserIdAlias(): string | undefined {
    return this.resolvedUserIdAlias;
  }

  /**
   * Polls once for new events, ingests them, and sweeps for
   * abandoned/evictable sessions. Never throws -- a fetch failure is
   * reported via `onWarning` (if given), and `tailStream` itself keeps
   * retrying from the same position next time (see `createLogTailStream()`
   * in frodo-lib), so the interactive list simply keeps waiting rather than
   * crashing or freezing on a transient error.
   */
  async poll(onWarning?: (message: string) => void): Promise<void> {
    try {
      const events = await this.tailStream.poll();
      for (const event of events) {
        this.ingest(event, onWarning);
      }
    } catch (error) {
      onWarning?.(
        `debug: log poll failed, will retry -- ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Own try/catch, same reasoning as the two below it -- a failure
    // polling `am-core` specifically must never block `am-authentication`
    // ingestion or the sweep that follows.
    try {
      const debugEvents = await this.debugTailStream.poll();
      for (const event of debugEvents) {
        this.ingestDebugEvent(event);
      }
    } catch (error) {
      onWarning?.(
        `debug: am-core poll failed, will retry -- ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // A third, separate try/catch -- not just one wrapping every call above --
    // deliberately keeps a tail()/ingest() failure from skipping the sweep
    // (abandoned-detection/eviction should still run even on a poll that
    // found nothing new). This one exists because `sweep()` not actually
    // being covered by any catch was a real bug: confirmed live that a
    // long-running debug session (left open against real admin-console
    // traffic for many minutes) went completely unresponsive to every key
    // except Escape -- Escape resolves the prompt directly and needs no
    // re-render to be visible, but every other key only ever updates state
    // that a re-render would have to pick up, so once the interval-driven
    // `poll()` this state depends on silently died from an unhandled
    // rejection (a `void`-called async function -- see the UI layer's own
    // `runPoll()` -- has no catch of its own either), the screen froze
    // while Escape kept working. Whatever specifically threw inside sweep()
    // that night doesn't need to be identified for this fix to matter --
    // poll() already documents "Never throws", and this is what actually
    // makes that true.
    try {
      await this.sweep(onWarning);
    } catch (error) {
      onWarning?.(
        `debug: sweep failed, will retry -- ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Current sessions, most-recently-active first, narrowed by `filter` (see
   * its own remarks) if one was given. Empty is a normal, expected state --
   * not an error, whether that's because nothing has run yet or because
   * nothing tracked currently matches the filter.
   */
  getSessions(): JourneySession[] {
    const sessions = [...this.sessions.values()];
    const matching =
      this.filter.journeyId || this.filter.userId
        ? sessions.filter((session) => this.matchesFilter(session))
        : sessions;
    return matching.sort((a, b) => b.lastEventAt - a.lastEventAt);
  }

  private matchesFilter(session: JourneySession): boolean {
    if (this.filter.journeyId) {
      if (!containsCaseInsensitive(session.treeName, this.filter.journeyId)) {
        return false;
      }
    }
    if (this.filter.userId) {
      // Checked against the literal filter value AND its resolved
      // username<->uuid counterpart (once available) -- see
      // `resolveUserIdAlias()`'s own remarks.
      const terms = [this.filter.userId, this.resolvedUserIdAlias].filter(
        (term): term is string => Boolean(term)
      );
      const matchesUser = terms.some(
        (term) =>
          containsCaseInsensitive(session.user, term) ||
          containsCaseInsensitive(session.userDisplayName, term)
      );
      if (!matchesUser) return false;
    }
    return true;
  }

  togglePin(transactionId: string): void {
    const session = this.sessions.get(transactionId);
    if (session) session.pinned = !session.pinned;
  }

  /**
   * Resolves a `transactionId` (plus any of its `trackingIds`) to the
   * session key it belongs to, registering every alias along the way so a
   * later event under any of these ids resolves to the same key. The
   * *first* time a genuinely new flow is seen, its own transactionId
   * becomes (and permanently stays) that session's key -- this is what
   * lets a plain non-polling tree, which never gets a second transactionId
   * at all, take the same path as a polling one with no special-casing.
   */
  private resolveSessionKey(
    transactionId: string,
    trackingIds: string[]
  ): string {
    let sessionKey = this.trackingIndex.get(transactionId);
    if (!sessionKey) {
      for (const trackingId of trackingIds) {
        const mapped = this.trackingIndex.get(trackingId);
        if (mapped) {
          sessionKey = mapped;
          break;
        }
      }
    }
    if (!sessionKey) sessionKey = transactionId;

    this.registerAlias(transactionId, sessionKey);
    for (const trackingId of trackingIds) {
      this.registerAlias(trackingId, sessionKey);
    }
    return sessionKey;
  }

  private registerAlias(alias: string, sessionKey: string): void {
    this.trackingIndex.set(alias, sessionKey);
    let aliases = this.sessionAliases.get(sessionKey);
    if (!aliases) {
      aliases = new Set();
      this.sessionAliases.set(sessionKey, aliases);
    }
    aliases.add(alias);
  }

  /** Removes every alias pointing at `sessionKey`, and its event-sequence counter and suppressed-noise buffer -- called on eviction so none of these grow unbounded alongside sessions the map itself already forgets. */
  private forgetAliases(sessionKey: string): void {
    const aliases = this.sessionAliases.get(sessionKey);
    if (aliases) {
      for (const alias of aliases) this.trackingIndex.delete(alias);
      this.sessionAliases.delete(sessionKey);
    }
    this.eventSeqCounters.delete(sessionKey);
    this.suppressedNoiseBuffer.delete(sessionKey);
  }

  private ingest(
    event: LogEventSkeleton,
    onWarning?: (message: string) => void
  ): void {
    const payload = getAuditPayload(event);
    if (!payload || payload.component !== 'Authentication') return;
    const transactionId = payload.transactionId;
    if (!transactionId) return;

    // Not every 'Authentication'-component event belongs to a journey/tree
    // execution -- OAuth2 client authentication (e.g. a service client
    // using client_credentials) completes via AM-LOGIN-COMPLETED/
    // AM-LOGIN-MODULE-COMPLETED too, with a real transactionId and
    // principal, but never runs through a tree at all (confirmed live:
    // these show up with no treeName, ever, for their whole transaction).
    // Only a node/tree event proves a transaction is an actual journey
    // execution, so only those may START a tracked session -- a
    // login-completed event alone is never enough, though it can still
    // enrich (e.g. resolve the user for) a session a node event already
    // started for the same transactionId.
    const isTreeEvent =
      payload.eventName === 'AM-NODE-LOGIN-COMPLETED' ||
      payload.eventName === 'AM-TREE-LOGIN-COMPLETED';

    // A polling/wait-node-based flow (push, and presumably other
    // wait-for-callback patterns) gets a *different* transactionId per
    // polling leg -- confirmed live against a real
    // `MultiplePushDevicesExample` login. Every leg's events do carry the
    // flow's very first event id in `trackingIds`, though, so resolving
    // through that folds every later leg back onto the same session key
    // instead of starting a new, seemingly-unrelated session per leg.
    const trackingIds = Array.isArray(payload.trackingIds)
      ? payload.trackingIds
      : [];
    const sessionKey = this.resolveSessionKey(transactionId, trackingIds);

    const now = Date.now();
    const info = payload.entries?.[0]?.info;

    let session = this.sessions.get(sessionKey);
    if (!session) {
      if (!isTreeEvent) return;
      session = {
        transactionId: sessionKey,
        status: 'running',
        startedAt: now,
        lastEventAt: now,
        nodeCount: 0,
        pinned: false,
        events: [],
      };
      this.sessions.set(sessionKey, session);
    }
    session.lastEventAt = now;
    if (info?.treeName) session.treeName = info.treeName;
    // A bare AM-LOGIN-COMPLETED/AM-LOGIN-MODULE-COMPLETED event can belong
    // to a nested internal service call sharing this transaction's id (e.g.
    // a scripted "Enrich Session" node's own IDM call, confirmed live to
    // log in as `idm-provisioning` under the *same* transactionId as the
    // real user's journey) -- never let one of those override a user
    // already established from this tree's own node/tree events, only fill
    // it in as a fallback if nothing else has yet.
    const who = payload.principal?.[0] ?? payload.userId;
    if (who && (isTreeEvent || !session.user)) {
      if (who !== session.user) session.userDisplayName = undefined;
      session.user = who;
    }

    const eventSeq = (this.eventSeqCounters.get(sessionKey) ?? 0) + 1;
    this.eventSeqCounters.set(sessionKey, eventSeq);
    const eventId = String(eventSeq);
    let entry: JourneyDebugEventEntry | undefined;
    switch (payload.eventName) {
      case 'AM-NODE-LOGIN-COMPLETED': {
        session.nodeCount += 1;
        session.lastNode = info?.displayName ?? info?.nodeType;
        session.lastNodeOutcome = info?.nodeOutcome;
        // A node event arriving for a session already marked terminal --
        // abandoned, or a tree that already completed finished/failed --
        // means the underlying AM transaction is genuinely still active, not
        // that the earlier terminal verdict was wrong to record at the time.
        // Confirmed live: a chained/step-up journey (e.g. FRSecondFactor)
        // correlated back to an already-"finished" session via trackingIds
        // keeps producing real AM-NODE-LOGIN-COMPLETED events well after its
        // first tree's own completion -- previously left status stuck on
        // that first tree's stale verdict (nodeCount/events kept growing
        // underneath it, but the header never reflected that anything was
        // still happening). Self-heal back to running -- and drop a stale
        // failureReason along with it, since it no longer describes the
        // session's current state -- rather than leaving a once-true,
        // now-outdated terminal status displayed indefinitely.
        if (session.status !== 'running') {
          session.status = 'running';
          session.terminalAt = undefined;
          session.failureReason = undefined;
        }
        entry = {
          at: now,
          id: eventId,
          source: 'AM',
          step: session.lastNode ?? 'node',
          type: info?.nodeType,
          outcome: info?.nodeOutcome,
          raw: pickDefined({
            nodeId: info?.nodeId,
            authLevel: info?.authLevel,
            nodeExtraLogging: info?.nodeExtraLogging,
          }),
        };
        break;
      }
      case 'AM-TREE-LOGIN-COMPLETED': {
        session.terminalAt = now;
        if (payload.result === 'FAILED') {
          session.status = 'failed';
          const rawFailure = info?.nodeExtraLogging?.failureReason;
          const compact = rawFailure
            ? compactFailureReason(rawFailure)
            : (info?.nodeExtraLogging?.exception ?? 'failed');
          // A generic AM-level failure (e.g. an internal exception in a
          // built-in node, as opposed to a scripted node's own descriptive
          // error) carries no node id or name at all -- confirmed live
          // against a failed `P1P-Login` social-authentication attempt,
          // where the tree-completed event's only failure detail was the
          // bare string "Node processing failed". The last node that *did*
          // complete, plus the outcome it completed with, is the closest
          // thing to a location AM gives us -- worth surfacing since a
          // redirect-bound outcome (e.g. `socialAuthentication`) is exactly
          // where an admin would go look in the tree editor next.
          session.failureReason = session.lastNode
            ? `${compact} (last completed step: ${session.lastNode}${session.lastNodeOutcome ? ` → ${session.lastNodeOutcome}` : ''})`
            : compact;
          // Now that this session is known to have actually failed, the
          // confirmed-noise filter's whole premise (this chatter is
          // irrelevant because nothing went wrong) no longer holds -- fold
          // back in whatever recent am-core noise was held back on the way
          // here, since it's now potential forensic context rather than
          // clutter. Flushed *before* the 'Tree completed' entry below so
          // it reads in its real chronological position, not dumped after.
          this.flushSuppressedNoise(sessionKey, session);
        } else {
          session.status = 'finished';
        }
        entry = {
          at: now,
          id: eventId,
          source: 'AM',
          step: 'Tree completed',
          type: payload.result,
          outcome:
            payload.result === 'FAILED' ? session.failureReason : undefined,
          raw: pickDefined({
            ipAddress: info?.ipAddress,
            authLevel: info?.authLevel,
            nodeExtraLogging: info?.nodeExtraLogging,
          }),
        };
        break;
      }
      case 'AM-LOGIN-COMPLETED':
      case 'AM-LOGIN-MODULE-COMPLETED': {
        const loginWho = payload.principal?.[0] ?? payload.userId ?? 'unknown';
        entry = {
          at: now,
          id: eventId,
          source: 'AM',
          step: 'Login',
          type: payload.result,
          outcome: `as ${loginWho}`,
          raw: pickDefined({
            principal: payload.principal?.[0],
            userId: payload.userId,
            authIndex: info?.authIndex,
            authIndexValue: info?.authIndexValue,
            ipAddress: info?.ipAddress,
          }),
        };
        break;
      }
      default:
        break;
    }

    if (entry) this.pushEvent(session, entry);

    if (session.treeName) this.ensureTreeCached(session.treeName, onWarning);
    this.applyServiceAccountName(session, onWarning);
  }

  /** Appends to a session's event history, enforcing `MAX_EVENTS_PER_SESSION` and collapsing an immediate repeat via `dedupeAppend()` -- shared by `ingest()` and `ingestDebugEvent()`. */
  private pushEvent(
    session: JourneySession,
    entry: JourneyDebugEventEntry
  ): void {
    dedupeAppend(session.events, entry, MAX_EVENTS_PER_SESSION);
  }

  /**
   * Holds back one confirmed-noise `am-core` entry instead of pushing it
   * straight into `session.events` -- see `CONFIRMED_NOISE_PATTERNS` and
   * `ingestAmCoreEvent()`. Also runs through `dedupeAppend()`, so a burst of
   * the exact same suppressed line (e.g. the five near-identical
   * `AttributeMappingIdRepo` "not found" lines observed live back to back)
   * collapses to one buffered entry with a `repeatCount`, the same as it
   * would have in the real event list.
   */
  private bufferSuppressedNoise(
    sessionKey: string,
    entry: JourneyDebugEventEntry
  ): void {
    let buffer = this.suppressedNoiseBuffer.get(sessionKey);
    if (!buffer) {
      buffer = [];
      this.suppressedNoiseBuffer.set(sessionKey, buffer);
    }
    dedupeAppend(buffer, entry, MAX_SUPPRESSED_NOISE);
  }

  /** Moves a session's whole suppressed-noise buffer into its real `events` history (each entry still going through the same `pushEvent`/dedup path) and clears the buffer -- called once a session is confirmed to have actually failed, see `ingest()`'s `AM-TREE-LOGIN-COMPLETED` handling. A no-op if nothing was ever suppressed. */
  private flushSuppressedNoise(
    sessionKey: string,
    session: JourneySession
  ): void {
    const buffer = this.suppressedNoiseBuffer.get(sessionKey);
    if (!buffer || buffer.length === 0) return;
    for (const entry of buffer) this.pushEvent(session, entry);
    this.suppressedNoiseBuffer.delete(sessionKey);
    // Nothing is being held back anymore -- it's all in `events` now.
    session.suppressedNoiseCount = 0;
  }

  /**
   * Resolves an `am-core` line's own (possibly nested) transactionId back
   * to a tracked session's key, or `undefined` if none matches at any
   * ancestor level.
   *
   * @remarks
   * Confirmed live (2026-09-13) that a plain, single-node journey failure's
   * own `am-authentication` transactionId is *already* `<uuid>/0` -- not
   * the bare `<uuid>` an earlier version of this method assumed -- and the
   * `am-core` lines for that same failing node carry that identical,
   * unsuffixed id. Stripping straight down to the bare root (as that
   * earlier version did) therefore missed this exact-match, single-level
   * case entirely: `trackingIndex` only ever has `<uuid>/0` registered
   * (from `resolveSessionKey()`, keyed off the real journey transactionId
   * as AM reports it), never the bare `<uuid>`. A deeper internal call
   * (confirmed live: an `IdServicesImpl` lookup on the very same request)
   * logs one or more *further* segments still -- `<uuid>/0/0/0` in that
   * case. So the only correct approach is to walk upward one path segment
   * at a time from the id as given -- trying the exact id first, since
   * that's the common case -- rather than assume any fixed number of
   * segments belongs to "the session" versus "the nesting".
   */
  private resolveDebugSessionKey(rawTransactionId: string): string | undefined {
    let candidate = rawTransactionId;
    for (;;) {
      const sessionKey = this.trackingIndex.get(candidate);
      if (sessionKey) return sessionKey;
      const lastSlash = candidate.lastIndexOf('/');
      if (lastSlash === -1) return undefined;
      candidate = candidate.slice(0, lastSlash);
    }
  }

  /**
   * Resolves `transactionId` to a tracked session (via
   * `resolveDebugSessionKey()`) and, if found, bumps its `lastEventAt` and
   * assigns the next event-sequence id for it -- the bookkeeping shared by
   * `ingestAmCoreEvent()`/`ingestIdmAccessEvent()`, factored out so neither
   * has to repeat it. Returns `undefined` (doing nothing else) for an
   * untracked/unrecognized transactionId -- callers rely on this to know
   * whether to build and attach an entry at all.
   */
  private beginDebugEvent(
    transactionId: string | undefined
  ): { session: JourneySession; eventId: string } | undefined {
    if (!transactionId) return undefined;
    const sessionKey = this.resolveDebugSessionKey(transactionId);
    if (!sessionKey) return undefined;
    const session = this.sessions.get(sessionKey);
    if (!session) return undefined;

    session.lastEventAt = Date.now();
    const eventSeq = (this.eventSeqCounters.get(sessionKey) ?? 0) + 1;
    this.eventSeqCounters.set(sessionKey, eventSeq);
    return { session, eventId: String(eventSeq) };
  }

  /**
   * Enriches an already-tracked session with one `am-core` WARN/ERROR/FATAL
   * line -- see this file's own top-level remarks for why `am-core` is
   * polled at all. Never creates a session and never touches
   * `status`/`terminalAt` -- this is enrichment of an already-classified
   * session, never itself a classification signal.
   */
  private ingestAmCoreEvent(payload: DebugLogPayload): void {
    if (!payload.level || !DEBUG_LEVELS_TO_SURFACE.has(payload.level)) return;
    const begun = this.beginDebugEvent(payload.transactionId);
    if (!begun) return;

    // AM's own `logger` is a full Java FQCN (e.g.
    // `org.forgerock.openam.auth.nodes.ScriptedDecisionNode`) -- the
    // meaningful part is the last segment, unlike every other `step` value
    // this UI shows (a node display name, "Tree completed", "Login"), so
    // showing the FQCN as-is would both look out of place and, once the
    // STEP column's own truncation kicks in, get cut from the *wrong* end
    // (a Java FQCN's useful part is at the end, not the start). The full
    // FQCN is kept in `raw` for the drill-down, never discarded.
    const shortLogger = payload.logger?.split('.').pop();

    const entry: JourneyDebugEventEntry = {
      at: Date.now(),
      id: begun.eventId,
      source: 'AM',
      step: shortLogger ?? 'am-core',
      type: payload.level,
      outcome: payload.message,
      raw: pickDefined({
        logger: payload.logger,
        exception: payload.exception
          ? compactFailureReason(payload.exception)
          : undefined,
      }),
    };

    // A session already known to have failed gets full visibility -- see
    // `flushSuppressedNoise()`'s own remarks on why the filter's premise
    // stops holding once something has actually gone wrong. Otherwise,
    // confirmed noise is held back rather than shown, so it never crowds a
    // genuinely successful run's node-by-node history out of its own
    // (necessarily limited) display window.
    if (
      begun.session.status !== 'failed' &&
      isConfirmedNoise(shortLogger, payload.message)
    ) {
      begun.session.suppressedNoiseCount =
        (begun.session.suppressedNoiseCount ?? 0) + 1;
      this.bufferSuppressedNoise(begun.session.transactionId, entry);
      return;
    }

    this.pushEvent(begun.session, entry);
  }

  /**
   * Enriches an already-tracked session with one *failed* `idm-access`
   * call -- e.g. the `openidm.patch()` a script node made, or any other
   * IDM REST call a journey node triggers. Only a failure is ever
   * surfaced: `idm-access` is itself an audit log of *every* call
   * (confirmed live it's always logged at `level: 'INFO'`, success or
   * failure alike -- unlike `am-core`, level tells you nothing here), and a
   * successful managed-object read/write is an extremely common, routine
   * part of many journey nodes -- surfacing those too would flood every
   * session's event list with noise instead of signal. `response.status`
   * (confirmed live: `'SUCCESSFUL'` vs `'FAILED'`) is the real signal.
   */
  private ingestIdmAccessEvent(payload: DebugLogPayload): void {
    const status = payload.response?.status;
    if (!status || status === 'SUCCESSFUL') return;
    const begun = this.beginDebugEvent(payload.transactionId);
    if (!begun) return;

    const method = payload.http?.request?.method;
    const outcome =
      payload.response?.detail?.message ??
      payload.response?.detail?.reason ??
      status;

    this.pushEvent(begun.session, {
      at: Date.now(),
      id: begun.eventId,
      source: 'IDM',
      step: method ? `IDM ${method}` : 'IDM',
      type: payload.response?.statusCode,
      outcome: decodeHtmlEntities(outcome),
      raw: pickDefined({
        path: payload.http?.request?.path,
        actor: payload.userId,
      }),
    });
  }

  /**
   * Dispatches one `am-core`/`idm-access` combined-stream event to the
   * right handler -- `eventName: 'access'` is what distinguishes an
   * `idm-access` line from an `am-core` one (see `DebugLogPayload`'s own
   * remarks); everything else here is a no-op by construction, since both
   * handlers already silently ignore anything that isn't a tracked,
   * surfaceable failure.
   */
  private ingestDebugEvent(event: LogEventSkeleton): void {
    const payload = getDebugLogPayload(event);
    if (!payload) return;
    if (payload.eventName === 'access') {
      this.ingestIdmAccessEvent(payload);
    } else {
      this.ingestAmCoreEvent(payload);
    }
  }

  /** Resolves `session.user` to `session.userDisplayName` when it's a `FRServiceAccountInternal` service-account UUID -- see `ensureServiceAccountCached`. Applies whatever's already cached immediately; kicks off resolution if not yet attempted (fire-and-forget, picked up next time this or `sweep()` runs). */
  private applyServiceAccountName(
    session: JourneySession,
    onWarning?: (message: string) => void
  ): void {
    if (session.treeName !== SERVICE_ACCOUNT_INTERNAL_TREE || !session.user) {
      return;
    }
    const cached = this.serviceAccountCache.get(session.user);
    if (cached?.resolved) {
      if (cached.name) session.userDisplayName = cached.name;
      return;
    }
    this.ensureServiceAccountCached(session.user, onWarning);
  }

  /** Lazily fetches and caches a service account's display name by id, tolerating failure -- same fire-and-forget/cooldown shape as `ensureTreeCached`. */
  private ensureServiceAccountCached(
    serviceAccountId: string,
    onWarning?: (message: string) => void
  ): void {
    const cached = this.serviceAccountCache.get(serviceAccountId);
    const now = Date.now();
    if (
      cached &&
      (cached.resolved || now - cached.lastAttemptAt < FAILED_LOOKUP_RETRY_MS)
    ) {
      return;
    }
    this.serviceAccountCache.set(serviceAccountId, {
      name: cached?.name,
      resolved: false,
      lastAttemptAt: now,
    });
    getServiceAccount(serviceAccountId)
      .then((account) => {
        this.serviceAccountCache.set(serviceAccountId, {
          name: account?.name,
          resolved: true,
          lastAttemptAt: Date.now(),
        });
      })
      .catch((error) => {
        // A 404 means this id genuinely isn't a service account frodo can
        // read (or no longer exists) -- permanent, not worth retrying or
        // warning about, same reasoning as the tree-export 404 case above.
        if ((error as { httpStatus?: number })?.httpStatus === 404) {
          this.serviceAccountCache.set(serviceAccountId, {
            name: undefined,
            resolved: true,
            lastAttemptAt: Date.now(),
          });
          return;
        }
        onWarning?.(
          `debug: could not resolve service account '${serviceAccountId}' to a name -- ${error instanceof Error ? error.message : String(error)}`
        );
        // Leave `resolved: false` so it's retried after the cooldown.
      });
  }

  /** Lazily fetches and caches one tree's abandoned-after override/suspend-capability, tolerating failure. Fire-and-forget: the result is picked up on the next sweep, not awaited inline, so a slow export never blocks event ingestion. */
  private ensureTreeCached(
    treeName: string,
    onWarning?: (message: string) => void
  ): void {
    const cached = this.treeCache.get(treeName);
    const now = Date.now();
    if (
      cached &&
      (cached.resolved || now - cached.lastAttemptAt < FAILED_LOOKUP_RETRY_MS)
    ) {
      return;
    }
    this.treeCache.set(treeName, {
      canSuspend: cached?.canSuspend ?? false,
      overrides: cached?.overrides ?? [],
      resolved: false,
      lastAttemptAt: now,
    });
    exportJourney(treeName)
      .then((exported) => {
        const tree = exported.trees?.[treeName];
        const innerNodes = tree?.innerNodes ?? {};
        const overrides: UpdateJourneyTimeoutNodeConfig[] = [];
        let canSuspend = false;
        for (const node of Object.values(innerNodes)) {
          const typeId = (node as { _type?: { _id?: string } })._type?._id;
          if (!typeId) continue;
          if (typeId === 'UpdateJourneyTimeoutNode') {
            const config = node as UpdateJourneyTimeoutNodeConfig;
            if (typeof config.value === 'number') overrides.push(config);
          }
          if (/suspend/i.test(typeId)) canSuspend = true;
        }
        this.treeCache.set(treeName, {
          overrides,
          canSuspend,
          resolved: true,
          lastAttemptAt: Date.now(),
        });
      })
      .catch((error) => {
        // A 404 means the tree genuinely has no exportable definition --
        // confirmed live against `FRServiceAccountInternal` (AM's own
        // internal service-account auth tree, which shows up as a normal
        // tracked session whenever the debug session's own credentials are
        // service-account-based) -- not a transient failure, so retrying it
        // forever every cooldown window would just be permanent, silent
        // waste. Treat it as permanently resolved with no overrides instead
        // of leaving it unresolved for retry, and don't warn -- an internal
        // system tree having no exportable definition isn't an error.
        if ((error as { httpStatus?: number })?.httpStatus === 404) {
          this.treeCache.set(treeName, {
            overrides: [],
            canSuspend: false,
            resolved: true,
            lastAttemptAt: Date.now(),
          });
          return;
        }
        onWarning?.(
          `debug: could not read journey definition for '${treeName}', abandoned-detection will use the realm default -- ${error instanceof Error ? error.message : String(error)}`
        );
        // Leave `resolved: false` so it's retried after the cooldown.
      });
  }

  private async ensureRealmSettings(
    onWarning?: (message: string) => void
  ): Promise<RealmSettingsCacheEntry> {
    const now = Date.now();
    if (
      this.realmSettings &&
      (this.realmSettings.resolved ||
        now - this.realmSettings.lastAttemptAt < FAILED_LOOKUP_RETRY_MS)
    ) {
      return this.realmSettings;
    }
    this.realmSettings = {
      ...this.realmSettings,
      resolved: false,
      lastAttemptAt: now,
    };
    try {
      const settings = await readAuthenticationSettings(false);
      // frodo-lib's own contract for this call: a 403 whose message is
      // "This operation is not available in PingOne Advanced Identity
      // Cloud" resolves to `null` rather than throwing -- confirmed live
      // against `volker-dev` (realm-level settings, not just the
      // globalConfig variant). A deployment-level restriction like that
      // won't change on retry, so this is treated the same as a permanent
      // resolution (fallback duration, no further retries) rather than a
      // transient failure, and isn't worth warning about -- it's an
      // expected "not available here" answer, not an error.
      const raw = settings as unknown as Record<string, unknown> | null;
      this.realmSettings = {
        authenticationSessionsMaxDuration: raw
          ? asNumber(raw.authenticationSessionsMaxDuration)
          : undefined,
        suspendedAuthenticationTimeout: raw
          ? asNumber(raw.suspendedAuthenticationTimeout)
          : undefined,
        resolved: true,
        lastAttemptAt: Date.now(),
      };
    } catch (error) {
      onWarning?.(
        `debug: could not read realm authentication settings, using a ${FALLBACK_SESSION_MINUTES}-minute default for abandoned-detection -- ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return this.realmSettings;
  }

  private async sweep(onWarning?: (message: string) => void): Promise<void> {
    const now = Date.now();
    const realmSettings = await this.ensureRealmSettings(onWarning);
    const baseMinutes =
      realmSettings.authenticationSessionsMaxDuration ??
      FALLBACK_SESSION_MINUTES;
    const suspendedMinutes =
      realmSettings.suspendedAuthenticationTimeout ?? FALLBACK_SESSION_MINUTES;

    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'suspended') {
        const treeInfo = session.treeName
          ? this.treeCache.get(session.treeName)
          : undefined;
        // Combine the realm base with each cached override here, at sweep
        // time, rather than pre-computing it in `ensureTreeCached` -- a
        // `MODIFY` override is a delta on the realm's own base duration,
        // and the realm settings/tree-definition caches are populated
        // independently and lazily, so this is the one place both are
        // reliably known together. "Most generous plausible" per node type
        // presence: take the max across every override found in the tree.
        let effectiveMinutes = baseMinutes;
        for (const override of treeInfo?.overrides ?? []) {
          const candidate =
            override.operation === 'MODIFY'
              ? Math.max(0, baseMinutes + (override.value ?? 0))
              : (override.value ?? baseMinutes);
          effectiveMinutes = Math.max(effectiveMinutes, candidate);
        }
        if (treeInfo?.canSuspend) {
          effectiveMinutes = Math.max(effectiveMinutes, suspendedMinutes);
        }
        session.abandonedAfterMinutes = effectiveMinutes;
        if (now - session.lastEventAt > effectiveMinutes * 60 * 1000) {
          session.status = 'abandoned';
          session.terminalAt = now;
        }
      }
    }

    // Evict completed sessions past their grace window, non-pinned first.
    // Also re-applied here (not just in `ingest()`) so a session that
    // stopped receiving events before its service-account name resolved
    // still picks up the name once a later sweep sees it cached.
    for (const [transactionId, session] of this.sessions) {
      this.applyServiceAccountName(session, onWarning);
      const isTerminal =
        session.status === 'finished' ||
        session.status === 'failed' ||
        session.status === 'abandoned';
      if (
        isTerminal &&
        !session.pinned &&
        now - (session.terminalAt ?? session.lastEventAt) >
          EVICT_AFTER_COMPLETION_MS
      ) {
        this.sessions.delete(transactionId);
        this.forgetAliases(transactionId);
      }
    }

    // Hard cap safety valve.
    if (this.sessions.size > MAX_TRACKED_SESSIONS) {
      const byAge = [...this.sessions.values()].sort(
        (a, b) => a.lastEventAt - b.lastEventAt
      );
      const nonPinnedFirst = [
        ...byAge.filter((s) => !s.pinned),
        ...byAge.filter((s) => s.pinned),
      ];
      while (
        this.sessions.size > MAX_TRACKED_SESSIONS &&
        nonPinnedFirst.length
      ) {
        const victim = nonPinnedFirst.shift();
        if (victim) {
          this.sessions.delete(victim.transactionId);
          this.forgetAliases(victim.transactionId);
        }
      }
    }
  }
}

/** `haystack` may legitimately be absent (e.g. `userId` filtering a session whose user hasn't resolved yet) -- that's never a match, not an error. */
function containsCaseInsensitive(
  haystack: string | undefined,
  needle: string
): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

/**
 * Appends `entry` to `list`, enforcing `maxLength` -- unless `entry` is an
 * exact repeat (same `source`/`step`/`type`/`outcome`) of `list`'s current
 * last item, in which case that existing item's `repeatCount` is bumped and
 * its `at` refreshed to `entry`'s timestamp instead of appending a new row.
 * The same syslog-style "message repeated N times" collapsing, applied
 * generically so both `session.events` (via `pushEvent`) and the
 * suppressed-noise buffer (via `bufferSuppressedNoise`) get it for free.
 * Only ever compares against the immediately preceding item -- a repeat
 * that isn't strictly consecutive (something else happened in between) is
 * deliberately left as its own row, not merged with an earlier occurrence.
 */
function dedupeAppend(
  list: JourneyDebugEventEntry[],
  entry: JourneyDebugEventEntry,
  maxLength: number
): void {
  const last = list[list.length - 1];
  if (
    last &&
    last.source === entry.source &&
    last.step === entry.step &&
    last.type === entry.type &&
    last.outcome === entry.outcome
  ) {
    last.repeatCount = (last.repeatCount ?? 1) + 1;
    last.at = entry.at;
    return;
  }
  list.push(entry);
  if (list.length > maxLength) list.shift();
}

/** Drops undefined/null values so a `JourneyDebugEventEntry.raw` bag only ever shows fields that were actually present on the source event. */
function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}
