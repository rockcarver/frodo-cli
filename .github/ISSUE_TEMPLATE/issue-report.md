---
name: Issue report
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''

---

## Frodo CLI version
Provide output of `frodo -v`

## Describe the issue
A clear and concise description of what the issue is.

## Stack trace (if the command crashed)
The npm package and the Docker image print stack traces without the original TypeScript file names. If you can, run the failing command again with `FRODO_SOURCE_MAPS=1` in the environment and paste the trace from that run. The native binary (Homebrew, the release zips) ignores the variable and has no source maps, so there is nothing to switch on there.
