import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo idm importAll --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm importAll' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo idm importAll [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm importAll' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Import all IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'importAll argument host' description should be expected english multiline", async () => {
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

test("CLI help interface 'importAll argument user' description should be expected english multiline", async () => {
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

test("CLI help interface 'importAll argument password' description should be expected english", async () => {
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

test("CLI help interface 'importAll option -k, --insecure' description should be expected english multiline", async () => {
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
