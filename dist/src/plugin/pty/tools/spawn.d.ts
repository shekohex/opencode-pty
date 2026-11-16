export declare const ptySpawn: {
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
//# sourceMappingURL=spawn.d.ts.map