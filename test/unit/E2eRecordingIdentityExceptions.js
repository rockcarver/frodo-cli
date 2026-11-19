/**
 * Exceptions of test/unit/E2eRecordingIdentity.test.js: the commands whose pin
 * is not the args id frodo-lib derives from the command, and the commands that
 * have no recording. An entry is `{ file, cmd, pin, why }`: `file` is the test
 * file below test/e2e, `cmd` the command line as the test runs it (blanks
 * around it do not matter), `pin` its FRODO_TEST_NAME, `why` one line for the
 * reader. The check fails when an entry matches no command, when it is no
 * longer needed, and when an entry has no reason, so the lists cannot go stale.
 *
 * - NEVER add an entry for a pin that is the derived id. Fix the pin.
 * - LABELS: a pin that is a fixed label. Add one only when two tests need
 *   separate recordings of one command line, and say so in `why`.
 * - NO_RECORDING: a command with no recording on disk. It has to be a skipped
 *   test, or a test that expects a failure before any request. A test that
 *   runs and needs a recording gets the recording, not an entry.
 * - RENAMED: a command that was renamed after it was recorded, a flag or the
 *   words before the first flag. An entry is `{ file, cmd, was, pin, why }`,
 *   `cmd` the command as it is now and `was` the command it was recorded as.
 *   The pin is checked against `was`, so a renamed flag keeps its pin. The
 *   directory is the one of the command as it is now: a step that renames the
 *   words moves the recording directory in the same pull request. The header
 *   lines of the test file are read for both spellings, so they still need the
 *   pin while they keep the old words. A rename of the words alone keeps the
 *   args id; its entry is needed only for those header lines (or update them
 *   to the new words). An entry for a command whose name did not change is
 *   reported as stale. The step that renames the command adds the entry in the
 *   same pull request.
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
    cmd: 'frodo config-manager pull oauth-cimd-profiles -i zz-e2e-cimd -D cimdProfilesTestDir1',
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
    cmd: 'frodo config-manager pull oauth-software-publishers -i zz-e2e-publisher -D softwarePublishersTestDir1',
    pin: 'pullOne',
    why: 'recorded under the label pullOne; the recording keeps its name',
  },
  {
    file: 'config-manager-pull-trusted-jwt-issuers.e2e.test.js',
    cmd: 'frodo config-manager pull oauth-issuers -i zz-e2e-issuer -D oauthIssuersTestDir1',
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
    cmd: 'frodo config-manager push oauth-cimd-profiles -i zz-e2e-cimd -D test/e2e/exports/fr-config-manager/cloud',
    pin: 'pushOne',
    why: 'recorded under the label pushOne; the recording keeps its name',
  },
  {
    file: 'config-manager-push-software-publishers.e2e.test.js',
    cmd: 'frodo config-manager push oauth-software-publishers -i zz-e2e-publisher -D test/e2e/exports/fr-config-manager/cloud',
    pin: 'pushOne',
    why: 'recorded under the label pushOne; the recording keeps its name',
  },
  {
    file: 'config-manager-push-themes.e2e.test.js',
    cmd: 'frodo config-manager push themes -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: 'allRealms',
    why: 'the same command line as the test pinned 0_D_m, run without a realm: the label keeps the two recordings apart',
  },
  {
    file: 'config-manager-push-trusted-jwt-issuers.e2e.test.js',
    cmd: 'frodo config-manager push oauth-issuers -i zz-e2e-issuer -D test/e2e/exports/fr-config-manager/cloud',
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
    cmd: 'frodo iga workflow delete -fp --draft-only --all -y',
    pin: '0_fdp_all_y',
    why: 'skipped test with no recording on disk (the TODO at the top of the test file)',
  },
];

const OPTIONS_RECORD_WHY =
  'a short form of the command was removed or moved to another letter by https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md (options of the configuration commands); the recording keeps its name';

const SELECTORS_RECORD_WHY =
  'the selector of the command was renamed to -i, --<type>-id by https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md (options of the configuration commands); -n and --name stay as its alias, and the recording keeps its name';

export const RENAMED = [
  {
    file: 'service-import.e2e.test.js',
    cmd: 'frodo service import -r --clean -i baseurl -f test/e2e/exports/all/allAlphaServices.service.json',
    was: 'frodo service import -Cri baseurl -f test/e2e/exports/all/allAlphaServices.service.json',
    pin: '0_Cri_f',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'service-import.e2e.test.js',
    cmd: 'frodo service import -r --clean -f test/e2e/exports/all/allAlphaServices.service.json',
    was: 'frodo service import -Crf test/e2e/exports/all/allAlphaServices.service.json',
    pin: '0_Crf',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'service-import.e2e.test.js',
    cmd: 'frodo service import --current-realm -a --clean -f test/e2e/exports/all/allAlphaServices.service.json',
    was: 'frodo service import --current-realm -Caf test/e2e/exports/all/allAlphaServices.service.json',
    pin: '0_current-realm_Caf',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'service-import.e2e.test.js',
    cmd: 'frodo service import -Ar --clean -D test/e2e/exports/all-separate/cloud/realm/root-alpha/service',
    was: 'frodo service import -ACrD test/e2e/exports/all-separate/cloud/realm/root-alpha/service',
    pin: '0_ACrD',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-iga-workflows.e2e.test.js',
    cmd: 'frodo config-manager pull iga-workflows --include-immutable -D igaTestDir03',
    was: 'frodo config-manager pull iga-workflows -i -D igaTestDir03',
    pin: '0_i_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-iga-workflows.e2e.test.js',
    cmd: 'frodo config-manager pull iga-workflows --include-immutable -n BasicApplicationGrant -D igaTestDir04',
    was: 'frodo config-manager pull iga-workflows -i -n BasicApplicationGrant -D igaTestDir04',
    pin: '0_i_n_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-journeys.e2e.test.js',
    cmd: 'frodo config-manager push journeys -F --push-dependencies -D test/e2e/exports/fr-config-manager/forgeops',
    was: 'frodo config-manager push journeys -Fd -D test/e2e/exports/fr-config-manager/forgeops',
    pin: '0_Fd_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-journeys.e2e.test.js',
    cmd: 'frodo config-manager push journeys --push-dependencies -D test/e2e/exports/fr-config-manager/forgeops',
    was: 'frodo config-manager push journeys -d -D test/e2e/exports/fr-config-manager/forgeops',
    pin: '0_d_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-journeys.e2e.test.js',
    cmd: 'frodo config-manager push journeys -Fn ConfigManagerPushTest --push-dependencies  -D test/e2e/exports/fr-config-manager/forgeops',
    was: 'frodo config-manager push journeys -Fn ConfigManagerPushTest -d  -D test/e2e/exports/fr-config-manager/forgeops',
    pin: '0_Fn_d_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-raw.e2e.test.js',
    cmd: 'frodo config-manager push raw --path /openidm/config/cluster --stdin -m forgeops',
    was: 'frodo config-manager push raw -p /openidm/config/cluster -i -m forgeops',
    pin: '0_p_i_m',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-raw.e2e.test.js',
    cmd: 'frodo config-manager push raw --path test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push raw -p test/e2e/exports/fr-config-manager/forgeops/raw/openidm/config -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_p_D_m',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-raw.e2e.test.js',
    cmd: 'frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" --path test/e2e/exports/fr-config-manager/cloud/raw/environment  -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push raw -E ESV_VARIABLE_TEST="MSwyLDM=" -p test/e2e/exports/fr-config-manager/cloud/raw/environment  -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_E_p_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-run-dryrun-promotion.test.js',
    cmd: "frodo config-manager promote run-dryrun-promotion -P provisional-report -uI --description 'provisional report' -t ticket",
    was: "frodo config-manager promote run-dryrun-promotion -p provisional-report -uid 'provisional report' -t ticket",
    pin: '0_p_uid_t',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-run-promotion.test.js',
    cmd: "frodo config-manager promote run-promotion -P provisional-report -uI --description 'provisional report' -t ticket",
    was: "frodo config-manager promote run-promotion -p provisional-report -uid 'provisional report' -t ticket",
    pin: '0_p_uid_t',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-rollback.test.js',
    cmd: "frodo config-manager promote rollback -P provisional-report -u --description 'provisional report' -t ticket",
    was: "frodo config-manager promote rollback -p provisional-report -ud 'provisional report' -t ticket",
    pin: '0_p_ud_t',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-journeys.e2e.test.js',
    cmd: 'frodo config-manager pull journeys --clean -D ConfigJourneytestDir4 --pull-dependencies',
    was: 'frodo config-manager pull journeys -cD ConfigJourneytestDir4 --pull-dependencies',
    pin: '0_cD_pull-dependencies',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete --draft-only -i testWorkflow1',
    was: 'frodo iga workflow delete -di testWorkflow1',
    pin: '0_di',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'iga-workflow-delete.e2e.test.js',
    cmd: 'frodo iga workflow delete -fp --draft-only --all -y',
    was: 'frodo iga workflow delete -fdp --all -y',
    pin: '0_fdp_all_y',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-check-promotion-reports.test.js',
    cmd: 'frodo config-manager promote check-promotion-reports --provisional',
    was: 'frodo config-manager promote check-promotion-reports -p',
    pin: '0_p',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-check-promotion-reports.test.js',
    cmd: 'frodo config-manager promote check-promotion-reports --provisional-rollback',
    was: 'frodo config-manager promote check-promotion-reports -r',
    pin: '0_r',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-scripts.e2e.test.js',
    cmd: "frodo config-manager push scripts -F --filenameFilter 'Debug,~Next' -D test/e2e/exports/fr-config-manager/forgeops",
    was: "frodo config-manager push scripts -Ff 'Debug,~Next' -D test/e2e/exports/fr-config-manager/forgeops",
    pin: '0_Ff_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-custom-nodes.e2e.test.js',
    cmd: 'frodo config-manager push custom-nodes --filename-filter ~Display -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push custom-nodes -f ~Display -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_f_D_m',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-schedules.e2e.test.js',
    cmd: 'frodo config-manager push schedules --filename-filter ~Groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push schedules -f ~Groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_f_D_m',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-endpoints.e2e.test.js',
    cmd: 'frodo config-manager push endpoints --filename-filter ~groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push endpoints -f ~groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_f_D_m',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-variables.e2e.test.js',
    cmd: 'frodo config-manager pull variables --dump -D variableDumpDir',
    was: 'frodo config-manager pull variables -u -D variableDumpDir',
    pin: '0_u_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-managed-objects.e2e.test.js',
    cmd: 'frodo config-manager pull managed-objects --custom-relationships -D testDir19',
    was: 'frodo config-manager pull managed-objects -u -D testDir19',
    pin: '0_u_D',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-restart.e2e.test.js',
    cmd: 'frodo config-manager push restart --check',
    was: 'frodo config-manager push restart -c',
    pin: '0_c',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-promote-check-locked-status.test.js',
    cmd: 'frodo config-manager promote check-locked-status -L',
    was: 'frodo config-manager promote check-locked-status -l',
    pin: '0_l',
    why: OPTIONS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-telemetry.e2e.test.js',
    cmd: 'frodo config-manager pull telemetry -c otlp -i test-otlp -D telemetryTestDir3',
    was: 'frodo config-manager pull telemetry -c otlp -n test-otlp -D telemetryTestDir3',
    pin: '0_c_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-telemetry.e2e.test.js',
    cmd: 'frodo config-manager pull telemetry -i test-otlp -D telemetryTestDir4',
    was: 'frodo config-manager pull telemetry -n test-otlp -D telemetryTestDir4',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-journeys.e2e.test.js',
    cmd: 'frodo config-manager pull journeys -i BravoTestRegistration -D ConfigJourneytestDir3 -m forgeops',
    was: 'frodo config-manager pull journeys -n BravoTestRegistration -D ConfigJourneytestDir3 -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-secret-mappings.e2e.test.js',
    cmd: 'frodo config-manager pull secret-mappings -i am.services.pingone.worker.bogus.clientsecret -D secretMappingTestDir3',
    was: 'frodo config-manager pull secret-mappings -n am.services.pingone.worker.bogus.clientsecret -D secretMappingTestDir3',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-services.e2e.test.js',
    cmd: 'frodo config-manager pull services -D serviceTestDir2 -i SocialIdentityProviders -m forgeops',
    was: 'frodo config-manager pull services -D serviceTestDir2 -n SocialIdentityProviders -m forgeops',
    pin: '0_D_n_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-managed-objects.e2e.test.js',
    cmd: 'frodo config-manager pull managed-objects -i alpha_user -D testDir18',
    was: 'frodo config-manager pull managed-objects -n alpha_user -D testDir18',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-connector-definitions.e2e.test.js',
    cmd: 'frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir1 -i Azure',
    was: 'frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir1 -n Azure',
    pin: '0_D_n',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-org-privileges.e2e.test.js',
    cmd: 'frodo config-manager pull org-privileges -i alphaOrgPrivileges -D configManagerExportOrgPrivilegesDir1',
    was: 'frodo config-manager pull org-privileges -n alphaOrgPrivileges -D configManagerExportOrgPrivilegesDir1',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-email-templates.e2e.test.js',
    cmd: 'frodo config-manager pull email-templates -i registration -D testDir6',
    was: 'frodo config-manager pull email-templates -n registration -D testDir6',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-schedules.e2e.test.js',
    cmd: 'frodo config-manager pull schedules -i TestSchedule -D testDir24',
    was: 'frodo config-manager pull schedules -n TestSchedule -D testDir24',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-endpoints.e2e.test.js',
    cmd: 'frodo config-manager pull endpoints -i testEndpoint2 -D testDir8',
    was: 'frodo config-manager pull endpoints -n testEndpoint2 -D testDir8',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-pull-remote-proxies.e2e.test.js',
    cmd: 'frodo config-manager pull remote-proxies -i zz-e2e-proxy -D testDir25',
    was: 'frodo config-manager pull remote-proxies -n zz-e2e-proxy -D testDir25',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-telemetry.e2e.test.js',
    cmd: 'frodo config-manager push telemetry -c otlp -i test-otlp -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push telemetry -c otlp -n test-otlp -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_KEY=test-value -E TELEMETRY_HEADER_OTLP_TEST_OTLP_API_SECRET=test-value -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_c_n_E_E_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-telemetry.e2e.test.js',
    cmd: 'frodo config-manager push telemetry -c splunk --exporter-id test -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push telemetry -c splunk --name test -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_c_name_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-journeys.e2e.test.js',
    cmd: 'frodo config-manager push journeys -i ProgressiveProfile -D test/e2e/exports/fr-config-manager/forgeops',
    was: 'frodo config-manager push journeys -n ProgressiveProfile -D test/e2e/exports/fr-config-manager/forgeops',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-secrets.e2e.test.js',
    cmd: 'frodo config-manager push secrets -i esv-fr-test-secret -E ESV_FR_TEST_SECRET="test1"  -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push secrets -n esv-fr-test-secret -E ESV_FR_TEST_SECRET="test1"  -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_n_E_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-secrets.e2e.test.js',
    cmd: 'frodo config-manager push secrets -i esv-test-secret --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push secrets -n esv-test-secret --env-file test/e2e/env/configManager1.env -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_n_env-file_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-secrets.e2e.test.js',
    cmd: 'frodo config-manager push secrets --prune --yes -i esv-prune-secrets -E ESV_PRUNE_SECRETS=test3  -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push secrets --prune --yes -n esv-prune-secrets -E ESV_PRUNE_SECRETS=test3  -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_prune_yes_n_E_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-variables.e2e.test.js',
    cmd: 'frodo config-manager push variables --force-update -i esv-fr-var-test-2 --env ESV_FR_VAR_TEST_2=20 -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push variables --force-update -n esv-fr-var-test-2 --env ESV_FR_VAR_TEST_2=20 -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_force-update_n_env_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-variables.e2e.test.js',
    cmd: 'frodo config-manager push variables --variable-id esv-fr-var-test --env ESV_FR_VAR_TEST="test2" --env-file test/e2e/env/configManager1.env  -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push variables --name esv-fr-var-test --env ESV_FR_VAR_TEST="test2" --env-file test/e2e/env/configManager1.env  -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_name_env_env-file_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-saml.e2e.test.js',
    cmd: 'frodo config-manager push saml -i test-IDP -E IDP_URL_PLACEHOLDER=https://platform.dev.trivir.com/am/idpsaehandler/metaAlias/alpha/test -E HTTP_REDIRECT_PLACEHOLDER=urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    // the host in the value of the first -E is the sample host: the args id of the command as it was recorded depends on its flags only
    was: 'frodo config-manager push saml -n test-IDP -E IDP_URL_PLACEHOLDER=https://openam-matrix.example.com/am/idpsaehandler/metaAlias/alpha/test -E HTTP_REDIRECT_PLACEHOLDER=urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_E_E_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-services.e2e.test.js',
    cmd: 'frodo config-manager push services -i id-repositories -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push services -n id-repositories -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-schedules.e2e.test.js',
    cmd: 'frodo config-manager push schedules -i taskscan_activate -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push schedules -n taskscan_activate -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-endpoints.e2e.test.js',
    cmd: 'frodo config-manager push endpoints -i groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push endpoints -n groovy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-connector-mappings.e2e.test.js',
    cmd: 'frodo config-manager push connector-mappings -i UserToUserJavascriptSync -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push connector-mappings -n UserToUserJavascriptSync -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-email-templates.e2e.test.js',
    cmd: 'frodo config-manager push email-templates -i forgottenUsername -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push email-templates -n forgottenUsername -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-connector-definitions.e2e.test.js',
    cmd: 'frodo config-manager push connector-definitions -i csv -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push connector-definitions -n csv -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-org-privileges.e2e.test.js',
    cmd: 'frodo config-manager push org-privileges -i alphaOrgPrivileges -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push org-privileges -n alphaOrgPrivileges -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-secret-mappings.e2e.test.js',
    cmd: 'frodo config-manager push secret-mappings -i am.services.iot.cert.verification -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push secret-mappings -n am.services.iot.cert.verification -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-managed-objects.e2e.test.js',
    cmd: 'frodo config-manager push managed-objects -i testObject -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    was: 'frodo config-manager push managed-objects -n testObject -D test/e2e/exports/fr-config-manager/forgeops -m forgeops',
    pin: '0_n_D_m',
    why: SELECTORS_RECORD_WHY,
  },
  {
    file: 'config-manager-push-remote-proxies.e2e.test.js',
    cmd: 'frodo config-manager push remote-proxies -i zz-e2e-proxy -D test/e2e/exports/fr-config-manager/cloud',
    was: 'frodo config-manager push remote-proxies -n zz-e2e-proxy -D test/e2e/exports/fr-config-manager/cloud',
    pin: '0_n_D',
    why: SELECTORS_RECORD_WHY,
  },
];
