import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/**
 * Prepares a shadow copy of the bun-pty native binary on Windows.
 * This prevents file locking issues when multiple OpenCode instances are running.
 */
export async function prepareShadowPty() {
  if (process.platform !== "win32") {
    return;
  }

  if (process.env.BUN_PTY_LIB) {
    return;
  }

  try {
    // Resolve the bun-pty package location
    const entryPath = await Bun.resolve("bun-pty", import.meta.dir);
    const packageRoot = path.dirname(path.dirname(entryPath));
    
    const dllPath = path.join(packageRoot, "rust-pty", "target", "release", "rust_pty.dll");
    
    if (!fs.existsSync(dllPath)) {
      return;
    }

    const tempDir = path.join(os.tmpdir(), "opencode-pty", crypto.randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });
    
    const targetDllPath = path.join(tempDir, "rust_pty.dll");
    fs.copyFileSync(dllPath, targetDllPath);
    
    // Set the environment variable that bun-pty uses to find its native library
    process.env.BUN_PTY_LIB = targetDllPath;
    
    // Ensure we clean up on exit
    process.on("exit", () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });
  } catch (err) {
    // Fail silently but log if in dev
    if (process.env.NODE_ENV === "development") {
      console.error("[opencode-pty] Failed to shadow copy native binary:", err);
    }
  }
}
