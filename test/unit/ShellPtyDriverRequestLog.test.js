import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The terminal driver of the PTY tests (test/utils/shell_pty_driver.py) can wait for a request in
 * the log of a fake tenant: a file with one JSON record a line that the fake appends to while the
 * driver reads it. The last line can be half written when it is read. It is not an error: the next
 * poll reads it whole. The driver is Python, so the test asks it, in a process of its own, whether
 * a log holds a request; no terminal and no clock is involved.
 */
const driverPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../utils/shell_pty_driver.py'
);
// the driver needs a terminal, which Windows does not have
const posixTest = process.platform === 'win32' ? test.skip : test;

const ASK = `
import importlib.util, json, re, sys
spec = importlib.util.spec_from_file_location('driver', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.request_logged(sys.argv[2], re.compile(sys.argv[3]))))
`;

/** Whether the log holds a request whose url the expression finds, as the driver answers it. */
const logged = (log, expression) =>
  JSON.parse(
    execFileSync('python3', ['-I', '-c', ASK, driverPath, log, expression], {
      encoding: 'utf8',
    })
  );

const record = (url) => `${JSON.stringify({ method: 'GET', url })}\n`;

let folder;
let log;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pty-driver-'));
  log = path.join(folder, 'requests.jsonl');
});

afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('the request log of the PTY driver', () => {
  posixTest('finds a request whose url matches, and not one whose url does not', () => {
    fs.writeFileSync(log, record('/am/json/realms') + record('/am/json/users'));

    expect(logged(log, '/users$')).toBe(true);
    expect(logged(log, '/groups$')).toBe(false);
  });

  posixTest('reads a line that is half written as not there yet, not as an error', () => {
    const whole = record('/am/json/users');
    fs.writeFileSync(log, record('/am/json/realms') + whole.slice(0, 20));

    expect(logged(log, '/users$')).toBe(false);
    // the request in front of the half line is still found
    expect(logged(log, '/realms$')).toBe(true);

    // the next poll: the line is whole
    fs.writeFileSync(log, record('/am/json/realms') + whole);
    expect(logged(log, '/users$')).toBe(true);
  });

  posixTest('takes a log that is not there yet, and blank lines, for no request', () => {
    expect(logged(log, '/users$')).toBe(false);

    fs.writeFileSync(log, `\n${record('/am/json/realms')}\n`);
    expect(logged(log, '/users$')).toBe(false);
  });
});
