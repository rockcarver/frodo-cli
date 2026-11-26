import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import ts from 'typescript';

/**
 * Every place in `src/` that removes a file or a folder, or renames one over another, is listed
 * here, with the reason that what it removes is not a path that a tenant names. A new call of
 * `rm`, `rmSync`, `rmdir`, `rmdirSync`, `unlink`, `unlinkSync`, `rimraf`, `rename` or `renameSync`
 * (also as `fs.promises.rm`, `fs['rmSync']` or a name that was imported), and a new call of
 * `exec`, `execSync`, `execFile`, `execFileSync`, `spawn` or `spawnSync` whose command is `rm`,
 * `rmdir`, `unlink`, `mv`, `shred` or `rimraf`, fails this file until it is listed, so that whoever
 * adds it says where its path comes from. The test files of `src/` are scanned like the rest. This
 * is a tripwire for those names, not a wall: a command that is built at run time, or a function
 * that is reached by a computed name, is not seen. A path that holds a value from the tenant (the
 * id of a journey, the realm of an object) is built with the functions of
 * `src/utils/ConfigTreePath.ts`, and the entry of such a place also says which call of them the
 * module has to hold anywhere in it. The behaviour of the two places that remove what the tenant
 * names is in ConfigManagerPullJourneysStayInside.test.js and
 * ApplicationMigrateHostileRealm.test.js.
 *
 * The scan looks at the syntax of the source, not at its text, so a reformatted call, or a call
 * in a comment or a string, is not mistaken for another. The text that an entry holds is compared
 * without white space and without a trailing comma.
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
  'rename',
  'renameSync',
]);

/** The functions that run a command, and what a command that removes something starts with (`rm -rf x`, `/bin/rm`). */
const SHELL_RUNNERS = new Set([
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'spawn',
  'spawnSync',
]);
const SHELL_REMOVAL =
  /(?:^|[^\w-])(?:rm|rmdir|unlink|mv|shred|rimraf)(?![\w-])/;

/**
 * The places that remove something, and why each is safe.
 * `call` is the text of the call, `count` how many times the module holds it (one when it is not
 * said), `via` the text that the module has to hold as well (the functions that make the path of a
 * value from the tenant a name inside the config folder).
 */
const ALLOWED = [
  {
    module: 'src/configManagerOps/FrConfigJourneysOps.ts',
    call: 'fs.rmSync(getFilePath(pulledFilePath(nodeDir, pulledPaths)), { recursive: true, force: true })',
    via: [
      'const journeyDir = objectFolderPath(journeysDir, treeId);',
      'const nodeDir = `${journeyDir}/nodes`;',
      '() => realmFolderOf(realmName),',
    ],
    why: 'the `nodes` folder of a journey that `pull journeys --clean` pulls: the realm is `realmFolderOf` and the id of the journey is `objectFolderPath`, one name each, and the path passes the gate of a pull',
  },
  {
    module: 'src/ops/ApplicationMigrateOps.ts',
    call: 'fs.rmSync(path.join(treeDir, pulledFilePath(file)))',
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
    via: [
      "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-stdin-'));",
    ],
    why: 'the private folder that `mkdtempSync` made in the temporary folder of the machine, for the text of standard input',
  },
  {
    module: 'src/utils/TreeLayout.ts',
    call: 'fs.rmSync(temporary, { force: true })',
    via: ['const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;'],
    why: 'the temporary file next to the layout marker, named from the process and the time',
  },
  {
    module: 'src/utils/TreeLayout.ts',
    call: 'fs.renameSync(temporary, file)',
    via: ['const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;'],
    why: 'the temporary file next to the layout marker is renamed over the marker: both names are made from the folder of the tree and constants',
  },
  {
    module: 'src/utils/FsFileSetWriter.ts',
    call: 'fs.promises.rename(temporary, target)',
    via: [
      'frodo.utils.assertFileSetPath(file?.path);',
      "`.frodo-${crypto.randomBytes(4).toString('hex')}.tmp`",
    ],
    why: 'the temporary file that the writer made next to a file of the set (a random name in the folder that the walk of the root checked) is renamed onto the path of that file, which passed the gate of the library; a link at that path is replaced, not followed',
  },
  {
    module: 'src/utils/FsFileSetWriter.ts',
    call: 'fs.promises.rm(temporary, { force: true })',
    via: ["`.frodo-${crypto.randomBytes(4).toString('hex')}.tmp`"],
    why: 'the temporary file that the writer made itself, with a random name, when writing the file failed',
  },
  {
    module: 'src/utils/FsFileSetWriter.ts',
    call: 'fs.promises.unlink(stale)',
    via: [
      'frodo.utils.assertFileSetPath(file?.path);',
      'if (spelled !== name) stale = path.join(folder, spelled);',
    ],
    why: 'the entry of a folder that is the file about to be written under another spelling of its name (case or Unicode form, found by the real path of the entry on a file system that ignores the difference); the folder was walked from the root of the set and the path passed the gate of the library; unlink removes a link and does not follow it',
  },
  {
    module: 'src/utils/FsFileSetWriter.ts',
    call: 'fs.promises.rm(full, { recursive: true, force: true })',
    via: [
      'if (options.clean && result.failed.length === 0) {',
      'if (walked.real !== direct) {',
      'frodo.utils.assertFileSetPath(folder);',
    ],
    why: 'an entry found by listing an owned folder of the set that the set does not list, only when a clean is asked for, no file failed, the owned folder is reached without a link (its real path is the container and the path of the set) and no file was written below it through a link; the entry is a name that the listing gave, and rm does not follow a link',
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
  {
    module: 'src/cli/shell/shell-web.pty.test.js',
    call: 'fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/cli/shell/shell-web.pty.test.js',
    call: 'fs.rmSync(tools, { recursive: true, force: true })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/cli/shell/shell-web.pty.test.js',
    call: 'fs.rmSync(dir, { recursive: true, force: true })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellHistoryOps.unit.test.ts',
    call: 'fs.rmSync(home, { recursive: true, force: true })',
    count: 3,
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellWebEngineOps.unit.test.ts',
    call: 'fs.rmSync(home, { recursive: true, force: true })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellWebLauncher.unit.test.ts',
    call: 'fs.rmSync(base, { recursive: true, force: true })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellWebServerOps.unit.test.ts',
    call: "fs.rmSync(profilesFile.slice(0, profilesFile.lastIndexOf('/')), { recursive: true, force: true })",
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellWebServerOps.unit.test.ts',
    call: "fs.rmSync(stub.slice(0, stub.lastIndexOf('/')), { recursive: true, force: true })",
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
  {
    module: 'src/ops/ShellWebServerOps.unit.test.ts',
    call: 'fs.rmSync(dir, { recursive: true, force: true })',
    count: 2,
    why: 'the temporary folder that a test block made with `mkdtempSync` in the temporary folder of the machine (the engine-failure block and the history-delete block each clean their own)',
  },
  {
    module: 'src/utils/interactive/FileSystemPaths.test.ts',
    call: 'fs.rmSync(root, { recursive: true, force: true })',
    why: 'the temporary folder that the test made with `mkdtempSync` in the temporary folder of the machine',
  },
];

/** The text without white space and without a comma before a closing bracket, as a formatter may write it. */
const withoutWhiteSpace = (text) =>
  text.replace(/\s+/g, '').replace(/,([)}\]])/g, '$1');

/**
 * Every call of a function that removes something, and every other mention of such a name (an
 * import, a function that is kept in a variable, a name in brackets).
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
  const add = (node, text) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    found.push({ line: line + 1, text });
  };
  /** The call that a node is the function of, or the node. */
  const callOf = (node) =>
    ts.isCallExpression(node.parent) && node.parent.expression === node
      ? node.parent
      : node;
  const visit = (node) => {
    if (ts.isIdentifier(node) && REMOVERS.has(node.text)) {
      // `fs.rmSync(...)`: the name is the property of an access that is the function of a call
      const named =
        ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
          ? node.parent
          : node;
      add(node, callOf(named).getText());
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      REMOVERS.has(node.argumentExpression.text)
    ) {
      add(node, callOf(node).getText());
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (
        SHELL_RUNNERS.has(name) &&
        SHELL_REMOVAL.test(node.arguments[0].getText())
      ) {
        add(node, node.getText());
      }
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
  const left = allowed.map((entry) => ({ count: 1, ...entry, found: 0 }));
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
    } else if (entry.found !== entry.count) {
      problems.push(
        `${entry.module}: ${entry.call} is there ${entry.found} times and listed ${entry.count} times`
      );
    } else if (source !== undefined) {
      for (const text of entry.via ?? []) {
        if (!withoutWhiteSpace(source).includes(withoutWhiteSpace(text))) {
          problems.push(`${entry.module}: ${entry.call} lacks ${text}`);
        }
      }
    }
  }
  return problems;
}

/** The modules of `src/`, by their path: everything that is shipped and every test file beside it. */
function modulesOfSrc() {
  const modules = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(path.join(root, folder), {
      withFileTypes: true,
    })) {
      const relative = `${folder}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) {
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

  test('a name in brackets, a rename and a command that removes are found', () => {
    const found = removalsOf(`
      fs['rmSync'](a);
      fs[\`unlinkSync\`](a);
      fs.renameSync(a, b);
      await fs.promises.rename(a, b);
      execSync('rm -rf ' + a);
      childProcess.execSync(\`rmdir \${a}\`);
      spawnSync('rm', ['-rf', a]);
      cp.execFileSync('/bin/rm', [a]);
      exec('mv a b');
    `);

    expect(found.map((one) => one.text)).toEqual([
      "fs['rmSync'](a)",
      'fs[`unlinkSync`](a)',
      'fs.renameSync(a, b)',
      'fs.promises.rename(a, b)',
      "execSync('rm -rf ' + a)",
      'childProcess.execSync(`rmdir ${a}`)',
      "spawnSync('rm', ['-rf', a])",
      "cp.execFileSync('/bin/rm', [a])",
      "exec('mv a b')",
    ]);
  });

  test('a command that does not remove anything is not mistaken for one', () => {
    expect(
      removalsOf(`
        execFileSync('ps', ['-p', pid]);
        spawn(command, args);
        execSync('git status');
        execSync('npm run format');
        spawnSync('open', ['rm.html']);
        /rm/.exec(text);
        fs.readFileSync(a);
        fs.writeFileSync(a, b);
      `)
    ).toEqual([]);
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

  test('a second removal of the same text is a problem unless it is listed twice', () => {
    const source = 'fs.rmSync(a); fs.rmSync(a);';

    expect(problemsOf({ 'm.ts': source }, only)).toEqual([
      'm.ts: fs.rmSync(a) is there 2 times and listed 1 times',
    ]);
    expect(problemsOf({ 'm.ts': source }, [{ ...only[0], count: 2 }])).toEqual(
      []
    );
    expect(
      problemsOf({ 'm.ts': 'fs.rmSync(a);' }, [{ ...only[0], count: 2 }])
    ).toEqual(['m.ts: fs.rmSync(a) is there 1 times and listed 2 times']);
  });

  test('a trailing comma that a formatter writes does not matter', () => {
    const entry = [
      { ...only[0], call: 'fs.rmSync(a, { force: true, recursive: true })' },
    ];

    expect(
      problemsOf(
        { 'm.ts': 'fs.rmSync(a, {\n force: true,\n recursive: true,\n});' },
        entry
      )
    ).toEqual([]);
  });

  test('a listed removal is found however the call is written', () => {
    expect(problemsOf({ 'm.ts': 'fs.rmSync(\n  a\n);' }, only)).toEqual([]);
  });

  test('a listed removal is a problem when the text that makes its path safe is not in the module', () => {
    const entry = [
      { ...only[0], via: ['const dir = objectFolderPath(f, id);'] },
    ];

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
    const modules = modulesOfSrc();
    // the scan reads the whole source, test files included, and every module an entry names is in it
    expect(Object.keys(modules).length).toBeGreaterThan(500);
    expect(Object.keys(modules)).toContain(
      'src/ops/ShellHistoryOps.unit.test.ts'
    );
    expect(Object.keys(modules)).toContain(
      'src/cli/shell/shell-web.pty.test.js'
    );
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
