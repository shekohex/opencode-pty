import { tool } from "@opencode-ai/plugin";
import { manager } from "../manager.ts";
import { checkCommandPermission, checkWorkdirPermission } from "../permissions.ts";
import DESCRIPTION from "./spawn.txt";

export const ptySpawn = tool({
  description: DESCRIPTION,
  args: {
    command: tool.schema.string().describe("The command/executable to run"),
    args: tool.schema.array(tool.schema.string()).optional().describe("Arguments to pass to the command"),
    workdir: tool.schema.string().optional().describe("Working directory for the PTY session"),
    env: tool.schema.record(tool.schema.string(), tool.schema.string()).optional().describe("Additional environment variables"),
    title: tool.schema.string().optional().describe("Human-readable title for the session"),
    description: tool.schema.string().describe("Clear, concise description of what this PTY session is for in 5-10 words"),
    notifyOnExit: tool.schema.boolean().optional().describe("If true, sends a notification to the session when the process exits (default: false)"),
  },
  async execute(args, ctx) {
    await checkCommandPermission(args.command, args.args ?? []);

    if (args.workdir) {
      await checkWorkdirPermission(args.workdir);
    }

    const sessionId = ctx.sessionID;
    const info = manager.spawn({
      command: args.command,
      args: args.args,
      workdir: args.workdir,
      env: args.env,
      title: args.title,
      description: args.description,
      parentSessionId: sessionId,
      notifyOnExit: args.notifyOnExit,
    });

    const output = [
      `<pty_spawned>`,
      `ID: ${info.id}`,
      `Title: ${info.title}`,
      `Command: ${info.command} ${info.args.join(" ")}`,
      `Workdir: ${info.workdir}`,
      `PID: ${info.pid}`,
      `Status: ${info.status}`,
      `</pty_spawned>`,
    ].join("\n");

    return output;
  },
});
