import cp from 'child_process';
import { promisify } from 'util';
import {
  crudeMultilineTakeUntil,
  collapseWhitespace,
  node14Compatibility,
} from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo info --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'info' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo info [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Print versions and tokens.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info argument host' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        host               Access Management base URL, e.g.:
                           https://cdk.iam.example.com/am. To use a connection profile,
                           just specify a unique substring.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host               ',
      '  user               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info argument user' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        user               Username to login with. Must be an admin user with appropriate
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

test("CLI help interface 'info argument password' description should be expected english", async () => {
  // Arrange
  const expected = `
  password              Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info Options -m, --type' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    -m, --type <type>   Override auto-detected deployment type. Valid values for type:
                        classic:  A classic Access Management-only deployment with
                        custom layout and configuration.
                        cloud:    A ForgeRock Identity Cloud environment.
                        forgeops: A ForgeOps CDK or CDM deployment.
                        The detected or provided deployment type controls certain
                        behavior like obtaining an Identity Management admin token or
                        not and whether to export/import referenced email templates or
                        how to walk through the tenant admin login flow of Identity
                        Cloud and handle MFA (choices: "classic", "cloud", "forgeops")
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

test("CLI help interface 'info Options -k, --insecure' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -k, --insecure Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability. (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure        ',
      '  --verbose             '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info option --verbose' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --verbose             Verbose output during command execution. If specified, may or may not produce additional output.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --verbose             ',
      '  --debug               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info option --debug' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --debug               Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --debug               ',
      '  --curlirize           '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info option --curlirize' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    --curlirize           Output all network calls in curl format.
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --curlirize           ',
      '  -s, --scriptFriendly  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'info option -s, --scriptFriendly' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -s, --scriptFriendly  Send output of operation to STDOUT in a script-friendly format (JSON) which can
  be piped to other commands. User messages/warnings are output to STDERR, and are
  not piped. For example, to only get bearer token:
  <<< frodo info my-tenant -s 2>/dev/null | jq -r .bearerToken >>> (default: Output
  as plain text)
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -s, --scriptFriendly  ',
      '  -h, --help            '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});
