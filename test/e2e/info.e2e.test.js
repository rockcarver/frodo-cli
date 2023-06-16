import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};

describe('frodo info', () => {
  test('"frodo info" (user): display env info, versions, and tokens', async () => {
    const CMD = `frodo info ${c.host} ${c.user} ${c.pass}`;
    const { stderr } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  });

  test('"frodo info --json" (user): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info --json ${c.host} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info -s" (user): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info -s ${c.host} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info --scriptFriendly" (user): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info --scriptFriendly ${c.host} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info" (service account): display env info, versions, and tokens', async () => {
    const CMD = `frodo info ${c.host}`;
    env.env.FRODO_SA_ID = c.saId;
    env.env.FRODO_SA_JWK = c.saJwk;
    const { stderr } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  });

  test('"frodo info --json" (service account): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info --json ${c.host}`;
    env.env.FRODO_SA_ID = c.saId;
    env.env.FRODO_SA_JWK = c.saJwk;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info -s" (service account): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info -s ${c.host}`;
    env.env.FRODO_SA_ID = c.saId;
    env.env.FRODO_SA_JWK = c.saJwk;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info --scriptFriendly" (service account): display env info, versions, and tokens in json', async () => {
    const CMD = `frodo info --scriptFriendly ${c.host}`;
    env.env.FRODO_SA_ID = c.saId;
    env.env.FRODO_SA_JWK = c.saJwk;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
});
