import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};

describe('frodo journey list', () => {
  test('"frodo journey list": should list the names of the default journeys', async () => {
    const CMD = `frodo journey list  ${c.host} ${c.realm} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo journey list -l": should list the names, status, and tags of the default journeys', async () => {
    const CMD = `frodo journey list -l  ${c.host} ${c.realm} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test('"frodo journey list --long": should list the names, status, and tags of the default journeys', async () => {
    const CMD = `frodo journey list --long  ${c.host} ${c.realm} ${c.user} ${c.pass}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
});
