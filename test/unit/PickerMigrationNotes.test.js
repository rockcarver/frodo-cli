import fs from 'fs';

/**
 * Record 0048: every change a user can see is listed in MIGRATION.md in the
 * pull request that makes it. The finished entity pickers (frodo-cli#1081)
 * changed what four commands say when they cannot tell what to act on, and
 * what a terminal is asked. The entries must name the commands, the release and
 * the exact errors, so that a reworded error, which the terminal and command
 * line tests of these commands catch, is also fixed in the guide.
 */
const migration = fs.readFileSync(
  new URL('../../MIGRATION.md', import.meta.url),
  'utf8'
);
// the table escapes the pipes of the messages it quotes
const text = migration.replace(/\\\|/g, '|');
const [upgrading5] = text.split('## Upgrading to 4.x');

const ERRORS = [
  "error: one of '-i, --id <id> | -a, --all' is required to choose what to delete",
  "error: one of '-a, --all | -A, --all-separate | -i, --policy-id <policy-id>' is required to choose what to export",
  "error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --aliases <aliases>' are required to choose the mapping to create",
  "error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --alias <alias>' are required to choose the alias to create",
];

describe('MIGRATION.md, the entity pickers of frodo-cli#1081', () => {
  test.each(ERRORS)('quotes the error %s in the 5.x section', (error) => {
    expect(upgrading5).toContain(error);
  });

  test('names the four commands, what to use instead and the release', () => {
    for (const command of [
      '`service delete`',
      '`authz policy export --set-id <set>`',
      '`secretstore mapping create`',
      '`secretstore mapping alias create`',
    ]) {
      expect(upgrading5).toContain(command);
    }
    expect(upgrading5).toMatch(/Name the service with `-i`, or delete all/);
    expect(upgrading5).toMatch(/add `-a` or `-A`, or name one policy/);
    expect(upgrading5).toMatch(/From 5\.0\.0-26 this holds for these/);
  });

  test('says what changed on a terminal, and that it is interactive mode only', () => {
    expect(upgrading5).toMatch(
      /\*\*On a terminal, the last options get a picker \(interactive mode only\)\*\*/
    );
    for (const sentence of [
      '`conn service-account describe` and `remove` no longer ask for\n`--name` as free text',
      'There is no secret to choose from.',
      'There is no service to choose from.',
      'asks for every option\nthat is missing, not for one of them',
    ]) {
      expect(upgrading5).toContain(sentence);
    }
  });
});
