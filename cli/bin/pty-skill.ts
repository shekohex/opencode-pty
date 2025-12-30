#!/usr/bin/env bun

import { parseArgs } from "util";
import { spawnCommand } from "../commands/spawn.ts";
import { readCommand } from "../commands/read.ts";
import { writeCommand } from "../commands/write.ts";
import { listCommand } from "../commands/list.ts";
import { killCommand } from "../commands/kill.ts";
import { statusCommand } from "../commands/status.ts";
import { daemonCommand } from "../commands/daemon.ts";

const VERSION = "0.2.0";

function showHelp(): void {
  console.log(`pty-skill - Interactive PTY management for AI agents

Usage: pty-skill <command> [options]

Commands:
  spawn <cmd> [args...]   Start a new PTY session
  read <id>               Read output from a PTY session
  write <id> <data>       Send input to a PTY session
  list                    List all PTY sessions
  kill <id>               Kill a PTY session
  status                  Check daemon status
  daemon <action>         Manage the daemon (start|stop|restart|logs)

Options:
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  pty-skill spawn npm run dev
  pty-skill spawn -t "Dev Server" -w /app npm start
  pty-skill read pty_abc123 --limit 50
  pty-skill read pty_abc123 --pattern "error" --ignore-case
  pty-skill write pty_abc123 "\\x03"    # Send Ctrl+C
  pty-skill write pty_abc123 "yes\\n"   # Send "yes" + Enter
  pty-skill list
  pty-skill kill pty_abc123 --cleanup
`);
}

function showVersion(): void {
  console.log(`pty-skill v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    showHelp();
    return;
  }

  if (args[0] === "-v" || args[0] === "--version") {
    showVersion();
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  try {
    switch (command) {
      case "spawn":
        await handleSpawn(restArgs);
        break;
      case "read":
        await handleRead(restArgs);
        break;
      case "write":
        await handleWrite(restArgs);
        break;
      case "list":
        await handleList(restArgs);
        break;
      case "kill":
        await handleKill(restArgs);
        break;
      case "status":
        await handleStatus(restArgs);
        break;
      case "daemon":
        await handleDaemon(restArgs);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error("Run 'pty-skill --help' for usage.");
        process.exit(1);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function handleSpawn(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      workdir: { type: "string", short: "w" },
      env: { type: "string", short: "e", multiple: true },
      title: { type: "string", short: "t" },
      json: { type: "boolean", short: "j" },
    },
  });

  if (positionals.length === 0) {
    console.error("Error: command is required");
    console.error("Usage: pty-skill spawn [options] <command> [args...]");
    process.exit(1);
  }

  const [cmd, ...cmdArgs] = positionals;
  await spawnCommand(cmd, cmdArgs, {
    workdir: values.workdir,
    env: values.env,
    title: values.title,
    json: values.json,
  });
}

async function handleRead(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      offset: { type: "string", short: "o" },
      limit: { type: "string", short: "l" },
      pattern: { type: "string", short: "p" },
      "ignore-case": { type: "boolean", short: "i" },
      json: { type: "boolean", short: "j" },
    },
  });

  if (positionals.length === 0) {
    console.error("Error: PTY session ID is required");
    console.error("Usage: pty-skill read [options] <id>");
    process.exit(1);
  }

  await readCommand(positionals[0], {
    offset: values.offset ? parseInt(values.offset, 10) : undefined,
    limit: values.limit ? parseInt(values.limit, 10) : undefined,
    pattern: values.pattern,
    ignoreCase: values["ignore-case"],
    json: values.json,
  });
}

async function handleWrite(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: "boolean", short: "j" },
    },
  });

  if (positionals.length < 2) {
    console.error("Error: PTY session ID and data are required");
    console.error("Usage: pty-skill write <id> <data>");
    process.exit(1);
  }

  await writeCommand(positionals[0], positionals[1], {
    json: values.json,
  });
}

async function handleList(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      status: { type: "string", short: "s" },
      json: { type: "boolean", short: "j" },
    },
  });

  await listCommand({
    status: values.status,
    json: values.json,
  });
}

async function handleKill(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      cleanup: { type: "boolean", short: "c" },
      json: { type: "boolean", short: "j" },
    },
  });

  if (positionals.length === 0) {
    console.error("Error: PTY session ID is required");
    console.error("Usage: pty-skill kill [options] <id>");
    process.exit(1);
  }

  await killCommand(positionals[0], {
    cleanup: values.cleanup,
    json: values.json,
  });
}

async function handleStatus(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      json: { type: "boolean", short: "j" },
    },
  });

  await statusCommand({
    json: values.json,
  });
}

async function handleDaemon(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error("Error: daemon action is required");
    console.error("Usage: pty-skill daemon <start|stop|restart|logs>");
    process.exit(1);
  }

  await daemonCommand(args[0]);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
