import { frodo, state } from '@rockcarver/frodo-lib';
import { exportMappingToDirectory } from '../configManagerOps/FrConfigConnectorMappingOps';
import {
  exportCircleOfTrustToFile,
  readSamlProviderForFile,
} from '../configManagerOps/FrConfigSamlOps';
import { exportScriptToFiles } from '../configManagerOps/FrConfigScriptOps';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import {
  applicationFolderName,
  decideApplicationLayout,
  writeTreeMarker,
  type ApplicationLayoutDecision,
} from '../utils/TreeLayout';

const { getFilePath, saveJsonToFile, getWorkingDirectory, escapePlaceholders } =
  frodo.utils;
const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

type ApplicationRecord = Awaited<
  ReturnType<typeof frodo.app.readApplicationByName>
>;
type ApplicationReferenceList = Awaited<
  ReturnType<typeof frodo.app.readApplicationReferences>
>;
type ApplicationReferenceItem = ApplicationReferenceList['references'][number];

/** What is not written into `application.json`: runtime and access data of the tenant, and the glossary (cli#1132). */
const RECORD_FIELDS_NOT_PULLED = [
  '_id',
  '_rev',
  '_provider',
  'members',
  'owners',
  'roles',
  'glossary',
];

/** The kinds of reference this command does not pull, because the first version leaves them out (cli#1132). */
const KINDS_LEFT_OUT = ['glossarySchema', 'requestForm', 'requestType'];

/**
 * The name of the environment variable that holds the secret of the OAuth2
 * client of an application, which the pulled file refers to as a placeholder:
 * `APP_<NAME>_CLIENT_SECRET`, with the name in upper case and every run of
 * characters other than letters and digits as one underscore.
 * @param {string} applicationName the name of the application
 * @returns {string} the name of the variable
 */
export function clientSecretVariable(applicationName: string): string {
  const name = applicationName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `APP_${name}_CLIENT_SECRET`;
}

/**
 * Whether an OAuth2 client has a secret: the client type of its core
 * configuration is `Confidential` (it is stored as a value or as an object with
 * a `value`).
 * @param {any} client the OAuth2 client as the library reads it
 * @returns {boolean} true for a confidential client
 */
export function isConfidentialClient(client: any): boolean {
  const type = client?.coreOAuth2ClientConfig?.clientType;
  const value = typeof type === 'object' && type !== null ? type.value : type;
  return String(value ?? '').toLowerCase() === 'confidential';
}

/**
 * The OAuth2 client of an application as it is written to `oauth2-client.json`:
 * the format of the `oauth2-agents` kind, with literal `${` escaped, and for a
 * confidential client the secret as a placeholder (the library masks it on
 * reads, and a secret is never written in the clear: core record 0013).
 * @param {any} client the OAuth2 client as the library reads it
 * @param {string} applicationName the name of the application
 * @returns {object} the content of the file
 */
function clientFile(client: any, applicationName: string): object {
  const file: any = escapePlaceholders(client);
  if (isConfidentialClient(client)) {
    file.userpassword = `\${${clientSecretVariable(applicationName)}}`;
  }
  return file;
}

/** The text that names a reference that could not be followed, for the summary. */
function describeProblem(
  problem: ApplicationReferenceList['problems'][number]
) {
  const what = problem.reference
    ? `${problem.kind} ${problem.reference.id}`
    : problem.kind;
  return `${what} is ${problem.reason}`;
}

/**
 * Pull applications in config-manager format (decision record 0042): one folder
 * per application, `realms/<realm>/applications/<name>/`, that holds the record
 * (`application.json`) and the objects the application owns (the OAuth2 client,
 * the SAML providers, the connector and its mappings). The objects an
 * application shares with others (scripts, circles of trust) are written where
 * `pull scripts` and `pull saml` write them, so that an application is complete
 * without another command. Members, owners, roles, the glossary and request
 * forms are not pulled.
 *
 * A tree that uses the application layout is marked (`frodo-config-manager.json`
 * at its root). A new tree gets the marker, with the layout of the per-user
 * setting, before the first file is written; a tree that keeps the objects of an
 * application at the paths of their kinds is never switched here: the command
 * refuses and names `config-manager migrate applications`, and the step of
 * `pull all` (`quiet`) skips with a warning.
 *
 * Every application is one operation of an {@link OperationRun}: an application
 * whose objects cannot all be read or written, or that refers to an object that
 * does not exist, is pulled as far as it goes and named in one summary, and the
 * others are still pulled. A realm whose applications cannot be read is a failed
 * operation too. A named application that cannot be read, a name that needs a
 * realm, a tree that cannot take the layout and a marker that cannot be read fail
 * the command whatever `--allow-failures` says.
 * @param {string} name optional name: pull only that application (needs a single realm)
 * @param {string} realm optional realm: pull only from that realm. Default: every realm (the root realm of a Cloud tenant has no applications)
 * @param {boolean} quiet true for the step of `pull all`: say nothing when there is no application, and skip a tree that does not use the application layout with a warning instead of failing
 * @param {boolean} allowFailures true to report applications that could not be pulled but still succeed. Default: false
 * @param {ApplicationLayoutDecision} layout the decision about the tree that was made before anything was written into it (`pull all` decides once, before its first step); default: decided now
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportApplications(
  name?: string,
  realm?: string,
  quiet: boolean = false,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    if (name && realms.length !== 1) {
      printMessage(
        'Error: for a named application, specify a single realm',
        'error'
      );
      return false;
    }

    const treeDir = getWorkingDirectory();
    const decision = layout ?? decideApplicationLayout(treeDir);
    if (decision.layout !== 'folders') {
      const reason =
        decision.tree === 'new'
          ? `The layout setting for a new tree is "kind-paths" (frodo settings config-manager-layout), so this tree keeps the objects of an application at the paths of their own kinds.`
          : `This tree keeps the objects of an application at the paths of their own kinds. Move it to one folder per application with "frodo config-manager migrate applications".`;
      if (quiet) {
        printMessage(`Applications were not pulled. ${reason}`, 'warn');
        return true;
      }
      printMessage(`Applications cannot be pulled. ${reason}`, 'error');
      return false;
    }
    let markerWritten = !decision.createMarker;

    const run = new OperationRun({ unit: 'application', allowFailures });
    let namedFailed = false;
    let found = 0;
    let mappings: any[] | undefined;
    const readMappingsOnce = async () =>
      (mappings ??= await frodo.idm.mapping.readMappings());

    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(currentRealm);
      const realmDir = currentRealm === '/' ? 'root' : currentRealm;
      let applications: ApplicationRecord[];
      try {
        applications = name
          ? [await frodo.app.readApplicationByName(name)]
          : await frodo.app.readApplications();
      } catch (error) {
        if (name) {
          // the one application that was asked for: nothing for the flag to allow
          printError(
            error,
            `Error reading application '${name}' in realm '${currentRealm}'`
          );
          namedFailed = true;
        } else {
          printError(
            error,
            `Error reading the applications of realm '${currentRealm}'`
          );
          run.recordFailure(`realm ${realmDir}`, causeOf(error));
        }
        continue;
      }
      found += applications.length;

      const folders = new Map<string, string>();
      for (const application of [...applications].sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        const label = `${realmDir}/${application.name}`;
        let folderName: string;
        try {
          folderName = applicationFolderName(application.name);
        } catch (error) {
          printError(
            error,
            `Application '${application.name}' cannot be pulled`
          );
          run.recordFailure(label, causeOf(error));
          continue;
        }
        // a file system may ignore case, so names that differ only in case share a folder too
        const folderKey = folderName.toLowerCase();
        if (folders.has(folderKey)) {
          // two names, one folder: the first one is pulled, the second one is not
          const other = folders.get(folderKey);
          printMessage(
            `Application '${application.name}' of realm '${currentRealm}' would share a folder with '${other}'.`,
            'error'
          );
          run.recordFailure(
            label,
            `its folder name collides with the application '${other}'`
          );
          continue;
        }
        folders.set(folderKey, application.name);

        await run.run(label, async () => {
          if (!markerWritten) {
            writeTreeMarker(treeDir, 'folders');
            markerWritten = true;
          }
          await pullApplication(
            application,
            currentRealm,
            `realms/${realmDir}/applications/${folderName}`,
            readMappingsOnce
          );
        });
      }
    }

    if (found === 0 && !namedFailed && !quiet) {
      printMessage('No applications found.', 'info');
    }
    return run.finish() && !namedFailed;
  } catch (error) {
    printError(error, 'Error pulling applications');
    return false;
  }
}

/**
 * Pull one application into its folder, as far as it goes: every object is its
 * own step, and what cannot be pulled does not stop the others.
 * @param {ApplicationRecord} application the record, as the library reads it
 * @param {string} realm the realm of the application (the current realm of the state)
 * @param {string} folder the folder of the application, relative to the working directory
 * @param {() => Promise<any[]>} readMappings reads all mappings of the tenant, once per command
 * @throws {Error} after the work, if an object could not be pulled or the application refers to an object that does not exist, naming each
 */
async function pullApplication(
  application: ApplicationRecord,
  realm: string,
  folder: string,
  readMappings: () => Promise<any[]>
): Promise<void> {
  const incomplete: string[] = [];
  const piece = async (what: string, work: () => Promise<void> | void) => {
    try {
      await work();
    } catch (error) {
      printError(
        error,
        `Error pulling ${what} of application '${application.name}'`
      );
      incomplete.push(`${what}: ${causeOf(error)}`);
    }
  };

  const references = await frodo.app.readApplicationReferences(application._id);

  const record: Record<string, unknown> = { ...application };
  for (const field of RECORD_FIELDS_NOT_PULLED) delete record[field];
  await piece('the application record', () =>
    saveJsonToFile(
      record,
      getFilePath(`${folder}/application.json`, true),
      false,
      false
    )
  );

  const owned = (kind: string) =>
    references.references.filter(
      (reference: ApplicationReferenceItem) =>
        reference.ownership === 'owned' && reference.kind === kind
    );
  const shared = (kind: string) =>
    references.references.filter(
      (reference: ApplicationReferenceItem) =>
        reference.ownership === 'shared' && reference.kind === kind
    );

  for (const client of owned('oauth2Client')) {
    await piece(`OAuth2 client ${client.id}`, async () => {
      const agent = await frodo.agent.readAgentByTypeAndId(
        'OAuth2Client',
        client.id
      );
      if (isConfidentialClient(agent)) {
        verboseMessage(
          `The secret of the OAuth2 client of application '${application.name}' is written as \${${clientSecretVariable(application.name)}}; set that variable when you push.`
        );
      }
      saveJsonToFile(
        clientFile(agent, application.name),
        getFilePath(`${folder}/oauth2-client.json`, true),
        false,
        false,
        true
      );
    });
  }

  for (const provider of owned('saml2Provider')) {
    await piece(`SAML provider ${provider.id}`, async () => {
      const { config, metadata } = await readSamlProviderForFile(provider.id);
      const role = provider.from === 'ssoEntities.idpPrivateId' ? 'idp' : 'sp';
      saveJsonToFile(
        { config, metadata },
        getFilePath(`${folder}/saml/${role}.json`, true),
        false,
        true
      );
    });
  }

  for (const connector of owned('connector')) {
    await piece(`connector ${connector.id}`, async () => {
      const definition = await frodo.idm.connector.readConnector(connector.id);
      saveJsonToFile(
        definition,
        getFilePath(`${folder}/connector.json`, true),
        false,
        true
      );
    });
  }

  const mappingNames = owned('mapping').map((mapping) => mapping.id);
  if (mappingNames.length > 0) {
    await piece('the mappings', async () => {
      const all = await readMappings();
      for (const mappingName of mappingNames) {
        await piece(`mapping ${mappingName}`, () => {
          const found = all.find((m) => m.name === mappingName);
          if (!found) {
            throw new Error(`the mapping ${mappingName} does not exist`);
          }
          // a legacy mapping (in sync.json) has no id of its own in its file, as in `pull connector-mappings`
          const mapping = structuredClone(found);
          delete mapping._rev;
          if (String(mapping._id ?? '').startsWith('sync/')) delete mapping._id;
          exportMappingToDirectory(
            mapping,
            `${folder}/mappings/${mappingName}`
          );
        });
      }
    });
  }

  // what the application shares with others goes where its own kind goes
  for (const reference of shared('script')) {
    if (reference.isDefault) continue; // every tenant has the default scripts
    await piece(`script ${reference.name ?? reference.id}`, async () => {
      const script = await frodo.script.readScript(reference.id);
      if (script.language !== 'JAVASCRIPT') {
        printMessage(
          `Script '${script.name}' of application '${application.name}' is not a JavaScript script and cannot be pulled; the same holds for 'pull scripts'.`,
          'warn'
        );
        return;
      }
      exportScriptToFiles(script, realm);
    });
  }
  for (const reference of shared('circleOfTrust')) {
    await piece(`circle of trust ${reference.id}`, () =>
      exportCircleOfTrustToFile(reference.id, realm)
    );
  }

  // glossary values, request forms and request types are left out on purpose (cli#1132)
  for (const problem of references.problems) {
    if (KINDS_LEFT_OUT.includes(problem.kind)) continue;
    incomplete.push(describeProblem(problem));
  }

  if (incomplete.length > 0) {
    throw new Error(`pulled as far as it goes, but ${incomplete.join('; ')}`);
  }
}
