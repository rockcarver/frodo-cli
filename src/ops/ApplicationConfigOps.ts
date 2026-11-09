import { randomUUID } from 'crypto';
import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import {
  exportMappingToDirectory,
  readMappingFromDirectory,
} from '../configManagerOps/FrConfigConnectorMappingOps';
import {
  exportCircleOfTrustToFile,
  findCirclesOfTrustOfProviders,
  importCircleOfTrustFromFile,
  importSamlProviderFromFile,
  readSamlProviderForFile,
} from '../configManagerOps/FrConfigSamlOps';
import {
  exportScriptToFiles,
  importScriptFromFiles,
} from '../configManagerOps/FrConfigScriptOps';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { clearOperationalAttributes, realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import {
  applicationFolderName,
  decideApplicationLayout,
  writeTreeMarker,
  type ApplicationLayoutDecision,
} from '../utils/TreeLayout';

const {
  getFilePath,
  saveJsonToFile,
  getWorkingDirectory,
  escapePlaceholders,
  readJsonFile,
} = frodo.utils;
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
  // a literal ${ in the record stays literal when the push reads the file back
  await piece('the application record', () =>
    saveJsonToFile(
      escapePlaceholders(record),
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
        escapePlaceholders(definition),
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

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

/** The files of one application folder, read and with the placeholders resolved. */
interface ApplicationFiles {
  /** The application record, as the file holds it. */
  record: any;
  /** The OAuth2 client, if the record names one. */
  client?: any;
  /** The SAML providers the record names, identity provider first. */
  providers: {
    file: string;
    location: 'hosted' | 'remote';
    content: { config: any; metadata: string };
  }[];
  /** The connector the record names. */
  connector?: any;
  /** The mappings the record names, with their script sources inline. */
  mappings: { name: string; data: any }[];
}

/** Where the identity provider and the service provider of an application live, unless its record says otherwise. */
const DEFAULT_PROVIDER_LOCATION = { idp: 'hosted', sp: 'remote' } as const;

/**
 * Read every file of an application folder before anything is written, so that a
 * missing environment variable or an incomplete folder fails the application
 * while the tenant is still untouched. What the record names (the OAuth2 client,
 * the SAML providers, the connector and its mappings, as the library reads it
 * from the record) has to have its file, or the folder is incomplete.
 * @param {string} folder the folder of the application, absolute
 * @param {string} relativeFolder the same folder, relative to the working directory (the library resolves paths it is given against that directory)
 * @returns {ApplicationFiles} what the folder holds
 * @throws {Error} if the record is missing, a file cannot be read (a placeholder without a value names the variable), or the folder is incomplete
 */
function readApplicationFolder(
  folder: string,
  relativeFolder: string
): ApplicationFiles {
  if (!fs.existsSync(`${folder}/application.json`)) {
    throw new Error(`the folder has no application.json`);
  }
  const record = readJsonFile(`${folder}/application.json`) as any;
  if (!record?.name) {
    throw new Error(`application.json has no name`);
  }
  const owned = frodo.app
    .getApplicationRecordReferences(record)
    .filter((reference) => reference.ownership === 'owned');
  const files: ApplicationFiles = { record, providers: [], mappings: [] };
  const missing: string[] = [];
  const need = (file: string): boolean => {
    if (fs.existsSync(`${folder}/${file}`)) return true;
    missing.push(file);
    return false;
  };

  if (owned.some((reference) => reference.kind === 'oauth2Client')) {
    if (need('oauth2-client.json')) {
      files.client = readJsonFile(`${folder}/oauth2-client.json`);
      if (!files.client?._id) {
        throw new Error(`oauth2-client.json has no _id`);
      }
    }
  }
  for (const reference of owned.filter((r) => r.kind === 'saml2Provider')) {
    const role = reference.from === 'ssoEntities.idpPrivateId' ? 'idp' : 'sp';
    const file = `saml/${role}.json`;
    if (!need(file)) continue;
    const content = readJsonFile(`${folder}/${file}`) as any;
    if (!content?.config?.entityId) {
      throw new Error(`${file} has no config with an entityId`);
    }
    const stated = record.ssoEntities?.[`${role}Location`];
    files.providers.push({
      file,
      location:
        stated === 'hosted' || stated === 'remote'
          ? stated
          : DEFAULT_PROVIDER_LOCATION[role],
      content,
    });
  }
  if (owned.some((reference) => reference.kind === 'connector')) {
    if (need('connector.json')) {
      files.connector = readJsonFile(`${folder}/connector.json`);
    }
  }
  for (const reference of owned.filter((r) => r.kind === 'mapping')) {
    const file = `mappings/${reference.id}/${reference.id}.json`;
    if (!need(file)) continue;
    files.mappings.push({
      name: reference.id,
      data: readMappingFromDirectory(
        `${relativeFolder}/mappings/${reference.id}`,
        reference.id
      ),
    });
  }
  if (missing.length > 0) {
    throw new Error(
      `the folder is incomplete: the record names objects whose files are missing (${missing.join(', ')}); nothing was pushed for it`
    );
  }
  return files;
}

/** Collect every string value of a JSON value. */
function collectStrings(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => collectStrings(v, into));
}

/**
 * The scripts in the files of a realm that the given contents use, libraries
 * before the scripts that require them. A content uses a script when it holds
 * the id of a script that has a configuration file in the realm; a script uses a
 * library when its text requires it by name.
 * @param {unknown[]} contents the OAuth2 client and the SAML providers of an application
 * @param {string} realmDir the folder name of the realm (`root` for `/`)
 * @returns {string[]} script ids in the order to import them
 */
function scriptsUsedBy(contents: unknown[], realmDir: string): string[] {
  const configDir = `${getWorkingDirectory()}/realms/${realmDir}/scripts/scripts-config`;
  if (!fs.existsSync(configDir)) return [];
  const local = new Map<string, { name: string; textFile?: string }>();
  for (const file of fs.readdirSync(configDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const config = JSON.parse(
        fs.readFileSync(`${configDir}/${file}`, 'utf8')
      );
      local.set(config._id ?? file.slice(0, -'.json'.length), {
        name: config.name,
        textFile: config.script?.file,
      });
    } catch {
      // a script file that cannot be read is reported when the script is imported, if it is used
    }
  }
  if (local.size === 0) return [];
  const idByName = new Map([...local].map(([id, { name }]) => [name, id]));
  const strings = new Set<string>();
  contents.forEach((content) => collectStrings(content, strings));

  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const { textFile } = local.get(id) as { textFile?: string };
    let text = '';
    try {
      if (textFile) {
        text = fs.readFileSync(
          `${getWorkingDirectory()}/realms/${realmDir}/scripts/${textFile}`,
          'utf8'
        );
      }
    } catch {
      // the text is read again, and fails with its own message, when the script is imported
    }
    for (const required of text.matchAll(
      /require\(\s*['"]([^'"]+)['"]\s*\)/g
    )) {
      const library = idByName.get(required[1]);
      if (library) visit(library);
    }
    ordered.push(id);
  };
  [...strings]
    .filter((id) => local.has(id))
    .sort()
    .forEach(visit);
  return ordered;
}

/**
 * Push applications from the files that `pull applications` writes (decision
 * record 0042): one folder per application,
 * `realms/<realm>/applications/<name>/`. The application is matched BY NAME:
 * a tenant that has an application of that name gets the configuration
 * fields of the file under its own id (a PUT that leaves its members, owners and
 * roles alone), a tenant that has none gets a new application. Members, owners,
 * roles, the glossary and request forms are never written.
 *
 * Every folder is one operation of an {@link OperationRun} and is pushed in
 * this order, each step before the next one needs it:
 * 1. every file of the folder is read, with the placeholders resolved: a
 *    placeholder without a value fails the application and names the variable,
 *    and a folder that lacks a file the record names fails it too, before
 *    anything is written;
 * 2. the scripts the OAuth2 client and the SAML providers use (shared with other
 *    applications: they are at the paths `pull scripts` writes), libraries first;
 * 3. the connector, then its mappings, then the OAuth2 client, then the SAML
 *    identity provider and service provider;
 * 4. the circles of trust the providers are members of (shared: at the path
 *    `pull saml` writes), after the providers, because the library keeps only
 *    members that exist;
 * 5. the application record, last: an application that refers to an object that
 *    could not be pushed is not written, and is named in the summary.
 *
 * A push needs no marker: the folders are the input, and nothing is created or
 * changed in the tree. A named application without a folder, and a name that
 * needs a realm, fail the command whatever `--allow-failures` says; nothing to
 * push is not a failure.
 * @param {string} name optional name: push only that application (needs a single realm)
 * @param {string} realm optional realm: push only that realm. Default: every realm folder that has applications
 * @param {boolean} allowFailures true to report applications that could not be pushed but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportApplications(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    let realmDirs: string[];
    if (named) {
      realmDirs = [realm === '/' ? 'root' : realm];
    } else if (fs.existsSync(realmsDir)) {
      realmDirs = fs
        .readdirSync(realmsDir, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            fs.existsSync(`${realmsDir}/${entry.name}/applications`)
        )
        .map((entry) => entry.name)
        .sort();
    } else {
      realmDirs = [];
    }
    if (name && realmDirs.length !== 1) {
      printMessage(
        'Error: for a named application, specify a single realm',
        'error'
      );
      return false;
    }

    const run = new OperationRun({ unit: 'application', allowFailures });
    let found = 0;
    let namedFound = false;
    for (const realmDir of realmDirs) {
      const currentRealm = realmDir === 'root' ? '/' : realmDir;
      const applicationsDir = `${realmsDir}/${realmDir}/applications`;
      if (!fs.existsSync(applicationsDir)) continue;
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        printMessage(
          `Applications of the root realm are skipped: the root realm of a Cloud tenant has no applications.`,
          'warn'
        );
        continue;
      }
      state.setRealm(currentRealm);

      const folders = fs
        .readdirSync(applicationsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      // the folders to push: all of them, or the one whose record has the name that was asked for
      const selected: { folder: string; label: string }[] = [];
      for (const folder of folders) {
        let applicationName: string | undefined;
        try {
          applicationName = JSON.parse(
            fs.readFileSync(
              `${applicationsDir}/${folder}/application.json`,
              'utf8'
            )
          ).name;
        } catch {
          // reported as that application's failure below, unless another application was asked for
        }
        if (name && applicationName !== name) continue;
        if (name) namedFound = true;
        selected.push({
          folder,
          label: `${realmDir}/${applicationName ?? folder}`,
        });
      }
      if (selected.length === 0) continue;
      found += selected.length;

      // one read of the applications of the realm, before anything is written into it
      let existing: Awaited<ReturnType<typeof frodo.app.readApplications>>;
      try {
        existing = await frodo.app.readApplications();
      } catch (error) {
        printError(
          error,
          `Error reading the applications of realm '${currentRealm}'`
        );
        run.recordFailure(`realm ${realmDir}`, causeOf(error));
        continue;
      }
      for (const { folder, label } of selected) {
        await run.run(label, () =>
          pushApplication(folder, currentRealm, realmDir, existing)
        );
      }
    }

    if (name && !namedFound) {
      printMessage(
        `Application '${name}' has no folder in realm ${named ? realm : realmDirs[0]}.`,
        'error'
      );
    } else if (found === 0 && !name) {
      printMessage('No applications found to push.', 'info');
    }
    return run.finish() && !(name && !namedFound);
  } catch (error) {
    printError(error, 'Error pushing applications');
    return false;
  }
}

/**
 * Push one application folder: the shared pieces and the owned objects first, the
 * record last, each step named in the error if it fails.
 * @param {string} folder the name of the folder of the application, in the applications folder of the realm
 * @param {string} realm the realm of the application (the current realm of the state)
 * @param {string} realmDir the folder name of the realm
 * @param {ApplicationRecord[]} existing the applications of the realm on the tenant
 * @throws {Error} naming the step that failed; the record is written only if every step before it worked
 */
async function pushApplication(
  folder: string,
  realm: string,
  realmDir: string,
  existing: ApplicationRecord[]
): Promise<void> {
  const relativeFolder = `realms/${realmDir}/applications/${folder}`;
  const files = readApplicationFolder(
    `${getWorkingDirectory()}/${relativeFolder}`,
    relativeFolder
  );
  const name: string = files.record.name;
  const step = async (what: string, work: () => Promise<unknown> | unknown) => {
    try {
      await work();
    } catch (error) {
      printError(error, `Error pushing ${what} of application '${name}'`);
      throw new Error(
        `${what}: ${causeOf(error)}; the application record was not written`,
        { cause: error }
      );
    }
  };

  const used = scriptsUsedBy(
    [files.client, ...files.providers.map((p) => p.content)].filter(Boolean),
    realmDir
  );
  for (const scriptId of used) {
    await step(`script ${scriptId}`, () =>
      importScriptFromFiles(scriptId, realm)
    );
  }

  if (files.connector) {
    const connectorId = String(files.connector._id).split('/')[1];
    await step(`connector ${connectorId}`, () =>
      frodo.idm.connector.importConnectors(
        { connector: { [connectorId]: files.connector } },
        { deps: false }
      )
    );
  }
  for (const { name: mappingName, data } of files.mappings) {
    await step(`mapping ${mappingName}`, () => {
      // a pulled mapping of the new style keeps its id, a legacy one (in sync.json) has none
      const isNew = String(data._id ?? '').startsWith('mapping/');
      const mappingId = isNew ? data._id : `sync/${mappingName}`;
      const mapping = { ...data, _id: mappingId };
      return frodo.idm.mapping.importMapping(
        mappingId,
        isNew
          ? {
              mapping: { [mappingId]: mapping },
              sync: { _id: 'sync', mappings: [] } as any,
            }
          : { mapping: {}, sync: { _id: 'sync', mappings: [mapping] } as any },
        { deps: false }
      );
    });
  }
  if (files.client) {
    const client = files.client;
    // the operational attributes, the id among them, are cleared from what is sent, as `push oauth2-agents` does
    const clientId = client._id as string;
    await step(`OAuth2 client ${clientId}`, () => {
      clearOperationalAttributes(client);
      return frodo.agent.importAgent(
        clientId,
        { agent: { [clientId]: client } } as any,
        false
      );
    });
  }
  for (const provider of files.providers) {
    await step(`SAML provider ${provider.content.config.entityId}`, () =>
      importSamlProviderFromFile(provider.content, provider.location)
    );
  }
  const memberships = findCirclesOfTrustOfProviders(
    realm,
    files.providers.map((p) => p.content.config.entityId)
  );
  for (const cotId of memberships) {
    await step(`circle of trust ${cotId}`, () =>
      importCircleOfTrustFromFile(cotId, realm)
    );
  }

  // the record last, matched by name, never with the data of who has access
  const body: Record<string, unknown> = { ...files.record };
  for (const field of RECORD_FIELDS_NOT_PULLED) delete body[field];
  const current = existing.find((application) => application.name === name);
  if (current) {
    const applicationId = current._id as string;
    verboseMessage(`Updating application '${name}' (${applicationId}).`);
    await step('the application record', () =>
      frodo.app.importApplication(
        applicationId,
        {
          managedApplication: {
            [applicationId]: { ...body, _id: applicationId },
          },
        } as any,
        { deps: false }
      )
    );
  } else {
    const applicationId = randomUUID();
    verboseMessage(`Creating application '${name}' (${applicationId}).`);
    await step('the application record', () =>
      frodo.app.createApplication(applicationId, {
        ...body,
        _id: applicationId,
      } as any)
    );
  }
}
