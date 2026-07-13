import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import cp from 'child_process';
import tmp from 'tmp'

const exec = promisify(cp.exec);
const fspromise = fs.promises

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Remove ANSI escape codes
 * @param {string} text Text containing ANSI escape codes
 * @returns {string} Text without ANSI escape codes
 */
export function removeAnsiEscapeCodes(text) {
  return text ? text.replace(ansiEscapeCodes, '') : text;
}

/**
 * Mask random ForgeRock transaction IDs that make snapshots non-deterministic.
 * @param {string} text
 * @returns {string}
 */
export function maskTransactionIds(text) {
  if (!text) return text;
  return text.replace(
    /"x-forgerock-transactionid":\s*"frodo-[0-9a-f-]+"/g,
    '"x-forgerock-transactionid": "frodo-<transaction-id>"'
  );
}

/**
 * Mask frodo user-agent versions that change with package releases.
 * @param {string} text
 * @returns {string}
 */
export function maskUserAgentVersions(text) {
  if (!text) return text;
  return text.replace(
    /"user-agent":\s*"@rockcarver\/frodo-lib\/[^"]+"/g,
    '"user-agent": "@rockcarver/frodo-lib/<version>"'
  );
}

/**
 * Normalize absolute local/CI stack trace paths in snapshot text.
 * @param {string} text
 * @returns {string}
 */
export function normalizeStackPaths(text) {
  if (!text) return text;
  return text.replace(
    /\((?:\/Users\/[^)]+|\/home\/runner\/work\/[^)]+)(\/(?:dist\/app\.cjs|node_modules\/.+?@pollyjs\/adapter\/src\/index\.js):\d+:\d+)\)/g,
    '(<repo>$1)'
  );
}

/**
 * Normalize command output for stable snapshots across local and CI environments.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSnapshotText(text) {
  return normalizeStackPaths(
    maskUserAgentVersions(maskTransactionIds(removeAnsiEscapeCodes(text)))
  );
}

/**
 * Returns true when tests run in recording mode.
 * @returns {boolean}
 */
export function isRecordingMode() {
  return process.env['FRODO_MOCK'] === 'record';
}

/**
 * Print prefixed progress output in recording mode.
 * @param {string} message Log message
 * @param {boolean} [enabled=isRecordingMode()] Whether logging is enabled
 */
export function logRecordingProgress(message, enabled = isRecordingMode()) {
  if (enabled) {
    console.log(`[recording] ${message}`);
  }
}

/**
 * Execute a command and emit timing/progress logs in recording mode.
 * @param {string} command Command to execute
 * @param {{env: Record<string, string>}} options exec() options
 * @param {boolean} [enabled=isRecordingMode()] Whether progress logging is enabled
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function execWithRecordingProgress(
  command,
  options,
  enabled = isRecordingMode()
) {
  const startedAt = Date.now();
  logRecordingProgress(`START: ${command}`, enabled);
  try {
    const result = await exec(command, options);
    logRecordingProgress(
      `SUCCESS (${Date.now() - startedAt}ms): ${command}`,
      enabled
    );
    return result;
  } catch (error) {
    logRecordingProgress(
      `FAIL (${Date.now() - startedAt}ms): ${command}`,
      enabled
    );
    throw error;
  }
}

/**
 * Guard against accidentally snapshotting Polly replay/auth errors.
 * Returns de-ANSI-fied output text when no replay markers are present.
 * @param {string} output Command stdout/stderr
 * @param {string} command Command being validated
 * @param {string[]} [extraMarkers=[]] Additional marker substrings to detect
 * @returns {string}
 */
export function assertNoPollyReplayError(
  output,
  command,
  extraMarkers = []
) {
  const text = removePollyRecordingNoise(normalizeSnapshotText(output || ''));
  const markers = [
    '[Polly] [adapter:node-http] Recording for the following request is not found',
    'PollyError',
    'Error getting tokens',
    ...extraMarkers,
  ];
  const hasPollyReplayError = markers.some((marker) => text.includes(marker));
  if (hasPollyReplayError) {
    throw new Error(
      `Unexpected Polly replay error while running "${command}".\n` +
      'The test attempted to snapshot an error payload instead of command output.\n\n' +
      text
    );
  }
  return text;
}

/**
 * Remove verbose Polly record-mode diagnostics that are not command errors.
 * @param {string} text
 * @returns {string}
 */
export function removePollyRecordingNoise(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const filtered = lines.filter((line) => {
    if (line.startsWith('[Polly] Recording may fail because the browser is offline.')) {
      return false;
    }
    if (line.startsWith('{"url":"') && line.includes('"recordingName":')) {
      return false;
    }
    return true;
  });
  return filtered.join('\n').trim();
}

/**
 * Method that runs an export command and tests that it was executed correctly.
 * @param {string} command The export command to run
 * @param {{env: Record<string, string>}} env The environment variables
 * @param {string} type The type of the file(s), e.g. script, idp, etc.
 * @param {string | undefined} fileName The file name if exporting a single file. Leave undefined if exporting (potentially) multiple files.
 * @param {string} directory The path to the directory the export files are located in. Default is the current directory "./".
 * @param checkForMetadata If true, ensures that metadata exists in each export. Default: true
 * @param checkStderr
 * @returns {Promise<void>}
 */
export async function testExport(
  command,
  env,
  type,
  fileName,
  directory = './',
  checkForMetadata = true,
  checkStderr = false
) {
  const isCurrentDirectory = directory === './' || directory === '.';
  let stdout;
  let stderr;
  let exitCode = 0;
  let deleteExportDirectory = true;
  try {
    try {
      const output = await exec(command, env);
      stdout = output.stdout;
      stderr = output.stderr;
    } catch (e) {
      stdout = e.stdout;
      stderr = e.stderr;
      exitCode = e.code;
    }
    assertNoPollyReplayError(stdout, command);
    assertNoPollyReplayError(stderr, command);
    expect(exitCode).toMatchSnapshot();
    // console.error(`stdout:\n${stdout}`);
    // console.error(`stderr:\n${stderr}`);
    const regex = new RegExp(
      fileName
        ? fileName
        : type
          ? `.*\\.${type}\\.(json|js|groovy|xml)`
          : `.*\\.(json|js|groovy|xml)`
    );
    const filePaths = getFilePaths(directory, !isCurrentDirectory).filter((p) =>
      regex.test(p)
    );
    if (fileName) {
      // if (filePaths.length !== 0)
      //   console.error(`filePaths:\n${filePaths.join('\n')}`);
      expect(filePaths.length).toBe(1);
    } else {
      expect(filePaths.length >= 1).toBeTruthy();
    }
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    if (checkStderr) expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
    filePaths.forEach((path) => {
      let deleteExportFile = true;
      if (path.endsWith('json')) {
        let exportData = {};
        try {
          exportData = JSON.parse(fs.readFileSync(path, 'utf8'));
        } catch (error) {
          deleteExportFile = false;
          deleteExportDirectory = false;
          exportData = { path, error };
        }
        if (checkForMetadata || exportData.meta) {
          expect(exportData).toMatchSnapshot(
            {
              meta: expect.any(Object),
            },
            path
          );
        } else {
          expect(exportData).toMatchSnapshot(path);
        }
      } else {
        const data = fs.readFileSync(path, 'utf8');
        expect(data).toMatchSnapshot(path);
      }
      //Delete export file
      if (deleteExportFile) {
        try {
          fs.unlinkSync(path);
        } catch (error) {
          // ignore for now, since this is only cleanup
        }
      }
    });
  } finally {
    // Always clean up generated export artifacts, even when an assertion above
    // (e.g. the Polly replay-integrity guard or a snapshot mismatch) throws
    // before the normal cleanup runs. Files are intentionally preserved only
    // when a JSON parse error set deleteExportDirectory to false, so a human
    // can inspect the malformed export.
    if (deleteExportDirectory) {
      if (!isCurrentDirectory) {
        try {
          fs.rmSync(directory, { recursive: true, force: true });
        } catch (error) {
          // ignore cleanup failures
        }
      } else if (fileName) {
        try {
          fs.unlinkSync(fileName);
        } catch (error) {
          // ignore cleanup failures
        }
      }
    }
  }
}

export const testif = (condition) => (condition ? test : test.skip);

/**
 * Gets the file paths of all files in the given directory.
 * @param {string} directoryPath The given base directory
 * @param {boolean} recursive If true, recursively gets file paths from sub-directories in the given directory. Default: false
 * @returns {string[]} The list of file paths
 */
function getFilePaths(directoryPath, recursive = false) {
  let paths = [];
  fs.readdirSync(directoryPath)
    .map((file) => path.join(directoryPath, file))
    .filter((filePath) => {
      // try/catch and safest possible fallback to stabilize highly parallelized test execution where the results of readdirSync are altered while being mapped/filtered/forEach-ed
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(filePath).isDirectory();
      } catch (error) {
        // ignore
      }
      return recursive || !isDirectory;
    }) // Filter out directories if it is not recursive
    .forEach((filePath) => {
      // try/catch and safest possible fallback to stabilize highly parallelized test execution where the results of readdirSync are altered while being mapped/filtered/forEach-ed
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(filePath).isDirectory();
      } catch (error) {
        // ignore
      }
      isDirectory
        ? (paths = paths.concat(getFilePaths(filePath, recursive)))
        : paths.push(filePath);
    });
  return paths;
}

export async function testPromote(
  sourceDir,
  modifiedFilesDir,
  referenceSubDirs,
  env,
  name
) {
  env.env.FRODO_TEST_NAME = name
  const tempDir = await copyAndModifyDirectory(sourceDir, modifiedFilesDir, referenceSubDirs)
  const CMD = `frodo promote -M ${sourceDir} -E ${tempDir}`;
  const { stdout, stderr } = await exec(CMD, env);
  assertNoPollyReplayError(stdout, CMD);
  assertNoPollyReplayError(stderr, CMD);
  expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
}

async function copyAndModifyDirectory(sourceDir, modifiedFilesDir, referenceSubDirs) {
  // Step 1: Create a temporary directory
  const tmpDir = tmp.dirSync().name;

  // Step 2: Copy the source directory to the temporary location
  await fspromise.cp(sourceDir, tmpDir, { recursive: true });

  // Step 3: Overwrite with modified files
  await fspromise.cp(modifiedFilesDir, tmpDir, { recursive: true });

  // Step 4: Delete files not present in modified files dir
  for (const referenceSubDir of referenceSubDirs) {
    await deleteFilesNotPresent(referenceSubDir, tmpDir, modifiedFilesDir)
  }
  // Step 5: Return the path to the temporary directory
  return tmpDir;
}

async function deleteFilesNotPresent(referenceSubDir, tmpDir, modifiedFilesDir) {
  // Step 4.1: Get a list of files in the reference directory of modifiedFilesDir
  const referenceDir = path.join(modifiedFilesDir, referenceSubDir);
  const referenceFiles = new Set(await getAllFiles(referenceDir, referenceDir));

  // Step 4.2: Delete files in tmpDir that aren’t in the referenceFiles list
  const targetDir = path.join(tmpDir, referenceSubDir);
  const targetFiles = await getAllFiles(targetDir, targetDir);

  for (const file of targetFiles) {
    if (!referenceFiles.has(file)) {
      const filePath = path.join(targetDir, file);
      await fspromise.rm(filePath);
    }
  }
}

// Helper function to get all file paths within a directory, relative to the base
async function getAllFiles(dir, base) {
  let files = [];
  const items = await fspromise.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    const relativePath = path.relative(base, itemPath);

    if (item.isDirectory()) {
      files = files.concat(await getAllFiles(itemPath, base));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

/**
 * Returns env for testing given connection info
 * 
 * When recording (FRODO_MOCK=record), you must also set FRODO_HOST:
 * FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am npm run test:update e2e/test-name
 * 
 * @param connection The connection info
 * @param {{ preserveProfilePaths?: boolean }} options Env assembly options
 * @returns {{env: {[p: string]: string | undefined, FRODO_SA_JWK: (string|(JwkInterface & {d: string, dp: string, dq: string, e: string, n: string, p: string, q: string, qi: string})|JwkRsa|*), TZ?: string, FRODO_HOST, FRODO_SA_ID: (string|string|*)}}} The env object
 */
export function getEnv(connection = undefined, options = {}) {
  const { preserveProfilePaths = false } = options;
  const isRecording = process.env['FRODO_MOCK'] === 'record';
  const requestedProfile =
    process.env['FRODO_CONNECTION'] || (isRecording ? (connection?.profile || connection?.host) : connection?.profile);

  // Mock/replay mode must always use explicit test credentials, not local live profiles.
  const {
    FRODO_CONNECTION: _ignoredFrodoConnection,
    FRODO_CONNECTION_PROFILES_PATH: _ignoredProfilesPath,
    FRODO_MASTER_KEY_PATH: _ignoredMasterKeyPath,
    ...baseEnv
  } = process.env;

  const pathOverrides = preserveProfilePaths
    ? {
      ...(process.env.FRODO_CONNECTION_PROFILES_PATH && {
        FRODO_CONNECTION_PROFILES_PATH: process.env.FRODO_CONNECTION_PROFILES_PATH,
      }),
      ...(process.env.FRODO_MASTER_KEY_PATH && {
        FRODO_MASTER_KEY_PATH: process.env.FRODO_MASTER_KEY_PATH,
      }),
    }
    : {};

  return {
    env: {
      ...baseEnv,
      ...pathOverrides,
      ...(isRecording && requestedProfile && {
        FRODO_CONNECTION: requestedProfile,
      }),
      // only add property if we have it
      ...(connection?.host && { FRODO_HOST: connection.host }),
      ...(connection?.authService && { FRODO_AUTHENTICATION_SERVICE: connection.authService }),
      ...(connection?.isIGA && { FRODO_IGA: connection.isIGA }),
      ...(connection?.isPingFed && { FRODO_PINGFED: connection.isPingFed }),
      ...(!isRecording && connection?.saId && { FRODO_SA_ID: connection.saId }),
      ...(!isRecording && connection?.saJwk && { FRODO_SA_JWK: connection.saJwk }),
      ...(!isRecording && connection?.user && { FRODO_USERNAME: connection.user }),
      ...(!isRecording && connection?.pass && { FRODO_PASSWORD: connection.pass }),
      ...(!isRecording && connection?.pk && { FRODO_AMSTER_PRIVATE_KEY: connection.pk }),
    },
  };
}

/**
 * Backward-compatible wrapper around getEnv().
 * Prefer getEnv() directly for all test suites.
 */
export function getRecordingEnv(profileName = 'default', mockConnection = undefined) {
  // Backward-compatible wrapper: prefer using getEnv() directly.
  return getEnv({
    ...(mockConnection || {}),
    profile: profileName,
  });
}

/**
 * Method that runs a command and verifies that the command succeeds when run
 * @param {string} command The command to run
 * @param {{env: Record<string, string>}} env The environment variables
 * @returns {Promise<void>}
 */
export async function testSuccess(
  command,
  env,
) {
  const { stdout, stderr } = await exec(command, env);
  assertNoPollyReplayError(stdout, command);
  assertNoPollyReplayError(stderr, command);
  expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
  expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
}

/**
 * Method that runs a command and verifies that the command fails when run
 * @param {string} command The command to run
 * @param {{env: Record<string, string>}} env The environment variables
 * @returns {Promise<void>}
 */
export async function testFail(
  command,
  env,
) {
  let commandSucceeded = false;
  try {
    await exec(command, env);
    commandSucceeded = true;
  } catch (e) {
    assertNoPollyReplayError(e.stdout, command);
    assertNoPollyReplayError(e.stderr, command);
    expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    expect(e.code).toMatchSnapshot();
  }
  if (commandSucceeded) {
    throw new Error("Command should've failed")
  }
}

/**
 * Stage fixture data by executing a staging command (e.g., import fixture data).
 * Used in beforeEach to set up deterministic test state.
 * @param {string} command The staging command to run (e.g., 'frodo agent import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.agent.json')
 * @param {{env: Record<string, string>}} env The environment variables
 * @param {Object} options Optional configuration
 * @param {number} options.timeout Optional timeout in milliseconds for the staging command
 * @returns {Promise<void>}
 */
export async function stageFixture(command, env, options = {}) {
  await exec(command, env);
}

/**
 * Clear fixture data by executing a teardown command (e.g., delete fixture data).
 * Used in afterEach to clean up test state. Idempotent—ignores errors on cleanup.
 * @param {string} command The cleanup command to run (e.g., 'frodo agent delete -i frodo-test-ig-agent')
 * @param {{env: Record<string, string>}} env The environment variables
 * @param {Object} options Optional configuration
 * @param {number} options.timeout Optional timeout in milliseconds for the cleanup command
 * @returns {Promise<void>}
 */
export async function clearFixture(command, env, options = {}) {
  try {
    await exec(command, env);
  } catch (error) {
    // ignore cleanup failures so teardown stays idempotent across reruns
  }
}

/**
 * Verify that authentication works in recording mode.
 * Makes a safe read-only API call to detect token acquisition failures early.
 * Throws a descriptive error if auth fails, preventing corrupt recordings.
 * 
 * Call this in beforeAll during recording mode to fail fast:
 * ```javascript
 * beforeAll(async () => {
 *   if (process.env['FRODO_MOCK'] === 'record') {
 *     await verifyAuth(env);
 *     await stageFixture(importCommand, env);
 *   }
 * });
 * ```
 * 
 * @param {{env: Record<string, string>}} envWrapper The env wrapper from getEnv()
 * @returns {Promise<void>} Resolves if auth succeeds; throws with descriptive message on failure
 * @throws {Error} If in recording mode and authentication fails
 */
export async function verifyAuth(envWrapper) {
  const isRecording = process.env['FRODO_MOCK'] === 'record';
  if (!isRecording) {
    // Skip verification in replay mode—HAR responses are deterministic
    return;
  }

  try {
    // Make a simple read-only API call to verify bearer token is valid
    // frodo info requires authentication and is a safe read-only operation
    const testCmd = 'frodo info';
    await exec(testCmd, envWrapper);
  } catch (error) {
    const profileFromEnv = envWrapper.env.FRODO_CONNECTION || 'frodo-dev';
    const masterKeyPath = envWrapper.env.FRODO_MASTER_KEY_PATH;
    const profilesPath = envWrapper.env.FRODO_CONNECTION_PROFILES_PATH;

    const errorDetails = [
      '❌ Token acquisition failed during recording mode setup.',
      `Requested profile: "${profileFromEnv}"`,
      '',
      'Actual Error:',
      `  Command: frodo info`,
      `  Exit code: ${error.code}`,
      '',
      'Error output:',
      error.stderr ? error.stderr.trim() : '(no stderr)',
      '',
      error.stdout ? `Stdout:\n${error.stdout.trim()}\n` : '',
      'Possible causes:',
      '  • Connection profile not found or incorrect credentials',
      '  • Master key file missing or wrong path',
      '  • JWT issuer not trusted by test environment',
      '  • Network/connectivity issue',
      '',
      'Debug steps:',
      '  1. Ensure FRODO_HOST is set when recording:',
      '     FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am',
      `  2. Verify profile exists: frodo conn list`,
      `  3. Test profile directly: FRODO_CONNECTION=${profileFromEnv} frodo info`,
      '  4. Check master key file exists:',
      `     ls -la "${masterKeyPath || '~/.frodo/masterkey.key'}"`,
      '  5. Check profiles file exists:',
      `     ls -la "${profilesPath || '~/.frodo/connections.json'}"`,

      '',
      'Recording cannot proceed with failed authentication.',
      'This prevents corrupt test responses from being saved to HAR files.',
    ].join('\n');

    throw new Error(errorDetails);
  }
}
