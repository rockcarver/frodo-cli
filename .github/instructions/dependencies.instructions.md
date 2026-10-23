---
applyTo: 'package.json,tsdown.config.ts,tsdown.sea.config.mts'
---

# Dependencies

This CLI ships as a zero-dependency package: `dependencies` in `package.json` stays empty.

- **A package imported by shipped code goes in `devDependencies`.** The bundler (tsdown) inlines `devDependencies` into the bundle and externalizes anything under `dependencies`. An externalized package breaks the native binary at runtime, because no `node_modules` exists next to it.
- **If something genuinely cannot be bundled,** raise it as a design problem in the pull request instead of moving it to `dependencies` or forcing `alwaysBundle`.
- **After changing the dependency graph,** run the verification in [docs/BUILD-ENV.md, section 2.2.1](../../docs/BUILD-ENV.md): build fresh and confirm the bundles contain no bare `require("@...")`.
