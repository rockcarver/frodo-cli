/**
 * Session-aggregating engine behind `frodo debug --topic journey`'s
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
import { frodo } from '@rockcarver/frodo-lib';
import type { LogEventSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/LogApi';

import { compactFailureReason, getAuditPayload } from './DebugLogOps';

const { createLogTailStream } = frodo.cloud.log;
const { exportJourney } = frodo.authn.journey;
const { readAuthenticationSettings } = frodo.authn.settings;
const { getServiceAccount } = frodo.cloud.serviceAccount;

// The well-known internal tree AM itself uses for JWT-bearer service-account
// login (confirmed live against `volker-dev`) -- its `principal` is a raw
// service-account UUID, not a human-readable identity, so it's the one case
// where resolving `user` to a display name via `getServiceAccount()` is
// worth the extra lookup.
const SERVICE_ACCOUNT_INTERNAL_TREE = 'FRServiceAccountInternal';

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
  /** Node display name for a node event; a short fixed label ('Tree completed', 'Login') otherwise. */
  step: string;
  /** Node type for a node event; the AM result word (SUCCESSFUL/FAILED) for a tree-completed or login event. */
  type?: string;
  /** Node outcome for a node event; the (failure-enriched, see `session.failureReason`) result detail for a tree-completed event; `as <principal>` for a login event. */
  outcome?: string;
  /** Extra raw fields for this one event, shown in the UI's per-event drill-down -- whatever's actually present varies by event kind (see `ingest()`), so this is a plain bag rather than a fixed shape. */
  raw?: Record<string, unknown>;
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
 * Live-updating session aggregator for one `frodo debug --topic journey`
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

    await this.sweep(onWarning);
  }

  /** Current sessions, most-recently-active first. Empty is a normal, expected state -- not an error. */
  getSessions(): JourneySession[] {
    return [...this.sessions.values()].sort(
      (a, b) => b.lastEventAt - a.lastEventAt
    );
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

  /** Removes every alias pointing at `sessionKey`, and its event-sequence counter -- called on eviction so neither grows unbounded alongside sessions the map itself already forgets. */
  private forgetAliases(sessionKey: string): void {
    const aliases = this.sessionAliases.get(sessionKey);
    if (aliases) {
      for (const alias of aliases) this.trackingIndex.delete(alias);
      this.sessionAliases.delete(sessionKey);
    }
    this.eventSeqCounters.delete(sessionKey);
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
        // A node event arriving for a session previously marked abandoned
        // means it wasn't actually abandoned -- self-heal back to running
        // rather than leaving a stale, now-wrong status displayed.
        if (session.status === 'running' || session.status === 'abandoned') {
          session.status = 'running';
          session.terminalAt = undefined;
        }
        entry = {
          at: now,
          id: eventId,
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
        } else {
          session.status = 'finished';
        }
        entry = {
          at: now,
          id: eventId,
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

    if (entry) {
      session.events.push(entry);
      if (session.events.length > MAX_EVENTS_PER_SESSION) {
        session.events.shift();
      }
    }

    if (session.treeName) this.ensureTreeCached(session.treeName, onWarning);
    this.applyServiceAccountName(session, onWarning);
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

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

/** Drops undefined/null values so a `JourneyDebugEventEntry.raw` bag only ever shows fields that were actually present on the source event. */
function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}
