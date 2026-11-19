/**
 * Unit tests for `config-manager delete custom-nodes`
 * (configManagerDeleteCustomNodes in src/configManagerOps/FrConfigCustomNodesOps.ts)
 * with a selector: a custom node is deleted by its display name or, new, by its
 * id (`_id`). The facade and the console are mocked before the module is
 * imported (the bundled ESM of frodo-lib cannot load under jest's ESM runtime).
 * What these tests guard: an id deletes the one node that has exactly that id
 * and nothing else (never all custom nodes), the list that a delete of all reads
 * is the one the id is looked for in, a missing id fails the command whatever
 * --allow-failures says, and the name still works as it did.
 */
import { jest } from '@jest/globals';

const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everything = () => printed.map((entry) => entry.msg).join('\n');

const calls = [];
let nodes = [];
let failingIds = new Set();

const node = (id, displayName) => ({ _id: id, displayName });

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      saveJsonToFile: () => {},
      getFilePath: (file) => file,
      saveTextToFile: () => {},
      readJsonFile: () => ({}),
      getWorkingDirectory: () => '.',
    },
    authn: {
      node: {
        readCustomNodes: async () => {
          calls.push('readCustomNodes');
          return nodes;
        },
        readCustomNode: async (id, name) => {
          calls.push(`readCustomNode ${id} ${name}`);
          const found = nodes.find((n) =>
            id ? n._id === id : n.displayName === name
          );
          if (!found) throw new Error(`Custom node '${name ?? id}' not found`);
          return found;
        },
        importCustomNodes: async () => {},
        deleteCustomNode: async (id, name) => {
          calls.push(`deleteCustomNode ${id} ${name}`);
          const found = nodes.find((n) =>
            id ? n._id === id : n.displayName === name
          );
          if (!found) throw new Error(`Custom node '${name ?? id}' not found`);
          if (failingIds.has(found._id))
            throw new Error(`refused ${found._id}`);
          return found;
        },
        deleteCustomNodes: async (resultCallback) => {
          calls.push('deleteCustomNodes');
          for (const n of nodes) resultCallback?.(undefined, n);
          return nodes;
        },
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error, message) =>
    printed.push({
      msg: `${message ?? ''} ${error?.message ?? error}`.trim(),
      type: 'error',
    }),
  createProgressIndicator: () => 'indicator',
  stopProgressIndicator: () => {},
}));

jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  fileFilter: () => true,
}));

const { configManagerDeleteCustomNodes } =
  await import('../../src/configManagerOps/FrConfigCustomNodesOps.ts');

beforeEach(() => {
  printed.length = 0;
  calls.length = 0;
  failingIds = new Set();
  nodes = [
    node('alu-1', 'ALU'),
    node('alu-extra-1', 'ALU Extra'),
    node('other-1', 'Other'),
  ];
  process.exitCode = undefined;
});

describe('one custom node by id', () => {
  test('is deleted, and only that one, by the id that the list gives it', async () => {
    expect(
      await configManagerDeleteCustomNodes(undefined, false, false, 'alu-1')
    ).toBe(true);

    // the id is looked for in the list that a delete of all reads, then that node is deleted by its id
    expect(calls).toEqual([
      'readCustomNodes',
      'deleteCustomNode alu-1 undefined',
    ]);
    expect(messages('error')).toEqual([]);
    expect(everything()).toContain('Deleting node with id: alu-1');
  });

  test('an id never deletes all custom nodes', async () => {
    await configManagerDeleteCustomNodes(undefined, false, false, 'other-1');

    expect(calls).not.toContain('deleteCustomNodes');
    expect(calls.filter((c) => c.startsWith('deleteCustomNode '))).toEqual([
      'deleteCustomNode other-1 undefined',
    ]);
  });

  test('the id is matched exactly: the id without its -1, the display name, a prefix and the id in other letters select nothing', async () => {
    for (const id of ['alu', 'ALU', 'alu-', 'ALU-1']) {
      printed.length = 0;
      expect(
        await configManagerDeleteCustomNodes(undefined, false, false, id)
      ).toBe(false);

      expect(messages('error')).toEqual([
        `Custom node with id '${id}' not found.`,
      ]);
    }
    expect(calls.filter((c) => c.startsWith('deleteCustomNode'))).toEqual([]);
  });

  test('an id that no custom node has fails the command whatever --allow-failures says, and deletes nothing', async () => {
    for (const allowFailures of [false, true]) {
      printed.length = 0;
      expect(
        await configManagerDeleteCustomNodes(
          undefined,
          false,
          allowFailures,
          'nope-1'
        )
      ).toBe(false);
      expect(messages('error')).toEqual([
        "Custom node with id 'nope-1' not found.",
      ]);
    }
    expect(calls.filter((c) => c.startsWith('deleteCustomNode'))).toEqual([]);
  });

  test('the dry run reads the list, deletes nothing and names the node', async () => {
    expect(
      await configManagerDeleteCustomNodes(
        undefined,
        true,
        false,
        'alu-extra-1'
      )
    ).toBe(true);

    expect(calls).toEqual(['readCustomNodes']);
    expect(messages(undefined)).toEqual([
      'Dry run: Deleting node with displayName ALU Extra',
    ]);
  });

  test('a node that cannot be deleted fails the command, and --allow-failures lets it pass', async () => {
    failingIds = new Set(['alu-1']);

    expect(
      await configManagerDeleteCustomNodes(undefined, false, false, 'alu-1')
    ).toBe(false);
    expect(messages('error').join('\n')).toContain('alu-1');

    printed.length = 0;
    expect(
      await configManagerDeleteCustomNodes(undefined, false, true, 'alu-1')
    ).toBe(true);
  });
});

describe('a custom node by display name, and all of them', () => {
  test('a display name is deleted by that name, as it was', async () => {
    expect(await configManagerDeleteCustomNodes('ALU', false, false)).toBe(
      true
    );

    expect(calls).toEqual(['deleteCustomNode undefined ALU']);
    expect(everything()).toContain('Deleting node with displayName: ALU');
  });

  test('without a selector all custom nodes are deleted', async () => {
    expect(await configManagerDeleteCustomNodes(undefined, false, false)).toBe(
      true
    );

    expect(calls).toEqual(['deleteCustomNodes']);
  });

  test('the dry run of a display name reads that node', async () => {
    expect(await configManagerDeleteCustomNodes('ALU', true, false)).toBe(true);

    expect(calls).toEqual(['readCustomNode undefined ALU']);
  });
});
