import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo email_templates --help';
const { stdout } = await exec(CMD);

test("CLI help interface for 'email_templates' Usage should be expected english", async () => {
  // Arrange
  const expected = `
        Usage: frodo email_templates [options] [command]
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
        list [options] <host> [user] [password]    List all the email templates in the system.
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
        export [options] <host> [user] [password]  Export email templates.
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
        import [options] <host> [user] [password]  Import email template.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('import'))
    .trim();
  // Assert
  expect(testLine).toBe(expected);
});
