export declare const ptyWrite: {
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
//# sourceMappingURL=write.d.ts.map