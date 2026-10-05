import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { PTYPlugin } from '../src/plugin.ts'
import { manager } from '../src/plugin/pty/manager.ts'
import { setPermissionAuthorizer } from '../src/plugin/pty/permissions.ts'
import type { PluginContext } from '../src/plugin/types.ts'
import { originsForProject } from '../src/shared/runtime.ts'
import { Plugin, getActiveServer, stopActiveServer } from '../src/v2/index.ts'
import type { PluginContextV2 } from '../src/v2/types.ts'
import { PTYServer } from '../src/web/server/server.ts'

type EventDomain = NonNullable<PluginContextV2['event']>
type HostEvent =
  ReturnType<EventDomain['subscribe']> extends AsyncIterable<infer Event> ? Event : never

function createEvents() {
  let pending = Promise.withResolvers<IteratorResult<HostEvent>>()
  const subscribe = mock((options?: Parameters<EventDomain['subscribe']>[0]) => {
    options?.signal?.addEventListener('abort', () => pending.reject(options.signal?.reason), {
      once: true,
    })
    return {
      [Symbol.asyncIterator]: () => ({ next: () => pending.promise }),
    }
  })
  return {
    subscribe,
    emit(event: HostEvent) {
      const current = pending
      pending = Promise.withResolvers<IteratorResult<HostEvent>>()
      current.resolve({ done: false, value: event })
    },
  }
}

afterEach(() => {
  mock.restore()
  stopActiveServer()
  manager.setNotifier(null)
  setPermissionAuthorizer(null)
})

describe('Plugin lifecycle', () => {
  test('v2 cleans up PTYs when their parent session is deleted', async () => {
    const events = createEvents()
    const cleanupBySession = spyOn(manager, 'cleanupBySession')
    const cleanup = await Plugin.setup({ event: events })
    try {
      events.emit({ type: 'session.deleted', data: { sessionID: 'session-deleted' } } as HostEvent)
      await Promise.resolve()
      expect(cleanupBySession).toHaveBeenCalledWith('session-deleted')
      expect(cleanupBySession).toHaveBeenCalledTimes(1)
    } finally {
      if (typeof cleanup === 'function') await cleanup()
    }
  })

  test('v2 cleanup aborts the event subscription and leaves the shared server running', async () => {
    const events = createEvents()
    const cleanup = await Plugin.setup({
      event: events,
      options: { autostart: true, port: 0, hostname: '127.0.0.1' },
    })
    const server = getActiveServer()
    expect(server).not.toBeNull()
    if (typeof cleanup === 'function') await cleanup()
    expect(getActiveServer()).toBe(server)
    expect(events.subscribe.mock.calls[0]?.[0]?.signal?.aborted).toBe(true)
  })

  test('v1 dispose removes the server origin record', async () => {
    const directory = '/test/plugin-lifecycle'
    using server = await PTYServer.createServer({ directory, port: 0, hostname: '127.0.0.1' })
    spyOn(PTYServer, 'createServer').mockResolvedValue(server)
    const hooks = await PTYPlugin({
      client: { session: { prompt: mock(async () => {}) } },
      directory,
      worktree: directory,
    } as unknown as PluginContext)
    await expect(
      hooks['command.execute.before']?.(
        { command: 'pty-show-server-url', sessionID: 'session-v1', arguments: '' },
        { parts: [] }
      )
    ).rejects.toThrow('Command handled by PTY plugin')
    expect(originsForProject(directory)).toHaveLength(1)
    await hooks.dispose?.()
    expect(originsForProject(directory)).toEqual([])
  })
})
