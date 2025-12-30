import { client } from "../client.ts";

interface StatusOptions {
  json?: boolean;
}

interface DaemonStatus {
  running: boolean;
  sessions: number;
  uptime: number;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const daemonStatus = await client.status();

  if (!daemonStatus.running) {
    if (options.json) {
      console.log(JSON.stringify({ running: false }, null, 2));
    } else {
      console.log("Daemon is not running.");
    }
    return;
  }

  try {
    const status = await client.call<DaemonStatus>("status", {});

    if (options.json) {
      console.log(JSON.stringify({ ...status, pid: daemonStatus.pid }, null, 2));
    } else {
      console.log("Daemon status:");
      console.log(`  Running: yes`);
      console.log(`  PID: ${daemonStatus.pid}`);
      console.log(`  Sessions: ${status.sessions}`);
      console.log(`  Uptime: ${Math.floor(status.uptime)}s`);
    }
  } catch (e) {
    if (options.json) {
      console.log(JSON.stringify({ running: false, error: String(e) }, null, 2));
    } else {
      console.log("Daemon is not responding.");
    }
  }
}
