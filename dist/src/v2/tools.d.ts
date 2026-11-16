import type { ToolDraft } from './types.ts';
export declare const ptyTools: {
    readonly pty_spawn: {
        description: string;
        args: {
            command: import("zod").ZodString;
            args: import("zod").ZodArray<import("zod").ZodString>;
            workdir: import("zod").ZodOptional<import("zod").ZodString>;
            env: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>>;
            title: import("zod").ZodOptional<import("zod").ZodString>;
            description: import("zod").ZodString;
            notifyOnExit: import("zod").ZodOptional<import("zod").ZodBoolean>;
            timeoutSeconds: import("zod").ZodOptional<import("zod").ZodNumber>;
        };
        execute(args: {
            command: string;
            args: string[];
            description: string;
            workdir?: string | undefined;
            env?: Record<string, string> | undefined;
            title?: string | undefined;
            notifyOnExit?: boolean | undefined;
            timeoutSeconds?: number | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    readonly pty_write: {
        description: string;
        args: {
            id: import("zod").ZodString;
            data: import("zod").ZodString;
        };
        execute(args: {
            id: string;
            data: string;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    readonly pty_read: {
        description: string;
        args: {
            id: import("zod").ZodString;
            offset: import("zod").ZodOptional<import("zod").ZodNumber>;
            limit: import("zod").ZodOptional<import("zod").ZodNumber>;
            pattern: import("zod").ZodOptional<import("zod").ZodString>;
            ignoreCase: import("zod").ZodOptional<import("zod").ZodBoolean>;
        };
        execute(args: {
            id: string;
            offset?: number | undefined;
            limit?: number | undefined;
            pattern?: string | undefined;
            ignoreCase?: boolean | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    readonly pty_list: {
        description: string;
        args: {};
        execute(args: Record<string, never>, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
    readonly pty_kill: {
        description: string;
        args: {
            id: import("zod").ZodString;
            cleanup: import("zod").ZodOptional<import("zod").ZodBoolean>;
        };
        execute(args: {
            id: string;
            cleanup?: boolean | undefined;
        }, context: import("@opencode-ai/plugin").ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
    };
};
export type PTYToolName = keyof typeof ptyTools;
/**
 * Registers the PTY tools with opencode v2's `ToolEditor`.
 *
 * The tool definitions are authored against the V1 `tool()` helper
 * (`{ description, args, execute }`). opencode v2 expects `Tool.Info`
 * (`{ name, input, description, execute }`); we adapt:
 *   - `args` (Zod raw shape) -> `input`: JSON Schema (Zod v4 `toJSONSchema`)
 *   - string result -> `{ content }`
 */
export declare function registerV2Tools(draft: ToolDraft, directory?: string): void;
//# sourceMappingURL=tools.d.ts.map