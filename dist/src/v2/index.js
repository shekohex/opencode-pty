import { createV2Adapter } from "../adapters/v2/index.js";
import { createV2PermissionAuthorizer } from "../adapters/v2/permissions.js";
import { installHostAdapter } from "../adapters/index.js";
import { getOrCreateServer, registerV2Commands } from "./commands.js";
import { V2SessionNotifier } from "./notifier.js";
import { registerV2Tools } from "./tools.js";
import { define } from "./types.js";
export * from "./commands.js";
export * from "./notifier.js";
export * from "./tools.js";
export * from "./types.js";
/**
 * OpenCode V2 Plugin definition for opencode-pty.
 * Conforms to the V2 Plugin.define({ id, setup }) contract.
 */
export const Plugin = define({
    id: 'opencode-pty',
    setup: async (ctx) => {
        // opencode v2 plugin contexts are server clients: `ctx.session.prompt`
        // wakes a session with a user prompt, preserving the session's current
        // model by construction. Pre-2.0 hosts without the session domain still
        // load the plugin, but exit notifications are disabled with a visible
        // warning instead of silently never arriving.
        const notifier = typeof ctx.session?.prompt === 'function' ? new V2SessionNotifier(ctx.session) : undefined;
        if (!notifier) {
            console.warn('[opencode-pty] host does not expose ctx.session.prompt — exit notifications disabled');
        }
        // The project directory lives on `location`. `ctx.worktree` is deliberately
        // NOT used: it is a domain object on the V2 API, not a path, and passing it
        // through reached createHash and threw. Absent paths only mean no record is
        // published — the sidebar then falls back to the instance-scoped URL scrape.
        const location = ctx.location;
        const directory = typeof location?.directory === 'string' ? location.directory : undefined;
        // opencode V2 exposes no `config.get()`, so `permission.bash` cannot be
        // re-read and re-implemented here: `ctx.permission.assert` is the only
        // documented surface that evaluates the session's rules and prompts on
        // `ask`. Without it PTY spawns would bypass `permissions` deny rules (#80).
        const permissions = createV2PermissionAuthorizer(ctx.permission, directory);
        if (!permissions) {
            console.warn('[opencode-pty] host does not expose ctx.permission.assert — PTY commands are not checked against permissions');
        }
        const adapter = createV2Adapter({ notifier, permissions });
        installHostAdapter(adapter);
        if (ctx.tool && typeof ctx.tool.transform === 'function') {
            await ctx.tool.transform((draft) => {
                registerV2Tools(draft, directory);
            });
        }
        const serverOptions = {
            port: ctx.options?.port,
            hostname: ctx.options?.hostname,
            ...(directory ? { directory } : {}),
        };
        if (ctx.command && typeof ctx.command.transform === 'function') {
            await ctx.command.transform((draft) => {
                registerV2Commands(draft, serverOptions);
            });
        }
        if (ctx.options?.autostart) {
            await getOrCreateServer(serverOptions);
        }
    },
});
export default Plugin;
//# sourceMappingURL=index.js.map