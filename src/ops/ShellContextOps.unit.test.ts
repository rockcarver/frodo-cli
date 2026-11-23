import { describe, expect, it } from '@jest/globals';
import {
  createConsoleBindings,
  installConsoleContext,
} from './ShellContextOps';

/**
 * The names both consoles put into a REPL context. `_` is not one of them:
 * the Node REPL owns it (the last result), so the console must not bind it.
 */

describe('ShellContextOps', () => {
  it('installs the console names and does not bind _', () => {
    const bindings = createConsoleBindings();
    const context: Record<string, unknown> = {};
    installConsoleContext(context, bindings, {
      write: () => undefined,
      colors: false,
    });
    expect(Object.keys(context).sort()).toEqual(
      ['$', 'am', 'frodo', 'frodoLib', 'help', 'openidm', 'state'].sort()
    );
    expect('_' in context).toBe(false);
  });

  it('does not offer _ to completion as a root name', () => {
    const { rootBindings } = createConsoleBindings();
    expect(Object.keys(rootBindings)).not.toContain('_');
  });
});
