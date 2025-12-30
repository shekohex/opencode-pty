import { client } from "../client.ts";
import type { PTYSessionInfo } from "../../src/core/types.ts";

interface SpawnOptions {
  workdir?: string;
  env?: string[];
  title?: string;
  json?: boolean;
}

export async function spawnCommand(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<void> {
  await client.ensureDaemon();

  // Parse env from array of "KEY=VALUE" strings
  const env: Record<string, string> = {};
  if (options.env) {
    for (const e of options.env) {
      const idx = e.indexOf("=");
      if (idx > 0) {
        env[e.slice(0, idx)] = e.slice(idx + 1);
      }
    }
  }

  const result = await client.call<PTYSessionInfo>("spawn", {
    command,
    args,
    workdir: options.workdir || process.cwd(),
    env: Object.keys(env).length > 0 ? env : undefined,
    title: options.title,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Spawned PTY session: ${result.id}`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Command: ${result.command} ${result.args.join(" ")}`);
    console.log(`  PID: ${result.pid}`);
    console.log(`  Workdir: ${result.workdir}`);
  }
}
