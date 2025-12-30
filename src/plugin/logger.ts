import { setLogHandler, createLogger as coreCreateLogger, type Logger } from "../core/logger.ts";
import type { PluginClient } from "./types.ts";

/**
 * Initialize the logger with the plugin client for remote logging
 */
export function initLogger(client: PluginClient): void {
  setLogHandler((level, service, message, extra) => {
    client.app.log({
      body: { service, level, message, extra },
    }).catch(() => {});
  });
}

/**
 * Create a logger for a specific module (re-export from core)
 */
export const createLogger: (module: string) => Logger = coreCreateLogger;
