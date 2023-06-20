import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { writeFileSync, rmSync } from 'fs';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};

const jwkFile = 'test/fs_tmp/conn-save-jwk.json';

beforeAll(() => {
  writeFileSync(jwkFile, c.saJwk);
});

afterAll(() => {
  rmSync(jwkFile);
});

describe('frodo conn save', () => {
  test(`"frodo conn save ${c.host} ${c.user} ${c.pass}": save new connection profile with existing service account and without admin account.`, async () => {
    const CMD = `frodo conn save ${c.host} ${c.user} ${c.pass}`;
    const { stderr } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  });

  test(`"frodo conn save --sa-id ${c.saId} --sa-jwk-file ${jwkFile} ${c.host}": save new connection profile with existing service account and without admin account.`, async () => {
    const CMD = `frodo conn save --sa-id ${c.saId} --sa-jwk-file ${jwkFile} ${c.host}`;
    const { stderr } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  });
});
