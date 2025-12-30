import { manager } from "../../src/core/manager.ts";
import type { PTYSessionInfo, ReadResult, SearchResult } from "../../src/core/types.ts";
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SpawnParams,
  type WriteParams,
  type ReadParams,
  type KillParams,
  success,
  error,
  ErrorCodes,
} from "./protocol.ts";

/**
 * Parse escape sequences in a string to their actual byte values.
 * Handles: \n, \r, \t, \xNN (hex), \uNNNN (unicode), \\
 */
function parseEscapeSequences(input: string): string {
  return input.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|[nrt\\])/g, (match, seq: string) => {
    if (seq.startsWith("x")) {
      return String.fromCharCode(parseInt(seq.slice(1), 16));
    }
    if (seq.startsWith("u")) {
      return String.fromCharCode(parseInt(seq.slice(1), 16));
    }
    switch (seq) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "\\": return "\\";
      default: return match;
    }
  });
}

function handleSpawn(params: SpawnParams): PTYSessionInfo {
  if (!params.command) {
    throw new Error("command is required");
  }
  return manager.spawn({
    command: params.command,
    args: params.args,
    workdir: params.workdir,
    env: params.env,
    title: params.title,
  });
}

function handleWrite(params: WriteParams): { success: boolean; bytes: number } {
  if (!params.id) {
    throw new Error("id is required");
  }
  if (params.data === undefined) {
    throw new Error("data is required");
  }

  const parsedData = parseEscapeSequences(params.data);
  const success = manager.write(params.id, parsedData);

  if (!success) {
    const session = manager.get(params.id);
    if (!session) {
      throw new Error(`PTY session '${params.id}' not found`);
    }
    throw new Error(`Cannot write to PTY '${params.id}' - session status is '${session.status}'`);
  }

  return { success: true, bytes: parsedData.length };
}

function handleRead(params: ReadParams): ReadResult | SearchResult {
  if (!params.id) {
    throw new Error("id is required");
  }

  const session = manager.get(params.id);
  if (!session) {
    throw new Error(`PTY session '${params.id}' not found`);
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 500;

  if (params.pattern) {
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, params.ignoreCase ? "i" : "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid regex pattern '${params.pattern}': ${msg}`);
    }

    const result = manager.search(params.id, regex, offset, limit);
    if (!result) {
      throw new Error(`PTY session '${params.id}' not found`);
    }
    return { ...result, status: session.status };
  }

  const result = manager.read(params.id, offset, limit);
  if (!result) {
    throw new Error(`PTY session '${params.id}' not found`);
  }
  return { ...result, status: session.status };
}

function handleList(): PTYSessionInfo[] {
  return manager.list();
}

function handleKill(params: KillParams): { success: boolean; session: PTYSessionInfo | null } {
  if (!params.id) {
    throw new Error("id is required");
  }

  const session = manager.get(params.id);
  if (!session) {
    throw new Error(`PTY session '${params.id}' not found`);
  }

  const cleanup = params.cleanup ?? false;
  const result = manager.kill(params.id, cleanup);

  return {
    success: result,
    session: cleanup ? null : manager.get(params.id)
  };
}

function handleStatus(): { running: boolean; sessions: number; uptime: number } {
  const sessions = manager.list();
  return {
    running: true,
    sessions: sessions.length,
    uptime: process.uptime(),
  };
}

function handlePing(): { pong: true } {
  return { pong: true };
}

export function handleRequest(request: JsonRpcRequest): JsonRpcResponse {
  const { method, params, id } = request;

  try {
    let result: unknown;

    switch (method) {
      case "spawn":
        result = handleSpawn(params as SpawnParams);
        break;
      case "write":
        result = handleWrite(params as WriteParams);
        break;
      case "read":
        result = handleRead(params as ReadParams);
        break;
      case "list":
        result = handleList();
        break;
      case "kill":
        result = handleKill(params as KillParams);
        break;
      case "status":
        result = handleStatus();
        break;
      case "ping":
        result = handlePing();
        break;
      default:
        return error(id, ErrorCodes.METHOD_NOT_FOUND, `Method '${method}' not found`);
    }

    return success(id, result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (message.includes("not found")) {
      return error(id, ErrorCodes.SESSION_NOT_FOUND, message);
    }

    return error(id, ErrorCodes.INTERNAL_ERROR, message);
  }
}
