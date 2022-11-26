import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = 'ON';
const env = {
  env: process.env,
};

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

const host = 'https://openam-frodo-dev.forgeblocks.com/am';
const user = 'volker.scheuber@forgerock.com';
const pass = 'Sup3rS3cr3t!';
const realm = 'alpha';

describe('frodo journey list', () => {
  test('"frodo journey list": should list the names of the default journeys', async () => {
    const CMD = `frodo journey list  ${host} ${realm} ${user} ${pass}`;
    const { stdout } = await exec(CMD, env);
    expect(stdout.replace(ansiEscapeCodes, '')).toMatchSnapshot();
  });

  test('"frodo journey list -l": should list the names, status, and tags of the default journeys', async () => {
    const CMD = `frodo journey list -l  ${host} ${realm} ${user} ${pass}`;
    const { stdout } = await exec(CMD, env);
    expect(stdout.replace(ansiEscapeCodes, '')).toMatchSnapshot();
  });

  test('"frodo journey list --long": should list the names, status, and tags of the default journeys', async () => {
    const CMD = `frodo journey list --long  ${host} ${realm} ${user} ${pass}`;
    const { stdout } = await exec(CMD, env);
    expect(stdout.replace(ansiEscapeCodes, '')).toMatchSnapshot();
  });
});
