import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ToolDraft } from '../src/v2/types.ts'

// #86: the published 0.4.0 tarball loaded `active` but registered no tools,
// because the V2 adapter shipped without calling `registerV2Tools`. Loading is
// not registration — only a real `setup()` against a recording `ctx.tool`
// proves it. These tests run the *built* artifacts, so a stale or incomplete
// `dist` cannot ship again.
const DIST_ROOT = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const DIST_V2 = fileURLToPath(new URL('../dist/src/v2/index.js', import.meta.url))

const EXPECTED_TOOLS = ['pty_kill', 'pty_list', 'pty_read', 'pty_spawn', 'pty_write']

interface RecordedTool {
  name: string
  description?: string
  input?: unknown
  execute?: unknown
}

interface RecordingContext {
  options: Record<string, unknown>
  location: { directory: string }
  tool: { transform: (callback: (draft: ToolDraft) => void) => Promise<void> }
  command: { transform: (callback: () => void) => Promise<void> }
}

function recordingContext(): { context: RecordingContext; tools: Map<string, RecordedTool> } {
  const tools = new Map<string, RecordedTool>()
  const context: RecordingContext = {
    options: {},
    location: { directory: '/tmp/opencode-pty-built-artifact' },
    tool: {
      transform: async (callback) => {
        await callback({
          add: (tool) => {
            tools.set(tool.name, tool as RecordedTool)
          },
        } as ToolDraft)
      },
    },
    command: {
      transform: async () => {},
    },
  }
  return { context, tools }
}

describe('built V2 entrypoints register the PTY tools (#86)', () => {
  it('builds dist before this test can pass', () => {
    expect(existsSync(DIST_V2)).toBe(true)
    expect(existsSync(DIST_ROOT)).toBe(true)
  })

  for (const [label, entry] of [
    ['package root (`.` entrypoint, dual-mode default)', DIST_ROOT],
    ['the ./v2 subpath entrypoint', DIST_V2],
  ] as const) {
    it(`${label} registers all five tools when setup runs`, async () => {
      const module = await import(entry)
      const plugin = module.default

      expect(plugin).toBeDefined()
      expect(plugin.id).toBe('opencode-pty')
      expect(typeof plugin.setup).toBe('function')

      const { context, tools } = recordingContext()
      await plugin.setup(context)

      expect([...tools.keys()].sort()).toEqual(EXPECTED_TOOLS)

      for (const tool of tools.values()) {
        expect(typeof tool.description).toBe('string')
        expect((tool.description ?? '').length).toBeGreaterThan(0)
        expect(tool.input).toBeDefined()
        expect(typeof tool.execute).toBe('function')
      }
    })
  }
})
