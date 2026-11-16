import { tool } from '@opencode-ai/plugin';
import { ptyKill } from "../plugin/pty/tools/kill.js";
import { ptyList } from "../plugin/pty/tools/list.js";
import { ptyRead } from "../plugin/pty/tools/read.js";
import { ptySpawn } from "../plugin/pty/tools/spawn.js";
import { ptyWrite } from "../plugin/pty/tools/write.js";
export const ptyTools = {
    pty_spawn: ptySpawn,
    pty_write: ptyWrite,
    pty_read: ptyRead,
    pty_list: ptyList,
    pty_kill: ptyKill,
};
/**
 * Registers the PTY tools with opencode v2's `ToolEditor`.
 *
 * The tool definitions are authored against the V1 `tool()` helper
 * (`{ description, args, execute }`). opencode v2 expects `Tool.Info`
 * (`{ name, input, description, execute }`); we adapt:
 *   - `args` (Zod raw shape) -> `input`: JSON Schema (Zod v4 `toJSONSchema`)
 *   - string result -> `{ content }`
 */
export function registerV2Tools(draft, directory) {
    if (typeof draft.add !== 'function') {
        return;
    }
    const add = draft.add.bind(draft);
    const tools = ptyTools;
    for (const [name, definition] of Object.entries(tools)) {
        const info = {
            name,
            description: definition.description,
            input: tool.schema.toJSONSchema(tool.schema.object(definition.args)),
            execute: async (input, context) => {
                const ctx = { directory, ...context };
                const result = await definition.execute(input, ctx);
                return typeof result === 'string' ? { content: result } : result;
            },
        };
        add(info);
    }
}
//# sourceMappingURL=tools.js.map