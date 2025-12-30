import { connect, type Socket } from "net";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { JsonRpcRequest, JsonRpcResponse } from "./daemon/protocol.ts";

const HOME = process.env.HOME || "/tmp";
const CONFIG_DIR = join(HOME, ".pty-skill");
const SOCKET_PATH = process.env.PTY_SKILL_SOCKET || join(CONFIG_DIR, "daemon.sock");
const PID_FILE = join(CONFIG_DIR, "daemon.pid");

export class DaemonClient {
  private requestId = 0;

  /**
   * Check if daemon is running by pinging it
   */
  async ping(): Promise<boolean> {
    try {
      await this.call("ping", {}, 1000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the daemon if not running
   */
  async startDaemon(): Promise<void> {
    // Find the daemon server script
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const serverPath = join(__dirname, "daemon", "server.ts");

    const child = spawn("bun", ["run", serverPath], {
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    // Wait for daemon to start
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (await this.ping()) {
        return;
      }
    }

    throw new Error("Failed to start daemon");
  }

  /**
   * Stop the daemon
   */
  async stopDaemon(): Promise<boolean> {
    if (!existsSync(PID_FILE)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure daemon is running, starting it if necessary
   */
  async ensureDaemon(): Promise<void> {
    if (await this.ping()) {
      return;
    }
    await this.startDaemon();
  }

  /**
   * Get daemon status
   */
  async status(): Promise<{ running: boolean; pid?: number }> {
    const isRunning = await this.ping();

    if (isRunning && existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
      return { running: true, pid };
    }

    return { running: false };
  }

  /**
   * Call a method on the daemon
   */
  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeout: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = connect(SOCKET_PATH);
      let buffer = "";
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        socket.destroy();
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out"));
      }, timeout);

      socket.on("connect", () => {
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          method,
          params,
          id: ++this.requestId,
        };
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const response = JSON.parse(line) as JsonRpcResponse;
            cleanup();

            if ("error" in response) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result as T);
            }
          } catch (e) {
            cleanup();
            reject(new Error("Invalid response from daemon"));
          }
        }
      });

      socket.on("error", (err: Error) => {
        cleanup();
        reject(err);
      });
    });
  }
}

// Export singleton instance
export const client = new DaemonClient();
