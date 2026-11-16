import { PTYServer, type ServerOptions } from '../web/server/server.ts';
import type { CommandDraft } from './types.ts';
export declare const PTY_OPEN_CLIENT_COMMAND = "pty-open-background-spy";
export declare const PTY_SHOW_SERVER_URL_COMMAND = "pty-show-server-url";
export declare function getOrCreateServer(options?: ServerOptions): Promise<PTYServer>;
export declare function getActiveServer(): PTYServer | null;
export declare function stopActiveServer(): void;
export declare function handleOpenClientCommand(options?: ServerOptions): Promise<string>;
export declare function handleShowServerUrlCommand(options?: ServerOptions): Promise<string>;
/**
 * Registers the PTY slash commands with opencode v2's `CommandEditor`.
 *
 * opencode v2's `command.transform` draft exposes `add(definition)` only
 * (there is no `update`), so commands must be created with an `execute`
 * handler rather than "updated".
 */
export declare function registerV2Commands(draft: CommandDraft, options?: ServerOptions): void;
//# sourceMappingURL=commands.d.ts.map