import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo email template --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'email_templates' Usage should be expected english", async () => {
  // Arrange
  const expected = `
  Usage: frodo email template [options] [command]
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('Usage:'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'email_templates' description at line 2 should be expected english", async () => {
  // Arrange
  const expected = `
        Manage email templates.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .map((line) => line.trim())
    .at(2);
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'email_templates commands list' description should be expected english", async () => {
  // Arrange
  const expected = `
  list            List email templates.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('list'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'email_templates commands export' description should be expected english", async () => {
  // Arrange
  const expected = `
  export          Export email templates.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('export'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});

test("CLI help interface 'email_templates commands import' description should be expected english", async () => {
  // Arrange
  const expected = `
  import          Import email templates.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('import'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
