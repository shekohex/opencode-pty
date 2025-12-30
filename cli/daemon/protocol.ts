// JSON-RPC 2.0 Protocol Types

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  result: unknown;
  id: number | string;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number | string | null;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// Standard JSON-RPC error codes
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes (server-defined)
  SESSION_NOT_FOUND: -32000,
  SPAWN_FAILED: -32001,
  WRITE_FAILED: -32002,
} as const;

// RPC Method Parameters
export interface SpawnParams {
  command: string;
  args?: string[];
  workdir?: string;
  env?: Record<string, string>;
  title?: string;
}

export interface WriteParams {
  id: string;
  data: string;
}

export interface ReadParams {
  id: string;
  offset?: number;
  limit?: number;
  pattern?: string;
  ignoreCase?: boolean;
}

export interface KillParams {
  id: string;
  cleanup?: boolean;
}

// Helper to create success response
export function success(id: number | string, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", result, id };
}

// Helper to create error response
export function error(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", error: { code, message, data }, id };
}
