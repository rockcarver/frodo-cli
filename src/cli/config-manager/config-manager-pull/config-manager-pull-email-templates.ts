import { frodo } from '@rockcarver/frodo-lib';
import { configManagerExportEmailTemplates } from '../../../configManagerOps/FrConfigEmailTemplatesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config pull email-templates',
    [],
    deploymentTypes
  );

  program
    .description('Export email-templates objects.')
    .addOption(
      selectorOption(
        '-i, --template-id <id>',
        'Email template id. If specified, only exports the email template with the specified id.',
        ['-n', '--name']
      )
    )
    .multiOp()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting email templates');
        const outcome = await configManagerExportEmailTemplates(
          options.templateId,
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
