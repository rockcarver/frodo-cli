import cp from 'child_process';
import { promisify } from 'util';
import {
  node14Compatibility,
  crudeMultilineTakeUntil,
  collapseWhitespace,
} from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo email template import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'email_templates import' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo email template import [options] <host> [realm] [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'email_templates import' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Import email templates.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import argument host' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  host Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring. realm Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise. (default: "alpha" for Identity Cloud tenants, "/" otherwise.)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host               ',
      '  user           '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import argument user' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        user                     Username to login with. Must be an admin user with appropriate
                                 rights to manage authentication journeys/trees.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  user               ',
      '  password           '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import argument password' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
  password                         Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'import option -m, --type <type>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -m, --type <type>  Override auto-detected deployment type. Valid values for
                       type:
                       classic:  A classic Access Management-only deployment
                       with custom layout and configuration.
                       cloud:    A ForgeRock Identity Cloud environment.
                       forgeops: A ForgeOps CDK or CDM deployment.
                       The detected or provided deployment type controls certain
                       behavior like obtaining an Identity Management admin
                       token or not and whether to export/import referenced
                       email templates or how to walk through the tenant admin
                       login flow of Identity Cloud and handle MFA (choices:
                       "classic", "cloud", "forgeops")
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -m, --type <type>  ',
      '  -k, --insecure     '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -k, --insecure Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability. (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure                   ',
      '  --verbose                        '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option --verbose' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --verbose                        Verbose output during command execution. If specified, may or may not produce additional output.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --verbose                        ',
      '  --debug                          '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option --debug' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --debug                          Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --debug                          ',
      '  --curlirize                      '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option --curlirize' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    --curlirize                      Output all network calls in curl format.
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --curlirize                      ',
      '  -i, --template-id <template-id>  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option -i, --template-id' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -i, --template-id <template-id>  Email template id/name. If specified, -a and -A are ignored.
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -i, --template-id <template-id>  ',
      '  -f, --file <file>                '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option -f, --file <file>' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -f, --file <file>                Name of the import file.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -f, --file <file>                ',
      '  -a, --all                        '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option -a, --all' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -a, --all                        Import all email templates from single file. Ignored with -i.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -a, --all                        ',
      '  -A, --all-separate               '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import option -A, --all-separate' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -A, --all-separate               Import all email templates from separate files (*.template.email.json) in
  the current directory. Ignored with -i or -a.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -A, --all-separate               ',
      '  -h, --help                       '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});
