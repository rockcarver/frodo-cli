import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo script --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'script' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo script [options] [command]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'script' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Manage scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'script commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
  list            List scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'script commands export' description should be expected english", async () => {
  // Arrange
  const expected = `
  export          Export scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('export'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'script commands import' description should be expected english", async () => {
  // Arrange
  const expected = `
  import          Import scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('import'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
