import fs from 'fs';
import { Command, Option } from 'commander';
import { Authenticate, Journey, state } from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';

const { getTokens } = Authenticate;
const { listJourneys, exportTree, describeTree } = Journey;

const program = new Command('frodo journey describe');

program
  .description(
    'If -h is supplied, describe the journey/tree indicated by -i, or all journeys/trees in the realm if no -i is supplied, otherwise describe the journey/tree export file indicated by -f.'
  )
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgumentM)
  .addArgument(common.realmArgument)
  .addArgument(common.userArgument)
  .addArgument(common.passwordArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(
    new Option(
      '-i, --journey-id <journey>',
      'Name of a journey/tree. If specified, -a and -A are ignored.'
    )
  )
  .addOption(
    new Option(
      '-f, --file <file>',
      'Name of the file to write the exported journey(s) to. Ignored with -A.'
    )
  )
  // .addOption(
  //   new Option(
  //     '-o, --override-version <version>',
  //     "Override version. Notation: 'X.Y.Z' e.g. '7.1.0'. Override detected version with any version. This is helpful in order to check if journeys in one environment would be compatible running in another environment (e.g. in preparation of migrating from on-prem to ForgeRock Identity Cloud. Only impacts these actions: -d, -l."
  //   )
  // )
  .action(
    // implement command logic inside action handler
    async (host, realm, user, password, options) => {
      state.default.session.setTenant(host);
      state.default.session.setRealm(realm);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      // TODO: review checks for arguments
      if (typeof host === 'undefined' || typeof options.file !== 'undefined') {
        if (typeof options.file === 'undefined') {
          console.log(
            'You either need <host> or -f when using describe',
            'error'
          );
          return;
        }
        console.log(`Describing local journey file ${options.file}...`);
        try {
          const data = fs.readFileSync(options.file, 'utf8');
          const journeyData = JSON.parse(data);
          describeTree(journeyData);
        } catch (err) {
          console.log(err, 'error');
        }
      } else if (await getTokens()) {
        console.log(
          `Describing journey(s) in realm "${state.default.session.getRealm()}"...`
        );
        if (typeof options.journeyId === 'undefined') {
          const journeyList = await listJourneys(false);
          // createProgressBar(journeyList.length, '');
          for (const item of journeyList) {
            // eslint-disable-next-line no-await-in-loop
            const journeyData = await exportTree(item.name);
            describeTree(journeyData);
            // updateProgressBar(`Analyzing journey - ${item.name}`);
          }
          // stopProgressBar('Done');
        } else {
          const journeyData = await exportTree(options.journeyId);
          describeTree(journeyData);
        }
      }
    }
    // end command logic inside action handler
  );

program.parse();
