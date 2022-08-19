// import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * delete all themes and import baseline and additional test themes
 */
beforeAll(async () => {
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

  // import baseline themes
  const importBaselineThemesCmd = spawnSync(
    'frodo',
    ['theme', 'import', '--all-separate', 'frodo-dev'],
    {
      cwd: `test/e2e/theme/baseline`,
    }
  );
  if (importBaselineThemesCmd.status > 0) {
    console.error(importBaselineThemesCmd.stderr.toString());
    console.log(importBaselineThemesCmd.stdout.toString());
  }
});

describe('frodo theme list', () => {
  it('"frodo theme list": should list the names of the default themes', (done) => {
    const themeList = spawn('frodo', ['theme', 'list', 'frodo-dev']);
    const expected = [
      'Contrast',
      'Highlander',
      'Robroy',
      'Starter Theme',
      'Zardoz',
      '',
    ].join('\n');

    const chunks = [];
    themeList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    themeList.stdout.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toBe(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  const expectedLong = [
    'Name         │Id                                  │Default',
    'Contrast     │cd6c93e2-52e2-4340-9770-66a588343841│       ',
    'Highlander   │00203891-dde0-4114-b27a-219ae0b43a61│       ',
    'Robroy       │b82755e8-fe9a-4d27-b66b-45e37ae12345│       ',
    'Starter Theme│86ce2f64-586d-44fe-8593-b12a85aac68d│Yes    ',
    'Zardoz       │4ded6d91-ceea-400a-ae3f-42209f1b0e06│       ',
    '',
  ].join('\n');

  it('"frodo theme list -l": should list the names, ids, and default flag of the baseline themes', (done) => {
    const themeList = spawn('frodo', ['theme', 'list', '-l', 'frodo-dev']);

    const chunks = [];
    themeList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    themeList.stdout.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toBe(expectedLong);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('"frodo theme list --long": should list the names, status, and default flag of the baseline themes', (done) => {
    const themeList = spawn('frodo', ['theme', 'list', '--long', 'frodo-dev']);

    const chunks = [];
    themeList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    themeList.stdout.on('end', () => {
      const output = Buffer.concat(chunks)
        .toString()
        .replace(ansiEscapeCodes, '');
      try {
        expect(output).toBe(expectedLong);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
