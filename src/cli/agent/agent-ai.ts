import AIAgentCmd from '../aiagent/aiagent.js';

/**
 * `frodo agent ai`, deprecated in favour of the root group `frodo aiagent`
 * (cli#1271). It is that group's factory registered under a second parent,
 * with its name, description and stability changed, so both paths run the same
 * commands. The path is frozen: the commands are built with `legacy = true`, which
 * keeps their options and help as they were in 4.x (no usage examples, and the
 * original rule of `import`). Removing the old path means deleting this file and
 * the line in agent.ts; a major release may do it (decision record 0048).
 */
export default function setup() {
  return AIAgentCmd(true)
    .name('ai')
    .description('Deprecated: use frodo aiagent. Manage AI agents.')
    .withStability(
      'deprecated',
      undefined,
      "Use 'frodo aiagent' instead: the commands and options are the same. 'frodo agent ai' keeps working in 5.x and may be removed in a later major release."
    );
}
