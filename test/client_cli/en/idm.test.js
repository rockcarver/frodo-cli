import cp from 'child_process';
import { promisify } from 'util';
import { crudeMultilineTakeUntil, collapseWhitespace } from '../utils/utils.js';

const exec = promisify(cp.exec);
const CMD = 'frodo idm --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'idm' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo idm [options] [command]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Manage IDM configuration.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
        list [options] <host> [user] [password]          List all IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands export' description should be expected english", async () => {
  // Arrange
  const expected = `
        export [options] <host> [user] [password]        Export an IDM configuration object.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('export'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands exportAllRaw' description should be expected english", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        exportAllRaw [options] <host> [user] [password]  Export all IDM configuration objects into
                                                         separate JSON files in a directory
                                                         specified by <directory>
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  exportAllRaw [options] <host> [user] [password]  ',
      '  exportAll [options] <host> [user] [password]     '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands exportAll' description should be expected english", async () => {
  // Arrange
  const expected = `
        exportAll [options] <host> [user] [password]     Export all IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) =>
      line
        .trim()
        .startsWith('exportAll [options] <host> [user] [password]     ')
    )
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands count' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
        count [options] <host> [user] [password]         Count number of managed objects of a given
    type.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(
      stdout,
      '  count [options] <host> [user] [password]         ',
      '  help [command]                                   '
    )
  );
  // Assert
  expect(testLine).toBe(expected);
});
