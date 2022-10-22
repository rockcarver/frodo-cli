/* eslint-disable no-console */
// import { jest } from '@jest/globals';
import { spawn, spawnSync } from 'child_process';

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * delete all journeys and import baseline and additional test journeys
 */
beforeAll(async () => {
  // delete all journeys
  const deleteJourneysCmd = spawnSync('frodo', [
    'journey',
    'delete',
    '--all',
    'frodo-dev',
  ]);
  if (deleteJourneysCmd.status && deleteJourneysCmd.status > 0) {
    console.error(deleteJourneysCmd.stderr.toString());
    console.log(deleteJourneysCmd.stdout.toString());
  }

  // import baseline journeys
  const importBaselineJourneysCmd = spawnSync(
    'frodo',
    ['journey', 'import', '--all-separate', 'frodo-dev'],
    {
      cwd: `test/e2e/journey/baseline`,
    }
  );
  if (
    importBaselineJourneysCmd.status &&
    importBaselineJourneysCmd.status > 0
  ) {
    console.error(importBaselineJourneysCmd.stderr.toString());
    console.log(importBaselineJourneysCmd.stdout.toString());
  }

  // import additional test journeys
  const importTestJourneysCmd = spawnSync(
    'frodo',
    ['journey', 'import', '--all-separate', 'frodo-dev'],
    {
      cwd: `test/e2e/journey/list`,
    }
  );
  if (importTestJourneysCmd.status && importTestJourneysCmd.status > 0) {
    console.error(importTestJourneysCmd.stderr.toString());
    console.log(importTestJourneysCmd.stdout.toString());
  }
});

describe('frodo journey list', () => {
  it('"frodo journey list": should list the names of the default journeys', (done) => {
    const journeyList = spawn('frodo', ['journey', 'list', 'frodo-dev']);
    const expected = [
      'Disabled',
      'ForgottenUsername',
      'Login',
      'PasswordGrant',
      'ProgressiveProfile',
      'Registration',
      'ResetPassword',
      'UpdatePassword',
      '',
    ].join('\n');

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toBe(expected);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  const expectedLong = [
    'Listing journeys in realm "alpha"...',
    'Name              │Status  │Tags               ',
    'Disabled          │disabled│Prototype          ',
    'ForgottenUsername │enabled │Username Reset     ',
    'Login             │enabled │Authentication     ',
    'PasswordGrant     │enabled │                   ',
    'ProgressiveProfile│enabled │Progressive Profile',
    'Registration      │enabled │Registration       ',
    'ResetPassword     │enabled │Password Reset     ',
    'UpdatePassword    │enabled │Password Reset     ',
    '',
  ].join('\n');

  it('"frodo journey list -l": should list the names, status, and tags of the default journeys', (done) => {
    const journeyList = spawn('frodo', ['journey', 'list', '-l', 'frodo-dev']);

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
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

  it('"frodo journey list --long": should list the names, status, and tags of the default journeys', (done) => {
    const journeyList = spawn('frodo', [
      'journey',
      'list',
      '--long',
      'frodo-dev',
    ]);

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
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
