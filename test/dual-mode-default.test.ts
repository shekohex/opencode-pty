import { describe, expect, it } from 'bun:test'
import defaults, { PTYPlugin } from '../index.ts'
import { Plugin } from '../src/v2/index.ts'

// The bare npm ref resolves the `.` entrypoint's default export on both runtimes:
// V1 (>= 1.18.29) calls `server()`, V2 validates `{ id, setup }` and calls `setup()`.
// Before the dual-mode export the `.` entrypoint had no default at all, so the bare
// ref schema-failed on V2 (#67) and the only working path was the `./v2` subpath —
// which the V2 loader cannot install (it parses subpath refs as npm install specs).
describe('dual-mode default export', () => {
  it('carries the V2 id and setup', () => {
    expect(defaults.id).toBe('opencode-pty')
    expect(defaults.setup).toBe(Plugin.setup)
    expect(typeof defaults.setup).toBe('function')
  })

  it('carries the V1 server entrypoint', () => {
    expect(defaults.server).toBe(PTYPlugin)
    expect(typeof defaults.server).toBe('function')
  })

  it('re-exports the V2 plugin by name', () => {
    expect(Plugin.id).toBe('opencode-pty')
  })
})
