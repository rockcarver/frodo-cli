---
applyTo: 'src/utils/interactive/**/*.ts,src/ops/**/*.ts'
---

# Where interactive code lives

The interactive framework is ambient: a command is written the usual way and interactivity attaches to it. The rules for new code are in [docs/INTERACTIVE-COMMANDS.md, "Layering: where interactive code lives"](../../docs/INTERACTIVE-COMMANDS.md#layering-where-interactive-code-lives). In short:

- **All prompt code lives in `src/utils/interactive/`:** prompt components, pickers and the prompts of natively interactive commands. Command files in `src/cli/` import it plainly or not at all; they contain no prompt code.
- **Do not add imports from `src/ops/` to `src/utils/interactive/`.** A new prompt takes its data loader as a parameter and the command file injects it (`DebugTailPrompt` does this). `JourneyDebugPrompt` importing `JourneyDebugAggregator` is the one sanctioned exception, documented in the guide.
- **`src/ops/` modules do not prompt.** The documented exception is one proceed or abort gate inside an operation (`LoginSetupOps`, "Apply these changes?"): never value collection, resolver prompting or a standalone picker.
- **Types that both layers need live in `src/utils/interactive/`,** so no layer imports a type across the boundary.
- `src/ops/AuthenticateOps.ts` reaches prompt code through lazy `await import()` so the frodo-lib graph stays clean for Jest mocks. Keep it that way.
