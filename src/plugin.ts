import { createLogger, initLogger } from "./plugin/logger.ts";
import type { PluginContext, PluginResult } from "./plugin/types.ts";
import { manager } from "./core/manager.ts";
import { initPermissions } from "./plugin/pty/permissions.ts";
import { ptySpawn } from "./plugin/pty/tools/spawn.ts";
import { ptyWrite } from "./plugin/pty/tools/write.ts";
import { ptyRead } from "./plugin/pty/tools/read.ts";
import { ptyList } from "./plugin/pty/tools/list.ts";
import { ptyKill } from "./plugin/pty/tools/kill.ts";

const log = createLogger("plugin");

export const PTYPlugin = async (
  { client, directory }: PluginContext,
): Promise<PluginResult> => {
  initLogger(client);
  initPermissions(client, directory);
  log.info("PTY plugin initialized");

  return {
    tool: {
      pty_spawn: ptySpawn,
      pty_write: ptyWrite,
      pty_read: ptyRead,
      pty_list: ptyList,
      pty_kill: ptyKill,
    },
    event: async ({ event }) => {
      if (!event) {
        return;
      }

      if (event.type === "session.deleted") {
        const sessionId = (event as { properties: { info: { id: string } } }).properties?.info?.id;
        if (sessionId) {
          log.info("cleaning up PTYs for deleted session", { sessionId });
          manager.cleanupBySession(sessionId);
        }
      }
    },
  };
};
