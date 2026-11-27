import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Every read of a property named `file` in the push code of the config tree goes through
 * `referencedFilePath` (src/utils/ConfigTreePath.ts), and every id that names a file of the tree goes
 * through `objectFilePath` or `objectFolderPath`. The behaviour of each of the 22 places is in
 * ConfigManagerFileReferences.test.js; this file keeps a place from being forgotten:
 *
 * - every module of src/configManagerOps and every application module of src/ops is read (a new
 *   module is scanned without being listed here);
 * - a read of `.file` is guarded when it is inside a call of `referencedFilePath`; it is not a read
 *   of a file when it only decides something (the test of an `if`, a `!`, a comparison, the argument
 *   of the name filter `fileFilter`), is deleted, or is assigned (a pull writes it); every other read
 *   is a failure, unless the exemption table below says why it is none;
 * - the number of calls of each helper in each module is the number of places the table of
 *   ConfigManagerFileReferences.test.js has in it, so a call that is removed fails here, and so does
 *   a place that is added without a row.
 *
 * The scan looks at the syntax of the source, not at its text, so a reformatted call is still found.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** The modules that push what a tree holds: every module of the folder, and the application modules. */
function modulesOfPush() {
  const folders = [
    ['src/configManagerOps', () => true],
    ['src/ops', (name) => /^Application.*\.ts$/.test(name)],
  ];
  return folders.flatMap(([folder, wanted]) =>
    fs
      .readdirSync(path.join(root, folder))
      .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
      .filter(wanted)
      .map((name) => `${folder}/${name}`)
      .sort()
  );
}

/**
 * The reads that are not a read of a file: a place that holds a `.file` and, in the source, says
 * what it does with it. `text` is a part of the text of the property, declaration or statement
 * that holds the read.
 */
const EXEMPT = [
  {
    module: 'src/ops/ApplicationConfigOps.ts',
    text: 'textFile: config.script?.file',
    reason:
      'the reference is kept with the id of the script, and read through referencedFilePath where the text is read',
  },
  {
    module: 'src/ops/ApplicationConfigOps.ts',
    text: '{ file, leftOut, redacted } = clientFile(',
    reason:
      'a pull: the name of the file that the pull is about to write, not a reference that was read',
  },
  {
    module: 'src/configManagerOps/FrConfigAllOps.ts',
    text: 'reading = steps',
    reason:
      'the file of a step of an all command is the one named with the option for a config file, not a reference found inside a file of the tree',
  },
  {
    module: 'src/configManagerOps/FrConfigAllOps.ts',
    text: 'namesOf = (everything',
    reason:
      'the file of a step of an all command is the one named with the option for a config file, not a reference found inside a file of the tree',
  },
];

const COMPARISONS = new Set(['===', '!==', '==', '!=']);
const LOGICAL = new Set(['&&', '||']);

const calleeName = (call) =>
  ts.isIdentifier(call.expression)
    ? call.expression.text
    : ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name.text
      : undefined;

/** Whether the expression only decides something where it stands, and its text goes nowhere. */
function isTest(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent)
    ) {
      current = parent;
    } else if (
      ts.isPrefixUnaryExpression(parent) &&
      parent.getFirstToken()?.getText() === '!'
    ) {
      return true;
    } else if (ts.isTypeOfExpression(parent)) {
      return true;
    } else if (
      ts.isBinaryExpression(parent) &&
      COMPARISONS.has(parent.operatorToken.getText())
    ) {
      return true;
    } else if (
      ts.isBinaryExpression(parent) &&
      LOGICAL.has(parent.operatorToken.getText())
    ) {
      // the value of `a && b` is b: it only decides when the whole expression is a test itself
      current = parent;
    } else if (ts.isIfStatement(parent)) {
      return parent.expression === current;
    } else if (ts.isConditionalExpression(parent)) {
      return parent.condition === current;
    } else {
      return false;
    }
  }
  return false;
}

/** The statement, declaration or property that holds the node: what an exemption names. */
function holderOf(node) {
  let current = node;
  while (current.parent) {
    if (
      ts.isPropertyAssignment(current) ||
      ts.isVariableDeclaration(current) ||
      ts.isExpressionStatement(current) ||
      ts.isReturnStatement(current) ||
      ts.isIfStatement(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return current;
}

/**
 * Every read of a property named `file` in the source, and what it is.
 * @returns {{ line: number, verdict: string, text: string }[]} `verdict` is `guarded`, `test`, `filter`, `delete`, `assigned`, or `unguarded`
 */
function readsOfFile(source) {
  const sourceFile = ts.createSourceFile(
    'module.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const found = [];
  const visit = (node) => {
    // `value.file`, and `value['file']` (a string with nothing in it but the name)
    const isAccess =
      (ts.isPropertyAccessExpression(node) && node.name.text === 'file') ||
      (ts.isElementAccessExpression(node) &&
        (ts.isStringLiteral(node.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) &&
        node.argumentExpression.text === 'file');
    const isBinding =
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      (node.propertyName
        ? node.propertyName.getText() === 'file'
        : node.name.text === 'file');
    if (isAccess || isBinding) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );
      const text = holderOf(node).getText();
      let verdict = 'unguarded';
      const insideCall = (name) => {
        for (let up = node.parent; up; up = up.parent) {
          if (ts.isCallExpression(up) && calleeName(up) === name) return true;
          if (ts.isBlock(up) || ts.isSourceFile(up)) return false;
        }
        return false;
      };
      if (
        isAccess &&
        ts.isBinaryExpression(node.parent) &&
        node.parent.left === node &&
        node.parent.operatorToken.getText() === '='
      ) {
        verdict = 'assigned';
      } else if (
        ts.isDeleteExpression(node.parent) ||
        (ts.isParenthesizedExpression(node.parent) &&
          ts.isDeleteExpression(node.parent.parent))
      ) {
        verdict = 'delete';
      } else if (insideCall('referencedFilePath')) {
        verdict = 'guarded';
      } else if (insideCall('fileFilter')) {
        verdict = 'filter';
      } else if (isAccess && isTest(node)) {
        verdict = 'test';
      }
      found.push({ line: line + 1, verdict, text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** The number of calls of the functions of ConfigTreePath that a module makes, by name. */
function helperCalls(source) {
  const sourceFile = ts.createSourceFile(
    'module.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const counts = {};
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (
        ['referencedFilePath', 'objectFilePath', 'objectFolderPath'].includes(
          name
        )
      ) {
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return counts;
}

const sourceOf = (module) => fs.readFileSync(path.join(root, module), 'utf8');

describe('the scan itself', () => {
  test('a read of a file that skips the helper is found', () => {
    const reads = readsOfFile(`
      function a(dir, value) {
        const p = path.join(dir, value.file);
        const q = \`\${dir}/\${value.script.file}\`;
        const { file } = value;
        const r = fs.readFileSync(value['x'].file);
        const t = fs.readFileSync(\`\${dir}/\${value['file']}\`);
        const u = fs.readFileSync(path.join(dir, value[\`file\`]));
        return [p, q, file, r, t, u];
      }
    `);

    expect(reads.map((read) => read.verdict)).toEqual([
      'unguarded',
      'unguarded',
      'unguarded',
      'unguarded',
      'unguarded',
      'unguarded',
    ]);
  });

  test('a read through the helper, a test, a filter, a delete and an assignment are told apart', () => {
    const reads = readsOfFile(`
      function a(dir, value, filter) {
        if (value.file) {
          const p = referencedFilePath(dir, value.file);
          if (!fileFilter(value.file, filter)) return;
          delete value.file;
        }
        value.file = 'x.js';
        const kept = ok && value.file;
        const q = referencedFilePath(dir, value['file']);
        if (value['file']) delete value['file'];
        value['file'] = 'y.js';
        const lost = ok && value['file'];
        return typeof value.file === 'string' ? p : [kept, q, lost];
      }
    `);

    expect(reads.map((read) => read.verdict)).toEqual([
      'test',
      'guarded',
      'filter',
      'delete',
      'assigned',
      // the value of `ok && value.file` is the file name itself: it is not a test
      'unguarded',
      // the same with the name written as a string
      'guarded',
      'test',
      'delete',
      'assigned',
      'unguarded',
      // and the `typeof` of the last line
      'test',
    ]);
  });

  test('a call of the helper is counted wherever it is written', () => {
    expect(
      helperCalls(`
        const a = referencedFilePath(
          dir,
          value.file
        );
        const b = getFilePath(objectFilePath(folder, id));
        const c = objectFolderPath(folder, id);
      `)
    ).toEqual({
      referencedFilePath: 1,
      objectFilePath: 1,
      objectFolderPath: 1,
    });
  });
});

describe('the reads of a file reference in the push code of the config tree', () => {
  const modules = modulesOfPush();

  test('the scan covers every module of the push code', () => {
    expect(modules.length).toBeGreaterThan(30);
    expect(modules).toEqual(
      expect.arrayContaining([
        'src/configManagerOps/FrConfigScriptOps.ts',
        'src/configManagerOps/FrConfigSamlOps.ts',
        'src/ops/ApplicationConfigOps.ts',
      ])
    );
  });

  test.each(modules.map((module) => [module]))(
    '%s: every read of a `file` goes through referencedFilePath, or is none',
    (module) => {
      const unguarded = readsOfFile(sourceOf(module)).filter(
        (read) =>
          read.verdict === 'unguarded' &&
          !EXEMPT.some(
            (exempt) =>
              exempt.module === module && read.text.includes(exempt.text)
          )
      );

      expect(unguarded).toEqual([]);
    }
  );

  test('every exemption is still needed, and says why', () => {
    for (const exempt of EXEMPT) {
      const used = readsOfFile(sourceOf(exempt.module)).filter(
        (read) =>
          read.verdict === 'unguarded' && read.text.includes(exempt.text)
      );

      expect({ exempt: exempt.text, used: used.length }).toEqual({
        exempt: exempt.text,
        used: 1,
      });
      expect(exempt.reason.length).toBeGreaterThan(20);
    }
  });

  test('the places that read a file reference are found: at least 15 reads go through the helper', () => {
    const guarded = modules.flatMap((module) =>
      readsOfFile(sourceOf(module)).filter((read) => read.verdict === 'guarded')
    );

    // S1 to S15 read a `.file` (S16 keeps the reference as `textFile`, S22 builds the name of the file from the version and the language)
    expect(guarded.length).toBeGreaterThanOrEqual(15);
  });
});

/**
 * The helper calls of each module that has a place. A row of ConfigManagerFileReferences.test.js is
 * one place; a place that reads a file reference is one call of `referencedFilePath`, a place that
 * turns an id into a file or folder of the tree is one call of `objectFilePath` or
 * `objectFolderPath` (and the module may have more such calls of its own, for the names that a
 * selector gives, which are in ConfigManagerPushHostileSelectors.test.js).
 *
 * `places` says which rows the calls are.
 */
const PLACES = {
  'src/configManagerOps/FrConfigConnectorMappingOps.ts': {
    referencedFilePath: 2, // S1, S2
    objectFilePath: 2, // the selector (-i), and the file of a mapping that an application owns (S19)
    objectFolderPath: 1, // the selector (-i)
  },
  'src/configManagerOps/FrConfigManagedObjectsOps.ts': {
    referencedFilePath: 1, // S3
    objectFilePath: 1,
    objectFolderPath: 1,
  },
  'src/configManagerOps/FrConfigThemeOps.ts': {
    referencedFilePath: 2, // S4, S5
  },
  'src/configManagerOps/FrConfigEmailTemplatesOps.ts': {
    referencedFilePath: 3, // S6, S7, S8
  },
  'src/configManagerOps/FrConfigIgaWorkflowsOps.ts': {
    referencedFilePath: 1, // S9
  },
  'src/configManagerOps/FrConfigScriptOps.ts': {
    referencedFilePath: 2, // S10, S11
    objectFilePath: 1, // S20
  },
  'src/configManagerOps/FrConfigSchedulesOps.ts': {
    referencedFilePath: 2, // S12, S13
  },
  'src/configManagerOps/FrConfigEndpointsOps.ts': {
    referencedFilePath: 1, // S14
  },
  'src/configManagerOps/FrConfigJourneysOps.ts': {
    referencedFilePath: 1, // S15
    objectFilePath: 4, // S17, the file of an inner journey (S18), and the file that a pull writes for a journey: claimed first, then written (ConfigManagerPullJourneysStayInside.test.js)
    objectFolderPath: 3, // the selector, the folder of an inner journey (S18), and the folder that a pull writes for a journey (ConfigManagerPullJourneysStayInside.test.js)
  },
  'src/configManagerOps/FrConfigTermsAndConditionsOps.ts': {
    referencedFilePath: 3, // S22: the version, the language, the reference that a pull wrote
  },
  'src/configManagerOps/FrConfigSamlOps.ts': {
    objectFilePath: 1, // S21
  },
  'src/ops/ApplicationConfigOps.ts': {
    referencedFilePath: 1, // S16
    objectFilePath: 1, // S19
    objectFolderPath: 1, // S19
  },
};

describe('the helper calls of the modules that have a place', () => {
  test.each(Object.entries(PLACES))('%s', (module, expected) => {
    const counts = helperCalls(sourceOf(module));

    // the places are the same as the calls: a call that is removed, or added, is a row that is missing or extra
    expect(counts).toEqual(expected);
  });

  test('no other module calls referencedFilePath: a new place is a new row', () => {
    const others = modulesOfPush().filter(
      (module) =>
        !(module in PLACES) &&
        (helperCalls(sourceOf(module)).referencedFilePath ?? 0) > 0
    );

    expect(others).toEqual([]);
  });
});
