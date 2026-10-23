---
applyTo: 'src/utils/interactive/**/*.ts,src/utils/TextLayout.ts,src/ops/**/*.ts,test/unit/*Prompt*.test.js'
---

# Where interactive code lives

The interactive framework is ambient: a command is written the usual way and interactivity attaches to it. The rules for new code are in [docs/INTERACTIVE-COMMANDS.md, "Layering: where interactive code lives"](../../docs/INTERACTIVE-COMMANDS.md#layering-where-interactive-code-lives). In short:

- **All prompt code lives in `src/utils/interactive/`:** prompt components, pickers and the prompts of natively interactive commands. Command files in `src/cli/` import it plainly or not at all; they contain no prompt code.
- **Do not add imports from `src/ops/` to `src/utils/interactive/`.** A new prompt takes its data loader as a parameter and the command file injects it (`DebugTailPrompt` does this). `JourneyDebugPrompt` importing `JourneyDebugAggregator` is the one sanctioned exception, documented in the guide.
- **`src/ops/` modules do not prompt.** The documented exception is one proceed or abort gate inside an operation (`LoginSetupOps`, "Apply these changes?"): never value collection, resolver prompting or a standalone picker.
- **Types that both layers need live in `src/utils/interactive/`,** so no layer imports a type across the boundary.
- `src/ops/AuthenticateOps.ts` reaches prompt code through lazy `await import()` so the frodo-lib graph stays clean for Jest mocks. Keep it that way.

## Frames and text

- **Draw frames only through `renderFramedBox`, `renderNavigationMenu` and `wrapLine`** (`src/utils/interactive/NavigationMenu.ts`). They split on line breaks, expand tabs, re-wrap rows that do not fit and cut an over-wide title, so raw log or tenant text cannot break a frame. Never assemble box characters in a prompt.
- **A dashboard's width comes from `useTerminalWidth()`** (`TerminalWidth.ts`). Pass it as `width` to `renderNavigationMenu` and `renderFramedBox`, and size your own rows with `frameInnerWidth(width)`. Do not hard-code 116 or 120.
- **A single-line cell (a list column) is flattened and cut with `singleLine` and `truncate`** from `src/utils/TextLayout.ts`. Wrapping it would add rows.
- **Text helpers live in `src/utils/TextLayout.ts`, never in a prompt file.** It has no imports, so `src/ops/` can use it too.
- **Every prompt's render test asserts the frame at several widths with hostile text,** using `assertFrame`, `FRAME_WIDTHS` and `HOSTILE_TEXTS` from `test/utils/FrameAssertions.js` (examples: `JourneyDebugPrompt.test.js`, `DebugTailPromptFrame.test.js`).
