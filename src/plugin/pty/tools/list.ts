import { tool } from "@opencode-ai/plugin";
import { manager } from "../../../core/manager.ts";
import DESCRIPTION from "./list.txt";

export const ptyList = tool({
  description: DESCRIPTION,
  args: {},
  async execute() {
    const sessions = manager.list();

    if (sessions.length === 0) {
      return "<pty_list>\nNo active PTY sessions.\n</pty_list>";
    }

    const lines = ["<pty_list>"];
    for (const session of sessions) {
      const exitInfo = session.exitCode !== undefined ? ` (exit: ${session.exitCode})` : "";
      lines.push(`[${session.id}] ${session.title}`);
      lines.push(`  Command: ${session.command} ${session.args.join(" ")}`);
      lines.push(`  Status: ${session.status}${exitInfo}`);
      lines.push(`  PID: ${session.pid} | Lines: ${session.lineCount} | Workdir: ${session.workdir}`);
      lines.push(`  Created: ${session.createdAt.toISOString()}`);
      lines.push("");
    }
    lines.push(`Total: ${sessions.length} session(s)`);
    lines.push("</pty_list>");

    return lines.join("\n");
  },
});
