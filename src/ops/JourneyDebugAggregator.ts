/**
 * Session-aggregating engine behind `frodo debug --topic journey`'s
 * interactive list.
 *
 * @remarks
 * Turns a stream of raw `am-authentication` log events (the same
 * `frodo.cloud.log.tail()` primitive `frodo log tail`/`frodo debug`'s other
 * topics already use) into a live `Map<transactionId, JourneySession>`,
 * grouping by `transactionId` -- confirmed live this session that an
 * `AM-NODE-LOGIN-COMPLETED` event and the terminal `AM-TREE-LOGIN-COMPLETED`
 * event for one journey execution share the identical `transactionId`.
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

import {
  compactFailureReason,
  formatJourneyEvent,
  getAuditPayload,
} from './DebugLogOps';

const { tail } = frodo.cloud.log;
const { exportJourney } = frodo.authn.journey;
const { readAuthenticationSettings } = frodo.authn.settings;

export type JourneySessionStatus =
  'running' | 'suspended' | 'finished' | 'failed' | 'abandoned';

export interface JourneySession {
  transactionId: string;
  treeName?: string;
  status: JourneySessionStatus;
  user?: string;
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
  nodeCount: number;
  lastNode?: string;
  failureReason?: string;
  pinned: boolean;
  /** Human-readable event history for drill-down, oldest first -- capped, see `MAX_EVENTS_PER_SESSION`. */
  events: string[];
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
 * run. Owns the raw `tail()` poll cookie, the session map, the per-tree
 * journey-definition cache, and the realm authentication-settings cache.
 * Call `poll()` on an interval (the UI layer owns the timer) and read
 * `getSessions()` after each call to re-render.
 */
export class JourneyDebugAggregator {
  private sessions = new Map<string, JourneySession>();
  private treeCache = new Map<string, JourneyDefinitionCacheEntry>();
  private realmSettings: RealmSettingsCacheEntry | undefined;
  private cookie: string | undefined;

  /**
   * Polls once for new events, ingests them, and sweeps for
   * abandoned/evictable sessions. Never throws -- a fetch failure is
   * reported via `onWarning` (if given) and the same cookie is retried next
   * time, so the interactive list simply keeps waiting rather than
   * crashing or freezing on a transient error.
   */
  async poll(onWarning?: (message: string) => void): Promise<void> {
    try {
      const page = await tail('am-authentication', this.cookie);
      this.cookie = page.pagedResultsCookie;
      const events = Array.isArray(page.result) ? page.result : [];
      for (const event of events) {
        this.ingest(event, onWarning);
      }
    } catch (error) {
      onWarning?.(
        `debug: log poll failed, will retry -- ${error instanceof Error ? error.message : String(error)}`
      );
      // Deliberately don't touch `this.cookie` -- retry from the same
      // position next cycle instead of risking a gap in coverage.
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

    const now = Date.now();
    const info = payload.entries?.[0]?.info;
    const line = formatJourneyEvent(payload);

    let session = this.sessions.get(transactionId);
    if (!session) {
      if (!isTreeEvent) return;
      session = {
        transactionId,
        status: 'running',
        startedAt: now,
        lastEventAt: now,
        nodeCount: 0,
        pinned: false,
        events: [],
      };
      this.sessions.set(transactionId, session);
    }
    session.lastEventAt = now;
    if (info?.treeName) session.treeName = info.treeName;
    const who = payload.principal?.[0] ?? payload.userId;
    if (who) session.user = who;
    if (line) {
      session.events.push(line);
      if (session.events.length > MAX_EVENTS_PER_SESSION) {
        session.events.shift();
      }
    }

    switch (payload.eventName) {
      case 'AM-NODE-LOGIN-COMPLETED':
        session.nodeCount += 1;
        session.lastNode = info?.displayName ?? info?.nodeType;
        // A node event arriving for a session previously marked abandoned
        // means it wasn't actually abandoned -- self-heal back to running
        // rather than leaving a stale, now-wrong status displayed.
        if (session.status === 'running' || session.status === 'abandoned') {
          session.status = 'running';
          session.terminalAt = undefined;
        }
        break;
      case 'AM-TREE-LOGIN-COMPLETED':
        session.terminalAt = now;
        if (payload.result === 'FAILED') {
          session.status = 'failed';
          const rawFailure = info?.nodeExtraLogging?.failureReason;
          session.failureReason = rawFailure
            ? compactFailureReason(rawFailure)
            : (info?.nodeExtraLogging?.exception ?? 'failed');
        } else {
          session.status = 'finished';
        }
        break;
      default:
        break;
    }

    if (session.treeName) this.ensureTreeCached(session.treeName, onWarning);
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
      const raw = settings as unknown as Record<string, unknown>;
      this.realmSettings = {
        authenticationSessionsMaxDuration: asNumber(
          raw.authenticationSessionsMaxDuration
        ),
        suspendedAuthenticationTimeout: asNumber(
          raw.suspendedAuthenticationTimeout
        ),
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
        if (now - session.lastEventAt > effectiveMinutes * 60 * 1000) {
          session.status = 'abandoned';
          session.terminalAt = now;
        }
      }
    }

    // Evict completed sessions past their grace window, non-pinned first.
    for (const [transactionId, session] of this.sessions) {
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
        if (victim) this.sessions.delete(victim.transactionId);
      }
    }
  }
}

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}
