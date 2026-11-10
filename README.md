<!-- README.md for NPM; the one for GitHub is .github/README.md. -->
# Frodo Command Line Interface

A command line interface to manage PingOne Advanced Identity Cloud environments, ForgeOps deployments, and classic deployments.

Frodo is the successor to field tools like [amtree.sh](https://github.com/vscheuber/AM-treetool), [fidc-debug-tools](https://github.com/vscheuber/fidc-debug-tools), and Ping/ForgeRock-internal utilities.

Please refer to the [GitHub README](https://github.com/rockcarver/frodo-cli#readme) for full documentation.

For air-gapped installs, run `frodo settings update-check disable` to persistently disable automatic update checks, `show` to see the effective state and its source, or `enable` to restore the persisted preference. Either the setting or `FRODO_NO_UPDATE_CHECK=1` disables start-up requests to GitHub and npm. Installed versions remain available with `frodo -v` or `--version`.
