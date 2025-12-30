import { spawn, type IPty } from "bun-pty";
import { RingBuffer } from "./buffer.ts";
import type { PTYSession, PTYSessionInfo, SpawnOptions, ReadResult, SearchResult } from "./types.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("manager");

function generateId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pty_${hex}`;
}

export class PTYManager {
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
      command: opts.command,
      args,
      workdir,
      env: opts.env,
      status: "running",
      pid: ptyProcess.pid,
      createdAt: new Date(),
      parentSessionId: opts.parentSessionId,
      buffer,
      process: ptyProcess,
    };

    this.sessions.set(id, session);

    ptyProcess.onData((data: string) => {
      buffer.append(data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      log.info("pty exited", { id, exitCode });
      if (session.status === "running") {
        session.status = "exited";
        session.exitCode = exitCode;
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
}

export const manager = new PTYManager();
