import cp from 'child_process';
import { promisify } from 'util';
import {
  crudeMultilineTakeUntil,
  collapseWhitespace,
  node14Compatibility,
} from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo idm export --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm export' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo idm export [options] <host> [realm] [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm export' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
  Export IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument host' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  host                                 Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile,
  just specify a unique substring.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host                                 ',
      '  realm                                '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument user' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  user                                 Username to login with. Must be an admin user with appropriate rights to manage authentication
  journeys/trees.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  user                                 ',
      '  password                             '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export argument password' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
  password                             Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'export option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -k, --insecure                       Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for
  https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability.
  (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure                       ',
      '  --verbose                            '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option --verbose' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --verbose                            Verbose output during command execution. If specified, may or may not produce additional output.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --verbose                            ',
      '  --debug                              '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option --debug' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  --debug                              Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --debug                              ',
      '  --curlirize                          '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option --curlirize' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    --curlirize                          Output all network calls in curl format.
      `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  --curlirize                          ',
      '  -N, --name <name>                    '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -N, --name <name>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -N, --name <name>                    Config entity name. E.g. "managed", "sync", "provisioner-<connector-name>", etc.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -N, --name <name>  ',
      '  -f, --file [file]  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -f, --file <file>' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -f, --file [file]                    Export file. Ignored with -A.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -f, --file [file]                    ',
      '  -E, --entities-file [entities-file]  '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -E, --entities-file [entities-file]' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -E, --entities-file [entities-file]  Name of the entity file. Ignored with -A.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -E, --entities-file [entities-file]  ',
      '  -e, --env-file [envfile]             '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -e, --env-file [envfile]' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -e, --env-file [envfile]             Name of the env file. Ignored with -A.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -e, --env-file [envfile]             ',
      '  -a, --all                            '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -a, --all' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -a, --all                            Export all IDM configuration objects into a single file in directory
                                       -D. Ignored with -N.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      ' -a, --all                            ',
      ' -A, --all-separate                   '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -A, --allSeparate' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -A, --all-separate                   Export all IDM configuration objects into separate JSON files in
                                       directory -D. Ignored with -N, and -a.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -A, --all-separate                   ',
      '  -D, --directory <directory>          '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'export option -D, --directory <directory>' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  -D, --directory <directory>          Export directory. Required with and ignored without -a/-A.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -D, --directory <directory>          ',
      '  -h, --help                           '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});
