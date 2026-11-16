export declare const ptyKill: {
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
//# sourceMappingURL=kill.d.ts.map