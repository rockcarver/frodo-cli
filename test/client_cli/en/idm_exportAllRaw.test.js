import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo idm exportAllRaw --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm exportAllRaw' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo idm exportAllRaw [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm exportAllRaw' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Export all IDM configuration objects into separate JSON files in a directory specified by <directory>
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAllRaw argument host' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
    host                Access Management base URL, e.g.:
                        https://cdk.iam.example.com/am. To use a connection
                        profile, just specify a unique substring.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  host               ',
      '  user              '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAllRaw argument user' description should be expected english multiline", async () => {
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

test("CLI help interface 'exportAllRaw argument password' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        password                     Password.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('password'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'exportAllRaw option -D, --directory <directory>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -D, --directory <directory>  Directory for exporting all configuration
                                     entities to.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -D, --directory <directory>  ',
      '  -k, --insecure               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAllRaw option -k, --insecure' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -k, --insecure              Allow insecure connections when using SSL/TLS
                                    (default: Don't allow insecure connections)
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -k, --insecure               ',
      '  -h, --help         '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});
