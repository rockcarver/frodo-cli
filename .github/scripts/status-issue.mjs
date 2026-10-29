// The status issue of Repo Concierge.
//
// Deterministic: no LLM. One pinned issue per repository, written and kept up to date by the bot, that shows the
// maintainers of that repository what the Concierge is doing: what waits for them, which reporters have answered,
// which issues the Concierge manages and which it does not, whether the gates are healthy and what they cost.
// Everything on it is derived from the repository's own state (issues, labels, comments, runs, the pin file), so a
// deployment needs no store and no access beyond the repository. The Concierge never acts on this issue: it is opened
// by a bot and carries no-auto-processing, and every gate skips both. Rules and reasons:
// docs/multi-phase-design.md, "The maintainer's view".
//
// Install: copy to .github/scripts/status-issue.mjs (it imports concierge-settings.mjs, concierge-state.mjs,
// janitor.mjs and opt-out.mjs, so install those too).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { SETTINGS_PATH, parseSettings } from './concierge-settings.mjs';
import {
  BOT, QUEUES, STUCK_AFTER_MINUTES, GATE_LABELS, ago, classify, compareVersions, isAnalysis, labelledAt, latestRelease,
  readPin, reporterReplies, runHealth, safeText, spend, tokenExpiry,
} from './concierge-state.mjs';
import { LABEL_OPT_OUT, labelNames } from './opt-out.mjs';

export const TITLE = 'Concierge status';
/** The hidden line that tells the status issue from every other issue the bot opened. */
export const MARKER = '<!-- concierge:status -->';
/** Items listed per queue; the rest is a link to the search. */
export const LIST_CAP = 10;
/** Issues whose comments are read to find out whether the issue worker has seen them. */
const ANALYSIS_CHECKS = 40;
/** Issues whose events are read to find out how long they have waited. */
const EVENT_CHECKS = 40;
/** GitHub accepts 65,536 characters in a body; the page stays well below. */
const BODY_LIMIT = 60000;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAINTAINER_DOCS = 'https://github.com/gearsnlevers/issue-concierge/blob/main/docs/multi-phase-design.md#the-maintainers-view';

const URL_OF = (repo, q) => `https://github.com/${repo}/issues?q=${encodeURIComponent(q)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const minute = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// ------------------------------------------------------------------ from the raw facts to the page's numbers

/**
 * raw: { repo, issues (the open ones, pull requests included), comments, events (number -> events), analysed (a set of
 * numbers), runs, pin, latest, token }; settings as parseSettings gives them; now in milliseconds.
 */
export function summarize(raw, settings, now) {
  const counts = { open: 0, managed: 0, optedOut: 0, botAuthored: 0, notPickedUp: 0 };
  const queues = new Map(QUEUES.map((q) => [q.id, { ...q, items: [] }]));
  const stages = { 'in-flight': [], 'with-agent': 0, elsewhere: 0, settled: 0 };
  const openNumbers = new Set();
  const optedOut = new Set();
  const byNumber = new Map();

  for (const issue of raw.issues) {
    const c = classify(issue, { analysed: raw.analysed.has(issue.number) });
    if (c.kind === 'pull-request') continue;
    counts.open += 1;
    openNumbers.add(issue.number);
    byNumber.set(issue.number, issue);
    if (c.kind === 'opted-out') { counts.optedOut += 1; optedOut.add(issue.number); continue; }
    if (c.kind === 'bot-authored') { counts.botAuthored += 1; continue; }
    if (c.kind === 'not-picked-up') { counts.notPickedUp += 1; continue; }
    counts.managed += 1;
    const events = raw.events.get(issue.number);
    if (queues.has(c.queue)) {
      const q = queues.get(c.queue);
      const since = labelledAt(events, q.label) ?? Date.parse(issue.updated_at);
      q.items.push({ number: issue.number, title: issue.title, since });
    } else if (c.queue === 'in-flight') {
      const gate = GATE_LABELS.find((l) => labelNames(issue).includes(l));
      const since = labelledAt(events, gate) ?? Date.parse(issue.updated_at);
      stages['in-flight'].push({ number: issue.number, title: issue.title, gate, since, stuck: now - since > STUCK_AFTER_MINUTES * 60000 });
    } else stages[c.queue] += 1;
  }
  for (const q of queues.values()) q.items.sort((a, b) => a.since - b.since);
  stages['in-flight'].sort((a, b) => a.since - b.since);

  const replies = reporterReplies(raw.comments, { now, days: settings['reporter-replies-days'], openNumbers }).map((r) => ({
    ...r,
    title: byNumber.get(r.number)?.title ?? '',
    optedOut: optedOut.has(r.number),
  }));

  const health = runHealth(raw.runs, { now });
  const pinned = raw.pin;
  const behind = pinned.version && raw.latest && compareVersions(raw.latest, pinned.version) > 0 ? raw.latest : null;
  return {
    repo: raw.repo, now, settings, counts, queues: [...queues.values()], stages, replies, health,
    spend: spend(raw.comments, { now }), pin: pinned, latest: raw.latest, behind, token: raw.token,
    problems: raw.problems ?? [], pinNote: raw.pinNote ?? null, paused: raw.paused ?? null,
  };
}

// ------------------------------------------------------------------ the page

function issueLine(m, item, extra = '') {
  return `- #${item.number} ${safeText(item.title)}${extra}`;
}

function waitingList(m, queue) {
  const shown = queue.items.slice(0, LIST_CAP);
  const lines = shown.map((i) => issueLine(m, i, ` · waiting ${ago(m.now - i.since)}`));
  if (queue.items.length > shown.length) lines.push(`- and ${queue.items.length - shown.length} more: [all ${queue.items.length}](${URL_OF(m.repo, `is:issue is:open label:${queue.label}`)})`);
  return lines;
}

/** The page. Everything a person reads is built here from the numbers summarize gave; nothing in it is a model's. */
export function render(m) {
  const { repo, counts, settings } = m;
  const L = [];
  const you = m.queues.filter((q) => q.who === 'you');
  const youCount = you.reduce((n, q) => n + q.items.length, 0);

  L.push(MARKER, `# ${TITLE}`, '', `Last changed ${minute(m.now)} · [What is this page?](${MAINTAINER_DOCS})`, '');
  if (m.paused) {
    L.push(`> ⏸ **Paused**${m.paused.since ? ` since ${minute(Date.parse(m.paused.since))}` : ''}. No gate, sweep, closer or notifier touches an issue or a pull request, and runs that are already in flight finish. To resume, delete the repository variable \`CONCIERGE_PAUSED\` or set it to anything but \`true\`: [Settings › Variables](https://github.com/${repo}/settings/variables/actions). An issue that was in a gate meanwhile may need \`/retry\` afterwards.`, '');
  }
  if (m.pinNote) L.push(`> ⚠ This issue is not pinned: ${m.pinNote}`, '');

  L.push(`## Needs you (${youCount})`, '');
  if (youCount === 0) L.push('Nothing is waiting for a maintainer.', '');
  for (const q of you) {
    if (q.items.length === 0) continue;
    L.push(`**${q.title}** · [${plural(q.items.length, 'issue')}](${URL_OF(repo, `is:issue is:open label:${q.label}`)})`, ...waitingList(m, q), '');
  }

  L.push(`## Reporter replies waiting (${m.replies.length})`, '');
  if (m.replies.length === 0) {
    L.push(`No open issue has a reporter reply from the last ${plural(settings['reporter-replies-days'], 'day')} that nobody has answered.`, '');
  } else {
    L.push(`The latest comment is from someone who is not a maintainer or a bot, from the last ${plural(settings['reporter-replies-days'], 'day')}.`, '');
    for (const r of m.replies.slice(0, LIST_CAP)) {
      L.push(`- #${r.number} ${safeText(r.title)} · \`${safeText(r.login, 39)}\` replied ${ago(m.now - r.at)} ago${r.optedOut ? ' · opted out, the Concierge will not answer' : ''}${r.url ? ` · [comment](${r.url})` : ''}`);
    }
    if (m.replies.length > LIST_CAP) L.push(`- and ${m.replies.length - LIST_CAP} more`);
    L.push('');
  }

  const stuck = m.stages['in-flight'].filter((i) => i.stuck);
  L.push(`## In flight (${m.stages['in-flight'].length})${stuck.length ? ` · ${stuck.length} stuck` : ''}`, '');
  if (m.stages['in-flight'].length === 0) L.push('No issue is in a gate.', '');
  else {
    for (const i of m.stages['in-flight'].slice(0, LIST_CAP)) L.push(issueLine(m, i, ` · \`${i.gate}\` for ${ago(m.now - i.since)}${i.stuck ? ' ⚠ stuck' : ''}`));
    if (m.stages['in-flight'].length > LIST_CAP) L.push(`- and ${m.stages['in-flight'].length - LIST_CAP} more`);
    L.push('');
  }

  const other = m.queues.filter((q) => q.who !== 'you');
  const rest = [
    ...other.map((q) => `${q.title.toLowerCase()}: [${q.items.length}](${URL_OF(repo, `is:issue is:open label:${q.label}`)})`),
    `with the coding agent: ${m.stages['with-agent']}`,
    `tracked in another repository: ${m.stages.elsewhere}`,
    `settled: ${m.stages.settled}`,
  ];
  L.push('## Everything else the Concierge manages', '', rest.map((r) => r[0].toUpperCase() + r.slice(1)).join(' · '), '');

  L.push('## Which issues the Concierge manages', '');
  L.push(`${plural(counts.open, 'open issue')} = **${counts.managed} managed** · ${counts.optedOut} opted out (\`${LABEL_OPT_OUT}\`) · ${counts.botAuthored} opened by bots · ${counts.notPickedUp} not yet picked up`, '');
  L.push(`Every number on this page counts the ${counts.managed} managed issues, except the reporter replies, which also include opted-out issues.`, '');

  L.push('## Health', '');
  const last = m.health.lastGood;
  L.push(last.length ? `- Last good run: ${last.map((g) => `${g.name.replace(/^Concierge /, '')} ${ago(m.now - g.at)} ago`).join(' · ')}` : '- No gate has run successfully in the runs GitHub lists.');
  if (m.health.failures.length === 0) L.push('- Failed runs in the last 7 days: none');
  else {
    L.push(`- Failed runs in the last 7 days: ${m.health.failures.length}`);
    for (const f of m.health.failures.slice(0, 5)) L.push(`  - [${safeText(f.name.replace(/^Concierge /, ''))}](${f.url}) ${ago(m.now - f.at)} ago`);
  }
  if (m.pin.version) {
    L.push(`- Pinned: \`${m.pin.version}\` (${m.pin.channel}) from \`${m.pin.source}\`${m.behind ? ` · ⚠ ${m.behind} is available, the updater opens a pull request` : m.latest ? ' · up to date' : ''}`);
  } else L.push('- No pin file (`.github/concierge.yml`) was found.');
  L.push(`- ${tokenLine(m)}`, '');

  L.push('## Spend', '');
  L.push(m.spend.comments
    ? `About ${m.spend.total} AIC in the last 7 days (${m.spend.last24h} in the last 24 hours), from ${plural(m.spend.comments, 'comment')} of the gates. A run that posts no comment is not counted.`
    : 'No comment of a gate reports a cost in the last 7 days.', '');

  L.push('## Settings', '');
  L.push(`\`status-issue\`: ${settings['status-issue']} · \`reporter-replies-days\`: ${settings['reporter-replies-days']}. The file is \`${SETTINGS_PATH}\`; without it the defaults apply.`);
  for (const p of m.problems) L.push(`- ⚠ ${safeText(p, 160)}`);
  L.push('');

  const data = {
    schema: 1, repo, generatedAt: new Date(m.now).toISOString(), paused: Boolean(m.paused),
    open: counts.open, managed: counts.managed, optedOut: counts.optedOut, botAuthored: counts.botAuthored, notPickedUp: counts.notPickedUp,
    queues: Object.fromEntries(m.queues.map((q) => [q.id, q.items.length])), inFlight: m.stages['in-flight'].length, stuck: stuck.length,
    withAgent: m.stages['with-agent'], elsewhere: m.stages.elsewhere, settled: m.stages.settled,
    replies: m.replies.length, failedRuns7d: m.health.failures.length, pinned: m.pin.version, behind: m.behind,
    aic7d: m.spend.total, aic24h: m.spend.last24h,
  };
  L.push('<details><summary>The same numbers for a dashboard</summary>', '', '```json', JSON.stringify(data, null, 2), '```', '', '</details>');
  const body = L.join('\n');
  return body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT)}\n\n…` : body;
}

function tokenLine(m) {
  const t = m.token;
  if (!t || t.state === 'missing') return '⚠ `SIGNAL_TOKEN` is not set: the gates cannot hand an issue to the next gate.';
  if (t.state === 'rejected') return `⚠ \`SIGNAL_TOKEN\` is rejected by GitHub (HTTP ${t.status}): the gates cannot label. Renew it.`;
  if (t.state === 'unknown') return '`SIGNAL_TOKEN` could not be checked (GitHub did not answer).';
  if (!t.expiresAt) return '`SIGNAL_TOKEN` is accepted and has no expiry date.';
  const left = Math.ceil((t.expiresAt - m.now) / 86400000);
  return `${left < 14 ? '⚠ ' : ''}\`SIGNAL_TOKEN\` expires ${day(t.expiresAt)} (in ${plural(left, 'day')})${left < 14 ? '. Renew it before then' : ''}.`;
}

/** The body without what changes on every run, to decide whether an edit is needed. */
export function normalise(body) {
  return String(body || '').replace(/^Last changed .*? · /m, 'Last changed X · ').replace(/"generatedAt": "[^"]*"/, '"generatedAt": "X"');
}

// ------------------------------------------------------------------ the nudge

/** The hidden line the mention comment starts with. It is the bot's comment on the status issue, found by this line. */
export const MENTION_MARKER = '<!-- concierge:mention -->';
/** At most this many people are named in one comment. */
export const MENTION_CAP = 20;
/** Items listed in a mention comment; the rest is a count. */
const MENTION_ITEMS = 10;

/** The items that wait for a maintainer and have waited `days` days or more, oldest first. Nothing for 0. */
export function overdue(model, days) {
  if (!(days > 0)) return [];
  const limit = days * 86400000;
  return model.queues
    .filter((q) => q.who === 'you')
    .flatMap((q) => q.items.filter((i) => model.now - i.since >= limit).map((i) => ({ number: i.number, title: i.title, since: i.since, queue: q.title })))
    .sort((a, b) => a.since - b.since);
}

/** The people to mention from the collaborators GitHub lists: users with the maintain or admin role, at most MENTION_CAP, by login. */
export function maintainersOf(collaborators) {
  return [...new Set((collaborators || []).filter((c) => c && c.type === 'User' && ['maintain', 'admin'].includes(c.role_name) && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(c.login || '')).map((c) => c.login))].sort((a, b) => a.localeCompare(b)).slice(0, MENTION_CAP);
}

/** The comment. The logins are the only mentions in it; the titles are written so that they mention nobody. */
export function renderMention(logins, items, days, now) {
  const L = [MENTION_MARKER, logins.map((l) => `@${l}`).join(' '), ''];
  L.push(`${plural(items.length, 'issue')} ${items.length === 1 ? 'has' : 'have'} waited for a maintainer for ${plural(days, 'day')} or more:`, '');
  for (const i of items.slice(0, MENTION_ITEMS)) L.push(`- #${i.number} ${safeText(i.title)} · ${i.queue.toLowerCase()} · waiting ${ago(now - i.since)}`);
  if (items.length > MENTION_ITEMS) L.push(`- and ${items.length - MENTION_ITEMS} more, listed on this page`);
  L.push('', 'The lists above say what each one needs. To stop these comments, set `mention-after-days: 0` in `.github/agentic-workflows/settings.yml`.');
  return L.join('\n');
}

/**
 * What to do about the nudge: { post, remove }. `previous` is the latest mention comment (id, created_at) or null.
 * One comment per period at most; the old one goes when a new one is posted, and when nothing waits that long any more.
 */
export function planMention({ previous, items, logins, days, now }) {
  const remove = previous ? previous.id : null;
  if (items.length === 0) return { post: false, remove, reason: 'nothing has waited that long' };
  if (logins.length === 0) return { post: false, remove: null, reason: 'nobody to mention: the collaborators could not be listed' };
  if (previous && now - Date.parse(previous.created_at) < days * 86400000) return { post: false, remove: null, reason: 'the last mention is newer than the period' };
  return { post: true, remove, reason: `${plural(items.length, 'item')} waited ${plural(days, 'day')} or more` };
}

/** Mention the maintainers on the status issue when something has waited too long. Returns the log line. */
export function nudge(ctx, repo, number, model, settings, signalToken) {
  const days = settings['mention-after-days'];
  const items = overdue(model, days);
  const comments = ctx.list(`repos/${repo}/issues/${number}/comments`) ?? [];
  const mentions = comments.filter((c) => c.user && c.user.login === BOT && String(c.body || '').startsWith(MENTION_MARKER));
  const previous = mentions.length ? mentions[mentions.length - 1] : null;
  // Listing the collaborators needs more than the workflow token may have: try it first, then the signal token.
  let listed = null;
  if (items.length) {
    listed = ctx.list(`repos/${repo}/collaborators`);
    if (!listed && signalToken) listed = ctx.list(`repos/${repo}/collaborators`, { token: signalToken });
  }
  const logins = maintainersOf(listed);
  const plan = planMention({ previous, items, logins, days, now: model.now });
  for (const extra of mentions.slice(0, -1)) ctx.write('DELETE', `repos/${repo}/issues/comments/${extra.id}`);
  if (plan.remove !== null) ctx.write('DELETE', `repos/${repo}/issues/comments/${plan.remove}`);
  if (plan.post) ctx.write('POST', `repos/${repo}/issues/${number}/comments`, { body: renderMention(logins, items, days, model.now) });
  return `mention: ${plan.post ? `mentioned ${plural(logins.length, 'person', 'people')} about ${plural(items.length, 'issue')}` : plan.reason}`;
}

// ------------------------------------------------------------------ GitHub

const flag = (e) => String((e && (e.stderr || e.message)) || '').trim().split('\n')[0];

/** The real context: the gh CLI, with the read token for reads and the signal token where a call needs it. */
export function realContext(env = process.env) {
  // A page of 100 workflow runs is more than the 1 MiB that execFileSync allows by default.
  const run = (args, token) => execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER });
  const get = (path, token = env.GH_TOKEN) => {
    try {
      const out = run(['api', path], token);
      return { status: 200, data: out ? JSON.parse(out) : null };
    } catch (e) {
      const m = /HTTP (\d{3})/.exec(String(e.stderr || e.message || ''));
      return { status: m ? Number(m[1]) : 0, data: null };
    }
  };
  return {
    now: Date.now(),
    get,
    list(path, { maxPages = 20, token } = {}) {
      const all = [];
      for (let page = 1; page <= maxPages; page += 1) {
        const res = get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
        if (res.status !== 200 || !Array.isArray(res.data)) return null;
        all.push(...res.data);
        if (res.data.length < 100) break;
      }
      return all;
    },
    runs(since) {
      const all = [];
      for (let page = 1; page <= 3; page += 1) {
        const res = get(`repos/${env.GITHUB_REPOSITORY}/actions/runs?per_page=100&page=${page}&created=${encodeURIComponent(`>=${since}`)}`);
        if (res.status !== 200 || !res.data) return page === 1 ? null : all;
        all.push(...(res.data.workflow_runs || []));
        if ((res.data.workflow_runs || []).length < 100) break;
      }
      return all;
    },
    /** The status code and the token-expiry header GitHub puts on an answer to this token. */
    probe(token) {
      if (!token) return { state: 'missing' };
      try {
        const out = run(['api', '-i', 'rate_limit'], token);
        const header = /^github-authentication-token-expiration:\s*(.+)$/im.exec(out)?.[1]?.trim();
        return { state: 'ok', expiresAt: tokenExpiry(header) };
      } catch (e) {
        const m = /HTTP (\d{3})/.exec(String(e.stderr || e.message || ''));
        return m && (m[1] === '401' || m[1] === '403') ? { state: 'rejected', status: Number(m[1]) } : { state: 'unknown' };
      }
    },
    write(method, path, body, token = env.GH_TOKEN) {
      const args = ['api', path, '--method', method, ...(body ? ['--input', '-'] : [])];
      return JSON.parse(execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAX_BUFFER }) || 'null');
    },
    graphql(query, variables, token = env.GH_TOKEN) {
      const args = ['api', 'graphql', '-f', `query=${query}`];
      for (const [k, v] of Object.entries(variables)) args.push('-F', `${k}=${v}`);
      return JSON.parse(run(args, token));
    },
    read: (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
  };
}

/** Collect the facts. Returns null when the issues cannot be read: the page is not rewritten from nothing. */
export function collect(ctx, repo, settings, signalToken, paused = false) {
  const now = ctx.now;
  const issues = ctx.list(`repos/${repo}/issues?state=open`);
  if (!issues) return null;
  const candidates = issues.filter((i) => !i.pull_request && !(i.body || '').includes(MARKER));

  const windowDays = Math.max(settings['reporter-replies-days'], 7);
  const since = new Date(now - windowDays * 86400000).toISOString();
  const rawComments = ctx.list(`repos/${repo}/issues/comments?since=${encodeURIComponent(since)}`, { maxPages: 10 }) ?? [];
  const comments = rawComments.map((c) => ({ ...c, issueNumber: Number(String(c.issue_url).split('/').pop()) }));

  const analysed = new Set();
  let checks = 0;
  for (const issue of candidates) {
    if (classify(issue).kind !== 'not-picked-up' || checks >= ANALYSIS_CHECKS) continue;
    checks += 1;
    const list = ctx.list(`repos/${repo}/issues/${issue.number}/comments`, { maxPages: 3 });
    if (list && list.some((c) => isAnalysis(c, repo))) analysed.add(issue.number);
  }

  const events = new Map();
  const waiting = candidates
    .map((i) => ({ i, c: classify(i, { analysed: analysed.has(i.number) }) }))
    .filter(({ c }) => QUEUES.some((q) => q.who === 'you' && q.id === c.queue) || c.queue === 'in-flight')
    .slice(0, EVENT_CHECKS);
  for (const { i } of waiting) events.set(i.number, ctx.list(`repos/${repo}/issues/${i.number}/events`, { maxPages: 3 }) ?? []);

  const pin = readPin(ctx.read('.github/concierge.yml'));
  let latest = null;
  if (pin.source) {
    const releases = ctx.get(`repos/${pin.source}/releases?per_page=30`);
    if (releases.status === 200) latest = latestRelease(releases.data, pin.channel);
  }
  const runs = ctx.runs(new Date(now - 7 * 86400000).toISOString().slice(0, 10)) ?? [];
  // When the variable was last set is the nearest thing to "paused since"; the workflow token may not be allowed to read it.
  const variable = paused ? ctx.get(`repos/${repo}/actions/variables/CONCIERGE_PAUSED`) : null;
  const pausedSince = variable && variable.status === 200 && variable.data ? variable.data.updated_at ?? null : null;
  return { repo, issues: candidates, comments, analysed, events, runs, pin, latest, token: ctx.probe(signalToken), paused: paused ? { since: pausedSince } : null };
}

const PIN = 'mutation($id: ID!) { pinIssue(input: {issueId: $id}) { issue { id } } }';
const UNPIN = 'mutation($id: ID!) { unpinIssue(input: {issueId: $id}) { issue { id } } }';
const IS_PINNED = 'query($id: ID!) { node(id: $id) { ... on Issue { isPinned } } }';

/** Find the status issue among the issues the bot opened, open or closed. */
export function findStatusIssue(ctx, repo) {
  const bot = ctx.list(`repos/${repo}/issues?state=all&creator=${encodeURIComponent(BOT)}`, { maxPages: 5 }) ?? [];
  return bot.find((i) => !i.pull_request && (i.body || '').includes(MARKER)) ?? null;
}

/**
 * Bring the status issue to what the settings and the numbers say. Returns { action, pinned, number } for the log.
 * build(pinNote) renders the page; it is injected so that the decision can be tested without a repository.
 */
export function reconcile(ctx, repo, settings, existing, build, signalToken) {
  if (!settings['status-issue']) {
    if (existing && existing.state === 'open') {
      try { ctx.graphql(UNPIN, { id: existing.node_id }, signalToken); } catch { /* it was not pinned */ }
      ctx.write('PATCH', `repos/${repo}/issues/${existing.number}`, { state: 'closed', state_reason: 'not_planned' });
      return { action: 'closed' };
    }
    return { action: 'off' };
  }
  let issue = existing;
  let current = existing ? existing.body || '' : '';
  let action = 'unchanged';
  if (!issue) {
    current = build(null);
    issue = ctx.write('POST', `repos/${repo}/issues`, { title: TITLE, body: current, labels: [LABEL_OPT_OUT] });
    action = 'created';
  } else if (issue.state !== 'open') {
    ctx.write('PATCH', `repos/${repo}/issues/${issue.number}`, { state: 'open' });
    action = 'reopened';
  }

  // Pin it. A repository holds at most three pinned issues, and the signal token may not be allowed: the page says so.
  let pinNote = null;
  let pinned = false;
  try {
    pinned = Boolean(ctx.graphql(IS_PINNED, { id: issue.node_id }, signalToken)?.data?.node?.isPinned);
    if (!pinned) {
      ctx.graphql(PIN, { id: issue.node_id }, signalToken);
      pinned = true;
    }
  } catch (e) {
    pinNote = safeText(flag(e) || 'GitHub refused (a repository holds at most three pinned issues)', 120);
  }

  const body = build(pinNote);
  if (normalise(body) !== normalise(current)) {
    ctx.write('PATCH', `repos/${repo}/issues/${issue.number}`, { body });
    if (action === 'unchanged') action = 'updated';
  }
  return { action, pinned, number: issue.number };
}

export function main(env = process.env, ctx = realContext(env)) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error('GITHUB_REPOSITORY is required');
    return 1;
  }
  const text = ctx.read(SETTINGS_PATH);
  const { settings, problems } = parseSettings(text);
  for (const p of problems) console.log(`::warning::${p}`);
  const signalToken = env.SIGNAL_TOKEN || '';

  const existing = findStatusIssue(ctx, repo);
  if (!settings['status-issue']) {
    const out = reconcile(ctx, repo, settings, existing, () => '', signalToken);
    console.log(out.action === 'closed' ? 'status-issue is false: the status issue was closed and unpinned' : 'status-issue is false: nothing to do');
    return 0;
  }
  const raw = collect(ctx, repo, settings, signalToken, env.CONCIERGE_PAUSED === 'true');
  if (!raw) {
    console.log('::error::the open issues could not be listed; the status issue is left as it is');
    return 1;
  }
  raw.problems = problems;
  const build = (pinNote) => render(summarize({ ...raw, pinNote }, settings, ctx.now));
  const body = build(null);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${body}\n`);
  if (env.DRY_RUN === 'true') {
    console.log(body);
    console.log('dry run: nothing was written');
    return 0;
  }
  const result = reconcile(ctx, repo, settings, existing, build, signalToken);
  console.log(`status issue ${result.action}${result.number ? ` (#${result.number})` : ''}${result.pinned === false ? ', not pinned' : ''}`);
  // The nudge: only when asked for, only on a status issue that exists, and never while the Concierge is paused.
  if (settings['mention-after-days'] > 0 && result.number && !raw.paused) {
    console.log(nudge(ctx, repo, result.number, summarize({ ...raw, pinNote: null }, settings, ctx.now), settings, signalToken));
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
