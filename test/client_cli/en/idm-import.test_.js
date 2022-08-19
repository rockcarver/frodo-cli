import cp from 'child_process';
import { promisify } from 'util';
import {
  crudeMultilineTakeUntil,
  collapseWhitespace,
  node14Compatibility,
} from '../utils/utils.js';

node14Compatibility();

const exec = promisify(cp.exec);
const CMD = 'frodo idm import --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm import' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo idm import [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm import' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Import an IDM configuration object.
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
        host                Access Management base URL, e.g.:
                            https://cdk.iam.example.com/am. To use a connection
                            profile, just specify a unique substring.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  host           ', '  user           ')
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import argument user' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        user            Username to login with. Must be an admin user with
                        appropriate rights to manage authentication journeys/trees.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  user            ', '  password        ')
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'import argument password' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        password        Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'import option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -k, --insecure              Allow insecure connections when using SSL/TLS
                                    (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  -k, --insecure  ', '  -h, --help      ')
  );

  // Assert
  expect(testLine).toBe(expected);
});
