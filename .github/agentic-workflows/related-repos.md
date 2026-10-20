# Related repositories

this: rockcarver/frodo-cli

related:
  - role: library
    repo: rockcarver/frodo-lib
    secret: FRODO_LIB_ISSUES_TOKEN
    when: |
      Functional bugs, API behavior, authentication flows, data handling,
      configuration management, and anything that is not purely CLI surface
      (argument parsing, help text, output formatting, packaging).

notes: |
  Most issues reported against the CLI actually belong in the library.
  Only keep issues that are strictly about the CLI wrapper itself.
