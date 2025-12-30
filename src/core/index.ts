// Core PTY management - shared between plugin and CLI
export { RingBuffer, type SearchMatch } from "./buffer.ts";
export { PTYManager, manager } from "./manager.ts";
export { createLogger, setLogHandler, type Logger, type LogHandler } from "./logger.ts";
export type {
  PTYStatus,
  PTYSession,
  PTYSessionInfo,
  SpawnOptions,
  ReadResult,
  SearchResult,
} from "./types.ts";
