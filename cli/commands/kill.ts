import { client } from "../client.ts";
import type { PTYSessionInfo } from "../../src/core/types.ts";

interface KillOptions {
  cleanup?: boolean;
  json?: boolean;
}

interface KillResult {
  success: boolean;
  session: PTYSessionInfo | null;
}

export async function killCommand(id: string, options: KillOptions): Promise<void> {
  await client.ensureDaemon();

  // Get session info before killing
  const sessions = await client.call<PTYSessionInfo[]>("list", {});
  const sessionBefore = sessions.find((s) => s.id === id);

  if (!sessionBefore) {
    console.error(`PTY session '${id}' not found. Use 'pty-skill list' to see active sessions.`);
    process.exit(1);
  }

  const wasRunning = sessionBefore.status === "running";
  const cleanup = options.cleanup ?? false;

  const result = await client.call<KillResult>("kill", {
    id,
    cleanup,
  });

  if (options.json) {
    console.log(JSON.stringify({ ...result, sessionBefore }, null, 2));
    return;
  }

  const action = wasRunning ? "Killed" : "Cleaned up";
  const cleanupNote = cleanup ? " (session removed)" : " (session retained for log access)";

  console.log("<pty_killed>");
  console.log(`${action}: ${id}${cleanupNote}`);
  console.log(`Title: ${sessionBefore.title}`);
  console.log(`Command: ${sessionBefore.command} ${sessionBefore.args.join(" ")}`);
  console.log(`Final line count: ${sessionBefore.lineCount}`);
  console.log("</pty_killed>");
}
