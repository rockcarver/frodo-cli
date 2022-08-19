// import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Run once before running the suites in this file
 */
beforeAll(async () => {});

/**
 * Run before every test in every suite in this file
 */
beforeEach(async () => {
  // delete all themes
  const deleteThemesCmd = spawnSync('frodo', [
    'theme',
    'delete',
    '--all',
    'frodo-dev',
  ]);
  if (deleteThemesCmd.status > 0) {
    console.error(deleteThemesCmd.stderr.toString());
    console.log(deleteThemesCmd.stdout.toString());
  }

  // import test themes
  const importTestThemesCmd = spawnSync(
    'frodo',
    ['theme', 'import', '--all-separate', 'frodo-dev'],
    {
      cwd: `test/e2e/theme/baseline`,
    }
  );
  if (importTestThemesCmd.status > 0) {
    console.error(importTestThemesCmd.stderr.toString());
    console.log(importTestThemesCmd.stdout.toString());
  }
});

describe('frodo theme delete', () => {
  it('"frodo theme delete -n Zardoz": should delete the Zardoz theme', (done) => {
    const deleteThemeCmd = spawn('frodo', [
      'theme',
      'delete',
      '-n',
      'Zardoz',
      'frodo-dev',
    ]);
    const expected = ['✔ Deleted Zardoz.', ''].join('\n');
    const chunks = [];
    deleteThemeCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteThemeCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo theme delete -n DoesNotExist": should report an error that the theme does not exist', (done) => {
    const deleteThemeCmd = spawn('frodo', [
      'theme',
      'delete',
      '-n',
      'DoesNotExist',
      'frodo-dev',
    ]);
    const expected = ['✖ Error: DoesNotExist not found', ''].join('\n');
    const chunks = [];
    deleteThemeCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteThemeCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo theme delete -i 4ded6d91-ceea-400a-ae3f-42209f1b0e06": should delete the 4ded6d91-ceea-400a-ae3f-42209f1b0e06 (Zardoz) theme', (done) => {
    const deleteThemeCmd = spawn('frodo', [
      'theme',
      'delete',
      '-i',
      '4ded6d91-ceea-400a-ae3f-42209f1b0e06',
      'frodo-dev',
    ]);
    const expected = [
      '✔ Deleted 4ded6d91-ceea-400a-ae3f-42209f1b0e06.',
      '',
    ].join('\n');
    const chunks = [];
    deleteThemeCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteThemeCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo theme delete -i 4ded6d91-ceea-400a-ae3f-42209f1b0e07": should report an error that the theme does not exist', (done) => {
    const deleteThemeCmd = spawn('frodo', [
      'theme',
      'delete',
      '-i',
      '4ded6d91-ceea-400a-ae3f-42209f1b0e07',
      'frodo-dev',
    ]);
    const expected = [
      '✖ Error: 4ded6d91-ceea-400a-ae3f-42209f1b0e07 not found',
      '',
    ].join('\n');
    const chunks = [];
    deleteThemeCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteThemeCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo theme delete -a": should delete all themes', (done) => {
    const deleteThemeCmd = spawn('frodo', [
      'theme',
      'delete',
      '-a',
      'frodo-dev',
    ]);
    const expected = ['✔ Deleted all realm themes.', ''].join('\n');
    const chunks = [];
    deleteThemeCmd.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });
    deleteThemeCmd.stderr.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toContain(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
