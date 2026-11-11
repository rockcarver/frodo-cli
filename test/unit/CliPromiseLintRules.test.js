import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';

let root;
let eslint;
const preamble = `
  async function operation(): Promise<boolean> { return true; }
  export async function action() {
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-promise-lint-'));
  // a nested folder, like every command (src/cli/<group>/<verb>.ts)
  fs.mkdirSync(path.join(root, 'src/cli/group'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      include: ['src/**/*.ts'],
    })
  );
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.resolve('eslint.config.mjs'),
    overrideConfig: {
      languageOptions: {
        parserOptions: {
          project: path.join(root, 'tsconfig.json'),
          tsconfigRootDir: root,
        },
      },
    },
  });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function lint(body) {
  const filePath = path.join(root, 'src/cli/group/probe.ts');
  fs.writeFileSync(filePath, `${preamble}${body}\n}`);
  const [result] = await eslint.lintFiles([filePath]);
  return result.messages;
}

describe('CLI promise lint rules', () => {
  it('rejects a discarded async operation', async () => {
    expect(await lint('operation();')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: '@typescript-eslint/no-floating-promises',
          severity: 2,
        }),
      ])
    );
  });

  it('rejects testing a promise instead of its outcome', async () => {
    expect(
      await lint(
        'const outcome = operation(); if (!outcome) process.exitCode = 1;'
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: '@typescript-eslint/no-misused-promises',
          severity: 2,
        }),
      ])
    );
  });

  it('accepts an awaited outcome', async () => {
    expect(
      await lint(
        'const outcome = await operation(); if (!outcome) process.exitCode = 1;'
      )
    ).toEqual([]);
  });

  it('does not impose promise lint rules on ops', async () => {
    const config = await eslint.calculateConfigForFile(
      path.join(root, 'src/ops/probe.ts')
    );
    expect(
      config.rules['@typescript-eslint/no-floating-promises']
    ).toBeUndefined();
    expect(
      config.rules['@typescript-eslint/no-misused-promises']
    ).toBeUndefined();
  });
});
