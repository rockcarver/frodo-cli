import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo idm exportAll --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm exportAll' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo idm exportAll [options] <host> [user] [password]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm exportAll' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Export all IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAll argument host' description should be expected english multiline", async () => {
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

test("CLI help interface 'exportAll argument user' description should be expected english multiline", async () => {
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

test("CLI help interface 'exportAll argument password' description should be expected english", async () => {
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

test("CLI help interface 'exportAll option -D, --directory <directory>' description should be expected english multiline", async () => {
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
      '  -E, --entitiesFile <file>    '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAll option   -E, --entitiesFile <file>    ' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -E, --entitiesFile <file>    JSON file that specifies the config entities to
                                     export/import.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -E, --entitiesFile <file>    ',
      '  -e, --envFile <file>         '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAll option -e, --envFile <file>' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        -e, --envFile <file>         File that defines environment specific
                                     variables for replacement during configuration
                                     export/import.
    `);
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  -e, --envFile <file>         ',
      '  -k, --insecure               '
    )
  );

  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'exportAll option -k, --insecure' description should be expected english multiline", async () => {
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
