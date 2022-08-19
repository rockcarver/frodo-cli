import cp from 'child_process';
import { promisify } from 'util';
import {
  crudeMultilineTakeUntil,
  collapseWhitespace,
  node14Compatibility,
} from '../utils/utils.js';

node14Compatibility();

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
  list            List all IDM configuration objects.
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
  export          Export IDM configuration objects.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('export'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'idm commands count' description should be expected english multiline", async () => {
  // Arrange
  const expected = collapseWhitespace(`
  count           Count number of managed objects of a given type.
    `).trim();
  // Act
  const testLine = collapseWhitespace(
    crudeMultilineTakeUntil(stdout, '  count           ', '  help [command]  ')
  );
  // Assert
  expect(testLine).toBe(expected);
});
