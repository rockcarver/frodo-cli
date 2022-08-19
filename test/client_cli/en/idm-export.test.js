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

test("CLI help interface 'count argument host' description should be expected english multiline", async () => {
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

test("CLI help interface 'count argument user' description should be expected english multiline", async () => {
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

test("CLI help interface 'count option -f, --file <file>' description should be expected english", async () => {
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
      '  -N, --name <name>                    '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});
