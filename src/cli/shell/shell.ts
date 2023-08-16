import { frodo } from '@rockcarver/frodo-lib';
import fuzzy from 'fuzzy';
import inquirer from 'inquirer';
import inquirerPrompt from 'inquirer-autocomplete-prompt';

import * as s from '../../help/SampleData';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const exits = ['exit', 'quit', 'q'];
const functions = frodo.utils.json.getPaths(frodo, 'this.');

function searchFunctions(_answers, input = '') {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results = fuzzy.filter(input, functions).map((el) => el.original);
      // results.splice(5, 0, new inquirer.Separator());
      // results.push(new inquirer.Separator());
      resolve(results);
    }, Math.random() * 470 + 30);
  });
}

export default function setup() {
  const program = new FrodoCommand('shell');
  program
    .description('Launch the frodo interactive shell.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Launch a frodo shell using explicit login parameters:\n` +
        `  $ frodo shell ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Launch a frodo shell using a connection profile (identified by the full AM base URL):\n` +
        `  $ frodo shell ${s.amBaseUrl}'\n`['brightCyan'] +
        `  Launch a frodo shell using a connection profile (identified by a unique substring of the AM base URL):\n` +
        `  $ frodo shell ${s.connId}'\n`['brightCyan']
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
      if (host) await getTokens();
      let exit = false;
      do {
        try {
          inquirer.registerPrompt('autocomplete', inquirerPrompt);
          const response = await inquirer.prompt([
            {
              type: 'autocomplete',
              prefix: '',
              name: 'command',
              message: '>',
              source: searchFunctions,
              suggestOnly: true,
            },
          ]);
          exit = exits.includes(response.command);
          // evaluate code with context
          if (!exit) {
            const result = await function (str: string) {
              return eval(str);
            }.call(frodo, `${response.command}`);
            printMessage(result, 'data');
          }
        } catch (error) {
          printMessage(error.response?.data, 'error');
          printMessage(`${error}`, 'error');
        }
      } while (!exit);
    });
  return program;
}
