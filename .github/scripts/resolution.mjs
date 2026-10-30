// Resolution notice for Issue Concierge.
//
// Deterministic: no LLM. When an issue is closed because a pull request merged, the reporter should read how it
// was resolved, in plain words, where they read: on the issue. A model used to post one fixed sentence ("Fixed in
// #N. Waiting for a release that includes this."). The explanation already exists, in the pull request, and a
// maintainer has read it before merging, so this copies it:
//   - the pull request's description has a `## Resolution` section, written for the reporter;
//   - when the pull request closes an issue, this posts that section on the issue, once, with the number of the
//     pull request in the first line (`Fixed in #N.`, which the release closer reads) and a line about the release;
//   - the related-repo closer posts the same text on the original issue of a split-repository link.
// The rules and the reasons: docs/multi-phase-design.md, "The resolution", and the decision record
// https://github.com/gearsnlevers/issue-concierge/blob/main/docs/decisions/0029-the-reporter-is-told-how-an-issue-was-resolved.md
//
// Trust. The section is text from a pull request, and anyone can write a pull request. It is used only when a
// person merged the pull request, so a maintainer has had it in front of them (record 0005), and it is copied by
// code, never read by a model, so there is nothing to inject into. The copy removes what could surprise a reader:
// HTML (and comments), images, and `@` mentions (a mention in a bot's comment would notify a stranger). It is capped
// in length. A pull request without a usable section gets the old one-line comment.
//
// Install: copy to .github/scripts/resolution.mjs. The workflow `waiting-for-release.yml` and
// scripts/related-repo-closer.mjs import it, and it imports opt-out.mjs, so install that too.
import { execFileSync } from 'node:child_process';
import { isOptedOut, labelNames, optedOutReason } from './opt-out.mjs';

export const LABEL_WAITING = 'waiting-for-release';
export const LABEL_RELEASED = 'released';
export const BEGIN = '<!-- issue-concierge:resolution:begin -->';
export const END = '<!-- issue-concierge:resolution:end -->';
export const MARKER = '<!-- issue-concierge:resolution';
// What a version before the product was named for its kind wrote. Those comments stay in the issues for good (the
// resolution comments of production have been there since v1.5.0), so they are read as the same thing: the text between
// the old lines is the resolution, and the old marker line says the comment was posted.
export const LEGACY_BEGIN = '<!-- concierge:resolution:begin -->';
export const LEGACY_END = '<!-- concierge:resolution:end -->';
export const LEGACY_MARKER = '<!-- concierge:resolution';
export const MAX_CHARS = 1500;
export const MIN_CHARS = 20;
const BOT = 'github-actions[bot]';
const MAX_PAGES = 5;

// ------------------------------------------------------------------ the section

/**
 * The text of the `## Resolution` section of a pull request description, or null when there is none.
 * The section runs from that heading to the next heading of the same or a higher level; a heading inside a code
 * fence does not count. `## Resolution`, `### Resolution` and a trailing colon are all accepted.
 */
export function extractSection(body) {
  const lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
  let fence = false;
  let level = 0;
  const out = [];
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      if (level) out.push(line);
      continue;
    }
    const h = fence ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      if (level) {
        if (h[1].length <= level) break;
      } else if (h[1].length >= 2 && h[1].length <= 3 && /^resolution\s*:?$/i.test(h[2])) {
        level = h[1].length;
        continue;
      }
    }
    if (level) out.push(line);
  }
  return level ? out.join('\n') : null;
}

/** Make text from a pull request safe to post as a comment from the harness. */
export function sanitize(text) {
  let t = String(text || '').replace(/\r\n?/g, '\n');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  t = t.replace(/<\/?[a-z][^>]*>/gi, '');
  // A mention in a comment the harness writes notifies whoever it names. Put it in a code span instead.
  t = t.replace(/(^|[^`\w@/])@([A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9._-]+)?)/g, '$1`@$2`');
  t = t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Cut text at the last paragraph or sentence end within `max` characters. */
export function cap(text, max = MAX_CHARS) {
  if (text.length <= max) return { text, cut: false };
  const head = text.slice(0, max);
  const para = head.lastIndexOf('\n\n');
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'));
  // Prefer the end of a paragraph or sentence, even an early one, to a cut in the middle of a thought.
  const boundary = Math.max(para, sentence + 1);
  const at = boundary > max * 0.3 ? boundary : head.lastIndexOf(' ');
  return { text: `${head.slice(0, at > 0 ? at : max).trimEnd()} …`, cut: true };
}

/**
 * The reporter's text for a pull request description, or null when it has no usable `## Resolution` section.
 * `cut` says it was shortened, so the caller can point at the pull request for the rest.
 */
export function resolutionOf(body) {
  const section = extractSection(body);
  if (section === null) return null;
  const clean = sanitize(section);
  // A placeholder a template or an agent leaves behind ("TBD", "TODO", "n/a", an emptied comment) is shorter than this.
  if (clean.length < MIN_CHARS) return null;
  return cap(clean);
}

/** Bare issue references (`#12`) name an issue of the repository the text came from; qualify them for another. */
export function qualifyRefs(text, repo) {
  return String(text).replace(/(^|[^\w/&`#])#(\d+)\b/g, `$1${repo}#$2`);
}

// ---------------------------------------------------------------- the comments

const ref = (pull, thisRepo) => (pull.repo && pull.repo !== thisRepo ? `${pull.repo}#${pull.number}` : `#${pull.number}`);

/** One-line comment for a fix that has no resolution text. The first line is what the release closer reads. */
export function plainComment(pull, thisRepo, released) {
  const r = pull ? ref(pull, thisRepo) : null;
  const first = r ? `Fixed in ${r}.` : 'Fixed.';
  return released ? `${first} Included in ${released}.` : `${first} Waiting for a release that includes this.`;
}

/**
 * The comment that carries the resolution. `pull` is { number, repo, url }, `resolution` is { text, cut },
 * `released` is the tag of a release that already contains the fix, or empty.
 */
export function resolutionComment(pull, resolution, thisRepo, released) {
  const parts = [`Fixed in ${ref(pull, thisRepo)}.`, '', BEGIN, resolution.text, END];
  if (resolution.cut && pull.url) parts.push('', `The full description is in ${pull.url}.`);
  const elsewhere = pull.repo && pull.repo !== thisRepo;
  parts.push(
    '',
    released
      ? `This is part of ${released}.`
      : elsewhere
        ? `This is merged in ${pull.repo}. It reaches users with a release of this project that includes it, and a comment here names that release.`
        : 'This is merged and will be in the next release. A comment here names the release when it is out.'
  );
  parts.push('', `${MARKER} ${ref(pull, thisRepo)} -->`);
  return parts.join('\n');
}

/** The marker line of the comment above, so a second run finds it. */
export const markerFor = (pull, thisRepo) => `${MARKER} ${ref(pull, thisRepo)} -->`;
/** The same line as an earlier version wrote it: a comment that has either one was posted already. */
export const legacyMarkerFor = (pull, thisRepo) => `${LEGACY_MARKER} ${ref(pull, thisRepo)} -->`;

/** The resolution text inside a comment the harness wrote, or null. */
export function textOfComment(body) {
  const s = String(body || '');
  for (const [begin, end] of [[BEGIN, END], [LEGACY_BEGIN, LEGACY_END]]) {
    const a = s.indexOf(begin);
    const b = s.indexOf(end);
    if (a < 0 || b < a) continue;
    const text = s.slice(a + begin.length, b).trim();
    return text || null;
  }
  return null;
}

// -------------------------------------------------------------------- reading

/** Every comment of an issue (a few pages at most), or null when GitHub says no. */
export function readComments(api, thisRepo, number) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = api(`repos/${thisRepo}/issues/${number}/comments?per_page=100&page=${page}`);
    if (!r || r.status !== 200 || !Array.isArray(r.data)) return page === 1 ? null : all;
    all.push(...r.data);
    if (r.data.length < 100) break;
  }
  return all;
}

const CLOSING_EVENT = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) {
        nodes {
          ... on ClosedEvent {
            stateReason
            closer {
              __typename
              ... on PullRequest { number merged url repository { nameWithOwner } }
              ... on Commit { oid url }
            }
          }
        }
      }
    }
  }
}`;

/**
 * What closed the issue: { event: null } when GitHub has not recorded the closing yet, or { event: { stateReason,
 * closer } } with `closer` null for a close by hand. `ctx.graphql(query, variables)` returns the data or null.
 */
export async function closingEvent(ctx, number) {
  const [owner, repo] = ctx.thisRepo.split('/');
  for (let attempt = 0; attempt < ctx.attempts; attempt++) {
    const data = ctx.graphql(CLOSING_EVENT, { owner, repo, number });
    if (data === undefined) return { error: 'the closing event could not be read' };
    const node = data && data.repository && data.repository.issue && data.repository.issue.timelineItems.nodes[0];
    if (node) return { event: { stateReason: node.stateReason, closer: node.closer || null } };
    if (attempt + 1 < ctx.attempts) await ctx.sleep(ctx.waitMs);
  }
  return { event: null };
}

/** The earliest published release of this repository after `mergedAt` that contains `sha` (by git), or ''. */
export function releaseContaining(ctx, sha, mergedAt) {
  const r = ctx.api(`repos/${ctx.thisRepo}/releases?per_page=20`);
  if (!r || r.status !== 200 || !Array.isArray(r.data)) return '';
  const after = r.data
    .filter((x) => !x.draft && x.published_at && x.published_at > mergedAt)
    .sort((a, b) => (a.published_at < b.published_at ? -1 : 1));
  if (after.length === 0 || !sha) return '';
  // Only `status` is needed. Without per_page the answer lists every commit and file between the two, which can be
  // megabytes, and a response over the buffer of the gh call looks like a failed call.
  const c = ctx.api(`repos/${ctx.thisRepo}/compare/${sha}...${after[0].tag_name}?per_page=1`);
  return c && c.status === 200 && c.data && (c.data.status === 'ahead' || c.data.status === 'identical') ? after[0].tag_name : '';
}

/**
 * The closing pull request of an issue and what it says: { pull, resolution } where `pull` is { number, repo,
 * url, mergedAt, sha } and `resolution` is { text, cut } or null; { commit } for a close by a commit; or
 * { reason } when nothing waits for a release (closed by hand, not planned, a duplicate, not merged).
 * Used by this script and by the related-repo closer.
 */
export async function closingFix(issue, ctx) {
  if (issue.state_reason === 'not_planned' || issue.state_reason === 'duplicate') {
    return { reason: `closed as ${issue.state_reason.replace(/_/g, ' ')}: nothing waits for a release` };
  }
  const found = await closingEvent(ctx, issue.number);
  if (found.error) return { error: found.error };
  const { event } = found;
  if (!event) return { reason: 'GitHub has not recorded how the issue was closed' };
  if (event.stateReason === 'NOT_PLANNED' || event.stateReason === 'DUPLICATE') {
    return { reason: `closed as ${event.stateReason.toLowerCase().replace(/_/g, ' ')}: nothing waits for a release` };
  }
  if (!event.closer) return { reason: 'closed by hand, with no pull request or commit: nothing waits for a release' };
  if (event.closer.__typename === 'Commit') return { commit: { oid: event.closer.oid, url: event.closer.url } };
  if (!event.closer.merged) return { reason: `closed by pull request #${event.closer.number}, which is not merged` };

  const repo = (event.closer.repository && event.closer.repository.nameWithOwner) || ctx.thisRepo;
  const r = ctx.api(`repos/${repo}/pulls/${event.closer.number}`);
  if (!r || r.status !== 200 || !r.data) return { error: `pull request ${repo}#${event.closer.number} could not be read (HTTP ${r ? r.status : 0})` };
  const p = r.data;
  const pull = { number: p.number, repo, url: p.html_url || event.closer.url, mergedAt: p.merged_at, sha: p.merge_commit_sha };
  // The text is used only when a person merged: that merge is the maintainer's look at the description (record 0005).
  const byPerson = Boolean(p.merged_by && p.merged_by.type === 'User');
  return { pull, resolution: byPerson ? resolutionOf(p.body) : null };
}

// ------------------------------------------------------------------- deciding

/**
 * Decide what to do about a closed issue. `issue` is the REST issue; `ctx` has `thisRepo`, `api(path)` (a read-only GET
 * returning { status, data }, never throwing), `graphql(query, variables)`, `sleep(ms)`, `attempts`, `waitMs`.
 * Returns { action: 'skip', reason } | { action: 'error', reason } | { action: 'post', label, comment, marker,
 * released, kind } where `label` is the label to add (or '') and `comment` the text to post.
 */
export async function decide(issue, ctx) {
  const skip = (reason) => ({ action: 'skip', reason });
  if (issue.pull_request) return skip('a pull request');
  if (issue.state !== 'closed') return skip('the issue is not closed');
  if (issue.user && issue.user.type === 'Bot') return skip('opened by a bot');
  if (isOptedOut(issue)) return skip(optedOutReason('issue'));
  // A manual run on an issue that was released long ago must not put it back to waiting.
  if (labelNames(issue).includes(LABEL_RELEASED)) return skip(`the issue carries ${LABEL_RELEASED} already`);

  const fix = await closingFix(issue, ctx);
  if (fix.error) return { action: 'error', reason: fix.error };
  if (fix.reason) return skip(fix.reason);

  // A close by a commit has no description to copy, and the release closer cannot tell by git which release holds a
  // fix it has no pull request number for: a maintainer explains it.
  if (fix.commit) return skip('closed by a commit, with no pull request: nothing to copy');

  const { pull, resolution } = fix;
  const released = pull.repo === ctx.thisRepo ? releaseContaining(ctx, pull.sha, pull.mergedAt) : '';
  const marker = markerFor(pull, ctx.thisRepo);
  const body = resolution
    ? resolutionComment(pull, resolution, ctx.thisRepo, released)
    : `${plainComment(pull, ctx.thisRepo, released)}\n\n${marker}`;
  return {
    action: 'post',
    kind: resolution ? 'resolution' : 'plain',
    label: released ? LABEL_RELEASED : LABEL_WAITING,
    released,
    marker,
    legacyMarker: legacyMarkerFor(pull, ctx.thisRepo),
    comment: body,
  };
}

/**
 * Do what `decide` found, through the injected write functions. The label goes first, then the comment, as the
 * release closer does: a run that stopped half way is finished by the next one, because each step checks first.
 */
export function apply(verdict, issue, ctx, comments) {
  const did = [];
  const have = new Set(labelNames(issue));
  const posted = comments.some(
    (c) =>
      c.user &&
      c.user.login === BOT &&
      c.user.type === 'Bot' &&
      [verdict.marker, verdict.legacyMarker].filter(Boolean).some((m) => String(c.body || '').includes(m))
  );
  if (verdict.label && !have.has(verdict.label)) {
    if (!ctx.dryRun) ctx.addLabel(issue.number, verdict.label);
    did.push(`labelled #${issue.number} ${verdict.label}`);
  }
  if (!posted) {
    if (!ctx.dryRun) ctx.comment(issue.number, verdict.comment);
    did.push(`commented on #${issue.number} (${verdict.kind})`);
  }
  return did;
}

// ----------------------------------------------------------------------- main

/** Read through the gh CLI. Returns { status, data } and never throws. */
export function ghApi(path, token) {
  try {
    const out = execFileSync('gh', ['api', path], {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 200, data: out ? JSON.parse(out) : null };
  } catch (e) {
    const m = /HTTP (\d{3})/.exec(String(e.stderr || e.message || ''));
    return { status: m ? Number(m[1]) : 0, data: null };
  }
}

/** A GraphQL query through the gh CLI: the data, or undefined when the call failed. */
export function ghGraphql(query, variables, token) {
  try {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [k, v] of Object.entries(variables)) args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
    const out = execFileSync('gh', args, {
      env: { ...process.env, GH_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    return parsed.errors ? undefined : parsed.data;
  } catch {
    return undefined;
  }
}

function ghWrite(args, token) {
  return execFileSync('gh', ['api', ...args], {
    env: { ...process.env, GH_TOKEN: token },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const thisRepo = env.GITHUB_REPOSITORY;
  const number = Number(env.ISSUE_NUMBER);
  if (!thisRepo || !Number.isInteger(number) || number <= 0) {
    console.error('GITHUB_REPOSITORY and ISSUE_NUMBER are required');
    return 1;
  }
  const token = env.GH_TOKEN;
  const api = (path) => ghApi(path, token);
  const issue = api(`repos/${thisRepo}/issues/${number}`);
  if (issue.status !== 200 || !issue.data) {
    console.log(`::error::#${number}: could not read the issue (HTTP ${issue.status}); nothing changed`);
    return 1;
  }
  const dryRun = argv.includes('--dry-run');
  const ctx = {
    thisRepo,
    api,
    graphql: (query, variables) => ghGraphql(query, variables, token),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // The closing event can lag the `closed` webhook by a few seconds; a close by hand has the event at once.
    attempts: 6,
    waitMs: 5000,
    dryRun,
    addLabel: (n, label) => ghWrite([`repos/${thisRepo}/issues/${n}/labels`, '--method', 'POST', '-f', `labels[]=${label}`], token),
    comment: (n, body) => ghWrite([`repos/${thisRepo}/issues/${n}/comments`, '--method', 'POST', '-f', `body=${body}`], token),
  };

  const verdict = await decide(issue.data, ctx);
  if (verdict.action === 'skip') {
    console.log(`#${number}: skipped (${verdict.reason})`);
    return 0;
  }
  if (verdict.action === 'error') {
    console.log(`::error::#${number}: ${verdict.reason}. Nothing changed.`);
    return 1;
  }
  const comments = readComments(api, thisRepo, number);
  if (!comments) {
    console.log(`::error::#${number}: the comments could not be read, so a comment already posted cannot be ruled out. Nothing changed.`);
    return 1;
  }
  try {
    const did = apply(verdict, issue.data, ctx, comments);
    console.log(`#${number}: ${did.length ? did.join(', ') : 'nothing to do, it was done already'}${dryRun ? ' (dry run, nothing written)' : ''}`);
    if (dryRun) console.log(`--- the comment ---\n${verdict.comment}`);
    return 0;
  } catch (e) {
    console.log(`::error::#${number}: ${String((e.stderr || e.message || e)).trim().split('\n')[0]}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
