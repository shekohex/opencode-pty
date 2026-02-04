---
name: Bug Report
about: Report a bug with the opencode-pty plugin
title: '[Bug]: '
labels: ['bug']
assignees: ''
---

## Description

A clear and concise description of what the bug is.

## Reproduction Steps

Steps to reproduce the behavior:

1. Configure plugin in opencode.json
2. Run opencode
3. Use pty_spawn with '...'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

A clear and concise description of what actually happens.

## Environment

- OS: [e.g. macOS 14, Ubuntu 22.04, Windows 11]
- OpenCode Version: [Output of `opencode --version`]
- Plugin Version: [e.g. 0.1.0]
- Bun Version: [Output of `bun --version`]

## OpenCode Configuration

<details>
<summary>opencode.json (sanitized)</summary>

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-pty"],
  "permission": {
    // your permission config
  }
}
```

</details>

## Debug Logs

<details>
<summary>Click to expand debug logs</summary>

To get debug logs, run OpenCode with debug logging enabled:

```bash
opencode --log-level DEBUG --print-logs
```

Or check log files in `~/.local/share/opencode/logs/`.

```
[Paste relevant log output here]
```

</details>

## Additional Context

Add any other context about the problem here.
