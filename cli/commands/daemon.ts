import { client } from "../client.ts";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const HOME = process.env.HOME || "/tmp";
const CONFIG_DIR = join(HOME, ".pty-skill");
const LOG_FILE = join(CONFIG_DIR, "daemon.log");

export async function daemonCommand(action: string): Promise<void> {
  switch (action) {
    case "start":
      await daemonStart();
      break;
    case "stop":
      await daemonStop();
      break;
    case "restart":
      await daemonRestart();
      break;
    case "logs":
      daemonLogs();
      break;
    default:
      console.error(`Unknown daemon action: ${action}`);
      console.error("Usage: pty-skill daemon <start|stop|restart|logs>");
      process.exit(1);
  }
}

async function daemonStart(): Promise<void> {
  const status = await client.status();

  if (status.running) {
    console.log(`Daemon is already running (PID: ${status.pid})`);
    return;
  }

  console.log("Starting daemon...");
  await client.startDaemon();
  const newStatus = await client.status();
  console.log(`Daemon started (PID: ${newStatus.pid})`);
}

async function daemonStop(): Promise<void> {
  const status = await client.status();

  if (!status.running) {
    console.log("Daemon is not running.");
    return;
  }

  console.log(`Stopping daemon (PID: ${status.pid})...`);
  const stopped = await client.stopDaemon();

  if (stopped) {
    console.log("Daemon stopped.");
  } else {
    console.log("Failed to stop daemon.");
    process.exit(1);
  }
}

async function daemonRestart(): Promise<void> {
  await daemonStop();
  // Wait a bit for socket to be released
  await new Promise((resolve) => setTimeout(resolve, 500));
  await daemonStart();
}

function daemonLogs(): void {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found.");
    return;
  }

  const logs = readFileSync(LOG_FILE, "utf-8");
  const lines = logs.trim().split("\n");

  // Show last 50 lines
  const lastLines = lines.slice(-50);
  for (const line of lastLines) {
    console.log(line);
  }

  if (lines.length > 50) {
    console.log(`\n(Showing last 50 of ${lines.length} lines)`);
  }
}
