#!/usr/bin/env bun

import { createServer, type Socket } from "net";
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { manager } from "../../src/core/manager.ts";
import { handleRequest } from "./handlers.ts";
import { error, ErrorCodes, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.ts";

const HOME = process.env.HOME || "/tmp";
const CONFIG_DIR = join(HOME, ".pty-skill");
const SOCKET_PATH = process.env.PTY_SKILL_SOCKET || join(CONFIG_DIR, "daemon.sock");
const PID_FILE = join(CONFIG_DIR, "daemon.pid");
const LOG_FILE = join(CONFIG_DIR, "daemon.log");

function log(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line, ...args);

  // Also append to log file
  try {
    const logLine = args.length > 0
      ? `${line} ${JSON.stringify(args)}\n`
      : `${line}\n`;
    Bun.write(Bun.file(LOG_FILE), { append: true }).then(() => {});
    // Use sync write for simplicity
    const fs = require("fs");
    fs.appendFileSync(LOG_FILE, logLine);
  } catch {}
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function writePidFile(): void {
  writeFileSync(PID_FILE, String(process.pid));
}

function removePidFile(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {}
}

function removeSocket(): void {
  try {
    if (existsSync(SOCKET_PATH)) {
      unlinkSync(SOCKET_PATH);
    }
  } catch {}
}

function cleanup(): void {
  log("Shutting down daemon...");
  manager.cleanupAll();
  removeSocket();
  removePidFile();
  log("Daemon stopped.");
}

function handleConnection(socket: Socket): void {
  let buffer = "";

  socket.on("data", (data: Buffer) => {
    buffer += data.toString();

    // Try to parse complete JSON messages (newline-delimited)
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      let response: JsonRpcResponse;

      try {
        const request = JSON.parse(line) as JsonRpcRequest;

        if (request.jsonrpc !== "2.0" || !request.method) {
          response = error(
            request.id ?? null,
            ErrorCodes.INVALID_REQUEST,
            "Invalid JSON-RPC request"
          );
        } else {
          response = handleRequest(request);
        }
      } catch (e) {
        response = error(null, ErrorCodes.PARSE_ERROR, "Parse error");
      }

      socket.write(JSON.stringify(response) + "\n");
    }
  });

  socket.on("error", (err: Error) => {
    log("Socket error:", err.message);
  });

  socket.on("close", () => {
    // Connection closed, nothing to clean up per-connection
  });
}

function startServer(): void {
  ensureConfigDir();

  // Remove stale socket if exists
  removeSocket();

  const server = createServer(handleConnection);

  server.on("error", (err: Error) => {
    log("Server error:", err.message);
    cleanup();
    process.exit(1);
  });

  server.listen(SOCKET_PATH, () => {
    writePidFile();
    log(`Daemon listening on ${SOCKET_PATH}`);
    log(`PID: ${process.pid}`);
  });

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    log("Received SIGTERM");
    server.close();
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("Received SIGINT");
    server.close();
    cleanup();
    process.exit(0);
  });

  process.on("uncaughtException", (err: Error) => {
    log("Uncaught exception:", err.message);
    server.close();
    cleanup();
    process.exit(1);
  });
}

// Check if already running
function isAlreadyRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, remove stale PID file
    removePidFile();
    return false;
  }
}

// Main
if (isAlreadyRunning()) {
  console.error("Daemon is already running");
  process.exit(1);
}

startServer();
