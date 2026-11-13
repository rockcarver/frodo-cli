/**
 * The web console's page: one HTML document with its style and script
 * inline, built as a string so it ships inside the bundle (no files to
 * locate at runtime, which the single-file binary could not do).
 *
 * The page never builds markup from data. Everything that came from a
 * script or a tenant reaches the document through `textContent`, so a
 * hostile string cannot become an element. The Content-Security-Policy
 * from `buildContentSecurityPolicy` backs that up: only the two inline
 * blocks carrying this response's nonce may run or style anything.
 */

const TOKEN_SHAPE = /^[A-Za-z0-9_-]+$/;

export type ContentSecurityPolicyOptions = {
  /** Exact script URLs the page may load from elsewhere. */
  scripts?: string[];
  /** Exact stylesheet URLs the page may load from elsewhere. */
  styles?: string[];
};

/**
 * The policy sent with the page. Nothing is allowed unless named: the page
 * may talk only to its own origin, load no frames, forms or base URLs, and
 * run only the inline blocks that carry `nonce`. External resources are
 * allowed one exact URL at a time, never by whole origin, so a CDN that
 * hosts a million other files does not become part of this page's trust.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  options: ContentSecurityPolicyOptions = {}
): string {
  if (!TOKEN_SHAPE.test(nonce)) throw new Error('Invalid CSP nonce');
  const scripts = (options.scripts ?? []).map(assertUrl);
  const styles = (options.styles ?? []).map(assertUrl);
  return [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}' ${scripts.join(' ')}`.trim(),
    `style-src 'nonce-${nonce}' ${styles.join(' ')}`.trim(),
    `connect-src 'self'`,
    `img-src 'self' data:`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

function assertUrl(url: string): string {
  // A source expression is a URL with no spaces, semicolons or commas; refuse
  // anything that could smuggle a second directive into the header.
  if (!/^https:\/\/[^\s;,'"]+$/.test(url)) {
    throw new Error(`Not a valid CSP source URL: ${url}`);
  }
  return url;
}

const STYLE = String.raw`
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1b1f23; --dim: #6a737d; --line: #d8dee4;
  --panel: #f6f8fa; --accent: #0969da; --err: #cf222e;
  --key: #8250df; --str: #0a7f3f; --num: #0550ae; --bool: #bc4c00;
  --sel: #ddf4ff; --ok: #1a7f37;
  /* How tall the prompt may get before it scrolls internally: a floor of
     240px, more on tall windows, shared by the editor and its scroller. */
  --input-max: max(240px, 40vh);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --fg: #e6edf3; --dim: #8b949e; --line: #30363d;
    --panel: #161b22; --accent: #58a6ff; --err: #ff7b72;
    --key: #d2a8ff; --str: #7ee787; --num: #79c0ff; --bool: #ffa657;
    --sel: #1f3a5f; --ok: #3fb950;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  display: flex; flex-direction: column; background: var(--bg); color: var(--fg);
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
header {
  display: flex; align-items: center; gap: 12px; padding: 8px 14px;
  border-bottom: 1px solid var(--line); background: var(--panel);
}
header h1 { margin: 0; font-size: 13px; font-weight: 700; flex: none; }
#info { color: var(--dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Connected: the environment reads at a glance, not from a dim line. The
   pill carries the host; the prompt glyph follows the same state colour
   (this is the one always in view); the tab title names the host too.
   flex: 0 1 auto: hug the text when the header has room, shrink (with the
   ellipsis) only when the buttons genuinely crowd it. */
body.connected #info {
  color: var(--ok); font-weight: 700;
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  border-radius: 4px; padding: 2px 8px;
  flex: 0 1 auto; min-width: 0;
}
#prompt-row .p { color: var(--dim); user-select: none; }
body.connected #prompt-row .p { color: var(--ok); font-weight: 700; }
/* Link state as a dot alone: green pulsing while the event stream is up,
   still red when it is down. Colour is not the only carrier: the dot's
   title (and aria-label) say "online"/"offline" for hover and readers. */
#status {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--ok); flex: none; position: relative;
}
#status::after {
  content: ""; position: absolute; inset: -3px; border-radius: 50%;
  border: 1px solid var(--ok); opacity: 0; animation: none;
}
#status.up::after { animation: status-pulse 2s ease-out infinite; }
#status.down { background: var(--err); }
#status.down::after { border-color: var(--err); opacity: 0.6; animation: none; }
@keyframes status-pulse {
  0% { transform: scale(0.6); opacity: 0.8; }
  70% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  #status.up::after { animation: none; opacity: 0.5; }
}
button {
  font: inherit; color: inherit; background: transparent; cursor: pointer;
  border: 1px solid var(--line); border-radius: 6px; padding: 2px 10px;
}
button:hover { border-color: var(--accent); }
main { flex: 1; overflow: auto; padding: 10px 14px 4px; }
.entry { margin: 0 0 12px; }
/* The prompt lives in the scroll flow, like a browser console: right
   after the last entry when the output is short, pinned to the bottom
   edge when it overflows. */
#prompt-row {
  position: sticky; bottom: 4px; display: flex; gap: 8px; align-items: flex-start;
  padding: 6px 0 4px; background: var(--bg);
}
/* Lines up with the first line of input: same line-height, no top padding.
   (Its colour tracks the connection: see the body.connected rules.) */
/* The fuzzy search overlay takes the prompt's place while it is open. */
#search-row {
  position: sticky; bottom: 4px; display: none; flex-direction: column; gap: 2px;
  padding: 6px 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  max-height: 40vh; overflow: auto;
}
#search-row.open { display: flex; }
#search-row .head { display: flex; gap: 8px; align-items: baseline; }
#search-row .label { color: var(--dim); white-space: nowrap; }
#search-row .query { min-width: 4ch; white-space: pre-wrap; word-break: break-all; }
#search-row .match { color: var(--accent); font-weight: 700; }
#search-row .count { color: var(--dim); margin-left: auto; white-space: nowrap; }
#search-row .cand { white-space: pre-wrap; word-break: break-all; border-radius: 3px; padding: 0 4px; cursor: pointer; }
#search-row .cand .match { color: var(--accent); font-weight: 700; }
#search-row .cand.selected { background: var(--sel); }
#search-row .none { color: var(--dim); }
/* The completion popup: floats above the prompt, DevTools style. It owns
   the cursor keys while open; the list scrolls inside a small window. */
#complete-pop {
  position: sticky; bottom: calc(1.45em + 16px); margin-left: 3.5em; z-index: 25;
  max-height: 12.8em; overflow: auto; min-width: 20em; max-width: 60em; width: max-content;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 2px;
}
body.compact #complete-pop { bottom: calc(1.3em + 12px); }
#complete-pop .cand { white-space: pre; border-radius: 3px; padding: 0 6px; cursor: pointer; }
#complete-pop .cand.selected { background: var(--sel); }
#complete-pop .cand .tail { color: var(--dim); }
.echo { margin: 0; white-space: pre-wrap; word-break: break-word; }
.echo .p { color: var(--accent); user-select: none; }
.logs { margin: 4px 0 0; padding-left: 14px; border-left: 2px solid var(--line); color: var(--dim); white-space: pre-wrap; word-break: break-word; }
.result { margin: 4px 0 0 14px; }
.row { display: flex; align-items: baseline; cursor: default; border-radius: 3px; outline: none; }
.row:focus { background: var(--sel); }
.twisty { display: inline-block; width: 14px; flex: none; color: var(--dim); cursor: pointer; user-select: none; }
.key { color: var(--key); }
.sep { color: var(--dim); white-space: pre; }
.val { white-space: pre-wrap; word-break: break-word; }
.kind-string > .val { color: var(--str); }
.kind-number > .val, .kind-bigint > .val { color: var(--num); }
.kind-boolean > .val { color: var(--bool); }
.kind-null > .val, .kind-undefined > .val, .kind-symbol > .val { color: var(--dim); }
.kind-error > .val { color: var(--err); }
.kind-function > .val, .kind-promise > .val { color: var(--dim); font-style: italic; }
.children { margin-left: 14px; padding-left: 6px; border-left: 1px solid var(--line); }
.full { margin: 2px 0 4px 14px; padding: 6px 8px; background: var(--panel); border-radius: 4px; white-space: pre-wrap; word-break: break-word; max-height: 40vh; overflow: auto; }
.loading, .note { color: var(--dim); padding-left: 14px; }
.more { margin: 2px 0 2px 14px; }
.tools { margin-top: 2px; display: flex; gap: 8px; justify-content: flex-end; }
.tools button { padding: 0 8px; font-size: 12px; color: var(--dim); }
.error { color: var(--err); margin-left: 14px; white-space: pre-wrap; word-break: break-word; }
/* Compact mode: the same layout with the air let out. Toggled from the
   header and remembered per viewer; relaxed (the default) matches DevTools'
   roomier feel. */
body.compact { line-height: 1.3; }
body.compact .entry { margin-bottom: 6px; }
body.compact .children { margin-left: 10px; }
body.compact .full { margin: 1px 0 2px 10px; padding: 3px 6px; }
body.compact .logs { margin-top: 2px; }
body.compact #prompt-row { padding: 3px 0 2px; }
body.compact #search-row { padding: 3px 6px; }
body.compact #connect-bar { padding: 4px 14px; }
body.compact footer { padding: 4px 14px; }
body.compact header { padding: 4px 14px; }
#connect-bar {
  display: none; gap: 8px; align-items: center; flex-wrap: wrap;
  padding: 8px 14px; background: var(--panel); border-bottom: 1px solid var(--line);
}
#connect-bar.open { display: flex; }
#connect-bar .msg { color: var(--dim); }
#connect-bar .picker { position: relative; display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0; }
#connect-bar .select-box { position: relative; display: inline-flex; align-items: center; }
#connect-bar input[type="text"] {
  font: inherit; color: inherit; background: var(--bg);
  border: 1px solid var(--line); border-radius: 6px; padding: 2px 22px 2px 8px; width: 16em;
}
/* The dropdown caret, drawn so it never depends on a font glyph. */
#connect-bar .select-box::after {
  content: ''; position: absolute; right: 8px; pointer-events: none;
  border-left: 4px solid transparent; border-right: 4px solid transparent;
  border-top: 5px solid var(--dim);
}
#connect-bar input::placeholder { color: var(--dim); opacity: 1; }
/* The options float above the page while the dropdown is open; closed,
   only the input shows (a dropdown, not a permanent list). */
#connect-bar ul {
  list-style: none; margin: 0; padding: 0;
  position: absolute; top: 100%; left: 0; z-index: 30;
  max-height: 15em; overflow: auto;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  min-width: 28em; max-width: 56em; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
#connect-bar ul[hidden] { display: none; }
#connect-bar li { padding: 2px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#connect-bar li.selected { background: var(--sel); }
#connect-bar li .hint { color: var(--dim); font-size: 0.85em; margin-left: 0.5em; }
#connect-bar button { font: inherit; }
#connect-bar .err { color: var(--err); }
footer { border-top: 1px solid var(--line); padding: 8px 14px; background: var(--panel); }
#input-row { display: flex; gap: 8px; align-items: flex-start; }
/* Frameless like the browser console: no border, no box, no focus ring. */
#in {
  flex: 1; resize: none; font: inherit; color: inherit; background: var(--bg);
  border: 0; outline: 0; border-radius: 0; padding: 0; min-height: 1.45em; max-height: var(--input-max);
}
#hint { margin-top: 4px; color: var(--dim); font-size: 12px; min-height: 16px; white-space: pre-wrap; }
`;

const SCRIPT = String.raw`
(function () {
  'use strict';
  var csrf = document.querySelector('meta[name="csrf-token"]').content;
  // This tab's engine. sessionStorage is per tab by definition, so two
  // tabs hold two engine ids even though they share the session cookie.
  var engineId = null;
  try { engineId = sessionStorage.getItem('frodo-engine-id'); } catch (e) {}
  // Set once the server says this tab runs on the shared engine (no id of
  // its own): without the flag, a stream retry with a still-null id would
  // retry the session forever instead of opening the stream.
  var sharedEngine = false;

  function rememberEngine(id) {
    if (id) {
      engineId = id;
      try { sessionStorage.setItem('frodo-engine-id', id); } catch (e) {}
    } else {
      // No id in the reply: this tab runs on the shared engine.
      engineId = null;
      sharedEngine = true;
    }
  }
  var outEl = document.getElementById('out');
  var inEl = document.getElementById('in');
  var infoEl = document.getElementById('info');
  var statusEl = document.getElementById('status');
  var hintEl = document.getElementById('hint');
  var history = [];
  var histIndex = -1;
  var draft = '';
  var busy = false;
  var current = null;
  var search = null; // { query, matches: [indexes], cursor } while open
  var promptRow = document.getElementById('prompt-row');
  var searchEl = document.getElementById('search-row');
  var searchQueryEl = searchEl.querySelector('.query');
  var searchCountEl = searchEl.querySelector('.count');
  var searchCandsEl = searchEl.querySelector('.cands');
  var SEARCH_VISIBLE = 8; // candidates shown at once; Up/Down moves past them

  // History is common across tabs and connections; a tab picks up what the
  // others ran while it was out of sight. The snapshot refreshes when the
  // tab regains focus, never mid-navigation (histIndex keeps pointing at
  // what the user is recalling; recall positions may shift by the entries
  // other tabs added, which Up/Down forgives).
  window.addEventListener('focus', function () {
    refreshSession().catch(function () {});
  });

  // A small fzf-style scorer: subsequence match, greedily earliest, with a
  // bonus for consecutive hits and a penalty for the length of the gaps
  // and the tail. Exact substring beats every subsequence. Returns the
  // matched indexes for highlighting, or null when it does not match.
  function scoreMatch(query, line) {
    var q = query.toLowerCase();
    var t = line.toLowerCase();
    var direct = t.indexOf(q);
    if (direct !== -1) {
      var idx = [];
      for (var k = 0; k < q.length; k++) idx.push(direct + k);
      return { score: 1000 + line.length, indexes: idx };
    }
    var pos = 0;
    var indexes = [];
    var score = 0;
    var last = -2;
    for (var i = 0; i < q.length; i++) {
      var at = t.indexOf(q[i], pos);
      if (at === -1) return null;
      indexes.push(at);
      score += at === last + 1 ? 6 : 1;
      score -= Math.max(0, at - pos);
      last = at;
      pos = at + 1;
    }
    score -= Math.max(0, line.length - pos);
    return { score: score, indexes: indexes };
  }

  function runSearch(query) {
    if (!query) {
      // An empty query is not "no results": the window opens on the most
      // recent commands, recency order, so Ctrl+R alone shows the history.
      var recents = [];
      for (var r = 0; r < history.length && r < 50; r++) recents.push(r);
      return recents;
    }
    var hits = [];
    for (var i = 0; i < history.length; i++) {
      var m = scoreMatch(query, history[i]);
      if (m) hits.push({ idx: i, score: m.score });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, 50).map(function (h) { return h.idx; });
  }

  // One candidate row: the history line with matched characters bolded.
  function renderCandidate(line, indexes, selected) {
    var row = el('div', 'cand' + (selected ? ' selected' : ''));
    var set = {};
    indexes.forEach(function (i) { set[i] = true; });
    var span = null;
    for (var i = 0; i < line.length; i++) {
      if (set[i]) {
        if (!span) { span = document.createElement('span'); span.className = 'match'; row.appendChild(span); }
        span.textContent += line[i];
      } else {
        span = null;
        row.appendChild(document.createTextNode(line[i]));
      }
    }
    row.addEventListener('click', function () {
      if (!search) return;
      search.cursor = search.matches.indexOf(
        search.matches.filter(function (idx) { return history[idx] === line; })[0]
      );
      renderSearch();
    });
    return row;
  }

  function renderSearch() {
    searchQueryEl.textContent = search.query;
    searchCandsEl.textContent = '';
    searchCountEl.textContent = search.matches.length > 0
      ? ' ' + (search.cursor + 1) + '/' + search.matches.length
      : '';
    if (search.matches.length === 0) {
      searchCountEl.textContent = 'no matches';
      var none = el('div', 'none', 'no matches');
      searchCandsEl.appendChild(none);
      return;
    }
    // The selection stays inside a window of the most recent candidates,
    // like a picker: the list scrolls with the cursor.
    var total = search.matches.length;
    var start = Math.max(0, Math.min(search.cursor - SEARCH_VISIBLE + 1, total - SEARCH_VISIBLE));
    var end = Math.min(start + SEARCH_VISIBLE, total);
    for (var i = start; i < end; i++) {
      var idx = search.matches[i];
      var line = history[idx];
      // No query yet: nothing to highlight; the rows are just the recents.
      var m = search.query ? scoreMatch(search.query, line) : null;
      searchCandsEl.appendChild(
        renderCandidate(line, m ? m.indexes : [], i === search.cursor)
      );
    }
    var selected = searchCandsEl.querySelector('.cand.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function openSearch() {
    // Seeded, not empty: with no query runSearch('') returns the most recent
    // commands, so Ctrl+R alone opens on the history instead of waiting.
    search = { query: '', matches: runSearch(''), cursor: 0 };
    searchEl.classList.add('open');
    hintEl.textContent = 'Enter runs the selection · Tab pastes it for editing · Esc cancels';
    renderSearch();
    // The in-memory snapshot holds the most recent 1000; the file holds up
    // to 10k. Fetch the full list for the search and re-render when it
    // lands (the instant render above means Ctrl+R never waits on it).
    // Entries run while the fetch was in flight are newer than its
    // snapshot: keep them ahead of the fetched list rather than losing
    // them until the next refresh.
    api('/api/history').then(function (r) {
      if (!search) return; // closed while fetching
      var fetched = r.history || [];
      var have = {};
      fetched.forEach(function (l) { have[l] = true; });
      var newer = [];
      for (var n = 0; n < history.length; n++) {
        if (have[history[n]]) break; // reached the fetch's snapshot horizon
        newer.push(history[n]);
      }
      if (fetched.length > history.length - newer.length || newer.length > 0) {
        history = newer.concat(fetched);
        search.matches = runSearch(search.query);
        search.cursor = Math.min(search.cursor, Math.max(0, search.matches.length - 1));
        renderSearch();
      }
    }).catch(function () {});
  }

  function closeSearch(restore) {
    if (!search) return;
    search = null;
    searchEl.classList.remove('open');
    hintEl.textContent = '';
    if (restore) {
      input.setValue(draft !== null ? draft : '');
      autosize();
    }
  }

  // While the search overlay is open it owns the keyboard: printable keys
  // append to the query, Backspace trims, and the keys searchKeydown knows
  // are consumed there.
  function captureSearchKeys(e) {
    if (!search) return;
    if (e.metaKey || (e.ctrlKey && e.key !== 'r' && e.key !== 'R')) { closeSearch(true); return; }
    if (searchKeydown(e)) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      search.query = search.query.slice(0, -1);
      search.matches = runSearch(search.query);
      search.cursor = 0;
      renderSearch();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      search.query += e.key;
      search.matches = runSearch(search.query);
      search.cursor = 0;
      renderSearch();
    }
  }

  function searchKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(true); return true; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Cycle to the previous match, like the terminal's Tab.
        if (search.matches.length > 1) {
          search.cursor = (search.cursor + search.matches.length - 1) % search.matches.length;
          renderSearch();
        }
        return true;
      }
      // Paste the selection into the prompt for editing; nothing runs.
      var fill = search.matches.length > 0 ? history[search.matches[search.cursor]] : null;
      closeSearch();
      if (fill !== null) {
        input.setValue(fill);
        autosize();
        input.setAt(input.value().length);
        input.focus();
      }
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var pick = search.matches.length > 0 ? history[search.matches[search.cursor]] : null;
      closeSearch();
      submitWith(pick !== null ? pick : undefined);
      return true;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (search.matches.length > 1) {
        search.cursor = e.key === 'ArrowUp'
          ? (search.cursor + search.matches.length - 1) % search.matches.length
          : (search.cursor + 1) % search.matches.length;
        renderSearch();
      }
      return true;
    }
    return false;
  }

  document.addEventListener('keydown', captureSearchKeys, true);

  // Input adapter: the same operations on the plain textarea or the
  // CodeMirror editor, so everything below stays written once. The editor
  // takes over only if the CDN script actually loaded (window.CodeMirror).
  var input = {
    value: function () { return inEl.value; },
    setValue: function (v) { inEl.value = v; },
    focus: function () { inEl.focus(); },
    // Cursor position as an offset from the start of the value.
    at: function () { return inEl.selectionStart; },
    setAt: function (n) { inEl.selectionStart = inEl.selectionEnd = n; },
    // True when nothing but whitespace sits before the cursor on this line.
    atFirstLineStart: function () {
      return inEl.value.slice(0, inEl.selectionStart).indexOf('\n') === -1;
    },
    atLastLineEnd: function () {
      return inEl.value.slice(inEl.selectionEnd).indexOf('\n') === -1;
    },
    // Insert a newline at the cursor (an unfinished input continues).
    newline: function () {
      var at = inEl.selectionStart;
      inEl.value = inEl.value.slice(0, at) + '\n' + inEl.value.slice(inEl.selectionEnd);
      inEl.selectionStart = inEl.selectionEnd = at + 1;
      autosize();
    },
    replaceBefore: function (count, text) {
      var at = inEl.selectionStart;
      inEl.value = inEl.value.slice(0, at - count) + text + inEl.value.slice(at);
      inEl.selectionStart = inEl.selectionEnd = at - count + text.length;
      autosize();
    },
    lineBefore: function () {
      return inEl.value.slice(0, inEl.selectionStart).slice(inEl.value.slice(0, inEl.selectionStart).lastIndexOf('\n') + 1);
    },
  };

  function upgradeEditor() {
    if (!window.CodeMirror) return; // CDN unreachable: the textarea stays
    var cm = window.CodeMirror.fromTextArea(inEl, {
      mode: 'javascript',
      theme: 'frodo',
      lineWrapping: true,
      viewportMargin: 10,
      matchBrackets: true,
      autoCloseBrackets: true,
      extraKeys: { 'Shift-Enter': 'newlineAndIndent' },
    });
    input = {
      value: function () { return cm.getValue(); },
      setValue: function (v) { cm.setValue(v); },
      focus: function () { cm.focus(); },
      at: function () { return cm.indexFromPos(cm.getCursor()); },
      setAt: function (n) { cm.setCursor(cm.posFromIndex(n)); },
      atFirstLineStart: function () {
        var cur = cm.getCursor();
        return cm.getLine(cur.line).slice(0, cur.ch).trim() === '' &&
          cm.firstLine() === cur.line;
      },
      atLastLineEnd: function () {
        var cur = cm.getCursor();
        return cm.lastLine() === cur.line &&
          cm.getLine(cur.line).slice(cur.ch).trim() === '';
      },
      newline: function () { cm.replaceSelection('\n'); },
      replaceBefore: function (count, text) {
        var cur = cm.getCursor();
        var from = cm.posFromIndex(cm.indexFromPos(cur) - count);
        cm.replaceRange(text, from, cur);
      },
      lineBefore: function () {
        return cm.getLine(cm.getCursor().line).slice(0, cm.getCursor().ch);
      },
    };
    cm.on('keydown', function (_editor, e) {
      if (e.isComposing) return;
      if (popupKeydown(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      else if (e.key === 'ArrowUp' && input.atFirstLineStart()) { e.preventDefault(); recall(true); }
      else if (e.key === 'ArrowDown' && input.atLastLineEnd()) { e.preventDefault(); recall(false); }
      else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); complete(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clearOutput(); }
      else if (e.key === 'r' && e.ctrlKey) { e.preventDefault(); draft = input.value(); openSearch(); }
    });
    // Cap the editor's height from here, not from CSS: with a definite
    // pixel height on the wrapper, CodeMirror's scroller (height: 100%)
    // resolves and its own scrolling, cursor-follow and click mapping all
    // work; below the cap no height is set and the editor hugs its
    // content. Measured on the frame after a change (paste, typing,
    // recall): during the change itself the sizer still has its old
    // height, so a synchronous read would cap from stale numbers.
    function capEditor() {
      var wrap = cm.getWrapperElement();
      wrap.style.height = '';
      var cap = Math.max(240, Math.round(window.innerHeight * 0.4));
      if (wrap.scrollHeight > cap) {
        wrap.style.height = cap + 'px';
        cm.refresh();
      }
    }
    function capSoon() { requestAnimationFrame(capEditor); }
    cm.on('change', capSoon);
    window.addEventListener('resize', capSoon);
    capSoon();
  }
  // The CDN scripts carry defer; run after they had their chance.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.addEventListener('load', upgradeEditor);
    });
  } else {
    window.addEventListener('load', upgradeEditor);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function api(path, body) {
    var opts = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'X-Frodo-CSRF': csrf } };
    if (engineId) opts.headers['X-Frodo-Engine'] = engineId;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
        return j;
      });
    });
  }

  function clearOutput() {
    // Remove every entry but keep the prompt and search rows: they live
    // in the same scroll container and carry the live input.
    Array.prototype.slice
      .call(outEl.querySelectorAll('.entry'))
      .forEach(function (e) { e.remove(); });
    var note = el('div', 'note', 'output cleared');
    outEl.insertBefore(note, promptRow);
  }

  function scroll() {
    outEl.scrollTop = outEl.scrollHeight;
    if (promptRow.scrollIntoViewIfNeeded) promptRow.scrollIntoViewIfNeeded(false);
  }

  function renderNode(node, isRoot) {
    var wrap = el('div', 'node');
    var row = el('div', 'row kind-' + node.kind);
    row.tabIndex = 0;
    row.setAttribute('role', 'treeitem');
    var twisty = el('span', 'twisty', node.expandable ? '▸' : '');
    row.appendChild(twisty);
    if (node.key !== '' && !isRoot) {
      row.appendChild(el('span', 'key', node.key));
      row.appendChild(el('span', 'sep', ': '));
    }
    row.appendChild(el('span', 'val', node.preview));
    wrap.appendChild(row);

    var kids = null;
    var open = false;
    var full = null;

    if (node.expandable) {
      kids = el('div', 'children');
      kids.hidden = true;
      kids.setAttribute('role', 'group');
      wrap.appendChild(kids);
      row.setAttribute('aria-expanded', 'false');
    }

    function load(offset, replace) {
      if (replace) {
        kids.textContent = '';
        kids.appendChild(el('div', 'loading', 'loading…'));
      }
      api('/api/children', { id: node.id, offset: offset, limit: 200 }).then(function (res) {
        if (replace) kids.textContent = '';
        res.items.forEach(function (child) { kids.appendChild(renderNode(child, false)); });
        var next = res.offset + res.items.length;
        if (next < res.total) {
          var more = el('button', 'more', 'Show ' + Math.min(200, res.total - next) + ' more (' + (res.total - next) + ' remaining)');
          more.addEventListener('click', function () { more.remove(); load(next, false); });
          kids.appendChild(more);
        }
      }).catch(function (e) {
        kids.textContent = '';
        kids.appendChild(el('div', 'note', 'Could not load: ' + e.message + ' (very old results are released)'));
      });
    }

    function setOpen(want) {
      if (!node.expandable || want === open) return;
      open = want;
      twisty.textContent = open ? '▾' : '▸';
      row.setAttribute('aria-expanded', String(open));
      kids.hidden = !open;
      if (open) load(0, true);
    }

    function toggleFull() {
      if (node.text === undefined) return;
      if (full) { full.remove(); full = null; return; }
      full = el('div', 'full', node.text + (node.textTruncated ? '\n… (cut)' : ''));
      wrap.insertBefore(full, kids);
    }

    row.addEventListener('click', function () {
      if (node.expandable) setOpen(!open); else toggleFull();
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (node.expandable && !open) setOpen(true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (open) setOpen(false); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (node.expandable) setOpen(!open); else toggleFull(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var rows = Array.prototype.filter.call(outEl.querySelectorAll('.row'), function (r) { return r.offsetParent !== null; });
        var at = rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1);
        if (rows[at]) rows[at].focus();
      }
    });
    return wrap;
  }

  function addEntry(code) {
    var root = el('div', 'entry');
    if (code !== null) {
      var echo = el('pre', 'echo');
      echo.appendChild(el('span', 'p', 'frodo> '));
      echo.appendChild(document.createTextNode(code));
      root.appendChild(echo);
    }
    var logs = el('pre', 'logs');
    logs.hidden = true;
    var res = el('div', 'result');
    root.appendChild(logs);
    root.appendChild(res);
    outEl.insertBefore(root, promptRow || null);
    scroll();
    return { root: root, logs: logs, res: res };
  }

  function appendLog(text) {
    var target = current || addEntry(null);
    target.logs.hidden = false;
    target.logs.textContent += text;
    scroll();
  }

  function showError(entry, err) {
    var box = el('div', 'error');
    box.appendChild(document.createTextNode(err.name + ': ' + err.message));
    if (err.stack) {
      var stack = null;
      var toggle = el('button', '', 'stack');
      toggle.addEventListener('click', function () {
        if (stack) { stack.remove(); stack = null; return; }
        stack = el('div', 'full', err.stack);
        box.appendChild(stack);
      });
      var tools = el('div', 'tools');
      tools.appendChild(toggle);
      box.appendChild(tools);
    }
    entry.res.appendChild(box);
  }

  function showResult(entry, res) {
    if (res.status === 'error') { showError(entry, res.error); return; }
    // A result of undefined is noise for a work console (every side-effect
    // call would print a stray "undefined" under its logs), so it gets no
    // result row. The echo above and any log lines still show.
    if (res.result.kind === 'undefined') return;
    var tree = renderNode(res.result, true);
    entry.res.appendChild(tree);
    if (res.result.expandable) {
      var tools = el('div', 'tools');
      var copy = el('button', '', 'copy JSON');
      copy.addEventListener('click', function () {
        api('/api/json', { id: res.result.id }).then(function (j) {
          return navigator.clipboard.writeText(j.text).then(function () {
            copy.textContent = j.truncated ? 'copied (cut)' : 'copied';
          });
        }).catch(function () { copy.textContent = 'copy failed'; });
      });
      tools.appendChild(copy);
      entry.res.appendChild(tools);
    }
  }

  function autosize() {
    inEl.style.height = 'auto';
    // The same cap the CodeMirror editor uses: 240px or 40% of the window,
    // whichever is larger. Beyond it the textarea scrolls internally.
    inEl.style.height = Math.min(inEl.scrollHeight, Math.max(240, Math.round(window.innerHeight * 0.4))) + 'px';
  }

  function remember(code) {
    if (history[0] !== code) history.unshift(code);
    histIndex = -1;
  }

  function submitWith(codeOverride) {
    if (busy) return;
    var code = codeOverride !== undefined ? codeOverride : input.value();
    if (!code.trim()) return;
    busy = true;
    var entry = addEntry(code);
    current = entry;
    api('/api/eval', { code: code }).then(function (res) {
      if (res.status === 'incomplete') {
        entry.root.remove();
        input.newline();
        return;
      }
      remember(code);
      input.setValue('');
      hideCompletePopup();
      showResult(entry, res);
    }).catch(function (e) {
      showError(entry, { name: 'Request failed', message: e.message });
    }).then(function () {
      busy = false;
      current = null;
      hintEl.textContent = '';
      autosize();
      input.focus();
      scroll();
    });
  }

  function submit() {
    submitWith(undefined);
  }

  function recall(older) {
    if (older) {
      if (histIndex + 1 >= history.length) return;
      if (histIndex === -1) draft = input.value();
      histIndex += 1;
      input.setValue(history[histIndex]);
    } else {
      if (histIndex === -1) return;
      histIndex -= 1;
      input.setValue(histIndex === -1 ? draft : history[histIndex]);
    }
    hideCompletePopup();
    autosize();
    input.setAt(input.value().length);
  }

  function commonPrefix(items) {
    var prefix = items[0];
    items.forEach(function (s) { while (s.indexOf(prefix) !== 0) prefix = prefix.slice(0, -1); });
    return prefix;
  }

  // The completion popup. Opened by Tab with more than one candidate (a
  // single one, or a longer common prefix, inserts directly). The cursor
  // keys move the selection, Enter/Tab/ArrowRight accept it, Esc closes,
  // and a click picks.
  var pop = {
    el: document.getElementById('complete-pop'),
    items: [],
    replaceLen: 0,
    cursor: 0,
  };

  function hideCompletePopup() {
    pop.el.hidden = true;
    pop.el.textContent = '';
    pop.items = [];
  }

  function renderCompletePopup() {
    pop.el.textContent = '';
    var start = Math.max(0, Math.min(pop.cursor - 7, pop.items.length - 8));
    var end = Math.min(start + 8, pop.items.length);
    for (var i = start; i < end; i++) {
      var row = el('div', 'cand' + (i === pop.cursor ? ' selected' : ''));
      // Dim the part already typed: the eye reads the new characters first.
      row.appendChild(el('span', '', pop.items[i].slice(0, pop.replaceLen)));
      row.appendChild(el('span', 'tail', pop.items[i].slice(pop.replaceLen)));
      row.addEventListener('mousedown', function (e) {
        // mousedown: the textarea's blur would close the popup first.
        e.preventDefault();
        acceptCompletion(this.itemIndex);
      });
      row.itemIndex = i;
      pop.el.appendChild(row);
    }
    var selected = pop.el.querySelector('.cand.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function acceptCompletion(index) {
    var choice = pop.items[index];
    hideCompletePopup();
    input.replaceBefore(pop.replaceLen, choice);
    input.focus();
  }

  function showCompletePopup(candidates, replaceLen) {
    pop.items = candidates;
    pop.replaceLen = replaceLen;
    pop.cursor = 0;
    renderCompletePopup();
    pop.el.hidden = false;
  }

  // True when the popup consumed the key.
  function popupKeydown(e) {
    if (pop.el.hidden) return false;
    if (e.key === 'Escape') { e.preventDefault(); hideCompletePopup(); return true; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pop.cursor = (pop.cursor + 1) % pop.items.length;
      renderCompletePopup();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      pop.cursor = (pop.cursor + pop.items.length - 1) % pop.items.length;
      renderCompletePopup();
      return true;
    }
    // Accept the selection: Enter/Tab finish the word, ArrowRight takes it
    // but leaves the cursor where it is (DevTools' "accept, don't run").
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      e.preventDefault();
      acceptCompletion(pop.cursor);
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      acceptCompletion(pop.cursor);
      submit();
      return true;
    }
    // Any other key edits the input: the popup is stale now.
    hideCompletePopup();
    return false;
  }

  function complete() {
    if (!pop.el.hidden) {
      // Tab again while open: take the current selection.
      acceptCompletion(pop.cursor);
      return;
    }
    var line = input.lineBefore();
    api('/api/complete', { line: line }).then(function (r) {
      var c = r.candidates;
      if (!c.length) { hintEl.textContent = ''; return; }
      var prefix = commonPrefix(c);
      if (prefix.length > r.replace.length) {
        input.replaceBefore(r.replace.length, prefix);
        hintEl.textContent = '';
        // Extending may still leave several candidates: show them.
        if (c.length > 1) showCompletePopup(c, prefix.length);
      } else if (c.length > 1) {
        showCompletePopup(c, r.replace.length);
      } else {
        hintEl.textContent = '';
      }
    }).catch(function (e) {
      hintEl.textContent = 'completion failed: ' + e.message;
    });
  }

  inEl.addEventListener('input', autosize);
  inEl.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    if (popupKeydown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp' && input.atFirstLineStart()) { e.preventDefault(); recall(true); }
    else if (e.key === 'ArrowDown' && input.atLastLineEnd()) { e.preventDefault(); recall(false); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); complete(); }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clearOutput(); }
    else if (e.key === 'r' && e.ctrlKey) { e.preventDefault(); draft = input.value(); openSearch(); }
  });
  document.getElementById('clear').addEventListener('click', function () { clearOutput(); input.focus(); });
  // Reset JS: the engine swaps in a fresh context, so everything the user
  // defined is gone. The connection and the history are not part of the
  // context and survive; the note below says so, once, where the entry
  // would have gone.
  document.getElementById('reset').addEventListener('click', function () {
    if (busy) return;
    busy = true;
    api('/api/reset', {}).then(function (r) {
      var entry = addEntry(null);
      var note = el('pre', 'logs');
      note.hidden = false;
      note.textContent = 'JS state reset: your variables and functions are gone. ' +
        'The connection (' + (r.info.host || 'no environment') + ') and history were kept.\n';
      entry.root.appendChild(note);
      outEl.insertBefore(entry.root, promptRow || null);
      scroll();
    }).catch(function (e) {
      var entry = addEntry(null);
      var note = el('pre', 'logs');
      note.hidden = false;
      note.textContent = 'Reset failed: ' + e.message + '\n';
      entry.root.appendChild(note);
      outEl.insertBefore(entry.root, promptRow || null);
      scroll();
    }).then(function () {
      busy = false;
      input.focus();
      scroll();
    });
  });
  // Spacing density: a per-viewer choice, so localStorage (with a safe
  // fallback: the page renders relaxed without it). The button names the
  // mode a click switches to, like a checkbox would.
  var densityBtn = document.getElementById('density');
  var density = 'relaxed';
  try { density = localStorage.getItem('frodo-density') || 'relaxed'; } catch (e) {}
  function applyDensity() {
    document.body.classList.toggle('compact', density === 'compact');
    densityBtn.textContent = density === 'compact' ? 'Relaxed' : 'Compact';
  }
  densityBtn.addEventListener('click', function () {
    density = density === 'compact' ? 'relaxed' : 'compact';
    try { localStorage.setItem('frodo-density', density); } catch (e) {}
    applyDensity();
    input.focus();
  });
  applyDensity();
  document.getElementById('help').addEventListener('click', function () { input.setValue('help()'); submit(); });

  function setStatus(up) {
    statusEl.className = up ? 'up' : 'down';
    statusEl.title = up ? 'online' : 'offline';
    statusEl.setAttribute('aria-label', up ? 'online' : 'offline');
  }

  function listen() {
    // The stream must carry this tab's engine id or its log events go to
    // the wrong bus and console.log silently vanishes. A tab that opens
    // before it has an id (or lost it) asks for one first; a shared-engine
    // tab goes straight through (it has no id to learn).
    if (!engineId && !sharedEngine) {
      refreshSession()
        .catch(function (e) { infoEl.textContent = 'session error: ' + e.message; })
        .then(function () { listen(); });
      return;
    }
    var listenHeaders = { 'X-Frodo-CSRF': csrf };
    if (engineId) listenHeaders['X-Frodo-Engine'] = engineId;
    fetch('/api/events', { credentials: 'same-origin', headers: listenHeaders }).then(function (r) {
      if (!r.ok || !r.body) throw new Error('events ' + r.status);
      setStatus(true);
      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) throw new Error('closed');
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(function (line) {
            if (!line) return;
            var event = JSON.parse(line);
            if (event.type === 'log') appendLog(event.text);
          });
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      setStatus(false);
      setTimeout(listen, 1500);
    });
  }

  function refreshSession() {
    return api('/api/session').then(function (s) {
      if (s.engine) rememberEngine(s.engine);
      history = s.history;
      var i = s.info;
      // Connected or not is the state people lose track of (which
      // environment am I about to run this against?), so it is carried by
      // three cues at once: the info line as a pill, the prompt glyph's
      // colour, and the browser tab's title.
      document.body.classList.toggle('connected', !!i.host);
      infoEl.textContent = [i.host || 'no environment', i.realm, i.username, i.deploymentType]
        .filter(Boolean)
        .join('  ·  ');
      infoEl.title = i.host ? 'Connected environment' : 'Not connected to an environment';
      var short = i.host ? i.host.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
      document.title = short ? 'frodo console: ' + short : 'frodo console';
      // The picker stays up once a connection exists too: switching
      // environments without leaving the tab (and its output) is the
      // point. The prompt line says which.
      var bar = document.getElementById('connect-bar');
      bar.classList.add('open');
      bar.querySelector('.msg').textContent = i.host
        ? 'Connected. Pick another saved connection profile to switch:'
        : 'Not connected. Pick a saved connection profile:';
      if (!i.host) {
        api('/api/profiles').then(function (r) {
          connectProfiles = r.profiles;
          renderConnectList();
        }).catch(function () {});
      }
      return s;
    });
  }

  var connectProfiles = [];
  var connectFiltered = [];
  var connectCursor = 0;
  var CONNECT_VISIBLE = 10;

  function connectLabel(p) {
    return p.alias ? p.host + ' (' + p.alias + ')' : p.host;
  }

  /** A profile that logs in through a browser says so before the click. */
  function connectHint(p) {
    return p.browserLogin ? 'opens a browser to sign in' : '';
  }

  function openConnectList() {
    document.getElementById('connect-list').hidden = false;
  }

  function closeConnectList() {
    document.getElementById('connect-list').hidden = true;
  }

  function renderConnectList() {
    var list = document.getElementById('connect-list');
    var needle = document.getElementById('connect-filter').value.toLowerCase();
    connectFiltered = connectProfiles.filter(function (p) {
      return !needle ||
        p.host.toLowerCase().includes(needle) ||
        (p.alias || '').toLowerCase().includes(needle);
    });
    if (connectCursor >= connectFiltered.length) connectCursor = 0;
    list.textContent = '';
    connectFiltered
      .slice(0, CONNECT_VISIBLE)
      .forEach(function (p, i) {
        var li = document.createElement('li');
        li.textContent = connectLabel(p);
        var hint = connectHint(p);
        if (hint) {
          var span = document.createElement('span');
          span.className = 'hint';
          span.textContent = ' ' + hint;
          li.appendChild(span);
        }
        if (i === connectCursor) li.className = 'selected';
        li.addEventListener('mousedown', function (e) {
          // mousedown, not click: the input's blur would close the list
          // before a click event fires. Choosing only selects: the label
          // lands in the box and Connect (button or Enter) does the rest.
          e.preventDefault();
          connectCursor = i;
          document.getElementById('connect-filter').value = connectLabel(p);
          closeConnectList();
        });
        list.appendChild(li);
      });
    if (connectFiltered.length === 0) {
      var none = document.createElement('li');
      none.textContent = needle ? 'no profiles match' : 'no saved profiles';
      none.style.cursor = 'default';
      list.appendChild(none);
    }
  }

  function connectTo(host) {
    closeConnectList();
    var err = document.getElementById('connect-err');
    if (!host) { err.textContent = 'No saved profiles found'; return; }
    err.textContent = '';
    var go = document.getElementById('connect-go');
    go.disabled = true;
    // A browser-login profile opens a browser and waits in it; the worker
    // explains that on its stderr, which the server forwards into this
    // tab's log stream. Say something here too, so the wait has a face.
    var picked = connectProfiles.find(function (p) { return p.host === host; });
    err.textContent = picked && picked.browserLogin
      ? 'Opening a browser to sign in; finish there and come back here.'
      : 'Signing in...';
    api('/api/connect', { host: host }).then(function (r) {
      go.disabled = false;
      if (!r.ok) { err.textContent = 'Sign-in failed; check the profile credentials'; return; }
      err.textContent = '';
      refreshSession();
    }).catch(function (e) {
      go.disabled = false;
      err.textContent = e.message;
    });
  }

  document.getElementById('connect-filter').addEventListener('focus', function () {
    openConnectList();
    renderConnectList();
  });
  document.getElementById('connect-filter').addEventListener('blur', function () {
    // Defer so a click on an option lands before the list disappears.
    setTimeout(closeConnectList, 150);
  });
  document.getElementById('connect-filter').addEventListener('input', function () {
    openConnectList();
    renderConnectList();
  });
  document.getElementById('connect-filter').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closeConnectList(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (connectFiltered.length > 0) {
        connectCursor = (connectCursor + 1) % Math.min(connectFiltered.length, CONNECT_VISIBLE);
        renderConnectList();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (connectFiltered.length > 0) {
        connectCursor = (connectCursor + Math.min(connectFiltered.length, CONNECT_VISIBLE) - 1) % Math.min(connectFiltered.length, CONNECT_VISIBLE);
        renderConnectList();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      closeConnectList();
      connectGo.click();
    }
  });

  // Which profile Connect means: the one named exactly in the box (a click
  // or typed label) wins over the highlighted row, which may have moved
  // since the box was filled.
  function pickedProfile() {
    var text = document.getElementById('connect-filter').value.trim();
    var exact = connectProfiles.find(function (p) { return connectLabel(p) === text; });
    return exact || connectFiltered[connectCursor] || null;
  }

  // The only path that signs in; nothing connects until it runs.
  var connectGo = document.getElementById('connect-go');
  connectGo.addEventListener('click', function () {
    var pick = pickedProfile();
    connectTo(pick ? pick.host : '');
  });

  // The event stream gates itself on the engine id (see listen): its first
  // act is the session call, which mints the id. The error still surfaces
  // in the info line: a tab that cannot even get a session has nothing to
  // stream.
  listen();
  input.focus();
})();
`;

// The CodeMirror theme named above: follows the page's variables so dark
// mode works. Frameless, and with the library's default 4px insets removed,
// so the text sits exactly where the textarea's would: on the frodo> line.
const EDITOR_STYLE = String.raw`
.CodeMirror {
  flex: 1; height: auto; min-height: 1.45em;
  font: inherit; background: var(--bg); color: var(--fg);
  border: 0; border-radius: 0; padding: 0;
}
/* The height cap is applied from JS (capEditor): an explicit pixel height
   only when the content outgrows the cap. With a definite height on the
   wrapper, the scroller's height: 100% resolves and CodeMirror's own
   scrolling, cursor-follow and click mapping all work as in any fixed
   editor; below the cap the editor hugs its content. A CSS max-height
   here would clip without ever scrolling (measured), because the
   scroller's percentage height resolves against an auto-height parent. */
.CodeMirror-lines { padding: 0; }
.CodeMirror pre.CodeMirror-line, .CodeMirror pre.CodeMirror-line-like { padding-left: 0; padding-right: 0; }
.CodeMirror-focused { outline: 0; }
.CodeMirror-cursor { border-left: 1.5px solid var(--fg); }
.CodeMirror-gutters { background: var(--bg); border-right: 0; }
.CodeMirror-selected { background: var(--sel); }
.CodeMirror-matchingbracket { color: var(--accent) !important; outline: 1px solid var(--accent); }
.cm-keyword { color: var(--key); }
.cm-string, .cm-string-2 { color: var(--str); }
.cm-number { color: var(--num); }
.cm-atom { color: var(--bool); }
.cm-comment { color: var(--dim); }
.cm-def, .cm-variable-2, .cm-variable-3 { color: var(--fg); }
.cm-property { color: var(--fg); }
.cm-operator { color: var(--dim); }
`;

/** Escape for an attribute value; tokens are already restricted, this is belt and braces. */
function attr(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * One external resource the page may load, pinned. The URL goes into the
 * Content-Security-Policy, the hash into an integrity attribute, so a CDN
 * that serves anything other than the exact bytes it promised is refused by
 * the browser. Shape-checked here so a bad value fails at startup, not in
 * the tab.
 */
export type ExternalAsset = {
  url: string;
  /** An `integrity` value: sha384-<base64>. */
  integrity: string;
};

function assertAsset(asset: ExternalAsset, kind: 'script' | 'style'): void {
  assertUrl(asset.url);
  if (!/^sha384-[A-Za-z0-9+/]+={0,2}$/.test(asset.integrity)) {
    throw new Error(`Invalid integrity hash for ${asset.url}`);
  }
  if (kind === 'script' && !asset.url.endsWith('.js')) {
    throw new Error(`A script asset must be a .js URL: ${asset.url}`);
  }
  if (kind === 'style' && !asset.url.endsWith('.css')) {
    throw new Error(`A style asset must be a .css URL: ${asset.url}`);
  }
}

export function renderConsolePage(params: {
  nonce: string;
  csrf: string;
  /** Pinned external resources; today, the editor loaded from a CDN. */
  assets?: { scripts: ExternalAsset[]; styles: ExternalAsset[] };
}): string {
  if (!TOKEN_SHAPE.test(params.nonce) || !TOKEN_SHAPE.test(params.csrf)) {
    throw new Error('Invalid page token');
  }
  const scripts = (params.assets?.scripts ?? []).map((asset) => {
    assertAsset(asset, 'script');
    return `<script src="${attr(asset.url)}" integrity="${attr(asset.integrity)}" crossorigin="anonymous" defer></script>`;
  });
  const styles = (params.assets?.styles ?? []).map((asset) => {
    assertAsset(asset, 'style');
    return `<link rel="stylesheet" href="${attr(asset.url)}" integrity="${attr(asset.integrity)}" crossorigin="anonymous">`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="csrf-token" content="${attr(params.csrf)}">
<title>frodo console</title>
${styles.join('\n')}
<style nonce="${attr(params.nonce)}">${STYLE}${EDITOR_STYLE}</style>
</head>
<body>
<header>
  <h1>frodo console</h1>
  <span id="info"></span>
  <span id="status" class="up" title="online" aria-label="online"></span>
  <button id="help" type="button">help()</button>
  <button id="density" type="button" title="Toggle compact or relaxed spacing">Compact</button>
  <button id="clear" type="button" title="Clear the output (Ctrl+L)">Clear</button>
  <button id="reset" type="button" title="Discard every variable and function you defined. The connection and history stay.">Reset JS</button>
</header>
<div id="connect-bar">
<span class="msg">Not connected. Pick a saved connection profile:</span>
<div class="picker" title="All connections share this tab: switching keeps the output above; the connection applies to what you run next.">
<span class="select-box">
<input type="text" id="connect-filter" placeholder="Filter by host or alias" autocomplete="off" spellcheck="false">
</span>
<ul id="connect-list" hidden></ul>
</div>
<button id="connect-go" type="button">Connect</button>
<span class="err" id="connect-err"></span>
</div>
<main id="out" aria-live="polite">
<div id="prompt-row"><span class="p">frodo&gt;</span><textarea id="in" rows="1" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Type JavaScript. Enter runs, Shift+Enter adds a line, Tab completes, Ctrl+R searches history."></textarea></div>
<div id="complete-pop" hidden></div>
<div id="search-row" role="search"><div class="head"><span class="label">(fuzzy-search)</span><span class="query"></span><span class="count"></span></div><div class="cands"></div></div>
</main>
<footer><div id="hint"></div></footer>
<script nonce="${attr(params.nonce)}">${SCRIPT}</script>
${scripts.join('\n')}
</body>
</html>
`;
}
