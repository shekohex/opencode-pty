import { client } from "../client.ts";
import type { PTYSessionInfo } from "../../src/core/types.ts";

interface ListOptions {
  status?: string;
  json?: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  await client.ensureDaemon();

  let sessions = await client.call<PTYSessionInfo[]>("list", {});

  // Filter by status if specified
  if (options.status) {
    sessions = sessions.filter((s) => s.status === options.status);
  }

  if (options.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log("<pty_list>");
    console.log("No active PTY sessions.");
    console.log("</pty_list>");
    return;
  }

  console.log("<pty_list>");
  for (const session of sessions) {
    const exitInfo = session.exitCode !== undefined ? ` (exit: ${session.exitCode})` : "";
    console.log(`[${session.id}] ${session.title}`);
    console.log(`  Command: ${session.command} ${session.args.join(" ")}`);
    console.log(`  Status: ${session.status}${exitInfo}`);
    console.log(`  PID: ${session.pid} | Lines: ${session.lineCount} | Workdir: ${session.workdir}`);
    console.log(`  Created: ${new Date(session.createdAt).toISOString()}`);
    console.log();
  }
  console.log(`Total: ${sessions.length} session(s)`);
  console.log("</pty_list>");
}
