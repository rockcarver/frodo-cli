import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

/**
 * The guard behind "every prompt is a framed prompt" (cli records 0018 and
 * 0035). A prompt component is drawn as the same three parts as every
 * picker: the Navigate menu on top, the question in a box, the footer with
 * the command being authored underneath. A new prompt that leaves one out
 * fails here, so the frame cannot be forgotten by the next author or the
 * next agent: the unframed `--iss` prompt (a bare one-liner between two
 * framed pickers) is how this was found.
 *
 * Two lists name what is outside the rule. Neither grows, and an entry that
 * no longer applies fails the run until it is removed.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** The parts of the frame, and the way each one shows up in a prompt's source. */
const PARTS = {
  menu: {
    label: 'the Navigate menu (call renderNavigationMenu)',
    present: (code) => /\brenderNavigationMenu\s*\(/.test(code),
  },
  box: {
    label: 'the question in a box (call renderFramedBox)',
    present: (code) => /\brenderFramedBox\s*\(/.test(code),
  },
  width: {
    label: 'the terminal width (call useTerminalWidth)',
    present: (code) => /\buseTerminalWidth\s*\(/.test(code),
  },
  footer: {
    label: 'the command-preview footer (a `preview` option)',
    present: (code) => /\bpreview\??\s*:/.test(code),
  },
};

/**
 * Prompt components that are the screen of a running command, not a step in
 * authoring one: there is no command line to show, so they need no footer.
 * They still need the menu, the box and the width.
 */
const NO_COMMAND_BEING_AUTHORED = {
  'src/utils/interactive/DebugTailPrompt.ts': ['footer'],
  'src/utils/interactive/JourneyDebugPrompt.ts': ['footer'],
};

/**
 * Yes or no confirmations of the packaged `@inquirer/confirm`. They are
 * consent checks asked once the command is complete, not steps in authoring
 * it, so the frame rule does not cover them (record 0035 leaves their look
 * to a later decision). This is the inventory of the existing ones; a new
 * file waits for that decision.
 */
const PACKAGED_CONFIRMS = [
  'src/cli/esv/esv-apply.ts',
  'src/cli/esv/esv-secret-version-prune.ts',
  'src/cli/idm/idm-schema-object-import.ts',
  'src/cli/journey/journey-prune.ts',
  'src/ops/FeatureOps.ts',
  'src/ops/IdmOps.ts',
  'src/ops/PromoteOps.ts',
];

/** The source without its comments, so a mention in prose does not count as use. */
export function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Whether the source builds a prompt component of its own (importing `createPrompt` is not building one). */
export function buildsPrompt(source) {
  const withoutImports = code(source).replace(
    /import\s[^;]*?from\s+['"][^'"]+['"];?/g,
    ''
  );
  return /\bcreatePrompt\b/.test(withoutImports);
}

/** The packaged inquirer prompts the source imports (`@inquirer/confirm`, `@inquirer/select`, ...). */
export function packagedPrompts(source) {
  return [...code(source).matchAll(/from\s+['"]@inquirer\/([a-z-]+)['"]/g)]
    .map((match) => match[1])
    .filter((name) => !['core', 'type'].includes(name));
}

/** The parts of the frame a prompt component leaves out. */
export function missingParts(source) {
  const stripped = code(source);
  return Object.entries(PARTS)
    .filter(([, part]) => !part.present(stripped))
    .map(([name]) => name);
}

function sourceFiles(dir) {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return relative.endsWith('.ts') && !relative.endsWith('.test.ts')
        ? [relative]
        : [];
    });
}

const files = sourceFiles('src');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('every prompt component is drawn as the framed prompt', () => {
  const prompts = files.filter((file) => buildsPrompt(read(file)));

  it('finds the prompt components', () => {
    // a scan that finds nothing would pass for the wrong reason
    expect(prompts).toEqual(
      expect.arrayContaining([
        'src/utils/interactive/EscapableSelectPrompt.ts',
        'src/utils/interactive/PromptGate.ts',
      ])
    );
  });

  it.each(prompts)(
    '%s has the menu, the box, the width and the footer',
    (file) => {
      const waived = NO_COMMAND_BEING_AUTHORED[file] ?? [];
      const missing = missingParts(read(file)).filter(
        (part) => !waived.includes(part)
      );
      expect(missing.map((part) => PARTS[part].label)).toEqual([]);
    }
  );

  it.each(Object.keys(NO_COMMAND_BEING_AUTHORED))(
    '%s is still a prompt that needs its exemption',
    (file) => {
      expect(prompts).toContain(file);
      expect(missingParts(read(file))).toEqual(NO_COMMAND_BEING_AUTHORED[file]);
    }
  );
});

describe('a prompt is not taken from the packaged inquirer prompts', () => {
  const packaged = files.filter((file) => packagedPrompts(read(file)).length);

  it('has no new use of a packaged prompt: an authoring prompt is drawn through the frame, a confirmation waits for a maintainer', () => {
    expect(
      packaged.filter((file) => !PACKAGED_CONFIRMS.includes(file))
    ).toEqual([]);
  });

  it.each(PACKAGED_CONFIRMS)(
    '%s still uses the packaged confirm (remove it from the list once it does not)',
    (file) => {
      expect(packagedPrompts(read(file))).toEqual(['confirm']);
    }
  );
});

describe('the guard itself', () => {
  const framed = `
    import { createPrompt } from '@inquirer/core';
    const P = createPrompt((config) => {
      const width = useTerminalWidth();
      const menu = renderNavigationMenu(items, width);
      const panel = renderFramedBox({ title: 'q', lines: [], width });
      return [menu, panel, config.preview].join('\\n');
    });
    type Config = { message: string; preview?: string };
  `;

  it('accepts a prompt with all four parts', () => {
    expect(buildsPrompt(framed)).toBe(true);
    expect(missingParts(framed)).toEqual([]);
  });

  it('names what a bare one-line prompt leaves out', () => {
    const bare = `
      import { createPrompt } from '@inquirer/core';
      const P = createPrompt((config) => \`? \${config.message}\`);
    `;
    expect(buildsPrompt(bare)).toBe(true);
    expect(missingParts(bare)).toEqual(['menu', 'box', 'width', 'footer']);
  });

  it.each([
    ['the menu', 'renderNavigationMenu(items, width)', 'menu'],
    ['the box', "renderFramedBox({ title: 'q', lines: [], width })", 'box'],
    ['the width', 'useTerminalWidth()', 'width'],
    ['the footer', 'preview?: string', 'footer'],
  ])('notices when %s is taken out', (_label, piece, part) => {
    expect(missingParts(framed.replace(piece, ''))).toContain(part);
  });

  it('does not count a mention in a comment', () => {
    const commented = `
      // draws renderNavigationMenu( and renderFramedBox( and useTerminalWidth(
      /* preview: the footer */
      const P = createPrompt(() => 'x');
    `;
    expect(missingParts(commented)).toEqual(['menu', 'box', 'width', 'footer']);
  });

  it('finds a packaged prompt and ignores the core library', () => {
    expect(
      packagedPrompts(
        `import confirm from '@inquirer/confirm';\nimport { x } from '@inquirer/core';`
      )
    ).toEqual(['confirm']);
  });
});
