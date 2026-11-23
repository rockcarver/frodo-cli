import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import ts from 'typescript';

/**
 * Every place in `src/` that removes a file or a folder is listed here, with the reason that what
 * it removes is not a path that a tenant names. A new call of `rm`, `rmSync`, `rmdir`,
 * `rmdirSync`, `unlink` or `unlinkSync` (also as `fs.promises.rm` or a name that was imported)
 * fails this file until it is listed, so that whoever adds it says where its path comes from. A
 * path that holds a value from the tenant (the id of a journey, the realm of an object) is built
 * with the functions of `src/utils/ConfigTreePath.ts`, and the entry of such a place also says
 * which call of them the module has to hold. The behaviour of the two places that remove what the
 * tenant names is in ConfigManagerPullJourneysStayInside.test.js and
 * ApplicationMigrateHostileRealm.test.js.
 *
 * The scan looks at the syntax of the source, not at its text, so a reformatted call, or a call
 * in a comment or a string, is not mistaken for another. The text that an entry holds is compared
 * without white space.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const REMOVERS = new Set([
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'unlink',
  'unlinkSync',
  'rimraf',
]);

/**
 * The places that remove something, and why each is safe.
 * `call` is the text of the call, `via` the text that the module has to hold as well (the
 * functions that make the path of a value from the tenant a name inside the config folder).
 */
const ALLOWED = [
  {
    module: 'src/configManagerOps/FrConfigJourneysOps.ts',
    call: 'fs.rmSync(getFilePath(nodeDir), { recursive: true, force: true })',
    via: [
      'const journeyDir = objectFolderPath(journeysDir, treeId);',
      'const nodeDir = `${journeyDir}/nodes`;',
      'realmDir = realmFolderOf(realmName);',
    ],
    why: 'the `nodes` folder of a journey that `pull journeys --clean` pulls: the realm is `realmFolderOf` and the id of the journey is `objectFolderPath`, one name each',
  },
  {
    module: 'src/ops/ApplicationMigrateOps.ts',
    call: 'fs.rmSync(path.join(treeDir, file))',
    via: ['realmDir = realmFolderOf(object.realm);'],
    why: 'a file that `kindPathFiles` found: the realm of the object is `realmFolderOf` (a realm that is not a folder name has no files), the id is one segment',
  },
  {
    module: 'src/ops/ApplicationMigrateOps.ts',
    call: 'fs.rmdirSync(dir)',
    via: ['while (dir !== root && dir.startsWith(root + path.sep))'],
    why: 'a folder that a removal left empty, from the file upwards, never the root of the tree or anything outside it; a folder that is not empty is not removed',
  },
  {
    module: 'src/configManagerOps/FrConfigRawOps.ts',
    call: 'fs.rmSync(dir, { recursive: true, force: true })',
    via: ["const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-stdin-'));"],
    why: 'the private folder that `mkdtempSync` made in the temporary folder of the machine, for the text of standard input',
  },
  {
    module: 'src/utils/TreeLayout.ts',
    call: 'fs.rmSync(temporary, { force: true })',
    via: ['const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;'],
    why: 'the temporary file next to the layout marker, named from the process and the time',
  },
  {
    module: 'src/ops/ConfigOps.ts',
    call: 'fs.rmdirSync(`${baseDirectory}/${fileType}`)',
    via: ['if (!fs.readdirSync(`${baseDirectory}/${fileType}`).length) {'],
    why: 'the folder of `config export` that its own listing found empty: the directory is typed by the person, the folder name is a constant of the command, and a folder that is not empty is not removed',
  },
  {
    module: 'src/ops/McpServerLockfile.ts',
    call: 'fs.rmSync(getMcpHttpLockfilePath(port), { force: true })',
    via: [],
    why: 'the lock file of the server, named from its port number',
  },
  {
    module: 'src/ops/ShellWebLauncher.ts',
    call: 'fs.rmSync(path.join(directory, LAUNCHER_FILE_NAME), { force: true })',
    via: [],
    why: 'the launcher file in the folder that the launcher made itself',
  },
  {
    module: 'src/ops/ShellWebLauncher.ts',
    call: 'fs.rmdirSync(directory)',
    via: [],
    why: 'the folder that the launcher made itself, only when it is empty',
  },
];

const withoutWhiteSpace = (text) => text.replace(/\s+/g, '');

/**
 * Every call of a function that removes something, and every other mention of such a name (an
 * import, a function that is kept in a variable).
 * @param {string} source the text of a module
 * @returns {{ line: number, text: string }[]} the place, and the call it is the function of
 */
function removalsOf(source) {
  const sourceFile = ts.createSourceFile(
    'module.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const found = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && REMOVERS.has(node.text)) {
      // `fs.rmSync(...)`: the name is the property of an access that is the function of a call
      let named = node;
      if (
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.name === node
      ) {
        named = node.parent;
      }
      const call =
        ts.isCallExpression(named.parent) && named.parent.expression === named
          ? named.parent
          : named;
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart()
      );
      found.push({ line: line + 1, text: call.getText() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * What is wrong with the removals of a set of modules: a removal that is not listed, a listed one
 * that is gone, and a listed one whose module lacks the text that makes its path safe.
 * @param {Record<string, string>} modules the text of each module, by its path
 * @param {typeof ALLOWED} allowed the entries
 * @returns {string[]} the problems, none when all is well
 */
function problemsOf(modules, allowed) {
  const problems = [];
  const left = allowed.map((entry) => ({ ...entry, found: 0 }));
  for (const [module, source] of Object.entries(modules)) {
    for (const { line, text } of removalsOf(source)) {
      const entry = left.find(
        (one) =>
          one.module === module &&
          withoutWhiteSpace(one.call) === withoutWhiteSpace(text)
      );
      if (entry) entry.found++;
      else problems.push(`${module}:${line} removes with ${text}: not listed`);
    }
  }
  for (const entry of left) {
    const source = modules[entry.module];
    if (entry.found === 0) {
      problems.push(`${entry.module}: ${entry.call} is listed but not there`);
    } else if (source !== undefined) {
      for (const text of entry.via) {
        if (!withoutWhiteSpace(source).includes(withoutWhiteSpace(text))) {
          problems.push(`${entry.module}: ${entry.call} lacks ${text}`);
        }
      }
    }
  }
  return problems;
}

/** The modules of `src/`, by their path: everything that is shipped, no test. */
function shippedModules() {
  const modules = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(path.join(root, folder), {
      withFileTypes: true,
    })) {
      const relative = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (
        /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) &&
        !entry.name.includes('.test.')
      ) {
        modules[relative] = fs.readFileSync(path.join(root, relative), 'utf8');
      }
    }
  };
  walk('src');
  return modules;
}

describe('the scan itself', () => {
  const only = [{ module: 'm.ts', call: 'fs.rmSync(a)', via: [], why: 'x' }];

  test('every way to remove something is found', () => {
    const found = removalsOf(`
      import { rmSync } from 'fs';
      fs.rmSync(a);
      fs.rmdirSync(\`\${a}/b\`);
      fs.unlinkSync(a);
      await fs.promises.rm(a, { recursive: true });
      await fsp.rmdir(a);
      fs.unlink(a, callback);
      await rimraf(a);
      const remove = fs.rmSync;
    `);

    expect(found.map((one) => one.text)).toEqual([
      'rmSync',
      'fs.rmSync(a)',
      'fs.rmdirSync(`${a}/b`)',
      'fs.unlinkSync(a)',
      'fs.promises.rm(a, { recursive: true })',
      'fsp.rmdir(a)',
      'fs.unlink(a, callback)',
      'rimraf(a)',
      'fs.rmSync',
    ]);
  });

  test('other names, comments and strings are not mistaken for a removal', () => {
    expect(
      removalsOf(`
        // fs.rmSync(a)
        /** fs.unlinkSync(a) */
        const text = 'fs.rmSync(a)';
        confirm(a); perform(a); firm(a); form(a); a.format(b); remove(a);
      `)
    ).toEqual([]);
  });

  test('a removal that is not listed is a problem', () => {
    expect(
      problemsOf({ 'm.ts': 'fs.rmSync(a); fs.rmSync(`${a}/nodes`);' }, only)
    ).toEqual(['m.ts:1 removes with fs.rmSync(`${a}/nodes`): not listed']);
  });

  test('a removal that is listed for another module is a problem', () => {
    expect(problemsOf({ 'other.ts': 'fs.rmSync(a);' }, only)).toEqual([
      'other.ts:1 removes with fs.rmSync(a): not listed',
      'm.ts: fs.rmSync(a) is listed but not there',
    ]);
  });

  test('a listed removal that is gone is a problem', () => {
    expect(problemsOf({ 'm.ts': 'nothing();' }, only)).toEqual([
      'm.ts: fs.rmSync(a) is listed but not there',
    ]);
  });

  test('a listed removal is found however the call is written', () => {
    expect(problemsOf({ 'm.ts': 'fs.rmSync(\n  a\n);' }, only)).toEqual([]);
  });

  test('a listed removal is a problem when the text that makes its path safe is not in the module', () => {
    const entry = [{ ...only[0], via: ['const dir = objectFolderPath(f, id);'] }];

    expect(problemsOf({ 'm.ts': 'fs.rmSync(a);' }, entry)).toEqual([
      'm.ts: fs.rmSync(a) lacks const dir = objectFolderPath(f, id);',
    ]);
    expect(
      problemsOf(
        { 'm.ts': 'const dir =\n  objectFolderPath(f, id);\nfs.rmSync(a);' },
        entry
      )
    ).toEqual([]);
  });
});

describe('the removals of src/', () => {
  test('every one is listed, every listed one is there, and the paths that hold a value of the tenant are made by the functions for it', () => {
    const modules = shippedModules();
    // the scan reads the whole source, and every module an entry names is in it
    expect(Object.keys(modules).length).toBeGreaterThan(500);
    for (const { module } of ALLOWED) {
      expect(Object.keys(modules)).toContain(module);
    }

    expect(problemsOf(modules, ALLOWED)).toEqual([]);
  });

  test('every entry says why what it removes is safe', () => {
    for (const entry of ALLOWED) {
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });
});
