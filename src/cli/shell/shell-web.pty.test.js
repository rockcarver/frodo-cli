import cp from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  installStubOpener,
  makeHome,
  removeHome,
  startFrodo,
  waitFor,
} from '../../../test/utils/WebShell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const CDP_CALL_TIMEOUT_MS = 30_000;

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
  const userData = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frodo-chrome-webshell-')
  );
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
      // Without it Chrome asks the login keychain for its cookie key, and
      // under a home directory without one (every test run here) the first
      // page load hangs until the test gives up.
      '--use-mock-keychain',
      '--window-size=1280,900',
      'about:blank',
    ],
    // A group of its own, so that the helper processes of the browser end
    // with it: killing the main process alone leaves them running.
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true }
  );
  let stderr = '';
  chrome.stderr.on('data', (c) => {
    stderr += c;
  });
  running.add({ chrome, userData });
  return { chrome, userData, stderr: () => stderr };
}

/** The browsers this file started and has not ended yet. */
const running = new Set();

/** Ends the browser and every process it started, and removes its profile. */
function stopChrome(chrome, userData) {
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {
    chrome.kill('SIGKILL');
  }
  // A killed browser's helpers may write into the profile for a moment more,
  // which makes the removal fail once with ENOTEMPTY: try again.
  fs.rmSync(userData, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  for (const entry of running) {
    if (entry.chrome === chrome) running.delete(entry);
  }
}

/**
 * Ends every browser that is still running. A test that runs into its time
 * limit is only reported failed: its body goes on waiting for the browser, so
 * its own `finally` never runs. This runs after every test and when the test
 * process exits.
 */
function stopAllChromes() {
  for (const { chrome, userData } of [...running]) stopChrome(chrome, userData);
}
afterEach(stopAllChromes);
afterAll(stopAllChromes);
process.on('exit', stopAllChromes);

/** Waits until the browser lists a page target over the debugging port. */
async function waitForChromePage(port) {
  await waitFor(async () => /*W*/ {
    const targets = await cdpFetch('/json/list', port).catch(() => null);
    targets_seen = () =>
      JSON.stringify(
        Array.isArray(targets) ? targets.map((t) => t.url) : targets
      );
    return Array.isArray(targets) && targets.some((t) => t.type === 'page')
      ? true
      : null;
  }, 30_000);
}

/** A free port for the debugging protocol: the OS hands one out through a probe server. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const free = probe.address().port;
      probe.close(() => resolve(free));
    });
    probe.on('error', reject);
  });
}

async function cdpFetch(path, port, opts = {}) {
  const reply = await fetch(`http://127.0.0.1:${port}${path}`, opts);
  if (!reply.ok) {
    throw new Error(`CDP ${path} -> ${reply.status}`);
  }
  return reply.json();
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
      // A browser that stops answering must fail the test, not hang it
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
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

describe('frodo shell --web in a real browser', () => {
  let port;
  let web;
  let home;
  let tools;
  let temporary;
  let launcherUrl;

  beforeAll(async () => {
    port = await freePort();
    home = makeHome('frodo-web-home-');
    // The console opens "the default browser" the way it does for a person, but
    // the opener on its PATH is a stub that only writes what it was given; the
    // browser is this test's own headless Chrome, which is sent to the address
    // the stub was given (the private launcher file). The temporary directory
    // of the console is its own, so that what it leaves there can be looked at.
    tools = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-web-tools-'));
    temporary = path.join(tools, 'tmp');
    fs.mkdirSync(temporary);
    const log = path.join(tools, 'opened.log');
    installStubOpener(tools, log);
    // The command is this checkout's: dist/launch.cjs, or the native binary
    // under FRODO_TEST_BINARY=sea.
    web = startFrodo({
      args: ['shell', '--web'],
      homeDir: home,
      watchdogMs: 600_000,
      env: { PATH: tools, TMPDIR: temporary },
    });
    web.launchUrl = await web.link(20_000);
    launcherUrl = await waitFor(async () => {
      const lines = fs.existsSync(log)
        ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
        : [];
      return lines[0] ?? null;
    }, 20_000);
  }, 45_000);

  afterAll(async () => {
    await web?.stop();
    if (home) removeHome(home);
    if (tools) fs.rmSync(tools, { recursive: true, force: true });
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
        await waitForChromePage(port);
        // What the opener was given is a file, not the link: Chrome loads the
        // file, which sends it on to the link, and the console signs it in.
        expect(launcherUrl).toMatch(/^file:\/\/.*\/open\.html$/);
        expect(launcherUrl).not.toContain('?t=');
        await withPage(port, launcherUrl, async (evaluate, typeLine) => {
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
          // The link was used: the launcher file and its folder are gone, the
          // terminal says that a browser signed in, and the secret was printed
          // once (in the banner) and never again.
          await waitFor(
            async () =>
              /*W*/
              fs
                .readdirSync(temporary)
                .filter((name) => name.startsWith('frodo-shell-open-'))
                .length === 0
                ? true
                : null,
            10_000
          );
          expect(web.output()).toContain(
            'A browser signed in to the web console.'
          );
          const secret = new URL(web.launchUrl).searchParams.get('t');
          expect(web.output().split(secret)).toHaveLength(2);

          // The session header shows the (initially unconnected) console.
          await waitFor(() =>
            /*W*/
            evaluate(
              `(function () { var e = document.getElementById('info'); return !!e && e.textContent.length > 0; })()`
            )
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
              `(function () { var r = document.getElementById('search-row'); return r && r.classList.contains('open') ? true : null; })()`
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
              `(function () { var c = document.querySelector('#search-row .count'); return c && c.textContent.includes('/') ? true : null; })()`
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
          // Enter runs the selection again. Wait for that run to end, not for
          // an entry with the same text: the first run of it is on the page
          // already, and a run that ends clears the prompt, which would wipe
          // what the next step pastes into it.
          const entriesBeforeRun = await evaluate(
            `document.querySelectorAll('.entry').length`
          );
          await evaluate(
            `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))`
          );
          await waitFor(() =>
            /*W*/
            evaluate(
              `(function () { var r = document.getElementById('search-row'); var es = document.querySelectorAll('.entry'); var last = es[es.length - 1]; return r && !r.classList.contains('open') && es.length === ${entriesBeforeRun + 1} && last.querySelector('.result .row') ? true : null; })()`
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
              `(function () { var r = document.getElementById('search-row'); return r && r.classList.contains('open') ? true : null; })()`
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
              `(function () { var c = document.querySelector('#search-row .count'); return c && c.textContent.includes('/') ? true : null; })()`
            )
          );
          await evaluate(
            `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}))`
          );
          await waitFor(() =>
            /*W*/
            evaluate(
              `(function () { var r = document.getElementById('search-row'); var cm = document.querySelector('.CodeMirror'); var el = document.getElementById('in'); var text = cm ? cm.CodeMirror.getValue() : (el ? el.value : ''); return r && !r.classList.contains('open') && text.includes('setHost') ? true : null; })()`
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
              `Array.from(document.querySelectorAll('.entry')).some(e => e.textContent.includes('42') && e.querySelector('.result .row')) ? true : null`
            )
          );
          // The last result is `_`, as in the terminal console.
          await typeLine('_ + 1');
          await waitFor(() =>
            /*W*/
            evaluate(
              `Array.from(document.querySelectorAll('.entry')).some(e => e.textContent.includes('43') && e.querySelector('.result .row')) ? true : null`
            )
          );
        });
      } finally {
        stopChrome(chrome, userData);
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

describe('frodo shell --web in a real browser when the engine cannot start', () => {
  let port;
  let web;
  let home;
  let dir;

  beforeAll(async () => {
    port = await freePort();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-web-engine-'));
    // A home directory below a plain file: the console starts, and the engine
    // of every tab fails to start (it cannot make its history folder), in the
    // native binary as well as with npm.
    const file = path.join(dir, 'a-file');
    fs.writeFileSync(file, '');
    home = path.join(file, 'home');
    web = startFrodo({
      args: ['shell', '--web', '--no-open'],
      homeDir: home,
      watchdogMs: 300_000,
    });
    web.launchUrl = await web.link(20_000);
  }, 45_000);

  afterAll(async () => {
    await web?.stop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const driveBrowser = CHROME ? test : test.skip;
  driveBrowser(
    'says why in the page and asks the server again only after a pause that grows',
    async () => {
      const { chrome, userData } = startChrome(port);
      try {
        await waitForChromePage(port);
        await withPage(port, web.launchUrl, async (evaluate) => {
          // The reason the server gave is on the page, in the place of the
          // connection line.
          const info = await waitFor(
            () =>
              /*W*/
              evaluate(
                `(function () { var e = document.getElementById('info'); var t = e ? e.textContent : ''; return t.indexOf('session error') >= 0 ? t : null; })()`
              ),
            30_000
          );
          expect(info).toContain('The console could not start an engine');
          expect(info).not.toContain('Internal error');

          // Let the page retry for a while. Asked at once again each time, it
          // would start an engine process per answer, dozens in this time;
          // with a pause that grows (1.5 s, then 3 s, ...) it is asked three
          // times in eight seconds.
          await new Promise((resolve) => setTimeout(resolve, 8_000));
          const asked = await evaluate(
            `performance.getEntriesByType('resource').filter(function (e) { return e.name.indexOf('/api/session') >= 0; }).length`
          );
          expect(asked).toBeGreaterThanOrEqual(2);
          expect(asked).toBeLessThanOrEqual(5);
        });
      } finally {
        stopChrome(chrome, userData);
      }
    },
    120_000
  );
});
