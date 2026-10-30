---
name: pin-the-library
description: Use when frodo-cli has to move to a new exact version of frodo-lib, for example after a library prerelease that a CLI change needs. Covers when the pin may change, the exact install, the lockfile check against the registry, the checks to run, and the format of the pull request. Never merges.
---

# Pin the library

The CLI pins an exact version of `@rockcarver/frodo-lib` in `devDependencies` (a bundled package; `dependencies` stays empty, see `docs/BUILD-ENV.md` section 2.2.1). The pin is deliberate: CLI CI always validates against the library version it ships with. A CLI change that needs library behaviour waits for the library release and for this pin. Releasing the library is the `release-the-lib` skill of [frodo-lib](https://github.com/rockcarver/frodo-lib/blob/main/.claude/skills/release-the-lib/SKILL.md) (a maintainer's job); using the new version in a release of the CLI is [release-the-cli](../release-the-cli/SKILL.md).

This pull request changes two files and nothing else. **You open it and report; the maintainer merges** (core 0002, [a maintainer stays the last lever on agent work](../../../docs/decisions/core/0002-a-maintainer-stays-the-last-lever-on-agent-work.md)).

## Before you start

- **A maintainer asked for the pin** and named the version. Never pin a version nobody released: no range, no `file:` or git dependency, no prerelease that is not on npm.
- **The version is visible on npm.** After a publish npm can hold a new version in "Validating" for 25 minutes to about four hours: the publish log says `+ @rockcarver/frodo-lib@<version>`, but the registry answers 404 and the `next` tag does not move. Opening the pin earlier fails CI at `npm ci`. Check:

  ```console
  npm view @rockcarver/frodo-lib dist-tags --json
  npm view @rockcarver/frodo-lib@<version> version dist.integrity
  ```

  If it is not there yet, say so and wait; do not work around it.
- **The library release exists on GitHub** (`gh release view v<version> -R rockcarver/frodo-lib`): the pull request links it.
- **No other pull request moves the same pin.** Dependabot's weekly group can touch it (see `.github/dependabot.yml`): `gh pr list --search "frodo-lib in:title"`. Do not open a second one.

## Make the pin

1. Branch from `origin/main`: `chore/pin-frodo-lib-<version>`.
2. Install it exactly. `--ignore-scripts` keeps the install from running the library's postinstall in your checkout:

   ```console
   npm install --save-dev --save-exact --ignore-scripts @rockcarver/frodo-lib@<version>
   ```

3. `git diff --stat` must show `package.json` and `package-lock.json` and about five changed lines: the version in `devDependencies`, the same in the lockfile's root entry, and `version`, `resolved` and `integrity` of the library's own entry. Anything more (another package moved, a different registry URL) means something is wrong: stop and look.
4. **The lockfile integrity is the registry's.** The `integrity` line in `package-lock.json` must equal `npm view @rockcarver/frodo-lib@<version> dist.integrity`.
5. Run the checks:

   ```console
   npx tsc --noEmit
   npm run check
   ```

   A pin alone must compile. If it does not, the new library changed a type the CLI uses: say which, and do not fix it inside the pin pull request.

## The pull request

- **Title:** `fix(deps): bump frodo-lib to <version>`. The title feeds the generated changelog. Do not edit `CHANGELOG.md`.
- **Label:** `no-auto-processing`.
- **Body:** which library release it pins, with the link; what the release brings and which open CLI pull requests need it (full links to the library pull requests); that only `package.json` and `package-lock.json` change; that the lockfile integrity was checked against `npm view`; that `tsc` and `npm run check` pass. End it the way your other pull request bodies end.
- Wait for the checks. Report the link and the state. The maintainer merges, or tells you to.

## After the merge

Pull requests that waited for the pin get `main` merged into their branch (see [release-the-cli](../release-the-cli/SKILL.md)).
