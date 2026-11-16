import open from 'open';
import { PTYServer } from "../web/server/server.js";
export const PTY_OPEN_CLIENT_COMMAND = 'pty-open-background-spy';
export const PTY_SHOW_SERVER_URL_COMMAND = 'pty-show-server-url';
let activeServer = null;
export async function getOrCreateServer(options) {
    if (!activeServer) {
        activeServer = await PTYServer.createServer(options);
    }
    return activeServer;
}
export function getActiveServer() {
    return activeServer;
}
export function stopActiveServer() {
    if (activeServer) {
        activeServer[Symbol.dispose]();
        activeServer = null;
    }
}
export async function handleOpenClientCommand(options) {
    const server = await getOrCreateServer(options);
    const url = server.server.url.origin;
    open(url);
    return `PTY Sessions Web Interface opened at: ${url}`;
}
export async function handleShowServerUrlCommand(options) {
    const server = await getOrCreateServer(options);
    return `PTY Sessions Web Interface URL: ${server.server.url.origin}`;
}
/**
 * Registers the PTY slash commands with opencode v2's `CommandEditor`.
 *
 * opencode v2's `command.transform` draft exposes `add(definition)` only
 * (there is no `update`), so commands must be created with an `execute`
 * handler rather than "updated".
 */
export function registerV2Commands(draft, options) {
    if (typeof draft.add !== 'function') {
        return;
    }
    const add = draft.add.bind(draft);
    add({
        name: PTY_OPEN_CLIENT_COMMAND,
        description: 'Open PTY Sessions Web Interface',
        execute: async () => {
            await handleOpenClientCommand(options);
        },
    });
    add({
        name: PTY_SHOW_SERVER_URL_COMMAND,
        description: 'Show PTY Sessions Web Interface URL',
        execute: async () => {
            await handleShowServerUrlCommand(options);
        },
    });
}
//# sourceMappingURL=commands.js.map