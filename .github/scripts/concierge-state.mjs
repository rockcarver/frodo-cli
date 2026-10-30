// What state an issue is in, as far as a maintainer is concerned.
//
// Deterministic: no LLM, no network. The labels already say where an issue is; this turns them into the questions a
// maintainer asks: is the Concierge managing this issue, whose move is it, has the reporter answered, what did the
// gates cost. The status issue (status-issue.mjs) renders the answers, and the commands that come after it will
// read the same state, so that what a maintainer is shown and what a command does cannot drift apart.
// Rules and reasons: docs/multi-phase-design.md, "The maintainer's view".
//
// Install: copy to .github/scripts/concierge-state.mjs (it imports janitor.mjs and opt-out.mjs, so install those too).
import { GATE, isCodingAgent } from './janitor.mjs';
import { isOptedOut, labelNames } from './opt-out.mjs';

export const BOT = 'github-actions[bot]';

/** The people whose answer is a maintainer's: a reply from anyone else is a reporter's. */
export const MAINTAINER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/** Whose move it is, and the label that says so, in the order the status issue lists them. */
export const QUEUES = [
  { id: 'decision', who: 'you', label: 'needs-decision', title: 'Held: changes what exists' },
  { id: 'scope', who: 'you', label: 'scope-review', title: 'Held: may not fit the scope' },
  { id: 'plan', who: 'you', label: 'plan-approval-required', title: 'Held: waiting for your approval' },
  { id: 'dependency', who: 'another issue', label: 'dependency-required', title: 'Waiting for a dependency' },
  { id: 'reporter', who: 'the reporter', label: 'needs-info', title: 'Waiting for the reporter' },
  { id: 'parked', who: 'nobody', label: 'backlog', title: 'Parked' },
];

export const GATE_LABELS = [...GATE.issue, ...GATE.pr];

/** The labels that only the Concierge applies. A label a repository may use for itself (`duplicate`, `spam`) proves nothing. */
const OTHER_CONCIERGE_LABELS = [
  'plan-approval-required', 'needs-decision', 'scope-review', 'out-of-scope', 'dependency-required', 'dependency-satisfied',
  'needs-info', 'backlog', 'low-hanging-fruit', 'related-repo', 'original-in-related-repo', 'waiting-for-release', 'released', 'declined',
];

export const CONCIERGE_LABELS = [...GATE_LABELS, ...OTHER_CONCIERGE_LABELS];

export const isConciergeLabel = (name) => CONCIERGE_LABELS.includes(name) || /^(complexity|risk)\//.test(name);

/** An issue in a gate for longer than this is stuck: a whole run of the three gates takes about a quarter of an hour. */
export const STUCK_AFTER_MINUTES = 60;

/** The queue of a managed issue, or the stage it is in when nobody has to move. */
export function queueOf(issue) {
  const labels = new Set(labelNames(issue));
  const queue = QUEUES.find((q) => labels.has(q.label));
  if (queue) return queue.id;
  if (GATE_LABELS.some((l) => labels.has(l))) return 'in-flight';
  if ((issue.assignees || []).some((a) => isCodingAgent(a.login || a))) return 'with-agent';
  if (labels.has('related-repo')) return 'elsewhere';
  return 'settled';
}

/**
 * What the Concierge is to this issue. `analysed` says the issue worker has commented on it, which the labels cannot
 * show for an issue that was analysed and then given no label (a fix already in review, say).
 * kind: pull-request | opted-out | bot-authored | managed (with a queue) | not-picked-up
 */
export function classify(issue, { analysed = false } = {}) {
  if (issue.pull_request) return { kind: 'pull-request' };
  if (isOptedOut(issue)) return { kind: 'opted-out' };
  if (issue.user && issue.user.type === 'Bot') return { kind: 'bot-authored' };
  if (!analysed && !labelNames(issue).some(isConciergeLabel)) return { kind: 'not-picked-up' };
  return { kind: 'managed', queue: queueOf(issue) };
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** True when a comment is the issue worker's analysis of this repository (gh-aw appends the marker to every comment). */
export function isAnalysis(comment, repo) {
  return Boolean(comment.user && comment.user.login === BOT && new RegExp(`gh-aw-workflow-call-id:\\s*${esc(repo)}/issue-worker(?![\\w-])`, 'i').test(comment.body || ''));
}

/** When a label was last applied, from the issue's events; null when it was never seen. */
export function labelledAt(events, label) {
  const times = (events || []).filter((e) => e.event === 'labeled' && e.label && e.label.name === label).map((e) => Date.parse(e.created_at));
  return times.length ? Math.max(...times) : null;
}

/** The hidden line the options comment starts with (scripts/commands.mjs). It is the bot's, and not anybody's reply. */
export const OPTIONS_MARKER = '<!-- concierge:options';
export const isOptionsComment = (comment) => Boolean(comment.user && comment.user.login === BOT && String(comment.body || '').includes(OPTIONS_MARKER));

/**
 * Reporter replies nobody has answered: the latest comment of an open issue is from a person who is not a maintainer
 * and not a bot, and is newer than `days`. comments: [{ issueNumber, id, created_at, user, author_association, html_url }].
 * Returns [{ number, login, at, url }], newest first.
 */
export function reporterReplies(comments, { now, days, openNumbers }) {
  const latest = new Map();
  for (const c of comments) {
    // The options comment is always the last one, so it must not hide a reporter's reply under it.
    if (!openNumbers.has(c.issueNumber) || isOptionsComment(c)) continue;
    const seen = latest.get(c.issueNumber);
    if (!seen || Date.parse(c.created_at) > Date.parse(seen.created_at) || (c.created_at === seen.created_at && c.id > seen.id)) latest.set(c.issueNumber, c);
  }
  const limit = now - days * 86400000;
  const out = [];
  for (const [number, c] of latest) {
    const login = c.user && c.user.login;
    const isBot = !login || c.user.type === 'Bot' || login === BOT || /\[bot\]$/.test(login);
    if (isBot || MAINTAINER_ASSOCIATIONS.has(c.author_association)) continue;
    const at = Date.parse(c.created_at);
    if (at >= limit) out.push({ number, login, at, url: c.html_url });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The AIC a gate reports in the footer of its comment ("· ~14 AIC ·"), or 0 for a comment without one. */
export function aicOf(body) {
  const footer = /Generated by \[Concierge[^\]]*\]\([^)]*\)[^\n]*?~(\d+(?:\.\d+)?) AIC/.exec(String(body || ''));
  return footer ? Number(footer[1]) : 0;
}

/** What the gates' comments report in the last `days` days. Runs that post no comment are not in it. */
export function spend(comments, { now, days = 7 }) {
  let total = 0;
  let last24h = 0;
  let counted = 0;
  for (const c of comments) {
    if (!(c.user && c.user.login === BOT)) continue;
    const at = Date.parse(c.created_at);
    if (at < now - days * 86400000) continue;
    const aic = aicOf(c.body);
    if (!aic) continue;
    counted += 1;
    total += aic;
    if (at >= now - 86400000) last24h += aic;
  }
  return { total: Math.round(total * 10) / 10, last24h: Math.round(last24h * 10) / 10, comments: counted };
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

/**
 * The health of the gates from their runs: when each last succeeded, and which failed in the last `days` days.
 * A skipped run (an `if:` that said no) and a cancelled one (a newer event replaced it) are normal and ignored.
 * runs: [{ name, conclusion, status, created_at, html_url }].
 */
export function runHealth(runs, { now, days = 7 }) {
  const gates = runs.filter((r) => /^Concierge /.test(r.name || ''));
  const lastGood = new Map();
  for (const r of gates) {
    if (r.conclusion !== 'success') continue;
    const at = Date.parse(r.created_at);
    if (!lastGood.has(r.name) || at > lastGood.get(r.name)) lastGood.set(r.name, at);
  }
  const failures = gates
    .filter((r) => r.status === 'completed' && FAILED.has(r.conclusion) && Date.parse(r.created_at) >= now - days * 86400000)
    .map((r) => ({ name: r.name, at: Date.parse(r.created_at), url: r.html_url }))
    .sort((a, b) => b.at - a.at);
  return { lastGood: [...lastGood].map(([name, at]) => ({ name, at })).sort((a, b) => a.name.localeCompare(b.name)), failures };
}

/** The pin file's source, version and channel. */
export function readPin(text) {
  const value = (key) => new RegExp(`^${key}:\\s*(\\S+)`, 'm').exec(String(text || ''))?.[1];
  return { source: value('source') || null, version: value('version') || null, channel: value('channel') || 'stable' };
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Negative, zero or positive like a comparator; a prerelease sorts below its release. Null when a tag is not a version. */
export function compareVersions(a, b) {
  const x = SEMVER.exec(a || '');
  const y = SEMVER.exec(b || '');
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  if (x[4] === y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  return x[4].localeCompare(y[4], 'en', { numeric: true });
}

/** The newest release the channel follows: `stable` skips prereleases, `prerelease` takes any published one. */
export function latestRelease(releases, channel) {
  const published = (releases || []).filter((r) => !r.draft && SEMVER.test(r.tag_name || ''));
  const wanted = channel === 'prerelease' ? published : published.filter((r) => !r.prerelease);
  return wanted.sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0]?.tag_name ?? null;
}

/**
 * When a token stops working, from the header GitHub puts on every answer ("2026-11-25 06:34:56 UTC"), as a time in
 * milliseconds. Null for a token without an expiry or an answer without the header.
 */
export function tokenExpiry(headerValue) {
  if (!headerValue) return null;
  const t = Date.parse(String(headerValue).replace(' UTC', 'Z').replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

// ------------------------------------------------------------------ text from outside

/**
 * An issue title or a login, made safe to put in a body the bot writes. A title is anyone's text: an `@name` would
 * mention that person, a `#12` would link the status issue into that issue's timeline, and markdown or HTML would
 * change what the page shows. Entities stop all of it, and the length is bounded.
 */
export function safeText(text, max = 80) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return cut.replace(/[@#&<>`*_~[\]|\\]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * How long ago, in the unit a person reads: "under 1 h", "3 h", "2 d". The unit is never smaller than an hour, so a
 * page that shows it changes once an hour at most; one that counted minutes would be rewritten by every run.
 */
export function ago(ms) {
  const hours = Math.floor(Math.max(0, ms) / 3600000);
  if (hours < 1) return 'under 1 h';
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
