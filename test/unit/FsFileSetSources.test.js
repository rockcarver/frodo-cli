import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import ts from 'typescript';

/**
 * What the sources of the file-system adapters of a file set may import and call, read with the
 * TypeScript parser (not by text, so a word in a comment or a string is not mistaken for code):
 *
 * - the adapters never rely on the name of a file when they push: they take no name apart. No
 *   `decodeURIComponent`, no `encodeURIComponent`, no name function of `ConfigTreePath.ts` (only
 *   `assertInside` and `sameOnAnyFileSystem` are imported from it);
 * - they take from the library the values `frodo` and `FrodoError`, and types, from the package root;
 * - they import nothing from the commands or the operations, read no `state`, print nothing and set
 *   no exit code;
 * - both adapters call `frodo.utils.assertFileSetPath`, the gate of the library.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const MODULES = [
  'src/utils/FsFileSetWriter.ts',
  'src/utils/FsFileSetReader.ts',
  'src/utils/FsFileSetRoot.ts',
];

/**
 * What a module imports: the specifier, the names it takes, and whether the import is of types only.
 * @param {string} source the text of the module
 * @returns {{ from: string, names: string[], typeOnly: boolean }[]} the imports
 */
function importsOf(source) {
  const file = ts.createSourceFile('m.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  file.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    const clause = node.importClause;
    const names = [];
    let typeOnly = clause?.isTypeOnly ?? false;
    if (clause?.name) names.push(`default:${clause.name.text}`);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) names.push(`*:${bindings.name.text}`);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        names.push(
          element.isTypeOnly || typeOnly ? `type:${element.name.text}` : (element.propertyName ?? element.name).text
        );
      }
    }
    found.push({ from: node.moduleSpecifier.text, names, typeOnly });
  });
  return found;
}

/**
 * The names of the functions and objects that a module calls or reads, as written (`frodo.utils.assertFileSetPath`, `decodeURIComponent`).
 * @param {string} source the text of the module
 * @returns {string[]} the dotted names of every call and every property access
 */
function usesOf(source) {
  const file = ts.createSourceFile('m.ts', source, ts.ScriptTarget.Latest, true);
  const found = [];
  const dotted = (node) => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) {
      const left = dotted(node.expression);
      return left === undefined ? undefined : `${left}.${node.name.text}`;
    }
    return undefined;
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) {
      const name = ts.isCallExpression(node) ? dotted(node.expression) : dotted(node);
      if (name !== undefined) found.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * What is wrong with a module, by the rules above.
 * @param {string} source the text of the module
 * @param {{ needsGate: boolean }} what whether the module has to call the gate of the library
 * @returns {string[]} the problems, none when all is well
 */
function problemsOf(source, { needsGate }) {
  const problems = [];
  const imports = importsOf(source);
  const uses = usesOf(source);
  for (const { from, names } of imports) {
    if (/(^|\/)(ops|cli|configManagerOps)(\/|$)/.test(from)) {
      problems.push(`imports ${from}`);
    } else if (from === './ConfigTreePath') {
      for (const name of names) {
        if (!['assertInside', 'sameOnAnyFileSystem'].includes(name)) {
          problems.push(`takes ${name} from ConfigTreePath`);
        }
      }
    } else if (from === '@rockcarver/frodo-lib') {
      const allowed = ['frodo', 'FrodoError'];
      for (const name of names) {
        if (!name.startsWith('type:') && !allowed.includes(name)) {
          problems.push(`takes the value ${name} from the library`);
        }
      }
    } else if (from.startsWith('@rockcarver/frodo-lib/')) {
      problems.push(`imports the subpath ${from}`);
    } else if (!from.startsWith('node:') && !from.startsWith('./')) {
      problems.push(`imports the package ${from}`);
    } else if (from.startsWith('./') && !['./FsFileSetRoot'].includes(from)) {
      problems.push(`imports ${from}`);
    }
  }
  for (const banned of [
    'decodeURIComponent',
    'encodeURIComponent',
    'decodeURI',
    'encodeURI',
    'unescape',
    'escape',
  ]) {
    if (uses.includes(banned)) problems.push(`calls ${banned}`);
  }
  if (uses.some((use) => use.startsWith('state.'))) {
    problems.push('reads state');
  }
  for (const use of uses) {
    if (
      use === 'console' ||
      use.startsWith('console.') ||
      use.startsWith('process.stdout') ||
      use.startsWith('process.stderr') ||
      use === 'process.exit' ||
      use === 'process.exitCode'
    ) {
      problems.push(`prints or exits with ${use}`);
    }
  }
  if (needsGate && !uses.includes('frodo.utils.assertFileSetPath')) {
    problems.push('does not call frodo.utils.assertFileSetPath');
  }
  return problems;
}

const sources = Object.fromEntries(
  MODULES.map((module) => [module, fs.readFileSync(path.join(root, module), 'utf8')])
);

describe('the adapters of a file set stay what they are', () => {
  test.each(MODULES)('%s imports nothing from the commands or the operations, and takes nothing from the library but `frodo`, `FrodoError` and types', (module) => {
    const problems = problemsOf(sources[module], { needsGate: false }).filter(
      (problem) => /imports|takes|subpath|package/.test(problem)
    );

    expect(problems).toEqual([]);
  });

  test.each(MODULES)('%s takes no name function of ConfigTreePath, and calls neither decodeURIComponent nor encodeURIComponent: a name is never taken apart', (module) => {
    const problems = problemsOf(sources[module], { needsGate: false }).filter(
      (problem) => /ConfigTreePath|calls/.test(problem)
    );
    const imports = importsOf(sources[module]).filter((one) => one.from === './ConfigTreePath');

    expect(problems).toEqual([]);
    for (const { names } of imports) {
      expect(names.every((name) => ['assertInside', 'sameOnAnyFileSystem'].includes(name))).toBe(true);
    }
    expect(sources[module]).not.toMatch(/safeFileName|fileNameOf|nameInFolder|encodedName|nameInStem|objectFilePath|objectFolderPath|realmFolderOf|referencedFilePath|isOneSafeSegment/);
  });

  test.each(MODULES)('%s reads no state, prints nothing and sets no exit code', (module) => {
    const problems = problemsOf(sources[module], { needsGate: false }).filter(
      (problem) => /state|prints/.test(problem)
    );

    expect(problems).toEqual([]);
  });

  test('both adapters call the gate of the library, frodo.utils.assertFileSetPath', () => {
    expect(problemsOf(sources['src/utils/FsFileSetWriter.ts'], { needsGate: true })).toEqual([]);
    expect(problemsOf(sources['src/utils/FsFileSetReader.ts'], { needsGate: true })).toEqual([]);
  });

  test('the modules import what the package.json already has: node modules and the library, nothing else', () => {
    for (const module of MODULES) {
      for (const { from } of importsOf(sources[module])) {
        expect(
          from.startsWith('node:') || from.startsWith('./') || from === '@rockcarver/frodo-lib'
        ).toBe(true);
      }
    }
  });

  test('the scan can fail: it finds each of these in a module that has them', () => {
    const bad = `
      import { safeFileName, pulledFilePath, assertInside } from './ConfigTreePath';
      import { frodo, state, FrodoError } from '@rockcarver/frodo-lib';
      import { helper } from '@rockcarver/frodo-lib/types/x';
      import { run } from '../ops/Something';
      import other from 'lodash';
      const id = decodeURIComponent(name);
      const encoded = encodeURIComponent(name);
      const dir = state.getDirectory();
      console.log('x');
      process.stdout.write('x');
      process.exitCode = 1;
    `;

    const problems = problemsOf(bad, { needsGate: true });

    expect(problems).toEqual(
      expect.arrayContaining([
        'imports ../ops/Something',
        'takes safeFileName from ConfigTreePath',
        'takes pulledFilePath from ConfigTreePath',
        'takes the value state from the library',
        'imports the subpath @rockcarver/frodo-lib/types/x',
        'imports the package lodash',
        'calls decodeURIComponent',
        'calls encodeURIComponent',
        'reads state',
        'prints or exits with console.log',
        'prints or exits with process.stdout.write',
        'prints or exits with process.exitCode',
        'does not call frodo.utils.assertFileSetPath',
      ])
    );
    expect(problems).not.toContain('takes assertInside from ConfigTreePath');
  });

  test('the scan does not mistake a word in a comment or a string for code', () => {
    const fine = `
      import { assertInside } from './ConfigTreePath';
      import { frodo, FrodoError, type VirtualFileSet } from '@rockcarver/frodo-lib';
      // decodeURIComponent(name) and console.log and state are only words here
      const text = 'encodeURIComponent state console.log';
      frodo.utils.assertFileSetPath(text);
    `;

    expect(problemsOf(fine, { needsGate: true })).toEqual([]);
  });
});
