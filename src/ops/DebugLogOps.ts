/**
 * `frodo debug` — AIC-only, topic-scoped smart log tail (item 25).
 *
 * @remarks
 * Reuses the existing `frodo.cloud.log.createLogTailStream()` polling
 * primitive (the same one `frodo log tail` already uses) — the new part is
 * classifying each raw audit-log event by topic and rendering it as a
 * short, human-readable line instead of dumping the full raw JSON payload.
 *
 * Journey and OAuth transforms below were built against real, live event
 * payloads captured this session against a real AIC tenant (including a
 * deliberately broken authentication tree, to see a genuine script-failure
 * payload rather than only success cases) — see `compactFailureReason`'s
 * own remarks for the exact raw string that was verified.
 *
 * SAML and sync topics are best-effort only: no real SAML SSO flow or IDM
 * reconciliation run was exercised this session (both would need
 * additional live-tenant setup — a configured external IdP/SP for SAML,
 * an active sync mapping for IDM recon — that wasn't available or safe to
 * improvise against a real tenant in this pass), so their event-name
 * recognition is inferred from naming convention alone, not confirmed
 * against real payloads. The generic fallback formatter means an
 * unrecognized SAML/sync event still renders as a short, readable line
 * (never silently dropped, never raw JSON) — it just isn't specially
 * compacted the way journey/OAuth events are.
 */
import { frodo } from '@rockcarver/frodo-lib';
import type {
  LogEventPayloadSkeleton,
  LogEventSkeleton,
} from '@rockcarver/frodo-lib/types/api/cloud/LogApi';
import type { LogTailStream } from '@rockcarver/frodo-lib/types/ops/cloud/LogOps';

import { printError, printMessage } from '../utils/Console';

const { createLogTailStream } = frodo.cloud.log;

export type DebugTopic = 'journey' | 'oauth' | 'saml' | 'sync' | 'all';

/**
 * Log sources to poll per topic. `journey` and `oauth` are live-verified
 * (see this file's own remarks); `saml`/`sync` are best-effort guesses at
 * the right sources, not confirmed live this session.
 */
export const DEBUG_TOPIC_SOURCES: Record<DebugTopic, string> = {
  journey: 'am-authentication',
  oauth: 'am-access',
  saml: 'am-access,am-authentication',
  sync: 'idm-sync,idm-recon',
  all: 'am-everything,idm-everything',
};

export type JourneyEventInfo = {
  treeName?: string;
  displayName?: string;
  nodeType?: string;
  nodeOutcome?: string;
  nodeExtraLogging?: { exception?: string; failureReason?: string };
};

export type AuditPayload = LogEventPayloadSkeleton &
  Record<string, unknown> & {
    component?: string;
    eventName?: string;
    result?: string;
    realm?: string;
    principal?: string[];
    userId?: string;
    /**
     * Ids of prior events this one causally traces back to. Confirmed live
     * against a real `MultiplePushDevicesExample` login: AM assigns a
     * *different* `transactionId` to each polling leg of a wait-node-based
     * flow (Select Push Device / Send Push / Wait For Push / Verify Push
     * are each their own leg), but every leg's events still carry the very
     * first leg's own event id here -- the only field that stays constant
     * across the whole real login attempt. See
     * `JourneyDebugAggregator`'s cross-transaction correlation.
     */
    trackingIds?: string[];
    entries?: Array<{ info?: JourneyEventInfo & Record<string, unknown> }>;
    http?: {
      request?: { method?: string; path?: string };
    };
    request?: { detail?: Record<string, unknown> };
    response?: {
      detail?: Record<string, unknown>;
      elapsedTime?: number;
      status?: string;
      statusCode?: string;
    };
  };

/**
 * The shape of an `am-core` or `idm-access` event -- two genuinely
 * different payload shapes that `JourneyDebugAggregator` nonetheless polls
 * as one combined source (see its own remarks on why), so one loose type
 * covers both rather than forcing an artificial union. `am-core` (confirmed
 * live) is a flat debug-log line: no `component`/`eventName`/`entries` the
 * way `AuditPayload` above has, just `level`/`logger`/`message`, an
 * `exception` stack trace when the line came from one, and a
 * `transactionId` also mirrored under `mdc.transactionId`. `idm-access`
 * (confirmed live) is itself an *audit* event, structurally closer to
 * `AuditPayload` -- `eventName: 'access'` is what distinguishes it from an
 * `am-core` line -- carrying the IDM REST call's `http.request`,
 * `response` (status/statusCode/detail), and the calling `userId` (e.g.
 * `idm-provisioning` for a journey-triggered call), always at `level:
 * 'INFO'` even when the call itself failed -- `response.status` is the
 * real success/failure signal, not `level`.
 */
export type DebugLogPayload = Record<string, unknown> & {
  level?: string;
  logger?: string;
  message?: string;
  exception?: string;
  eventName?: string;
  http?: { request?: { method?: string; path?: string } };
  response?: {
    status?: string;
    statusCode?: string;
    detail?: { message?: string; reason?: string; code?: number };
  };
  userId?: string;
  transactionId?: string;
  timestamp?: string;
};

/** Parses `event.payload`, which the Log API sometimes returns as a JSON string rather than an already-parsed object -- shared by `getAuditPayload`/`getDebugLogPayload` below, which only differ in the type they assert onto the same raw parse. */
function parseLogPayload(
  event: LogEventSkeleton
): Record<string, unknown> | undefined {
  if (!event.payload) return undefined;
  if (typeof event.payload === 'string') {
    try {
      return JSON.parse(event.payload) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return event.payload as Record<string, unknown>;
}

/** Parses an audit-source (e.g. `am-authentication`) event's payload. */
export function getAuditPayload(
  event: LogEventSkeleton
): AuditPayload | undefined {
  return parseLogPayload(event) as AuditPayload | undefined;
}

/** Parses a debug-source (e.g. `am-core`) event's payload -- see `DebugLogPayload`. */
export function getDebugLogPayload(
  event: LogEventSkeleton
): DebugLogPayload | undefined {
  return parseLogPayload(event) as DebugLogPayload | undefined;
}

/**
 * Decodes the numeric/named HTML entities AM's own audit logging encodes a
 * failure string with (confirmed live: a `ResourceExceptionScriptAdapter`
 * failure came through as `...entry &#39;fr-idm-uuid=...&#39; does not
 * exist...`) -- entities are meant for HTML embedding, not a terminal, so
 * left undecoded every quote/equals/angle-bracket in the message renders as
 * unreadable `&#39;`/`&#61;` noise. Exported (not just used internally by
 * `compactFailureReason` below) since `idm-access`'s own `response.detail`
 * text is worth passing through the same decoding, even though it isn't
 * wrapped in the Java-exception prefixes `compactFailureReason` also
 * strips -- confirmed live IDM's own message text isn't HTML-encoded the
 * way AM's is, but decoding defensively costs nothing (a no-op on already
 * plain text) and guards against a future IDM version that does encode it.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/**
 * Compacts an AM script-execution failure string down to the useful part —
 * the real error type/message and where it happened — dropping the
 * repeated `javax.script.ScriptException`/`ExecutionException`/`Wrapped
 * <FQCN>` wrapper layers AM's own exception chain always prepends, and
 * decoding the HTML entities AM encodes the message with (see
 * `decodeHtmlEntities`).
 *
 * @remarks
 * Verified live (2026-09-12, against a deliberately broken
 * ScriptedDecisionNode on a real AIC tenant): the raw
 * `nodeExtraLogging.failureReason` string looked like
 * `javax.script.ScriptException: java.util.concurrent.ExecutionException:
 * javax.script.ScriptException: ReferenceError: "x" is not defined.
 * (scriptName#2) in scriptName at line number 2 at column number 0` — this
 * extracts `ReferenceError: "x" is not defined (scriptName:2)`. A second
 * script (an `openidm`-binding IDM call against a nonexistent object)
 * instead wrapped the underlying IDM error as `Wrapped
 * org.forgerock.openam.scripting.wrappers.ResourceExceptionScriptAdapter:
 * No Such Entry: ...` — the generic `Wrapped <FQCN>:` prefix strip handles
 * that shape too, without hardcoding this one adapter class name.
 */
export function compactFailureReason(raw: string): string {
  let msg = decodeHtmlEntities(raw);
  const wrapperPrefix =
    /^(?:javax\.script\.ScriptException|java\.util\.concurrent\.ExecutionException):\s*|^Wrapped\s+[\w.$]+:\s*/;
  while (wrapperPrefix.test(msg)) {
    msg = msg.replace(wrapperPrefix, '');
  }
  const locationMatch = msg.match(
    /^(.*?)\.?\s*\(([^#()]+)#(\d+)\)\s*in\s+\2\s+at line number \d+ at column number \d+\s*$/
  );
  if (locationMatch) {
    return `${locationMatch[1]} (${locationMatch[2]}:${locationMatch[3]})`;
  }
  return msg;
}

/**
 * Renders one journey/tree-execution event as a compact line, or
 * `undefined` if it isn't a recognized journey event shape at all (still
 * distinct from "recognized but no specific transform" — see
 * `formatGenericAuditEvent`, used as the fallback one level up).
 */
export function formatJourneyEvent(payload: AuditPayload): string | undefined {
  const entry = payload.entries?.[0]?.info;
  switch (payload.eventName) {
    case 'AM-TREE-LOGIN-COMPLETED': {
      const tree = entry?.treeName ?? 'unknown tree';
      if (payload.result === 'FAILED') {
        const failureReason = entry?.nodeExtraLogging?.failureReason;
        const compact = failureReason
          ? compactFailureReason(failureReason)
          : (entry?.nodeExtraLogging?.exception ?? 'failed');
        return `[${tree}] FAILED: ${compact}`;
      }
      return `[${tree}] ${payload.result ?? 'completed'}`;
    }
    case 'AM-NODE-LOGIN-COMPLETED': {
      const tree = entry?.treeName ?? 'unknown tree';
      const node = entry?.displayName ?? entry?.nodeType ?? 'node';
      const typeSuffix = entry?.nodeType ? ` (${entry.nodeType})` : '';
      const outcomeSuffix =
        entry?.nodeOutcome !== undefined ? ` → ${entry.nodeOutcome}` : '';
      return `[${tree}] ${node}${typeSuffix}${outcomeSuffix}`;
    }
    case 'AM-LOGIN-COMPLETED':
    case 'AM-LOGIN-MODULE-COMPLETED': {
      const who = payload.principal?.[0] ?? payload.userId ?? 'unknown';
      return `Login ${payload.result ?? 'unknown'} as ${who}`;
    }
    default:
      return undefined;
  }
}

/** Strips the request/response path down to just the path portion (drops scheme+host, which repeat on every line and add no information). */
function shortPath(rawPath: string | undefined): string {
  if (!rawPath) return '';
  return rawPath.replace(/^https?:\/\/[^/]+/, '') || rawPath;
}

const MAX_SCOPE_VALUES = 4;

/** Truncates a long space-delimited scope string to its first few entries plus a "+N more" suffix — an AIC admin/service-account grant can list a dozen-plus scopes, which would otherwise dominate the line. */
function shortScope(scope: string | undefined): string | undefined {
  if (!scope) return undefined;
  const values = scope.split(' ').filter(Boolean);
  if (values.length <= MAX_SCOPE_VALUES) return scope;
  return `${values.slice(0, MAX_SCOPE_VALUES).join(' ')} (+${values.length - MAX_SCOPE_VALUES} more)`;
}

/**
 * Renders one OAuth2/OIDC event as a compact line, or `undefined` if it
 * isn't a recognized OAuth event shape.
 */
function formatOAuthEvent(payload: AuditPayload): string | undefined {
  const method = payload.http?.request?.method ?? '';
  const path = shortPath(payload.http?.request?.path);
  switch (payload.eventName) {
    case 'AM-ACCESS-OUTCOME': {
      const detail = payload.response?.detail ?? {};
      const status =
        payload.response?.statusCode ?? payload.response?.status ?? '?';
      const elapsed = payload.response?.elapsedTime;
      const parts = [`OAuth2 ${method} ${path} → ${status}`];
      if (elapsed !== undefined) parts.push(`[${elapsed}ms]`);
      if (detail.client_id) parts.push(`client=${detail.client_id}`);
      const scope = shortScope(detail.scope as string | undefined);
      if (scope) parts.push(`scope=${scope}`);
      return parts.join(' ');
    }
    case 'AM-ACCESS-ATTEMPT': {
      const detail = payload.request?.detail ?? {};
      const parts = [`OAuth2 ${method} ${path} (attempt)`];
      if (detail.grant_type) parts.push(`grant_type=${detail.grant_type}`);
      if (detail.client_id) parts.push(`client=${detail.client_id}`);
      return parts.join(' ');
    }
    default:
      return undefined;
  }
}

/**
 * Generic fallback for an event that belongs to the requested topic (by
 * source/component) but has no dedicated transform above — renders a
 * short summary from whatever fields are actually present, rather than
 * either silently dropping the event or dumping the full raw payload. This
 * is the only formatter used for the `saml`/`sync` topics today (see this
 * file's own top-of-file remarks on why those aren't live-tuned yet).
 */
function formatGenericAuditEvent(payload: AuditPayload): string {
  const parts = [payload.eventName ?? payload.type ?? 'event'];
  if (payload.result) parts.push(payload.result);
  if (payload.realm) parts.push(`realm=${payload.realm}`);
  const who = payload.principal?.[0] ?? payload.userId;
  if (who) parts.push(`by ${who}`);
  return parts.join(' ');
}

/**
 * Classifies and formats one raw log event for the given topic. Returns
 * `undefined` when the event doesn't belong to the topic at all (filtered
 * out); otherwise always returns a short, human-readable line — either
 * from a topic-specific transform or the generic fallback.
 */
export function formatDebugEvent(
  event: LogEventSkeleton,
  topic: DebugTopic
): string | undefined {
  const payload = getAuditPayload(event);
  if (!payload) return undefined;

  const isJourney = payload.component === 'Authentication';
  const isOAuth = payload.component === 'OAuth';
  const isSaml =
    payload.component === 'SAML2' ||
    /saml/i.test(payload.eventName ?? '') ||
    /saml/i.test(payload.http?.request?.path ?? '');
  const isSync =
    event.source?.includes('idm-sync') || event.source?.includes('idm-recon');

  switch (topic) {
    case 'journey':
      return isJourney
        ? (formatJourneyEvent(payload) ?? formatGenericAuditEvent(payload))
        : undefined;
    case 'oauth':
      return isOAuth
        ? (formatOAuthEvent(payload) ?? formatGenericAuditEvent(payload))
        : undefined;
    case 'saml':
      return isSaml ? formatGenericAuditEvent(payload) : undefined;
    case 'sync':
      return isSync ? formatGenericAuditEvent(payload) : undefined;
    case 'all': {
      if (isJourney)
        return formatJourneyEvent(payload) ?? formatGenericAuditEvent(payload);
      if (isOAuth)
        return formatOAuthEvent(payload) ?? formatGenericAuditEvent(payload);
      if (isSaml || isSync) return formatGenericAuditEvent(payload);
      return formatGenericAuditEvent(payload);
    }
    default:
      return undefined;
  }
}

/**
 * Continuously tails and smart-renders logs for one topic, matching
 * `frodo log tail`'s existing recursive-poll pattern (a 5-second interval)
 * — this is not new polling machinery, just a new rendering layer on top
 * of `frodo.cloud.log.createLogTailStream()`, the deduped `tail()` wrapper
 * (cookie-tracking and redelivery-dedup both live centrally in frodo-lib
 * now -- see its own remarks on why raw `tail()` needs a wrapper at all).
 * `stream` is only ever passed by this function's own recursive call, to
 * carry the same stream (and its dedup state) forward across polls rather
 * than starting a fresh one — external callers always omit it.
 */
export async function debugTail(
  topic: DebugTopic,
  stream?: LogTailStream
): Promise<void> {
  try {
    const source = DEBUG_TOPIC_SOURCES[topic];
    const tailStream = stream ?? createLogTailStream(source);
    const events = await tailStream.poll();
    for (const event of events) {
      const line = formatDebugEvent(event, topic);
      if (line) {
        printMessage(line, 'data');
      }
    }
    setTimeout(() => {
      debugTail(topic, tailStream);
    }, 5000);
  } catch (error) {
    printError(error);
  }
}
