# pty-skill

Interactive PTY (pseudo-terminal) management for AI agents. Works as a **standalone CLI** for Claude Code, Codex CLI, and other AI tools, or as an **OpenCode plugin**.

## Why?

AI agents need to interact with long-running processes, but most tools run commands synchronously. This doesn't work for:

- **Dev servers** (`npm run dev`, `cargo watch`)
- **Watch modes** (`npm test -- --watch`)
- **Long-running processes** (database servers, tunnels)
- **Interactive programs** (REPLs, prompts)

This tool gives AI agents full control over multiple terminal sessions, like tabs in a terminal app.

## Features

- **Background Execution**: Spawn processes that run independently
- **Multiple Sessions**: Manage multiple PTYs simultaneously
- **Interactive Input**: Send keystrokes, Ctrl+C, arrow keys, etc.
- **Output Buffer**: Read output anytime with pagination (offset/limit)
- **Pattern Filtering**: Search output using regex (like `grep`)
- **Permission Support**: Respects OpenCode's bash permission settings
- **Session Lifecycle**: Sessions persist until explicitly killed
- **Auto-cleanup**: PTYs are cleaned up when OpenCode sessions end

## Installation

### CLI (for Claude Code, Codex CLI, etc.)

```bash
# Install globally
npm install -g pty-skill

# Or run directly with npx
npx pty-skill --help
```

The CLI runs a background daemon that maintains PTY sessions across invocations. The daemon auto-starts on first use.

### OpenCode Plugin

Add to your [OpenCode config](https://opencode.ai/docs/config/):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["pty-skill"]
}
```

OpenCode will automatically install the plugin on next run.

## CLI Usage

```bash
# Start a dev server
pty-skill spawn -t "Dev Server" npm run dev
# Returns: pty_abc123

# Check server output
pty-skill read pty_abc123 --limit 50

# Filter for errors
pty-skill read pty_abc123 --pattern "error" --ignore-case

# Send Ctrl+C to stop
pty-skill write pty_abc123 "\x03"

# List all sessions
pty-skill list

# Kill and cleanup
pty-skill kill pty_abc123 --cleanup

# Check daemon status
pty-skill status
```

See [SKILL.md](SKILL.md) for complete CLI documentation.

## OpenCode Plugin Tools

| Tool | Description |
|------|-------------|
| `pty_spawn` | Create a new PTY session (command, args, workdir, env, title) |
| `pty_write` | Send input to a PTY (text, escape sequences like `\x03` for Ctrl+C) |
| `pty_read` | Read output buffer with pagination and optional regex filtering |
| `pty_list` | List all PTY sessions with status, PID, line count |
| `pty_kill` | Terminate a PTY, optionally cleanup the buffer |

### Plugin Usage Examples

```
pty_spawn: command="npm", args=["run", "dev"], title="Dev Server"
→ Returns: pty_a1b2c3d4

pty_read: id="pty_a1b2c3d4", limit=50
→ Shows last 50 lines of output

pty_read: id="pty_a1b2c3d4", pattern="error|ERROR", ignoreCase=true
→ Shows only lines matching the pattern

pty_write: id="pty_a1b2c3d4", data="\x03"
→ Sends interrupt signal

pty_kill: id="pty_a1b2c3d4", cleanup=true
→ Terminates process and frees buffer
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PTY_MAX_BUFFER_LINES` | `50000` | Maximum lines to keep in output buffer per session |

### Permissions

This plugin respects OpenCode's [permission settings](https://opencode.ai/docs/permissions/) for the `bash` tool. Commands spawned via `pty_spawn` are checked against your `permission.bash` configuration.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "npm *": "allow",
      "git push": "deny",
      "terraform *": "deny"
    }
  }
}
```

> [!IMPORTANT]
> **Limitations compared to built-in bash tool:**
>
> - **"ask" permissions are treated as "deny"**: Since plugins cannot trigger OpenCode's permission prompt UI, commands matching an "ask" pattern will be denied. A toast notification will inform you when this happens. Configure explicit "allow" or "deny" for commands you want to use with PTY.
>
> - **"external_directory" with "ask" is treated as "allow"**: When the working directory is outside the project and `permission.external_directory` is set to "ask", this plugin allows it (with a log message). Set to "deny" explicitly if you want to block external directories.

#### Example: Allow specific commands for PTY

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "npm run dev": "allow",
      "npm run build": "allow",
      "npm test *": "allow",
      "cargo *": "allow",
      "python *": "allow"
    }
  }
}
```

## How It Works

1. **Spawn**: Creates a PTY using [bun-pty](https://github.com/nicksrandall/bun-pty), runs command in background
2. **Buffer**: Output is captured into a rolling line buffer (ring buffer)
3. **Read**: Agent can read buffer anytime with offset/limit pagination
4. **Filter**: Optional regex pattern filters lines before pagination
5. **Write**: Agent can send any input including escape sequences
6. **Lifecycle**: Sessions track status (running/exited/killed), persist until cleanup

## Session Lifecycle

```
spawn → running → [exited | killed]
                      ↓
              (stays in list until cleanup=true)
```

Sessions remain in the list after exit so the agent can:
- Read final output
- Check exit code
- Compare logs between runs

Use `pty_kill` with `cleanup=true` to remove completely.

## Local Development

```bash
git clone https://github.com/shekohex/opencode-pty.git
cd opencode-pty
bun install
bun run tsc --noEmit  # Type check
```

To load a local checkout in OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-pty"]
}
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a PR.

## Credits

- [OpenCode](https://opencode.ai) - The AI coding assistant this plugin extends
- [bun-pty](https://github.com/nicksrandall/bun-pty) - Cross-platform PTY for Bun
