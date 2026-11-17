import { createRequire } from 'node:module';

/**
 * Where the e2e tests write their export files, read from the sources of the
 * tests without running them. Jest runs test files in parallel workers in ONE
 * working directory, and testExport (test/e2e/utils/TestUtils.js) deletes the
 * files it read: its directory when it was given one, and in the working
 * directory every file that matches its pattern. Two test files that export
 * into the same directory name, or whose patterns match the same file in the
 * working directory, can therefore delete each other's files while the other
 * one is still reading them. test/unit/E2eOutputNames.test.js runs
 * `collectExportCalls` over every test/e2e/*.test.js and `findCollisions` over
 * the result.
 *
 * No file system, no state, no output: both functions are pure.
 */

const ts = createRequire(import.meta.url)('typescript');

/** The extensions testExport looks for when it has neither a type nor a file name. */
const EXTENSIONS = 'json|js|groovy|xml|html';

/** The positions of the arguments of testExport that decide what it reads. */
const TYPE = 2;
const FILE_NAME = 3;
const DIRECTORY = 4;

const RENAME =
  'Rename the directory in one of them (the name of a directory is not part of the recording id).';
const MOVE =
  'Export one of them into a directory of its own with -D and pin FRODO_TEST_NAME to the id the command was recorded under, because -D adds a flag name to the id; or, when only a pattern is too wide, give testExport the file name. See test/e2e/README.md, "Writing a test".';

/**
 * @param {import('typescript').Node} node
 * @returns {string | undefined} the text of a string literal, else undefined
 */
function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

/**
 * The value of the nearest enclosing `const name = '...'`: the scope of the use
 * first, then the scopes around it, so two tests of one file may both declare a
 * `const dirName` with different values.
 * @param {import('typescript').Identifier} identifier
 * @returns {string | undefined}
 */
function nearestConstString(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (!scope.statements) continue;
    for (const statement of scope.statements) {
      if (
        !ts.isVariableStatement(statement) ||
        !(statement.declarationList.flags & ts.NodeFlags.Const)
      ) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === identifier.text &&
          declaration.initializer
        ) {
          return literalText(declaration.initializer);
        }
      }
    }
  }
  return undefined;
}

/**
 * @param {import('typescript').Expression | undefined} node an argument of testExport
 * @param {() => string} where file:line of the call, for the error
 * @param {string} role what the argument is, for the error
 * @returns {string | null} the string it holds, or null when it is absent, undefined or null
 */
function resolveArgument(node, where, role) {
  if (!node || node.kind === ts.SyntaxKind.NullKeyword) return null;
  const literal = literalText(node);
  if (literal !== undefined) return literal;
  if (ts.isIdentifier(node)) {
    if (node.text === 'undefined') return null;
    const value = nearestConstString(node);
    if (value !== undefined) return value;
  }
  throw new Error(
    `${where()}: cannot tell what the ${role} argument of testExport is (${node.getText()}). Pass a string literal or a name declared with const and a string literal in the same function or file, so that the scan can see where the test writes.`
  );
}

/**
 * Every call of testExport in the source of one test file, with what the call
 * reads: its type, its file name and its directory. A skipped test counts: it
 * writes nothing today and everything the day it is enabled.
 * @param {string} source the source text of the test file
 * @param {string} file the name of the test file, for messages
 * @returns {{file: string, line: number, type: string | null, fileName: string | null, directory: string | null}[]}
 *   null means that the argument is absent or undefined; a null directory is the working directory
 * @throws when an argument is neither a string literal nor a const string
 */
export function collectExportCalls(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'testExport'
    ) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const where = () => `${file}:${line}`;
      calls.push({
        file,
        line,
        type: resolveArgument(node.arguments[TYPE], where, 'type'),
        fileName: resolveArgument(
          node.arguments[FILE_NAME],
          where,
          'file name'
        ),
        directory: resolveArgument(
          node.arguments[DIRECTORY],
          where,
          'directory'
        ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

/** @returns {boolean} true when the call exports into the working directory */
function isWorkingDirectory(call) {
  return (
    call.directory === null || call.directory === '.' || call.directory === './'
  );
}

/**
 * The pattern testExport applies to the paths it finds, built as testExport
 * builds it.
 * @returns {RegExp}
 */
function readPattern(call) {
  return new RegExp(
    call.fileName
      ? call.fileName
      : call.type
        ? `.*\\.${call.type}\\.(${EXTENSIONS})`
        : `.*\\.(${EXTENSIONS})`
  );
}

/**
 * A name the call certainly writes: its file name, or for a type-wide export a
 * made-up file of its type.
 * @returns {string}
 */
function writtenName(call) {
  return call.fileName ? call.fileName : `x.${call.type ?? 'x'}.json`;
}

/** @returns {string} the key of an unordered pair of files */
function pairKey(a, b) {
  return [a, b].sort().join(' | ');
}

/**
 * The places where two test files can delete each other's exports.
 * 1. The same directory name in two files (a directory is shared only by name:
 *    a path with a slash is not a claim, and one file may use a name twice).
 * 2. The same file name exported into the working directory by two files.
 * 3. A pattern of an export into the working directory that matches a file the
 *    other file exports there (both directions): a type-wide export of
 *    "saml" reads every "*.saml.json", the files of another test included.
 * A pair of files named in `allowed` is left out; an entry of `allowed` that
 * names a pair that no longer collides is a problem too, so that the list
 * cannot go stale.
 * @param {ReturnType<typeof collectExportCalls>} calls the calls of all files
 * @param {{files: [string, string], reason: string}[]} [allowed] pairs of test files that are known to collide, each with the reason
 * @returns {{kind: 'directory' | 'file' | 'overlap' | 'stale' | 'allowlist', files: string[], name: string | undefined, message: string}[]}
 *   empty when nothing collides
 */
export function findCollisions(calls, allowed = []) {
  const problems = [];
  const seen = new Set();
  const add = (kind, a, b, name, message) => {
    const key = `${kind} ${pairKey(a.file, b.file)}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ kind, files: [a.file, b.file].sort(), name, message });
  };
  const at = (call) => `${call.file}:${call.line}`;

  // 1. directory names
  const claims = new Map();
  for (const call of calls) {
    if (
      call.directory &&
      !isWorkingDirectory(call) &&
      !call.directory.includes('/')
    ) {
      if (!claims.has(call.directory)) claims.set(call.directory, []);
      claims.get(call.directory).push(call);
    }
  }
  for (const [name, users] of claims) {
    for (const a of users) {
      for (const b of users) {
        if (a.file < b.file) {
          add(
            'directory',
            a,
            b,
            name,
            `${at(a)} and ${at(b)} export into the same directory "${name}". ${RENAME}`
          );
        }
      }
    }
  }

  // 2 and 3. the working directory
  const here = calls.filter(isWorkingDirectory);
  for (const a of here) {
    for (const b of here) {
      if (a.file >= b.file) continue;
      if (a.fileName && a.fileName === b.fileName) {
        add(
          'file',
          a,
          b,
          a.fileName,
          `${at(a)} and ${at(b)} export the file "${a.fileName}" into the working directory. ${MOVE}`
        );
        continue;
      }
      for (const [reader, other] of [
        [a, b],
        [b, a],
      ]) {
        if (readPattern(reader).test(writtenName(other))) {
          add(
            'overlap',
            a,
            b,
            writtenName(other),
            `${at(reader)} reads and deletes every file that matches ${readPattern(reader)} in the working directory, which includes "${writtenName(other)}" of ${at(other)}. ${MOVE}`
          );
        }
      }
    }
  }

  // the allowed pairs
  const used = new Set();
  const known = new Set();
  const listed = [];
  for (const entry of allowed) {
    const files = entry?.files;
    if (
      !Array.isArray(files) ||
      files.length !== 2 ||
      files[0] === files[1] ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim() === ''
    ) {
      problems.push({
        kind: 'allowlist',
        files: Array.isArray(files) ? files : [],
        name: undefined,
        message: `an allowed pair needs two different test files and a reason: ${JSON.stringify(entry)}`,
      });
      continue;
    }
    known.add(pairKey(files[0], files[1]));
    listed.push(entry);
  }
  const remaining = problems.filter((problem) => {
    if (problem.kind === 'allowlist') return true;
    const key = pairKey(problem.files[0], problem.files[1]);
    if (!known.has(key)) return true;
    used.add(key);
    return false;
  });
  for (const entry of listed) {
    if (!used.has(pairKey(entry.files[0], entry.files[1]))) {
      remaining.push({
        kind: 'stale',
        files: [...entry.files].sort(),
        name: undefined,
        message: `${entry.files[0]} and ${entry.files[1]} are allowed to collide but no longer do: remove the entry from the allowed pairs.`,
      });
    }
  }
  return remaining;
}
