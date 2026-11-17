---
status: proposed
date: 2026-11-16
decision-makers: maintainers
applies-to:
  - src/ops/AgentKeySets.ts
  - src/ops/ConfigManagerAgentKind.ts
  - src/configManagerOps/FrConfigOauth2AgentOps.ts
  - src/ops/ApplicationConfigOps.ts
  - src/cli/config-manager/**
  - test/unit/AgentKeySets.test.js
issues:
  - rockcarver/frodo-cli#1355
  - rockcarver/frodo-cli#1363
---

# A pull never writes private or secret key material into an agent file

## Context and problem statement

A trusted JWT issuer, a software publisher, a remote consent agent and an OAuth2 client have a `jwkSet`: the key set of the other party, which the server uses to verify what that party signs. It is meant to hold public keys, but nothing stops a person from storing a private or a symmetric key in it. [Core 0013](core/0013-secrets-are-never-exported-in-the-clear.md) says a secret is never exported in the clear, and the files of `config-manager` are meant to be committed. The first writers of these files wrote such a key set as it was and printed a warning, so the key reached the file and, with the next commit, the history of a repository.

## Decision

1. **Never written.** A pull does not write a key set that holds a private or a symmetric key: a JWK with a member `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` or `k`. A key set with public keys only is written as it is. One private key among public ones makes the whole key set private: half of a secret is not written either.
2. **A placeholder instead.** The property holds `${<ID>_JWKSET}`: the id of the object in upper case, with `-` as `_` the way [record 0054](0054-a-config-manager-object-has-one-writer-and-agent-files-are-written-in-the-plain-shape.md) names the variable of a password (rule 7), and any other character that a variable name cannot have as `_`. It is not escaped: it is meant to be filled.
3. **Whatever the source.** The rule is applied last, after the overrides are merged: an override that is a placeholder of the user's own is kept, and a key in an overrides file is replaced like any other.
4. **One warning per object.** It names the object, the realm, the property and the variable, and never a part of the key. It is not a failure and changes no exit code. The key set is not a property that was left out, so the verbose count of record 0054 does not include it.
5. **Every writer.** The shared module of the kinds with a file per object (issuers, software publishers and the later ones), the generic `oauth2-agents` kind and the application folder (the `oauth2-client.json` of an application) apply it through the one function in `src/ops/AgentKeySets.ts`; the key set of an OAuth2 client is the one in its signing and encryption group. The application folder names its variable the way it names the one of the client secret: `APP_<NAME>_JWKSET`, with the name of the application in upper case and every run of characters other than letters and digits as one underscore (`APP_<NAME>_CLIENT_SECRET`, record 0042): the name of the application, not the id of the client, names the variable. `migrate applications` pulls the application again, so it follows the same rule.
6. **A push fills it from the key set as it is.** The variable holds the key set as JSON text, from `-E`, `--env-file` or the environment of the process as for any placeholder. The push puts it into the string of the file, so a key set with quotes works; a value that somebody already escaped by hand still works. A variable without a value fails that file, names the variable, sends nothing for it and never stores the placeholder.
7. **No flag writes the key.** There is no option that puts a private key into a file.

## Consequences

- A tree that holds a private key set pulls differently the next time; the key stays where the user keeps secrets and is given to the push as a variable.
- Two objects with the same id in different realms name the same variable: push them in separate runs when their key sets differ.
- Two applications whose names differ only in case or in the characters that become an underscore name the same variable, as they do for `APP_<NAME>_CLIENT_SECRET`.
- Kept in sync: the function and its tests, the help of the pull and push commands that name the placeholder, and the writers listed above.

## Alternatives considered

- **Refuse the object unless a flag is given:** safe by default, but the flag exists to write a key into a file, which core 0013 forbids, and the object is missing from the tree.
- **Keep the warning only:** the key reaches version control and its history.
