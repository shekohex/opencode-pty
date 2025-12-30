type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export type LogHandler = (
  level: LogLevel,
  service: string,
  message: string,
  extra?: Record<string, unknown>
) => void;

let _customHandler: LogHandler | null = null;

/**
 * Set a custom log handler (e.g., for plugin client logging)
 */
export function setLogHandler(handler: LogHandler | null): void {
  _customHandler = handler;
}

/**
 * Create a logger for a specific module
 */
export function createLogger(module: string): Logger {
  const service = `pty.${module}`;

  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>): void => {
    if (_customHandler) {
      _customHandler(level, service, message, extra);
    } else {
      const prefix = `[${service}]`;
      const args = extra ? [prefix, message, extra] : [prefix, message];
      switch (level) {
        case "debug":
          console.debug(...args);
          break;
        case "info":
          console.info(...args);
          break;
        case "warn":
          console.warn(...args);
          break;
        case "error":
          console.error(...args);
          break;
      }
    }
  };

  return {
    debug: (message, extra) => log("debug", message, extra),
    info: (message, extra) => log("info", message, extra),
    warn: (message, extra) => log("warn", message, extra),
    error: (message, extra) => log("error", message, extra),
  };
}
