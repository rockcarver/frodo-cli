import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = 'ON';
const env = {
  env: process.env,
};

describe('frodo info', () => {
  test('"frodo info": should display cookie name, session id, and access token', async () => {
    const CMD = `frodo info ${c.host} ${c.user} ${c.pass}`;
    const { stderr } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  });

  test('"frodo info -s": should output cookie name, session id, and access token in json', async () => {
    const CMD = `frodo info -s ${c.host} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo info --scriptFriendly": should output cookie name, session id, and access token in json', async () => {
    const CMD = `frodo info --scriptFriendly ${c.host} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
});
