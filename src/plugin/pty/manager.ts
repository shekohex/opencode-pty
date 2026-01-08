import { spawn, type IPty } from "bun-pty";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { RingBuffer } from "./buffer.ts";
import type { PTYSession, PTYSessionInfo, SpawnOptions, ReadResult, SearchResult } from "./types.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("manager");

let client: OpencodeClient | null = null;

export function initManager(opcClient: OpencodeClient): void {
  client = opcClient;
}

function generateId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pty_${hex}`;
}

class PTYManager {
  private sessions: Map<string, PTYSession> = new Map();

  spawn(opts: SpawnOptions): PTYSessionInfo {
    const id = generateId();
    const args = opts.args ?? [];
    const workdir = opts.workdir ?? process.cwd();
    const env = { ...process.env, ...opts.env } as Record<string, string>;
    const title = opts.title ?? (`${opts.command} ${args.join(" ")}`.trim() || `Terminal ${id.slice(-4)}`);

    log.info("spawning pty", { id, command: opts.command, args, workdir });

    const ptyProcess: IPty = spawn(opts.command, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: workdir,
      env,
    });

    const buffer = new RingBuffer();
    const session: PTYSession = {
      id,
      title,
      description: opts.description,
      command: opts.command,
      args,
      workdir,
      env: opts.env,
      status: "running",
      pid: ptyProcess.pid,
      createdAt: new Date(),
      parentSessionId: opts.parentSessionId,
      notifyOnExit: opts.notifyOnExit ?? false,
      buffer,
      process: ptyProcess,
    };

    this.sessions.set(id, session);

    ptyProcess.onData((data: string) => {
      buffer.append(data);
    });

    ptyProcess.onExit(async ({ exitCode }: { exitCode: number }) => {
      log.info("pty exited", { id, exitCode });
      if (session.status === "running") {
        session.status = "exited";
        session.exitCode = exitCode;
      }

      if (session.notifyOnExit && client) {
        try {
          const message = this.buildExitNotification(session, exitCode);
          await client.session.promptAsync({
            path: { id: session.parentSessionId },
            body: {
              parts: [{ type: "text", text: message }],
            },
          });
          log.info("sent exit notification", { id, exitCode, parentSessionId: session.parentSessionId });
        } catch (err) {
          log.error("failed to send exit notification", { id, error: String(err) });
        }
      }
    });

    return this.toInfo(session);
  }

  write(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    if (session.status !== "running") {
      return false;
    }
    session.process.write(data);
    return true;
  }

  read(id: string, offset: number = 0, limit?: number): ReadResult | null {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    const lines = session.buffer.read(offset, limit);
    const totalLines = session.buffer.length;
    const hasMore = offset + lines.length < totalLines;
    return { lines, totalLines, offset, hasMore };
  }

  search(id: string, pattern: RegExp, offset: number = 0, limit?: number): SearchResult | null {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    const allMatches = session.buffer.search(pattern);
    const totalMatches = allMatches.length;
    const totalLines = session.buffer.length;
    const paginatedMatches = limit !== undefined
      ? allMatches.slice(offset, offset + limit)
      : allMatches.slice(offset);
    const hasMore = offset + paginatedMatches.length < totalMatches;
    return { matches: paginatedMatches, totalMatches, totalLines, offset, hasMore };
  }

  list(): PTYSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.toInfo(s));
  }

  get(id: string): PTYSessionInfo | null {
    const session = this.sessions.get(id);
    return session ? this.toInfo(session) : null;
  }

  kill(id: string, cleanup: boolean = false): boolean {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }

    log.info("killing pty", { id, cleanup });

    if (session.status === "running") {
      try {
        session.process.kill();
      } catch {}
      session.status = "killed";
    }

    if (cleanup) {
      session.buffer.clear();
      this.sessions.delete(id);
    }

    return true;
  }

  cleanupBySession(parentSessionId: string): void {
    log.info("cleaning up ptys for session", { parentSessionId });
    for (const [id, session] of this.sessions) {
      if (session.parentSessionId === parentSessionId) {
        this.kill(id, true);
      }
    }
  }

  cleanupAll(): void {
    log.info("cleaning up all ptys");
    for (const id of this.sessions.keys()) {
      this.kill(id, true);
    }
  }

  private toInfo(session: PTYSession): PTYSessionInfo {
    return {
      id: session.id,
      title: session.title,
      command: session.command,
      args: session.args,
      workdir: session.workdir,
      status: session.status,
      exitCode: session.exitCode,
      pid: session.pid,
      createdAt: session.createdAt,
      lineCount: session.buffer.length,
    };
  }

  private buildExitNotification(session: PTYSession, exitCode: number): string {
    const lineCount = session.buffer.length;
    let lastLine = "";
    if (lineCount > 0) {
      for (let i = lineCount - 1; i >= 0; i--) {
        const bufferLines = session.buffer.read(i, 1);
        const line = bufferLines[0];
        if (line !== undefined && line.trim() !== "") {
          lastLine = line.length > 250 ? line.slice(0, 250) + "..." : line;
          break;
        }
      }
    }

    const displayTitle = session.description ?? session.title;
    const truncatedTitle = displayTitle.length > 64 ? displayTitle.slice(0, 64) + "..." : displayTitle;

    const lines = [
      "<pty_exited>",
      `ID: ${session.id}`,
      `Description: ${truncatedTitle}`,
      `Exit Code: ${exitCode}`,
      `Output Lines: ${lineCount}`,
      `Last Line: ${lastLine}`,
      "</pty_exited>",
      "",
    ];

    if (exitCode === 0) {
      lines.push("Use pty_read to check the full output.");
    } else {
      lines.push("Process failed. Use pty_read with the pattern parameter to search for errors in the output.");
    }

    return lines.join("\n");
  }
}

export const manager = new PTYManager();
