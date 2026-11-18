import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';
import { collectExportCalls, findCollisions } from '../utils/E2eOutputNames.js';

/**
 * No two e2e test files may write to the same place.
 *
 * Jest runs test files in parallel workers in one working directory, and
 * testExport (test/e2e/utils/TestUtils.js) deletes what it read: its directory
 * after the test, and in the working directory every file that matches its
 * pattern. Two files that export into the same directory name, or whose
 * patterns match the same file in the working directory, fail now and then
 * with an ENOENT or with a snapshot of the other file's export, depending on
 * how the workers happen to interleave. This test reads the source of every
 * test/e2e/*.test.js (without running it) and fails on such a pair.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const E2E = path.join(ROOT, 'test/e2e');

/**
 * Pairs of test files that are known to collide and are not fixed yet. A pair
 * that no longer collides fails the test, so an entry cannot outlive its cause.
 */
const ALLOWED = [
  {
    files: ['saml-cot-export.e2e.test.js', 'saml-export.e2e.test.js'],
    reason:
      'The saml export and saml cot export tests share the working directory: saml-export "-A" reads every ".saml.json" there, which includes the five "*.cot.saml.json" of saml-cot-export. A known open case, not seen to fail in forced starts. Fixing it means "-AD" in saml-export, a pin of its recording id and the edit of 11 snapshot keys that carry a developer name.',
  },
];

/** A synthetic test file with the given body. */
const file = (body) => `describe('x', () => {\n${body}\n});\n`;

describe('collectExportCalls', () => {
  it('reads the type, the file name and the directory of a call, and its line', () => {
    const calls = collectExportCalls(
      file(
        `  test('a', async () => {\n    await testExport(CMD, env, 'agent', 'a.agent.json', 'dirA', false);\n  });`
      ),
      'a.test.js'
    );
    expect(calls).toEqual([
      {
        file: 'a.test.js',
        line: 3,
        type: 'agent',
        fileName: 'a.agent.json',
        directory: 'dirA',
      },
    ]);
  });

  it('reads an absent, undefined or null argument as null', () => {
    const calls = collectExportCalls(
      file(
        `  testExport(CMD, env);\n  testExport(CMD, env, undefined, undefined, undefined, false);\n  testExport(CMD, env, null, null, null);`
      ),
      'a.test.js'
    );
    expect(calls.map((c) => [c.type, c.fileName, c.directory])).toEqual([
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
  });

  it('resolves a const string, also one of the module scope and a template without substitution', () => {
    const calls = collectExportCalls(
      `const type = 'idm';\n` +
        file(
          '  test("a", async () => {\n    const exportFile = `a.idm.json`;\n    await testExport(CMD, env, type, exportFile);\n  });'
        ),
      'a.test.js'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: 'idm', fileName: 'a.idm.json' });
  });

  it('resolves a const of the same name per scope: two tests may both declare dirName', () => {
    const calls = collectExportCalls(
      file(
        `  test('a', async () => {\n    const dirName = 'dirA';\n    await testExport(CMD, env, undefined, undefined, dirName);\n  });\n` +
          `  test('b', async () => {\n    const dirName = 'dirB';\n    await testExport(CMD, env, undefined, undefined, dirName);\n  });`
      ),
      'a.test.js'
    );
    expect(calls.map((c) => c.directory)).toEqual(['dirA', 'dirB']);
  });

  it('prefers the nearest const to one of the same name further out', () => {
    const calls = collectExportCalls(
      `const dirName = 'outer';\n` +
        file(
          `  test('a', async () => {\n    const dirName = 'inner';\n    await testExport(CMD, env, undefined, undefined, dirName);\n  });\n  test('b', async () => {\n    await testExport(CMD, env, undefined, undefined, dirName);\n  });`
        ),
      'a.test.js'
    );
    expect(calls.map((c) => c.directory)).toEqual(['inner', 'outer']);
  });

  it('counts a call in a skipped test and ignores one in a comment', () => {
    const calls = collectExportCalls(
      file(
        `  test.skip('a', async () => {\n    await testExport(CMD, env, 'x', 'a.x.json');\n  });\n  // await testExport(CMD, env, 'x', 'b.x.json');`
      ),
      'a.test.js'
    );
    expect(calls.map((c) => c.fileName)).toEqual(['a.x.json']);
  });

  it('throws with file and line when an argument cannot be resolved', () => {
    expect(() =>
      collectExportCalls(
        file(
          `  test('a', async () => {\n    await testExport(CMD, env, 'x', undefined, someFunction());\n  });`
        ),
        'bad.test.js'
      )
    ).toThrow(/bad\.test\.js:3: cannot tell what the directory argument/);
    expect(() =>
      collectExportCalls(
        file(`  testExport(CMD, env, 'x', \`a-\${n}.json\`);`),
        'bad.test.js'
      )
    ).toThrow(/bad\.test\.js:2: cannot tell what the file name argument/);
    // a let can be reassigned: not a name the scan can trust
    expect(() =>
      collectExportCalls(
        file(
          `  let dirName = 'a';\n  testExport(CMD, env, 'x', undefined, dirName);`
        ),
        'bad.test.js'
      )
    ).toThrow(/bad\.test\.js:3: cannot tell what the directory argument/);
  });
});

/** A call as collectExportCalls returns it. */
const call = (fileName, line, type, name, directory) => ({
  file: fileName,
  line,
  type,
  fileName: name,
  directory,
});

describe('findCollisions', () => {
  it('reports the same directory name in two files, with both places and the name', () => {
    const problems = findCollisions([
      call('a.test.js', 10, null, null, 'testDir1'),
      call('b.test.js', 20, null, null, 'testDir1'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      problem: 'directory',
      files: ['a.test.js', 'b.test.js'],
      name: 'testDir1',
    });
    expect(problems[0].message).toContain('a.test.js:10');
    expect(problems[0].message).toContain('b.test.js:20');
    expect(problems[0].message).toContain('"testDir1"');
    expect(problems[0].message).toMatch(/Rename the directory/);
  });

  it('does not report the same directory twice in one file', () => {
    expect(
      findCollisions([
        call('a.test.js', 10, null, null, 'testDir1'),
        call('a.test.js', 20, null, null, 'testDir1'),
      ])
    ).toEqual([]);
  });

  it('does not take a "./", ".", an absent directory or a path with a slash for a claim', () => {
    expect(
      findCollisions([
        call('a.test.js', 1, 'x', 'same.x.json', './'),
        call('b.test.js', 1, 'y', 'other.y.json', '.'),
        call('c.test.js', 1, 'z', 'third.z.json', null),
        call('a.test.js', 2, null, null, 'out/dir'),
        call('b.test.js', 2, null, null, 'out/dir'),
      ])
    ).toEqual([]);
  });

  it('reports the same file name exported into the working directory by two files', () => {
    const problems = findCollisions([
      call('a.test.js', 5, 'agent', 'one.agent.json', null),
      call('b.test.js', 6, 'agent', 'one.agent.json', './'),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      problem: 'file',
      files: ['a.test.js', 'b.test.js'],
      name: 'one.agent.json',
    });
    expect(problems[0].message).toContain('a.test.js:5');
    expect(problems[0].message).toContain('b.test.js:6');
    expect(problems[0].message).toMatch(/with -D and pin FRODO_TEST_NAME/);
  });

  it('does not report the same file name in a directory, or the same name twice in one file', () => {
    expect(
      findCollisions([
        call('a.test.js', 5, 'agent', 'one.agent.json', 'dirA'),
        call('b.test.js', 6, 'agent', 'one.agent.json', 'dirB'),
        call('c.test.js', 1, 'agent', 'two.agent.json', null),
        call('c.test.js', 2, 'agent', 'two.agent.json', null),
      ])
    ).toEqual([]);
  });

  it("reports a type-wide export whose pattern reads another file's name, and the reverse", () => {
    // reader first
    const first = findCollisions([
      call('type-wide.test.js', 1, 'saml', null, null),
      call('one-name.test.js', 2, 'saml', 'x.cot.saml.json', null),
    ]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      problem: 'overlap',
      files: ['one-name.test.js', 'type-wide.test.js'],
    });
    expect(first[0].message).toContain('type-wide.test.js:1');
    expect(first[0].message).toContain('x.cot.saml.json');
    // the reader comes second in the order of the files
    const second = findCollisions([
      call('a-one-name.test.js', 2, 'saml', 'x.cot.saml.json', null),
      call('z-type-wide.test.js', 1, 'saml', null, null),
    ]);
    expect(second).toHaveLength(1);
    expect(second[0].problem).toBe('overlap');
    expect(second[0].message).toContain('z-type-wide.test.js:1');
  });

  it("reports a pattern that is a substring of another file's name, and a type that is the end of another type", () => {
    expect(
      findCollisions([
        call(
          'a.test.js',
          1,
          'agent',
          'frodo-test-java-agent.java.agent.json',
          null
        ),
        call(
          'b.test.js',
          1,
          'java.agent',
          'my-frodo-test-java-agent.java.agent.json',
          null
        ),
      ]).map((p) => p.problem)
    ).toEqual(['overlap']);
    expect(
      findCollisions([
        call('a.test.js', 1, 'agent', null, null),
        call('b.test.js', 1, 'java.agent', null, null),
      ]).map((p) => p.problem)
    ).toEqual(['overlap']);
  });

  it('does not report files that cannot match each other, or a type-wide export in a directory', () => {
    expect(
      findCollisions([
        call('a.test.js', 1, 'agent', 'a.agent.json', null),
        call('b.test.js', 1, 'idm', 'b.idm.json', null),
        call('c.test.js', 1, 'idm', null, null),
        call('d.test.js', 1, 'agent', null, 'dirD'),
      ]).map((p) => `${p.problem} ${p.files.join(' ')}`)
    ).toEqual(['overlap b.test.js c.test.js']);
  });

  it('lets a pair that is on the allowed list pass, whatever the collision is', () => {
    const calls = [
      call('a.test.js', 1, 'saml', null, null),
      call('b.test.js', 1, 'saml', 'x.cot.saml.json', null),
      call('a.test.js', 2, null, null, 'testDir9'),
      call('b.test.js', 2, null, null, 'testDir9'),
    ];
    expect(findCollisions(calls)).toHaveLength(2);
    expect(
      findCollisions(calls, [
        { files: ['b.test.js', 'a.test.js'], reason: 'known and tracked' },
      ])
    ).toEqual([]);
  });

  it('does not let an allowed pair hide another pair', () => {
    const problems = findCollisions(
      [
        call('a.test.js', 1, null, null, 'testDir9'),
        call('b.test.js', 1, null, null, 'testDir9'),
        call('c.test.js', 1, null, null, 'testDir9'),
      ],
      [{ files: ['a.test.js', 'b.test.js'], reason: 'known' }]
    );
    expect(problems.map((p) => p.files.join(' '))).toEqual([
      'a.test.js c.test.js',
      'b.test.js c.test.js',
    ]);
  });

  it('fails an allowed pair that no longer collides (stale), naming both files', () => {
    const problems = findCollisions(
      [
        call('a.test.js', 1, null, null, 'dirA'),
        call('b.test.js', 1, null, null, 'dirB'),
      ],
      [{ files: ['a.test.js', 'b.test.js'], reason: 'known' }]
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      problem: 'stale',
      files: ['a.test.js', 'b.test.js'],
    });
    expect(problems[0].message).toContain('no longer');
  });

  it('fails an allowed pair without a reason or with one file only', () => {
    const calls = [
      call('a.test.js', 1, null, null, 'testDir9'),
      call('b.test.js', 1, null, null, 'testDir9'),
    ];
    expect(
      findCollisions(calls, [
        { files: ['a.test.js', 'b.test.js'], reason: ' ' },
      ]).map((p) => p.problem)
    ).toEqual(['directory', 'allowlist']);
    expect(
      findCollisions(calls, [
        { files: ['a.test.js', 'a.test.js'], reason: 'x' },
      ]).map((p) => p.problem)
    ).toEqual(['directory', 'allowlist']);
  });
});

describe('the e2e tests', () => {
  const names = fs
    .readdirSync(E2E)
    .filter((name) => name.endsWith('.test.js'))
    .sort();
  const calls = names.flatMap((name) =>
    collectExportCalls(fs.readFileSync(path.join(E2E, name), 'utf8'), name)
  );

  it('are read in full: every file, every call of testExport', () => {
    const files = new Set(calls.map((c) => c.file));
    console.info(
      `E2eOutputNames: ${calls.length} testExport calls in ${files.size} of ${names.length} e2e test files`
    );
    // Floors, not exact counts: a scan that finds nothing must fail, adding a test must not.
    expect(names.length).toBeGreaterThanOrEqual(290);
    expect(calls.length).toBeGreaterThanOrEqual(350);
    expect(files.size).toBeGreaterThanOrEqual(70);
  });

  it('never write to a place that another test file also writes to', () => {
    const problems = findCollisions(calls, ALLOWED);
    expect(problems.map((p) => p.message)).toEqual([]);
  });
});
