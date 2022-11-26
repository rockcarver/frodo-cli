/* eslint-disable no-console */
import { spawn } from 'child_process';

process.env['FRODO_MOCK'] = 'ON';
const env = {
  env: process.env,
};

describe('frodo journey list', () => {
  test('"frodo journey list": should list the names of the default journeys', (done) => {
    const journeyList = spawn('frodo', ['journey', 'list', 'frodo-dev'], env);

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toMatchSnapshot();
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  test('"frodo journey list -l": should list the names, status, and tags of the default journeys', (done) => {
    const journeyList = spawn(
      'frodo',
      ['journey', 'list', '-l', 'frodo-dev'],
      env
    );

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toMatchSnapshot();
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  test('"frodo journey list --long": should list the names, status, and tags of the default journeys', (done) => {
    const journeyList = spawn(
      'frodo',
      ['journey', 'list', '--long', 'frodo-dev'],
      env
    );

    const chunks: Uint8Array[] = [];
    journeyList.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    journeyList.stdout.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toMatchSnapshot();
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
