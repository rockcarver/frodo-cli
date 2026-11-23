import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import ts from 'typescript';

/**
 * Every file that a pull writes, and every file that it removes, passes the gate `pulledFilePath`
 * (src/utils/ConfigTreePath.ts) before the library creates the folders of its path. The behaviour of
 * each family is in ConfigManagerPullHostileNames.test.js. This file is a tripwire for the common forms
 * of a write, not a proof that no write escapes the gate: it keeps a write from being forgotten, it
 * cannot see one that is built at run time.
 *
 * What it reads: every module of src/configManagerOps, the application, remote proxy and agent kind
 * modules of src/ops, and the shared writer of src/utils/Config.ts (a new module is scanned without
 * being listed here), by the syntax of the source, so a reformatted call is still found.
 *
 * What it catches (each form has a test below that fails when it is not caught):
 * - a call of a function that writes, creates, copies, links, opens or removes (`saveJsonToFile`,
 *   `saveTextToFile`, `writeFileSync`, `appendFile`, `mkdir`, `rm`, `cpSync`, `copyFile`, `linkSync`,
 *   `symlink`, `openSync`, `truncate`, `rename`, `createWriteStream`, also through `fs.promises`), and
 *   every `getFilePath(..., true)` (which creates the folders), whose path is not a call of the gate,
 *   or of `getFilePath` with one in it, or of `path.join` or `path.resolve` whose every argument is
 *   such a call, a string, or a base that the table below allows, or a variable of the same function
 *   that is declared once, never assigned again, and holds one of those;
 * - any call of `extractDataToFile`, the writer of the commands of the first generation, which does
 *   not pass the gate;
 * - such a function that is used as a value (`const save = utils.saveJsonToFile`, `{ writeFileSync: w }`
 *   of a destructuring, an argument), and a member of `fs` or of the library utilities that is chosen
 *   by a computed key (`fs['write' + 'FileSync']`);
 * - a template that goes to the gate with a bare property of an object that the tenant sent (`x.name`,
 *   `y._id`) in it: such a value goes through `nameInFolder`, `nameInStem`, `encodedName` or
 *   `realmFolderOf` first, or a table says why not;
 * - the number of gate calls of each module is the number in a table, so a call that is removed fails
 *   here, and so does a write that is added without a row.
 *
 * What it does not catch: a write through a function of another module that the scanned module calls
 * (the function is scanned in its own module), a path built by a call that is not listed (a helper
 * that returns a gated path), a value that is changed through a property or a closure, `eval`, a
 * dynamic `import`, and a write by a child process (the guard of the removals, DestructiveSitesGuard.test.js,
 * looks for those).
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const SHARED_WRITER = 'src/utils/Config.ts';

/** The modules that a pull writes with: every module of the folder, and the ones of src/ops named here. */
function modulesOfPull() {
  const ops = fs
    .readdirSync(path.join(root, 'src/ops'))
    .filter(
      (name) =>
        /^Application(Config|Migrate)Ops\.ts$/.test(name) ||
        name === 'ConfigManagerAgentKind.ts' ||
        name === 'RemoteProxyOps.ts'
    )
    .map((name) => `src/ops/${name}`);
  const all = fs
    .readdirSync(path.join(root, 'src/configManagerOps'))
    .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
    .map((name) => `src/configManagerOps/${name}`);
  return [...all, ...ops, SHARED_WRITER].sort();
}

/**
 * The calls that write, create, copy, link, open or remove something, and the position of their path:
 * -1 is each of the first two arguments (a source and a target), -3 is a writer that has no gate at all
 * (so every call of it is a finding).
 */
const WRITES = {
  saveJsonToFile: 1,
  saveTextToFile: 1,
  saveToFile: 1,
  extractDataToFile: -3,
  writeFileSync: 0,
  writeFile: 0,
  appendFileSync: 0,
  appendFile: 0,
  mkdirSync: 0,
  mkdir: 0,
  mkdtempSync: 0,
  mkdtemp: 0,
  rmSync: 0,
  rm: 0,
  rmdirSync: 0,
  rmdir: 0,
  unlinkSync: 0,
  unlink: 0,
  truncateSync: 0,
  truncate: 0,
  renameSync: -1,
  rename: -1,
  copyFileSync: -1,
  copyFile: -1,
  cpSync: -1,
  cp: -1,
  linkSync: -1,
  link: -1,
  symlinkSync: -1,
  symlink: -1,
  openSync: 0,
  open: 0,
  createWriteStream: 0,
};

/** The bases that a `path.join` or `path.resolve` may start from without the gate, by module. */
const ALLOWED_BASES = [
  {
    module: 'src/ops/ApplicationMigrateOps.ts',
    text: 'treeDir',
    reason:
      'the root of the tree that the person named, a parameter of the command; what is joined to it passes the gate',
  },
];

/** The objects whose members are written through (a computed key on them is a finding). */
const WRITER_OBJECTS = new Set([
  'fs',
  'fsp',
  'promises',
  'fs.promises',
  'utils',
  'frodo.utils',
]);

/**
 * The writes that are not a pull of what a tenant names, and the reason. `inFunction` is the function
 * that holds the call.
 */
const EXEMPT = [
  {
    module: 'src/configManagerOps/FrConfigRawOps.ts',
    inFunction: 'readRawConfigFromStdin',
    reason:
      'a private file in a new folder of the OS temporary folder, for a push from standard input; no tenant value is in its path',
  },
  {
    module: 'src/ops/RemoteProxyOps.ts',
    inFunction: 'exportRemoteProxyToFile',
    reason:
      '`remote-proxy export`, a command of its own: the file name is the typed file name of the library or the one the user gave',
  },
  {
    module: 'src/ops/RemoteProxyOps.ts',
    inFunction: 'exportRemoteProxiesToFile',
    reason: '`remote-proxy export`: as exportRemoteProxyToFile',
  },
  {
    module: 'src/ops/RemoteProxyOps.ts',
    inFunction: 'exportRemoteProxiesToFiles',
    reason: '`remote-proxy export`: as exportRemoteProxyToFile',
  },
  {
    module: 'src/ops/ApplicationMigrateOps.ts',
    inFunction: 'pruneEmptyDirectories',
    reason:
      'removes only the empty folders above a file that was removed through the gate, never the root of the tree; a folder that holds anything stays',
  },
  {
    module: 'src/utils/Config.ts',
    inFunction: 'extractDataToFile',
    reason:
      'the extraction of the commands of the first generation (`config export`, `script export`), which name their files with the typed file name of the library',
  },
  {
    module: 'src/utils/Config.ts',
    inFunction: 'getNoiseFilters',
    reason:
      'the log noise filter file in the frodo folder of the user, a fixed file name; it is not a pull of a config folder',
  },
];

const calleeName = (call) =>
  ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : ts.isElementAccessExpression(call.expression) &&
          ts.isStringLiteralLike(call.expression.argumentExpression)
        ? call.expression.argumentExpression.text
        : undefined;

const unwrap = (node) => {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
};

/** The function (declaration, expression or arrow) that holds the node. */
function functionOf(node) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current)) current = current.parent;
  return current;
}

/** The name of the function that holds the node, as a person says it (an arrow that is a constant has the constant's name). */
function functionNameOf(node) {
  let current = functionOf(node);
  while (current) {
    if (current.name && ts.isIdentifier(current.name)) return current.name.text;
    const holder = current.parent;
    if (
      holder &&
      ts.isVariableDeclaration(holder) &&
      ts.isIdentifier(holder.name)
    ) {
      return holder.name.text;
    }
    current = functionOf(current);
  }
  return '(module)';
}

/**
 * The value that a variable of the function holds, by its name: the initializer of its only
 * declaration, or undefined when the name is declared more than once, is assigned again, or has no
 * initializer (a parameter, a destructuring): such a variable is not known to hold a gated path.
 */
function initializerOf(name, scope) {
  const declarations = [];
  let assigned = false;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      declarations.push(node.initializer);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(unwrap(node.left)) &&
      unwrap(node.left).text === name
    ) {
      assigned = true;
    } else if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      declarations.push(undefined);
    } else if (
      ts.isParameter(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      declarations.push(undefined);
    }
    ts.forEachChild(node, visit);
  };
  if (scope) visit(scope);
  return declarations.length === 1 && !assigned ? declarations[0] : undefined;
}

/**
 * Whether the expression is the path of a file that has passed the gate: a call of it, a call of
 * `getFilePath` with such a path as its first argument, a call of `path.join` or `path.resolve` whose
 * every argument is a string, such a path or an allowed base, or a variable of the function that holds
 * one and is never assigned again.
 */
function isGated(expression, scope, module = '', seen = new Set()) {
  const node = unwrap(expression);
  if (!node) return false;
  if (ts.isCallExpression(node)) {
    const name = calleeName(node);
    if (name === 'pulledFilePath') return true;
    if (name === 'getFilePath') {
      return isGated(node.arguments[0], scope, module, seen);
    }
    if (name === 'join' || name === 'resolve') {
      return (
        node.arguments.length > 0 &&
        node.arguments.every(
          (argument) =>
            ts.isStringLiteralLike(unwrap(argument)) ||
            ALLOWED_BASES.some(
              (base) =>
                base.module === module &&
                base.text === unwrap(argument).getText()
            ) ||
            isGated(argument, scope, module, seen)
        ) &&
        node.arguments.some((argument) =>
          isGated(argument, scope, module, seen)
        )
      );
    }
    return false;
  }
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return false;
    seen.add(node.text);
    const initializer = initializerOf(node.text, scope);
    return initializer ? isGated(initializer, scope, module, seen) : false;
  }
  return false;
}

/** The writes of a module: [{ call, name, line, path (the node), function }] */
function writesOf(source) {
  const writes = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name && Object.hasOwn(WRITES, name)) {
        const position = WRITES[name];
        writes.push({
          node,
          name,
          paths:
            position === -1
              ? node.arguments.slice(0, 2)
              : [node.arguments[position]],
        });
      } else if (
        name === 'getFilePath' &&
        node.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword
      ) {
        // it creates the folders of the path at once
        writes.push({ node, name, paths: [node.arguments[0]] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return writes.map((write) => ({
    ...write,
    line: source.getLineAndCharacterOfPosition(write.node.getStart()).line + 1,
    function: functionNameOf(write.node),
    scope: functionOf(write.node) ?? source,
  }));
}

/**
 * The places where a function that writes is used as a value, not called (an alias, an argument, a
 * renamed member of a destructuring), and where a member of the file system or of the library utilities
 * is chosen by a computed key: [{ line, text }].
 */
function aliasesOf(source) {
  const found = [];
  const note = (node, what) =>
    found.push({
      line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      text: `${what}: ${node.getText().slice(0, 60)}`,
      function: functionNameOf(node),
    });
  const visit = (node) => {
    if (ts.isIdentifier(node) && Object.hasOwn(WRITES, node.text)) {
      const parent = node.parent;
      const isCallee = (access) =>
        ts.isCallExpression(access.parent) &&
        access.parent.expression === access;
      if (ts.isCallExpression(parent) && parent.expression === node) {
        // a call: judged by writesOf
      } else if (ts.isBindingElement(parent) || ts.isImportSpecifier(parent)) {
        // `{ writeFileSync }` names the function; `{ writeFileSync: w }` renames it
        if (parent.propertyName === node) note(parent, 'renamed');
      } else if (
        ts.isPropertyAccessExpression(parent) &&
        parent.name === node
      ) {
        if (!isCallee(parent)) note(parent, 'used as a value');
      } else if (
        ts.isFunctionDeclaration(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isVariableDeclaration(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertySignature(parent)
      ) {
        // a name that is declared, or a key
        if (ts.isVariableDeclaration(parent) && parent.initializer) {
          // `const writeFileSync = ...` declares a function of the same name that is not the one of `fs`
        }
      } else {
        note(parent, 'used as a value');
      }
    }
    if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      WRITER_OBJECTS.has(node.expression.getText())
    ) {
      note(node, 'computed member');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** What the scan finds in a source: the writes whose path is not gated and the aliases, each as a line of text. */
function findingsOf(source, module) {
  const lines = [];
  for (const write of writesOf(source)) {
    if (exemptionOf(module, write)) continue;
    for (const pathNode of write.paths) {
      if (!pathNode || !isGated(pathNode, write.scope, module)) {
        lines.push(
          `${module}:${write.line} ${write.name}(...) in ${write.function}`
        );
      }
    }
  }
  for (const alias of aliasesOf(source)) {
    if (
      EXEMPT.some(
        (row) => row.module === module && row.inFunction === alias.function
      )
    ) {
      continue;
    }
    lines.push(`${module}:${alias.line} ${alias.text} in ${alias.function}`);
  }
  return lines;
}

/** The syntax tree of a text. */
const sourceOfText = (text) =>
  ts.createSourceFile('snippet.ts', text, ts.ScriptTarget.Latest, true);

/** The number of calls of the gate in a module. */
function gateCallsOf(source) {
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && calleeName(node) === 'pulledFilePath') {
      count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

const sources = new Map();
function sourceOf(module) {
  if (!sources.has(module)) {
    const file = path.join(root, module);
    sources.set(
      module,
      ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      )
    );
  }
  return sources.get(module);
}

const MODULES = modulesOfPull();
const exemptionOf = (module, write) =>
  EXEMPT.find(
    (row) => row.module === module && row.inFunction === write.function
  );

describe('every write of a pull passes the gate', () => {
  test('the scan reads the modules that write', () => {
    expect(MODULES.length).toBeGreaterThan(35);
    expect(MODULES).toContain('src/configManagerOps/FrConfigJourneysOps.ts');
    expect(MODULES).toContain('src/ops/ApplicationConfigOps.ts');
    expect(MODULES).toContain(SHARED_WRITER);
    let writes = 0;
    for (const module of MODULES) writes += writesOf(sourceOf(module)).length;
    expect(writes).toBeGreaterThan(100);
  });

  test.each(MODULES)(
    '%s: the path of every write is a call of the gate or comes from one',
    (module) => {
      expect(findingsOf(sourceOf(module), module)).toEqual([]);
    }
  );

  test('every row of the exemption table is a write that exists, so that a row cannot outlive its write', () => {
    for (const row of EXEMPT) {
      const found = writesOf(sourceOf(row.module)).filter(
        (write) => write.function === row.inFunction
      );
      expect(`${row.module} ${row.inFunction} ${found.length > 0}`).toBe(
        `${row.module} ${row.inFunction} true`
      );
      expect(row.reason.length).toBeGreaterThan(20);
    }
  });

  test('the shared writer of the extracted files passes the gate itself', () => {
    const source = sourceOf(SHARED_WRITER);
    const writer = [];
    const visit = (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'extractFrConfigDataToFile'
      ) {
        writer.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(writer).toHaveLength(1);
    const gated = writesOf(source).filter(
      (write) => write.function === 'extractFrConfigDataToFile'
    );
    expect(gated.length).toBeGreaterThanOrEqual(3);
    for (const write of gated) {
      expect(isGated(write.paths[0], write.scope, SHARED_WRITER)).toBe(true);
    }
  });
});

/**
 * The values that a template of a path may hold without a function of the tree path in front of them:
 * a variable that was made by one, a constant, or what the table below says is none of the tenant's.
 */
const BARE_PROPERTY_EXEMPT = [
  {
    module: 'src/configManagerOps/FrConfigRawOps.ts',
    text: 'config.path',
    reason:
      'the path of a raw config is a path by design (`/openidm/config/cluster`), taken from the list that the person gave; it passes the gate, which keeps it inside the config folder',
  },
  {
    module: 'src/configManagerOps/FrConfigThemeOps.ts',
    text: 'field.name',
    reason:
      'the name of one of the fixed fields of a theme (`journeyHeader`, `accountFooter`, ...), a constant of the module',
  },
];

/** The templates of the path that goes to the gate: [{ line, text }] for each bare property access in them. */
function bareValuesOf(source) {
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && calleeName(node) === 'pulledFilePath') {
      const argument = unwrap(node.arguments[0]);
      const templates = [];
      if (argument && ts.isTemplateExpression(argument)) {
        templates.push(argument);
      } else if (argument && ts.isIdentifier(argument)) {
        // a variable of the same function that holds a template
        const initializer = unwrap(
          initializerOf(argument.text, functionOf(node) ?? source)
        );
        if (initializer && ts.isTemplateExpression(initializer)) {
          templates.push(initializer);
        }
      }
      for (const template of templates) {
        for (const span of template.templateSpans) {
          const expression = unwrap(span.expression);
          if (
            ts.isPropertyAccessExpression(expression) ||
            ts.isElementAccessExpression(expression)
          ) {
            found.push({
              line:
                source.getLineAndCharacterOfPosition(expression.getStart())
                  .line + 1,
              text: expression.getText(),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no value that a tenant sends is joined to a path as it is', () => {
  test.each(MODULES)(
    '%s: a template that goes to the gate holds no bare property (`x.name`, `y._id`)',
    (module) => {
      const bare = bareValuesOf(sourceOf(module)).filter(
        ({ text }) =>
          !BARE_PROPERTY_EXEMPT.some(
            (row) => row.module === module && row.text === text
          )
      );

      expect(bare.map(({ line, text }) => `${module}:${line} ${text}`)).toEqual(
        []
      );
    }
  );
});

describe('the scan can fail: each form of a write that it knows is found', () => {
  const FORMS = [
    [
      'a write with a path that did not pass the gate',
      'saveJsonToFile({}, getFilePath(x, true));',
    ],
    [
      'a call of a writer through an alias',
      'const save = utils.saveJsonToFile; save({}, getFilePath(pulledFilePath(x), true));',
    ],
    ['an alias that is passed as an argument', 'run(fs.writeFileSync);'],
    [
      'a member of a destructuring that is renamed',
      "const { writeFileSync: w } = fs; w(pulledFilePath(x), 'y');",
    ],
    [
      'the writer of the commands of the first generation',
      "extractDataToFile('text', 'file.js', 'dir');",
    ],
    ['fs.cpSync', "fs.cpSync(pulledFilePath('a'), x);"],
    ['fs.copyFile', "fs.copyFile(x, pulledFilePath('a'), done);"],
    ['fs.promises.writeFile', "fs.promises.writeFile(x, 'y');"],
    ['fsp.appendFile', "fsp.appendFile(x, 'y');"],
    ['fs.openSync', "fs.openSync(x, 'w');"],
    ['fs.linkSync', "fs.linkSync(pulledFilePath('a'), x);"],
    ['fs.symlinkSync', "fs.symlinkSync(x, pulledFilePath('a'));"],
    ['fs.truncateSync', 'fs.truncateSync(x);'],
    ['fs.mkdirSync', 'fs.mkdirSync(x, { recursive: true });'],
    ['a computed key on fs', "fs['write' + 'FileSync'](x, 'y');"],
    [
      'a join with a base that is not gated',
      "fs.writeFileSync(path.join(raw, pulledFilePath('fixed.json')), 'y');",
    ],
    [
      'a variable that is assigned a raw path later',
      "let p = pulledFilePath('a'); p = raw; fs.writeFileSync(p, 'y');",
    ],
    [
      'a variable that is declared twice',
      "{ const p = pulledFilePath('a'); } const p = raw; fs.writeFileSync(p, 'y');",
    ],
    [
      'a parameter',
      "function inner(p) { fs.writeFileSync(p, 'y'); } inner(x);",
    ],
    [
      'a removal without the gate',
      'fs.rmSync(getFilePath(nodeDir), { recursive: true });',
    ],
  ];

  test.each(FORMS)('%s', (_what, body) => {
    const text = `export function f(x, raw, nodeDir) { ${body} }`;

    expect(findingsOf(sourceOfText(text), 'snippet.ts').length).toBeGreaterThan(
      0
    );
  });

  test.each([
    [
      'a path of the gate',
      'const p = pulledFilePath(`a/${x}.json`); saveJsonToFile({}, getFilePath(p, true));',
    ],
    [
      'the gate inside the call',
      "fs.writeFileSync(getFilePath(pulledFilePath(x)), 'y');",
    ],
    [
      'a join of gated paths and strings',
      "fs.rmSync(path.join(pulledFilePath('a'), 'b'));",
    ],
    [
      'the functions named by a destructuring',
      'const { saveJsonToFile, getFilePath } = frodo.utils;',
    ],
  ])('%s is not a finding', (_what, body) => {
    const text = `export function f(x) { ${body} }`;

    expect(findingsOf(sourceOfText(text), 'snippet.ts')).toEqual([]);
  });
});

/**
 * How many calls of the gate each module has: one for each file that a family writes, as the source
 * has them. A module that is not in the table has none.
 */
const GATE_CALLS = {
  'src/configManagerOps/FrConfigAccessConfigOps.ts': 1,
  'src/configManagerOps/FrConfigAuditOps.ts': 1,
  'src/configManagerOps/FrConfigAuthenticationOps.ts': 1,
  'src/configManagerOps/FrConfigAuthzPoliciesOps.ts': 6,
  'src/configManagerOps/FrConfigConnectorDefinitionsOps.ts': 1,
  'src/configManagerOps/FrConfigConnectorMappingOps.ts': 3,
  'src/configManagerOps/FrConfigCookieDomainsOps.ts': 1,
  'src/configManagerOps/FrConfigCorsOps.ts': 1,
  'src/configManagerOps/FrConfigCspOps.ts': 1,
  'src/configManagerOps/FrConfigCustomNodesOps.ts': 4,
  'src/configManagerOps/FrConfigEmailProviderOps.ts': 1,
  'src/configManagerOps/FrConfigEmailTemplatesOps.ts': 4,
  'src/configManagerOps/FrConfigEndpointsOps.ts': 3,
  'src/configManagerOps/FrConfigIdmAuthenticationOpts.ts': 1,
  'src/configManagerOps/FrConfigIgaWorkflowsOps.ts': 4,
  'src/configManagerOps/FrConfigInternalRolesOps.ts': 1,
  'src/configManagerOps/FrConfigJourneysOps.ts': 5,
  'src/configManagerOps/FrConfigKbaOps.ts': 1,
  'src/configManagerOps/FrConfigLocalesOps.ts': 1,
  'src/configManagerOps/FrConfigManagedObjectsOps.ts': 3,
  'src/configManagerOps/FrConfigOauth2AgentOps.ts': 1,
  'src/configManagerOps/FrConfigOrgPrivilegesOps.ts': 1,
  'src/configManagerOps/FrConfigPasswordPolicyOps.ts': 1,
  'src/configManagerOps/FrConfigRawOps.ts': 1,
  'src/configManagerOps/FrConfigRemoteServersOps.ts': 1,
  'src/configManagerOps/FrConfigSamlOps.ts': 2,
  'src/configManagerOps/FrConfigSchedulesOps.ts': 3,
  'src/configManagerOps/FrConfigScriptOps.ts': 2,
  'src/configManagerOps/FrConfigSecretMappingsOps.ts': 1,
  'src/configManagerOps/FrConfigSecretOps.ts': 1,
  'src/configManagerOps/FrConfigServiceObjectsOps.ts': 1,
  'src/configManagerOps/FrConfigServiceOps.ts': 2,
  'src/configManagerOps/FrConfigTelemetryOps.ts': 1,
  'src/configManagerOps/FrConfigTermsAndConditionsOps.ts': 2,
  'src/configManagerOps/FrConfigThemeOps.ts': 6,
  'src/configManagerOps/FrConfigUiConfigOps.ts': 1,
  'src/configManagerOps/FrConfigVariableOps.ts': 1,
  'src/ops/ApplicationConfigOps.ts': 4,
  'src/ops/ApplicationMigrateOps.ts': 1,
  'src/ops/ConfigManagerAgentKind.ts': 1,
  'src/ops/RemoteProxyOps.ts': 1,
  'src/utils/Config.ts': 1,
};

describe('the gate calls of each module', () => {
  test.each(MODULES)(
    '%s has the number of gate calls in the table',
    (module) => {
      expect({ [module]: gateCallsOf(sourceOf(module)) }).toEqual({
        [module]: GATE_CALLS[module] ?? 0,
      });
    }
  );
});
