import * as s from '../../help/SampleData';
import c, { type CliIntent } from '../../utils/ColorTheme';
import {
  createObjectTable,
  createTable,
  errorMessage,
  infoMessage,
  printMessage,
  successMessage,
  warnMessage,
} from '../../utils/Console';
import {
  getActiveBackground,
  getActiveContrast,
  getActiveThemeDefinition,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

const PREVIEW_INTENTS: CliIntent[] = [
  'error',
  'warning',
  'positive',
  'negative',
  'command',
  'emphasis',
  'heading',
  'muted',
  'debug',
];

function flag(value: 'yes' | 'no'): string {
  return value === 'yes' ? c.positive(value) : c.negative(value);
}

/**
 * Renders one of each realistic frodo-cli output shape -- an object/describe
 * table, a schema property table, a status list, and every message type --
 * on top of the bare per-intent color swatches above, so every intent shows
 * up the way it actually looks in real command output, not just in
 * isolation. This is the best way to actually judge whether a theme works
 * on a given terminal background: run `show` under it and look.
 */
function renderRealisticSample(): void {
  const objectSample = {
    name: s.managedObjectTitle,
    type: s.managedObjectType,
    icon: s.managedObjectIcon,
    connection: {
      host: s.amBaseUrl,
      realm: s.realm,
    },
  };
  const objectTable = createObjectTable(objectSample, {
    name: 'Name',
    type: 'Type',
    icon: 'Icon',
    connection: 'Connection',
    host: 'Host URL',
    realm: 'Realm',
  });
  printMessage(`\n${objectTable.toString()}`);

  const propertyTable = createTable([
    'Name',
    'Title',
    'Type',
    'NUL',
    'REQ',
    'SRH',
    'UED',
    'VIW',
  ]);
  propertyTable.push(
    [
      s.propertyName,
      'Max Crew',
      'number',
      flag('no'),
      flag('yes'),
      flag('yes'),
      flag('yes'),
      flag('yes'),
    ],
    [
      s.arrayPropertyName,
      'Callsigns',
      'string[]',
      flag('yes'),
      flag('no'),
      flag('yes'),
      flag('no'),
      flag('yes'),
    ]
  );
  printMessage(`\n${propertyTable.toString()}`);

  const statusTable = createTable(['Journey', 'Status', 'Must Run']);
  statusTable.push(
    ['Login', c.positive('active'), c.warning('yes')],
    ['Legacy', c.negative('inactive'), c.positive('no')]
  );
  printMessage(`\n${statusTable.toString()}`);

  printMessage('');
  successMessage(
    `Exported realm ${c.emphasis(s.realm)} to ${c.emphasis(s.saJwkFile)}.`
  );
  infoMessage(`Connecting to ${c.emphasis(s.amBaseUrl)}...`);
  warnMessage(
    `Property ${c.emphasis(s.propertyName)} is deprecated and will be removed in a future release.`
  );
  errorMessage(
    `Could not delete managed object type ${c.emphasis(s.managedObjectType)}.`
  );
  printMessage(c.debug(`[DEBUG] Resolved connection profile for ${s.connId}.`));
  printMessage(
    c.command(`  $ frodo idm schema object describe ${s.managedObjectType}`)
  );
}

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme show',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      "Show the active color theme, a preview of each intent's color, and a sample of realistic frodo-cli output (tables, messages) -- the best way to check whether a theme actually works on your terminal's background."
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      const def = getActiveThemeDefinition();
      printMessage(
        `Background: ${c.heading(getActiveBackground())}  Contrast: ${c.heading(getActiveContrast())}  Theme: ${def.name}`,
        'data'
      );
      printMessage(def.description, 'data');
      printMessage('', 'data');
      const table = createTable(['Intent', 'Preview']);
      for (const intent of PREVIEW_INTENTS) {
        table.push([intent, c[intent](intent)]);
      }
      printMessage(table.toString(), 'data');
      renderRealisticSample();
    });

  return program;
}
