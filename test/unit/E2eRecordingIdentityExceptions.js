/**
 * Exceptions of test/unit/E2eRecordingIdentity.test.js: the commands whose pin
 * is not the args id frodo-lib derives from the command, and the commands that
 * have no recording. An entry is `{ file, cmd, pin, why }`: `file` is the test
 * file below test/e2e, `cmd` the command line as the test runs it (blanks
 * around it do not matter),
 * `pin` its FRODO_TEST_NAME, `why` one line for the reader. The check fails
 * when an entry matches no command, when it is no longer needed, and when an
 * entry has no reason, so the lists cannot go stale.
 *
 * - NEVER add an entry for a pin that is the derived id. Fix the pin.
 * - LABELS: a pin that is a fixed label. Add one only when two tests need
 *   separate recordings of one command line, and say so in `why`.
 * - NO_RECORDING: a command with no recording on disk. It has to be a skipped
 *   test, or a test that expects a failure before any request. A test that
 *   runs and needs a recording gets the recording, not an entry.
 * - RENAMED: a command that was renamed after it was recorded, so that its
 *   pin is the args id of the old command line. An entry is
 *   `{ file, cmd, was, pin, why }`, `cmd` the command as it is now and `was`
 *   the command it was recorded as. The pin is then checked against `was`.
 *   The step that renames the command adds the entry in the same pull request.
 */
export const LABELS = [
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import -adf test/e2e/exports/all/all.cloud-full-import.json --no-validate',
    pin: '0_adf',
    why: 'recorded before --no-validate was added to the command, which does not change the requests; the recording keeps its name',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import -AD test/e2e/exports/all-separate/cloud-full-import --no-validate',
    pin: '0_AD',
    why: 'recorded before --no-validate was added to the command, which does not change the requests; the recording keeps its name',
  },
  {
    file: 'config-manager-delete-cimd-profiles.e2e.test.js',
    cmd: 'frodo config-manager delete oauth-cimd-profiles -n zz-e2e-cimd',
    pin: 'deleteOne',
    why: 'recorded under the label deleteOne; the recording keeps its name',
  },
  {
    file: 'config-manager-delete-software-publishers.e2e.test.js',
    cmd: 'frodo config-manager delete oauth-software-publishers -n zz-e2e-publisher',
    pin: 'deleteOne',
    why: 'recorded under the label deleteOne; the recording keeps its name',
  },
  {
    file: 'config-manager-delete-test.e2e.test.js',
    cmd: 'frodo config-manager delete test',
    pin: 'success',
    why: 'the two tests of this file run the same command line: the label keeps their recordings apart',
  },
  {
    file: 'config-manager-delete-test.e2e.test.js',
    cmd: 'frodo config-manager delete test',
    pin: 'invalid_credentials',
    why: 'the two tests of this file run the same command line: the label keeps their recordings apart',
  },
  {
    file: 'config-manager-delete-trusted-jwt-issuers.e2e.test.js',
    cmd: 'frodo config-manager delete oauth-issuers -n zz-e2e-issuer',
    pin: 'deleteOne',
    why: 'recorded under the label deleteOne; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-all-static.e2e.test.js',
    cmd: 'frodo config-manager pull all-static -D allStaticDir3',
    pin: 'allRealms',
    why: 'the same command line as the test pinned 0_D, run without a realm: the label keeps the two recordings apart',
  },
  {
    file: 'config-manager-pull-cimd-profiles.e2e.test.js',
    cmd: 'frodo config-manager pull oauth-cimd-profiles -n zz-e2e-cimd -D cimdProfilesTestDir1',
    pin: 'pullOne',
    why: 'recorded under the label pullOne; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-secrets.e2e.test.js',
    cmd: 'frodo config-manager pull secrets -r',
    pin: 'report',
    why: 'recorded under the label report; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-software-publishers.e2e.test.js',
    cmd: 'frodo config-manager pull oauth-software-publishers -n zz-e2e-publisher -D softwarePublishersTestDir1',
    pin: 'pullOne',
    why: 'recorded under the label pullOne; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-test.e2e.test.js',
    cmd: 'frodo config-manager pull test',
    pin: 'invalid_credentials',
    why: 'another test of this file runs the same command line, this one with wrong credentials: the label keeps the recordings apart',
  },
  {
    file: 'config-manager-pull-trusted-jwt-issuers.e2e.test.js',
    cmd: 'frodo config-manager pull oauth-issuers -n zz-e2e-issuer -D oauthIssuersTestDir1',
    pin: 'pullOne',
    why: 'recorded under the label pullOne; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-variables.e2e.test.js',
    cmd: 'frodo config-manager pull variables -r',
    pin: 'report',
    why: 'recorded under the label report; the recording keeps its name',
  },
  {
    file: 'config-manager-push-cimd-profiles.e2e.test.js',
    cmd: 'frodo config-manager push oauth-cimd-profiles -n zz-e2e-cimd -D test/e2e/exports/fr-config-manager/cloud',
    pin: 'pushOne',
    why: 'recorded under the label pushOne; the recording keeps its name',
  },
  {
    file: 'config-manager-push-software-publishers.e2e.test.js',
    cmd: 'frodo config-manager push oauth-software-publishers -n zz-e2e-publisher -D test/e2e/exports/fr-config-manager/cloud',
    pin: 'pushOne',
    why: 'recorded under the label pushOne; the recording keeps its name',
  },
  {
    file: 'config-manager-push-test.e2e.test.js',
    cmd: 'frodo config-manager push test',
    pin: 'invalid_credentials',
    why: 'another test of this file runs the same command line, this one with wrong credentials: the label keeps the recordings apart',
  },
  {
    file: 'config-manager-push-themes.e2e.test.js',
    cmd: 'frodo config-manager push themes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: 'allRealms',
    why: 'the same command line as the test pinned 0_D_m, run without a realm: the label keeps the two recordings apart',
  },
  {
    file: 'config-manager-push-trusted-jwt-issuers.e2e.test.js',
    cmd: 'frodo config-manager push oauth-issuers -n zz-e2e-issuer -D test/e2e/exports/fr-config-manager/cloud',
    pin: 'pushOne',
    why: 'recorded under the label pushOne; the recording keeps its name',
  },
];

export const NO_RECORDING = [
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.cloud.json --no-validate',
    pin: '0_all_clean_re-uuid-scripts_re-uuid-journeys_file_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/cloud --no-validate',
    pin: '0_all-separate_clean_re-uuid-scripts_re-uuid-journeys_directory_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import -caf test/e2e/exports/all/all.iga.json',
    pin: '0_caf',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import -adf test/e2e/exports/all/all.classic.json -m classic --no-validate',
    pin: '0_adf_m_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.classic.json--type classic --no-validate',
    pin: '1_all_clean_re-uuid-scripts_re-uuid-journeys_file_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import -AdD test/e2e/exports/all-separate/classic -m classic --no-validate',
    pin: '0_AdD_m_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-import.e2e.test.js',
    cmd: 'frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/classic --type classic --no-validate',
    pin: '0_all-separate_clean_re-uuid-scripts_re-uuid-journeys_directory_type_no-validate',
    why: 'skipped test with no recording on disk (the TODO above the test says why)',
  },
  {
    file: 'config-manager-delete-telemetry.e2e.test.js',
    cmd: 'frodo config-manager delete telemetry -n frodo-test-splunk-1',
    pin: '0_n',
    why: 'a name without a category is refused by the command before any request, so there is nothing to record',
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete -fpi testWorkflow9',
    pin: '0_fpi',
    why: 'skipped test with no recording on disk (the TODO at the top of the test file)',
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete --draft-only -a -y',
    pin: '0_draft-only_a_y',
    why: 'skipped test with no recording on disk (the TODO at the top of the test file)',
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete --published-only -fa -y',
    pin: '0_published-only_fa_y',
    why: 'skipped test with no recording on disk (the TODO at the top of the test file)',
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete -fdp --all -y',
    pin: '0_fdp_all_y',
    why: 'skipped test with no recording on disk (the TODO at the top of the test file)',
  },
];

export const RENAMED = [];
