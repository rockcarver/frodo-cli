import { Command } from 'commander';
import {
  fullName,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';

// FRODO_LOG_KEY and FRODO_LOG_SECRET are defined for `frodo conn save` and for
// the `frodo log` commands by their path. The table compared the short name of
// the command (`save`, `list`) with that path, so no help ever listed them,
// although the library reads them and the error of a tool that needs them says
// to set them.

// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

let leaves;

beforeAll(async () => {
  ({ leaves } = await loadCommandTree());
  // the tree of the helpers has no root program; which variables a command
  // lists depends on its path from the root
  const topOf = (command) => (command.parent ? topOf(command.parent) : command);
  for (const leaf of leaves) {
    const top = topOf(leaf);
    if (top.name() !== 'frodo') new Command('frodo').addCommand(top);
  }
});

/** The environment variables that the -hhh help of the command lists. */
function listed(path) {
  const leaf = leaves.find((candidate) => fullName(candidate) === path);
  expect(leaf).toBeDefined();
  const savedArgv = process.argv;
  process.argv = [...savedArgv, '--help-all'];
  try {
    return renderFullHelp(leaf).replace(ANSI, '');
  } finally {
    process.argv = savedArgv;
  }
}

describe('the Log API key and secret in the help', () => {
  // fullName adds the root once more, because the tree now has one
  test.each([
    ['frodo frodo conn save'],
    ['frodo frodo log list'],
    ['frodo frodo log key list'],
  ])('%s lists them', (path) => {
    const help = listed(path);
    expect(help).toContain('FRODO_LOG_KEY');
    expect(help).toContain('FRODO_LOG_SECRET');
  });

  test('a command that has nothing to do with the Log API does not', () => {
    const help = listed('frodo frodo journey list');
    expect(help).not.toContain('FRODO_LOG_KEY');
    expect(help).not.toContain('FRODO_LOG_SECRET');
  });

  test('on `conn save` they are overridden by the options, on `log` commands by the arguments', () => {
    expect(listed('frodo frodo conn save')).toMatch(
      /FRODO_LOG_KEY[\s\S]*?Overridden by '--log-api-key'\s+option/
    );
    expect(listed('frodo frodo log list')).toMatch(
      /FRODO_LOG_KEY[\s\S]*?Overridden by 'username'\s+argument/
    );
  });
});
