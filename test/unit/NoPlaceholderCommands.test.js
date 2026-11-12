import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command } from 'commander';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';

/**
 * No command of the real tree does nothing (cli#1287). The template of a new
 * command (src/cli/_template) marks where the logic goes with the comment
 * `// code goes here`. `log key describe` was registered with only that comment
 * after its login, so it printed nothing and ended with exit code 0 for any key.
 * A command whose action still holds the placeholder fails here.
 *
 * Registered commands are told from unregistered ones by the real tree: the
 * tree is built the way src/app.ts builds it (test/utils/CommandExamples.js),
 * and every function that is passed to `.action()` while it is built belongs to
 * a command that is registered. The files that nothing registers (the template
 * and a few unfinished stubs) are never built, so they are not looked at. The
 * source of the function is what the placeholder is searched in: the
 * transformer keeps the comments inside a function body.
 */

const PLACEHOLDER = /\/\/\s*code goes here/;

let actions;

beforeAll(async () => {
  actions = [];
  const original = Command.prototype.action;
  const spy = jest
    .spyOn(Command.prototype, 'action')
    .mockImplementation(function (fn) {
      actions.push({ command: this, source: String(fn) });
      return original.call(this, fn);
    });
  try {
    await loadCommandTree();
  } finally {
    spy.mockRestore();
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('the actions of the registered commands', () => {
  test('the real tree was built, so the check below has something to check', () => {
    expect(actions.length).toBeGreaterThan(300);
    const names = actions.map(({ command }) => fullName(command));
    expect(names).toEqual(
      expect.arrayContaining([
        'frodo log key describe',
        'frodo realm describe',
        'frodo conn describe',
      ])
    );
  });

  test('none holds the placeholder comment of the command template', () => {
    const placeholders = actions
      .filter(({ source }) => PLACEHOLDER.test(source))
      .map(({ command }) => fullName(command));
    expect(placeholders).toEqual([]);
  });
});

describe('the check itself', () => {
  test('finds the placeholder in an action that has it, and not in one that has not', () => {
    const empty = async (options) => {
      if (options) {
        // code goes here
      }
    };
    const done = async (options) => {
      if (options) {
        return true;
      }
    };
    expect(PLACEHOLDER.test(String(empty))).toBe(true);
    expect(PLACEHOLDER.test(String(done))).toBe(false);
  });
});
