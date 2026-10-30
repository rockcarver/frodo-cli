# Related repositories

this: rockcarver/frodo-cli

related:
  - role: library
    repo: rockcarver/frodo-lib
    secret: FRODO_LIB_ISSUES_TOKEN
    release:
      requires_consumer_release: true
      pins: "@rockcarver/frodo-lib"
    when: |
      Only when it is clear that the failing code is in the library and the CLI
      merely shows the result: a call to a tenant endpoint builds a wrong request
      or misreads the answer; export or import of an entity loses, adds or breaks
      data or fails on a reference between entities; the authentication protocol
      itself (token requests, the browser or device login flow, service account
      JWTs) misbehaves; or the problem reproduces by calling the `frodo` facade
      from a script without the CLI. If any of this is a guess, keep the issue here.

notes: |
  Decide by where the failing code lives, not by what the person was doing and
  not by the outermost error message.

  This repository owns, so keep the issue here: every prompt and every read from
  the terminal or standard input (the library only calls a handler the CLI gives
  it, for example to ask for a verification code); interactive mode; the MCP
  server (transport, authentication, lifecycle); the frodo shell; argument
  parsing, help and output formatting; the `conn` and `login` commands and what
  they print or ask; how the CLI starts a browser login; the packaged binary, the
  npm package and how the shipped build behaves in a given environment; and the
  config-manager, promote and admin commands, which are implemented here.

  The library owns: calls to tenant endpoints, export and import of entities and
  the shape of their data, the `frodo` facade, the authentication protocol,
  connection profile storage and encryption, the token cache and the
  recordings. It also still contains deprecated terminal colour code and the
  terminal background detection (`TerminalBackgroundDetection`, which sends an
  OSC 11 query and reads the reply from standard input).

  Wrapped errors: the library wraps what it catches in messages such as
  "Error getting tokens" and "Error authenticating user". Those outer messages
  come from the library even when the failure started in the CLI. Read the
  innermost cause. A failing read from the terminal or standard input (for
  example EAGAIN), a prompt, or an interactive-mode problem is a CLI problem,
  because prompts live here and the library only calls the handler. The one
  exception: a stack trace that names the library's terminal background
  detection is a library problem.

  A feature request for a command stays here. New capabilities are built in the
  library first, so the plan names the library function it needs and the library
  issue is opened from the plan, not at intake.

  When in doubt, keep the issue in this repository and say which part might be
  in the other one.
