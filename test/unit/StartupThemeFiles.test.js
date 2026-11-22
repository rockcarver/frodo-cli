import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * What a start of the BUILT CLI does with the colour theme files, and that the
 * saved theme still reaches the output.
 *
 * `app.ts` applies the saved colour theme once, before it builds the command
 * tree. The tree has about 490 command objects, and when each of them applied
 * the theme again in its constructor, a start made 14,282 synchronous calls on
 * `~/.frodo/themes` and `Theme.json` (492 listings of the folder) for about 50
 * ms of a 300 ms start. These tests run `dist/launch.cjs` as a user does, so
 * that they see the whole start and not one constructor. Run `npx tsdown` first
 * (the test scripts do not rebuild `dist/`); without a build the cases are
 * skipped, like those of LauncherCommandLine.test.js.
 *
 * The second half is the other side of the same change: a theme the user saved
 * (a custom one, a built-in one) must still colour the output. Before this
 * file, nothing in the suite proved that, because the suite runs without colour
 * and the unit tests mock the theme away.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const LAUNCHER = path.join(ROOT, 'dist', 'launch.cjs');
const hasDist = fs.existsSync(LAUNCHER);
const testif = (condition) => (condition ? test : test.skip);

// A module for `node --import` that counts, in the process that starts the CLI,
// the listings of a folder named `themes` and the stat or exists calls on a
// file below one, and prints the numbers on exit.
const COUNTER =
  'data:text/javascript,import fs from "node:fs";const c={readdir:0,stat:0};' +
  'const r=fs.readdirSync,s=fs.statSync,e=fs.existsSync;' +
  'fs.readdirSync=function(p,...a){if(String(p).endsWith("/themes"))c.readdir++;return r.call(this,p,...a)};' +
  'fs.statSync=function(p,...a){if(String(p).includes("/themes/"))c.stat++;return s.call(this,p,...a)};' +
  'fs.existsSync=function(p,...a){if(String(p).includes("/themes/"))c.stat++;return e.call(this,p,...a)};' +
  'process.on("exit",()=>process.stderr.write("THEMECOUNT "+JSON.stringify(c)+"\\n"))';

// The `heading` row of `settings theme show` in the colours of three themes: the
// default one (dark-vibrant, bright blue), the built-in light-vibrant (bright
// magenta) and the custom one of the test (magenta).
const DEFAULT_HEADING = '\u001b[1m\u001b[94mheading';
const LIGHT_VIBRANT_HEADING = '\u001b[1m\u001b[95mheading';
const CUSTOM_HEADING = '\u001b[1m\u001b[35mheading';

let home;

/** Runs the built CLI with a scratch HOME, colours forced on, no saved theme env. */
function frodo(args, { preload = false } = {}) {
  const env = { ...process.env };
  // The test scripts set NO_COLOR; the colour cases need colour, and a theme
  // set in the environment would hide the saved one.
  for (const name of ['NO_COLOR', 'FRODO_COLOR_THEME', 'FRODO_CONFIG_PATH']) {
    delete env[name];
  }
  return cp.spawnSync(
    process.execPath,
    [...(preload ? ['--import', COUNTER] : []), LAUNCHER, ...args],
    {
      env: {
        ...env,
        HOME: home,
        FRODO_NO_UPDATE_CHECK: '1',
        FRODO_NO_CACHE: '1',
        FORCE_COLOR: '3',
      },
      encoding: 'utf8',
    }
  );
}

describe('a start of the CLI and the colour theme files', () => {
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-theme-home-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  testif(hasDist)(
    'lists the theme folder once and checks each theme file a handful of times',
    () => {
      // The first start writes the 12 built-in theme files; the second one is
      // the usual case, with the files in place.
      expect(frodo(['--version']).status).toBe(0);
      const run = frodo(['--version'], { preload: true });
      expect(run.status).toBe(0);
      const match = /THEMECOUNT (.*)/.exec(run.stderr);
      expect(match).not.toBeNull();
      const count = JSON.parse(match[1]);
      // One listing is the minimum, since the saved theme is read from the
      // folder. Before the constructor stopped applying the theme this was one
      // per command object (492); the file checks were 11,808 (now 24).
      expect(count.readdir).toBeLessThanOrEqual(2);
      expect(count.stat).toBeLessThanOrEqual(40);
    }
  );

  testif(hasDist)('applies the saved custom theme to the output', () => {
    expect(frodo(['--version']).status).toBe(0);
    fs.writeFileSync(
      path.join(home, '.frodo', 'Theme.json'),
      JSON.stringify({ customActive: 'mine' })
    );
    fs.writeFileSync(
      path.join(home, '.frodo', 'themes', 'mine.json'),
      JSON.stringify({
        name: 'mine',
        description: 'a custom theme for the test',
        mode: 'light',
        colors: { heading: 'magenta' },
      })
    );

    const run = frodo(['settings', 'theme', 'show']);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(CUSTOM_HEADING);
    expect(run.stdout).not.toContain(DEFAULT_HEADING);
  });

  testif(hasDist)(
    'applies the saved theme before the command tree is built (the usage examples of a help page)',
    () => {
      // The usage examples are coloured with the `command` colour while the
      // command factories build the tree, not when an action runs. So only a
      // theme that is applied BEFORE `app.ts` builds the tree colours them,
      // and since no command constructor applies it any more, the one call in
      // `app.ts` is the only guard of that order.
      expect(frodo(['--version']).status).toBe(0);
      fs.writeFileSync(
        path.join(home, '.frodo', 'Theme.json'),
        JSON.stringify({ customActive: 'mine' })
      );
      fs.writeFileSync(
        path.join(home, '.frodo', 'themes', 'mine.json'),
        JSON.stringify({
          name: 'mine',
          description: 'a custom theme for the test',
          mode: 'light',
          colors: { command: 'cyan' },
        })
      );

      const run = frodo(['journey', 'export', '-hhh']);

      expect(run.status).toBe(0);
      expect(run.stdout).toContain('\u001b[36m  $ frodo journey export');
      expect(run.stdout).not.toContain('\u001b[96m  $ frodo journey export');
    }
  );

  testif(hasDist)('applies the saved built-in theme to the output', () => {
    expect(frodo(['--version']).status).toBe(0);
    fs.writeFileSync(
      path.join(home, '.frodo', 'Theme.json'),
      JSON.stringify({ background: 'light', contrast: 'vibrant' })
    );

    const run = frodo(['settings', 'theme', 'show']);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(LIGHT_VIBRANT_HEADING);
    expect(run.stdout).not.toContain(DEFAULT_HEADING);
  });
});
