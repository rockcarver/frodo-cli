import cp from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

/** A Chrome to drive: env override first, then the usual install paths. */
function findChrome() {
  if (process.env.FRODO_TEST_CHROME) return process.env.FRODO_TEST_CHROME;
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/opt/google/chrome/chrome',
        ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

const CHROME = findChrome();
const CDP_TIMEOUT_MS = 20_000;

/** Targets seen at the CDP endpoint, for failure diagnostics. */
let targets_seen = () => 'unknown';

function chromeStderr(chrome) {
  let text = '';
  chrome.stderr.on('data', (c) => {
    text += c;
  });
  return () => text;
}

function startChrome(port) {
  if (!CHROME) throw new Error('startChrome called without a Chrome binary');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-chrome-'));
  const chrome = cp.spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-crashpad',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  chrome.stderr.on('data', (c) => {
    stderr += c;
  });
  return { chrome, userData, stderr: () => stderr };
}

async function cdpFetch(path, port, opts = {}) {
  const reply = await fetch(`http://127.0.0.1:${port}${path}`, opts);
  if (!reply.ok) {
    throw new Error(`CDP ${path} -> ${reply.status}`);
  }
  return reply.json();
}

async function waitFor(watch, timeoutMs = CDP_TIMEOUT_MS, everyMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await watch().catch((e) => `ERROR: ${e.message}`);
    if (last !== null && last !== undefined && last !== false) return last;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`Timed out waiting; last value: ${JSON.stringify(last)}`);
}

/** One headless Chrome tab driven over CDP; every expression returns a value. */
async function withPage(port, url, run) {
  let target;
  for (let attempt = 0; ; attempt++) {
    try {
      target = await cdpFetch(
        `/json/new?${encodeURIComponent('about:blank')}`,
        port,
        {
          method: 'PUT',
        }
      );
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('CDP websocket failed'));
  });
  let nextId = 1;
  const pending = new Map();
  const loadListeners = [];
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === 'Page.loadEventFired') {
      for (const listener of loadListeners) listener();
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(
        exceptionDetails.exception?.description ?? 'Page evaluation failed'
      );
    }
    return result.value;
  };
  async function typeLine(code) {
    // With the CDN editor loaded, #in is CodeMirror's hidden textarea and
    // the editor holds the text; without it, the plain textarea is used.
    await evaluate(`(function () {
      var cmEl = document.querySelector('.CodeMirror');
      var code = ${JSON.stringify(code)};
      if (cmEl && cmEl.CodeMirror) {
        var cm = cmEl.CodeMirror;
        cm.setValue(code);
        var ta = cm.getInputField();
        ta.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      } else {
        var e = document.getElementById('in');
        e.value = code;
        e.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      }
    })()`);
  }
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    // Navigate to the sign-in link and wait for the redirect to land on the
    // console page, so the websocket stays bound to this target throughout.
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('page load timed out')),
        20_000
      );
      loadListeners.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    await send('Page.navigate', { url });
    await loaded;
    await run(evaluate, typeLine);
  } finally {
    ws.close();
    await cdpFetch(`/json/close/${target.id}`, port).catch(() => undefined);
  }
}

function startConsoleWeb(homeDir) {
  const child = cp.spawn(
    process.execPath,
    [path.join(repoRoot, 'dist', 'launch.cjs'), 'shell', '--web'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        FRODO_TEST: '1',
        FRODO_NO_CACHE: 'true',
        FRODO_CONNECTION_PROFILES_PATH: '',
        HOME: homeDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  // printMessage writes to stderr (utils/Console.ts, text()), so the
  // sign-in link arrives there.
  let stderrText = '';
  child.stderr.on('data', (c) => {
    stderrText += c;
  });
  return {
    child,
    get stdout() {
      return stderrText;
    },
  };
}

function stopConsoleWeb(child, home) {
  child.kill('SIGTERM');
  fs.rmSync(home, { recursive: true, force: true });
}

describe('frodo shell --web in a real browser', () => {
  let port;
  let web;
  let home;

  beforeAll(async () => {
    // A free debugging port: let the OS hand one out through a probe server.
    port = await new Promise((resolve, reject) => {
      const probe = http.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const free = probe.address().port;
        probe.close(() => resolve(free));
      });
      probe.on('error', reject);
    });
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-web-home-'));
    web = startConsoleWeb(home);
    // Wait for the one-time link on stdout.
    web.launchUrl = await waitFor(async () => /*W*/ {
      const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=\S+/.exec(web.stdout ?? '');
      return match ? match[0] : null;
    }, 20_000);
  }, 45_000);

  afterAll(() => {
    stopConsoleWeb(web.child, home);
  });

  // A real-browser test runs where a Chrome exists; the skip is loud.
  const driveBrowser = CHROME ? test : test.skip;
  driveBrowser(
    'signs in, evaluates, expands a result tree, and prints what a script logs',
    async () => {
      const { chrome, userData } = startChrome(port);
      const chromeRef = { stderr: () => 'not captured' };
      chromeRef.stderr = chromeStderr(chrome);
      try {
        await waitFor(async () => /*W*/ {
          const targets = await cdpFetch('/json/list', port).catch(() => null);
          targets_seen = () =>
            JSON.stringify(
              Array.isArray(targets) ? targets.map((t) => t.url) : targets
            );
          return Array.isArray(targets) &&
            targets.some((t) => t.type === 'page')
            ? true
            : null;
        }, 30_000);
        await withPage(port, web.launchUrl, async (evaluate, typeLine) => {
          // The one-time link signed us in and the page loaded.
          await waitFor(
            () => /*W*/ evaluate(`document.querySelector('#in') ? true : null`),
            30_000
          ).catch((e) => {
            // No evaluate() here: if the browser or the socket died, those
            // calls would hang and mask the real failure.
            throw new Error(
              `page never rendered; chrome said: ${JSON.stringify(chromeRef.stderr().slice(0, 400))}; targets: ${targets_seen()}; cause: ${e.message}`
            );
          });
          const signedIn = await evaluate(`location.search === ''`);
          expect(signedIn).toBe(true);

          // The session header shows the (initially unconnected) console.
          await waitFor(() =>
            /*W*/
            evaluate(`document.getElementById('info').textContent.length > 0`)
          );

          // Point the engine at the local fake IDM, through the console's
          // own input: the browser cannot see the engine's world.
          await typeLine(
            `state.setHost('http://127.0.0.1:18089/am'); state.setBearerTokenMeta({access_token: 'tok123', expires: Date.now() + 3600000}); 'ready'`
          );
          // The result, not the echo: the page refuses a new submit while
          // the previous one is still in flight (its `busy` flag), so a
          // wait on the echo alone races the next typeLine.
          await waitFor(
            () =>
              /*W*/
              evaluate(
                `Array.from(document.querySelectorAll('.entry')).some(e => e.textContent.includes("'ready'") && e.querySelector('.result .row')) ? true : null`
              ),
            30_000
          );
          const pageTail = () =>
            evaluate(
              `document.getElementById('out').textContent.slice(-500)`
            ).catch((x) => `page eval failed: ${x.message}`);

          // A script with output and a rich result.
          await typeLine(
            '({users: [{name: "alice"}], meta: {deep: {deeper: {deepest: 1}}}})'
          );
          await waitFor(
            () =>
              /*W*/
              evaluate(
                `Array.from(document.querySelectorAll('.entry')).some(e => e.querySelector('.result .row .val') && e.textContent.includes('users')) ? true : null`
              ),
            45_000
          ).catch(async (e) => {
            const tail = await pageTail();
            throw new Error(
              `users result never rendered; page tail: ${tail}; cause: ${e.message}`
            );
          });
          // The newest entry is last in the DOM; read its result row.
          const printed = await evaluate(
            `Array.from(document.querySelectorAll('.entry')).pop().querySelector('.result .row .val').textContent`
          );
          // Collapsed one-line summary with the hint line below it.
          expect(printed).toBe('{users: Array(1), meta: {…}}');
          // The page offers the JSON export for an expandable result.
          expect(
            await evaluate(
              `Array.from(document.querySelectorAll('.entry')).pop().textContent`
            )
          ).toContain('copy JSON');

          // Open the tree on the newest entry: click its twisty, then read
          // the loaded children (the result's top level is open at start,
          // so the first click closes it; click again to reopen).
          const newest = `Array.from(document.querySelectorAll('.entry')).pop()`;
          await evaluate(`${newest}.querySelector('.result .row').click()`);
          await evaluate(`${newest}.querySelector('.result .row').click()`);
          // A 'loading...' note is also a child of the container; the keys
          // are what this step is about, so wait for those.
          await waitFor(() =>
            /*W*/
            evaluate(
              `Array.from(${newest}.querySelectorAll('.result .children > .node > .row .key')).length > 0 ? true : null`
            )
          );
          const keys = await evaluate(
            `Array.from(${newest}.querySelectorAll('.result .children > .node > .row .key')).map(e => e.textContent)`
          );
          expect(keys).toEqual(['users', 'meta']);

          // Errors surface with name and message.
          await typeLine('throw new Error("from browser")');
          await waitFor(() =>
            /*W*/
            evaluate(
              `Array.from(document.querySelectorAll('.error')).some(e => e.textContent.includes('Error: from browser'))`
            )
          );

          // Ctrl+R opens the fuzzy search over history; typing filters and
          // Enter accepts the top match and runs it.
          await evaluate(`(function () {
            var cmEl = document.querySelector('.CodeMirror');
            var t = cmEl ? cmEl.CodeMirror.getInputField() : document.getElementById('in');
            t.dispatchEvent(new KeyboardEvent('keydown', {key: 'r', ctrlKey: true, bubbles: true}));
          })()`);
          await waitFor(() =>
            /*W*/
            evaluate(
              `document.getElementById('search-row').classList.contains('open') ? true : null`
            )
          );
          for (const key of ['s', 'e', 't', 'h']) {
            await evaluate(
              `document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(key)}, bubbles: true}))`
            );
          }
          await waitFor(() =>
            /*W*/
            evaluate(
              `document.querySelector('#search-row .count').textContent.includes('/') ? true : null`
            )
          ).catch(async (e) => {
            const state = await evaluate(
              `JSON.stringify({ open: document.getElementById('search-row').classList.contains('open'), q: document.querySelector('#search-row .query').textContent, c: document.querySelector('#search-row .count').textContent })`
            ).catch((x) => `page eval failed: ${x.message}`);
            throw new Error(
              `search did not filter; state: ${state}; cause: ${e.message}`
            );
          });
          // The candidates are a list with the matched characters
          // highlighted; the head row shows the raw query.
          expect(
            await evaluate(
              `document.querySelectorAll('#search-row .cand').length`
            )
          ).toBeGreaterThan(0);
          expect(
            await evaluate(
              `document.querySelectorAll('#search-row .cand .match').length`
            )
          ).toBeGreaterThan(0);
          expect(
            await evaluate(
              `document.querySelector('#search-row .query').textContent`
            )
          ).toBe('seth');
          await evaluate(
            `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`
          );
          await waitFor(() =>
            /*W*/
            evaluate(
              `Array.from(document.querySelectorAll('.entry')).some(e => e.querySelector('.result .row') && e.textContent.includes('ready')) && !document.getElementById('search-row').classList.contains('open') ? true : null`
            )
          );

          // Tab pastes the selection into the prompt for editing without
          // running it.
          const entriesBefore = await evaluate(
            `document.querySelectorAll('.entry').length`
          );
          await evaluate(`(function () {
            var cmEl = document.querySelector('.CodeMirror');
            var t = cmEl ? cmEl.CodeMirror.getInputField() : document.getElementById('in');
            t.dispatchEvent(new KeyboardEvent('keydown', {key: 'r', ctrlKey: true, bubbles: true}));
          })()`);
          await waitFor(() =>
            /*W*/
            evaluate(
              `document.getElementById('search-row').classList.contains('open') ? true : null`
            )
          );
          for (const key of ['s', 'e', 't', 'h']) {
            await evaluate(
              `document.dispatchEvent(new KeyboardEvent('keydown', {key: ${JSON.stringify(key)}, bubbles: true}))`
            );
          }
          await waitFor(() =>
            /*W*/
            evaluate(
              `document.querySelector('#search-row .count').textContent.includes('/') ? true : null`
            )
          );
          await evaluate(
            `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}))`
          );
          await waitFor(() =>
            /*W*/
            evaluate(
              `(document.querySelector('.CodeMirror') ? document.querySelector('.CodeMirror').CodeMirror.getValue() : document.getElementById('in').value).includes('setHost') && !document.getElementById('search-row').classList.contains('open') ? true : null`
            )
          );
          expect(
            await evaluate(`document.querySelectorAll('.entry').length`)
          ).toBe(entriesBefore);

          // Clear removes the entries but keeps the live prompt row: the
          // input (and its editor) survive, and the next input still runs.
          await waitFor(() =>
            /*W*/
            evaluate(
              `document.querySelectorAll('.entry').length > 0 && (function(){ var es = document.querySelectorAll('.entry'); return es[es.length-1].querySelector('.result .row'); })() ? true : null`
            )
          );
          await evaluate(`document.getElementById('clear').click()`);
          expect(
            await evaluate(`document.querySelectorAll('.entry').length`)
          ).toBe(0);
          expect(
            await evaluate(`!!document.querySelector('main #prompt-row')`)
          ).toBe(true);
          await typeLine('7 * 6');
          await waitFor(() =>
            /*W*/
            evaluate(
              `Array.from(document.querySelectorAll('.entry')).some(e => e.textContent.includes('42')) ? true : null`
            )
          );
        });
      } finally {
        chrome.kill('SIGKILL');
        fs.rmSync(userData, { recursive: true, force: true });
      }
    },
    300_000
  );
  if (!CHROME) {
    // eslint-disable-next-line no-console -- the skip itself says why
    console.warn(
      'skipped: no Chrome found (set FRODO_TEST_CHROME to the path)'
    );
  }
});
