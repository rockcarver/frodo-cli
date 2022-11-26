/* eslint-disable no-console */
import { spawn } from 'child_process';

process.env['FRODO_MOCK'] = 'ON';
const env = {
  env: process.env,
};

const host = 'https://openam-frodo-dev.forgeblocks.com/am';
const user = 'volker.scheuber@forgerock.com';
const pass = 'Sup3rS3cr3t!';
// const realm = 'alpha';

describe('frodo info', () => {
  test('"frodo info": should display cookie name, session id, and access token', (done) => {
    const info = spawn('frodo', ['info', `${host}`, `${user}`, `${pass}`], env);

    const chunks: Uint8Array[] = [];

    info.stderr.on('data', (chunk) => {
      chunks.push(chunk);
    });

    info.stderr.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toMatchSnapshot();
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  test('"frodo info -s": should output cookie name, session id, and access token in json', (done) => {
    const info = spawn(
      'frodo',
      ['info', '-s', `${host}`, `${user}`, `${pass}`],
      env
    );

    const chunks: Uint8Array[] = [];

    info.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    info.stdout.on('end', () => {
      const output = Buffer.concat(chunks).toString();
      try {
        expect(output).toMatchSnapshot();
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  test('"frodo info --scriptFriendly": should output cookie name, session id, and access token in json', (done) => {
    const info = spawn(
      'frodo',
      ['info', '--scriptFriendly', `${host}`, `${user}`, `${pass}`],
      env
    );

    const chunks: Uint8Array[] = [];

    info.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    info.stdout.on('end', () => {
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
