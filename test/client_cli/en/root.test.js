import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);
const CMD = 'frodo --help';
const { stdout } = await exec(CMD);

test("CLI help interface 'connection' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
  conn|connection                          Manage connection profiles.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('conn'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'info' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        info [options] <host> [user] [password]  Print versions and tokens.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('info'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'journey' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        journey                                  Manage journeys/trees.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('journey'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'script' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        script                                   Manage scripts.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('script'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'idm' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
        idm                                      Manage IDM configuration.
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('idm'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});

test("CLI help interface 'logs' description should be expected english", async () => {
  // Arrange
  const expectedDescription = `
  logs                                     List/View Identity Cloud logs
    `.trim();
  // Act
  const testLine = stdout
    .split(/\n/)
    .find((line) => line.trim().startsWith('logs'))
    .trim();
  // Assert
  expect(testLine).toBe(expectedDescription);
});
