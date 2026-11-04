import { frodo } from '@rockcarver/frodo-lib';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { exportIdmRemoteProxyConfig } from '../../../ops/ConfigManagerRemoteProxyOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull remote-proxy',
    [],
    deploymentTypes
  );

  program
    .description('Export IDM remote proxy configuration.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Export IDM remote proxy configuration after logging in with the AM base URL, realm, username, and password:\n` +
        c.command(
          `  $ frodo config-manager pull remote-proxy ${s.amBaseUrl} ${s.realm} ${s.username} '${s.password}'\n`
        )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (!(await getTokens(false, true, deploymentTypes))) {
        process.exitCode = 1;
        return;
      }

      verboseMessage('Exporting IDM remote proxy configuration.');
      if (!(await exportIdmRemoteProxyConfig())) process.exitCode = 1;
    });

  return program;
}
