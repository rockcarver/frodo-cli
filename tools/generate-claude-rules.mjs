#!/usr/bin/env node
// Writes .claude/rules/ (Claude Code) from .github/instructions/ (GitHub Copilot). The instruction files are the
// one source; each file of .claude/rules/ is its twin: same path, `paths` in place of `applyTo`, body unchanged.
// A glob feature that is not translated (braces, negation, character classes) is rejected. Without `--check` it
// writes the twins and removes every file of .claude/rules/ that has no source; `--check` writes nothing, names
// every file that differs and exits 1; `--root <dir>` works on another tree. The same file is kept in frodo-cli
// (tools/) and frodo-lib (scripts/): core 0026.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_DIR = '.github/instructions';
export const TARGET_DIR = '.claude/rules';
const SOURCE_SUFFIX = '.instructions.md';
const SELF = fileURLToPath(import.meta.url);
/** The command the header of a twin names, for example `node tools/generate-claude-rules.mjs`. */
export const COMMAND = `node ${path.basename(path.dirname(SELF))}/${path.basename(SELF)}`;

const lf = (text) => text.replace(/\r\n/g, '\n');
/** The globs of the `applyTo` line of an instruction file and its body (everything after the front matter, unchanged). */
export function parseInstructionFile(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(lf(text));
  if (!match) throw new Error('no front matter block');
  const lines = match[1].split('\n').filter((line) => line.trim() !== '');
  const other = lines.find((line) => !line.startsWith('applyTo:'));
  if (other) throw new Error(`front matter may hold only applyTo, found "${other}"`);
  if (lines.length !== 1) throw new Error(lines.length ? 'applyTo is given more than once' : 'applyTo is missing');
  const value = lines[0].slice('applyTo:'.length).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (value === '') throw new Error('applyTo is empty');
  const applyTo = value.split(',').map((item) => item.trim());
  for (const item of applyTo) {
    if (item === '') throw new Error(`applyTo "${value}" has an empty item`);
    if (/[{}![\]]/.test(item)) throw new Error(`"${item}" uses a glob feature that is not translated ({ } ! [ ])`);
    if (item.startsWith('/')) throw new Error(`"${item}" starts with a slash; write the path from the repository root`);
  }
  return { applyTo, body: lf(text).slice(match[0].length) };
}

/** A Copilot glob as a Claude Code `paths` pattern: a name without a slash matches anywhere there, so it is anchored at the root. */
export function translateGlob(glob) {
  return glob.includes('/') ? glob : `/${glob}`;
}

/** The twin of an instruction file: `paths` (every pattern double quoted, so `*` is no YAML alias), the header, the body. */
export function renderRule(text, { source, command = COMMAND }) {
  const { applyTo, body } = parseInstructionFile(text);
  const paths = applyTo.map((glob) => `  - ${JSON.stringify(translateGlob(glob))}`).join('\n');
  const header = `<!-- Generated: do not edit. Source: ${source}. Regenerate with: ${command} -->`;
  return `---\npaths:\n${paths}\n---\n${header}\n${body}`;
}

/** Every file below `dir`, as paths relative to it with `/`, sorted. */
const listFiles = (dir, prefix = '') =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`])).sort()
    : [];

/** Brings TARGET_DIR in line with SOURCE_DIR under `root` (writes only when `write`); returns what was out of line, one line per file. */
export function syncRules(root, { write = false } = {}) {
  const sources = listFiles(path.join(root, SOURCE_DIR)).filter((f) => f.endsWith(SOURCE_SUFFIX));
  const found = new Set(listFiles(path.join(root, TARGET_DIR)));
  const problems = [];
  for (const name of sources) {
    const source = `${SOURCE_DIR}/${name}`;
    const wanted = renderRule(fs.readFileSync(path.join(root, source), 'utf8'), { source });
    const file = path.join(root, TARGET_DIR, name);
    const current = found.has(name) ? lf(fs.readFileSync(file, 'utf8')) : undefined;
    if (current === wanted) continue;
    problems.push(`${TARGET_DIR}/${name}: ${current === undefined ? 'missing' : `differs from what ${source} generates`}`);
    if (write) fs.mkdirSync(path.dirname(file), { recursive: true }), fs.writeFileSync(file, wanted);
  }
  for (const name of [...found].filter((f) => !sources.includes(f))) {
    problems.push(`${TARGET_DIR}/${name}: has no source in ${SOURCE_DIR}`);
    if (write) fs.rmSync(path.join(root, TARGET_DIR, name));
  }
  return problems;
}

/** Whether Node started this file; real paths are compared, because through a symlinked folder argv[1] differs from the module URL. */
const isEntryPoint = () => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF); } catch { return false; }
};

if (isEntryPoint()) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : path.join(path.dirname(SELF), '..'));
  try {
    const check = args.includes('--check');
    const problems = syncRules(root, { write: !check });
    if (check && problems.length > 0) {
      console.error(`${problems.join('\n')}\nThe twins in ${TARGET_DIR}/ are generated: run \`${COMMAND}\` and commit the result.`);
      process.exitCode = 1;
    } else {
      console.log(check ? `${TARGET_DIR}/ is in line with ${SOURCE_DIR}/` : `${problems.length} file(s) written or removed in ${TARGET_DIR}/${problems.length ? `:\n${problems.join('\n')}` : ''}`);
    }
  } catch (error) {
    console.error(`${COMMAND}: ${error.message}`);
    process.exitCode = 1;
  }
}
