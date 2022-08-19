import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo connections --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'connections' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo conn|connection [options] [command]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test('CLI help interface connections description at line 2 should be expected english', async () => {
  // Arrange
  const expected = `
        Manage connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'list' description should be expected english", async () => {
  // Arrange
  const expected = `
  list            List connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'delete' description should be expected english", async () => {
  // Arrange
  const expected = `
  delete          Delete connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('delete'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
