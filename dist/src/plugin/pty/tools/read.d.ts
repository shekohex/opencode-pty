export declare const ptyRead: {
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
//# sourceMappingURL=read.d.ts.map