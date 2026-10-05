// Regression tests for the plugin factory's STARTUP contract.
//
// Three things must hold, all learned the hard way from the startup trace:
//
//  1. The factory must not await its first refresh. opencode's TUI plugin loader
//     awaits every plugin factory before the TUI becomes usable, showing its
//     "Loading plugins…" overlay the whole time.
//  2. Loading must not start the PTY server. Starting it goes through the
//     plugin's command handler in a throwaway session — server initialisation
//     plus a session create/delete does not belong on the startup path.
//  3. A start must still be reachable when the user asks: expanding the sidebar
//     panel is the only trigger.
//
// The TUI half cannot be driven headlessly, so the two display-only imports are
// mocked and the api is stubbed; the assertions are about timing and side
// effects, not rendering.
// =============================================================================

import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeOrigin } from '../src/shared/runtime.ts'

/** The project the stub api reports — the key the fixture records are published under. */
const PROJECT = '/proj-under-test'

let runtimeDir: string

// Discovery reads published origin records, so each test gets its own runtime
// directory instead of sharing the machine's.
beforeEach(() => {
  runtimeDir = mkdtempSync(join(tmpdir(), 'pty-tui-index-'))
  process.env.PTY_RUNTIME_DIR = runtimeDir
})

afterEach(() => {
  delete process.env.PTY_RUNTIME_DIR
  rmSync(runtimeDir, { recursive: true, force: true })
})

/** Publish a listener the way the real server does, so discovery can find it. */
function publish(listener: { port?: number }): void {
  if (typeof listener.port === 'number') {
    writeOrigin({ directory: PROJECT, hostname: '::1', port: listener.port })
  }
}

type El = { tag: string; props: Record<string, unknown>; children: El[]; text?: string }

mock.module('@opentui/solid', () => {
  // Text nodes carry their content in `text`, like the real renderable, so a
  // test can read a label the panel rendered from an accessor.
  const textNode = (value: unknown): El => ({
    tag: '#text',
    props: {},
    children: [],
    text: String(value),
  })
  return {
    createElement: (tag: string): El => ({ tag, props: {}, children: [] }),
    createTextNode: textNode,
    // Real `insert` handles a reactive accessor, and the panel renders both its
    // row list and its reactive labels that way. The mock must resolve the
    // accessor and attach what it yields — elements AND strings — or no test
    // could reach a rendered row or read a rendered label.
    insert: (parent: El, child: unknown) => {
      const value = typeof child === 'function' ? (child as () => unknown)() : child
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item && typeof item === 'object') parent.children.push(item as El)
        else if (typeof item === 'string') parent.children.push(textNode(item))
      }
    },
    insertNode: (parent: El, child: El) => {
      parent.children.push(child)
    },
    setProp: (el: El, key: string, value: unknown) => {
      el.props[key] = value
    },
  }
})

// Stateful on purpose: the expand/collapse contract is only testable if the
// panel's `collapsed` signal actually flips on a click.
mock.module('solid-js', () => ({
  createSignal: (init: unknown) => {
    let value = init
    return [
      () => value,
      (next: unknown) => {
        value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(value) : next
      },
    ]
  },
}))

const { default: plugin } = await import('../src/tui/index.ts')

/**
 * Assert a value the test knows is present.
 *
 * Used instead of a non-null assertion so a structural surprise in the rendered
 * tree fails with a message rather than as a downstream TypeError.
 */
function must<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error('expected a value')
  return value as NonNullable<T>
}

describe('plugin module contract', () => {
  test('default-exports { id: "opencode-pty", tui }', () => {
    // The loader reads module.default and requires an object carrying `tui`
    // (and, for a TUI target, that it is NOT a `server` object). A named export
    // or a bare function fails to load with "Plugin export is not a function".
    expect(plugin.id).toBe('opencode-pty')
    expect(typeof plugin.tui).toBe('function')
    expect('server' in plugin).toBe(false)
  })
})

/**
 * A stub api for the plugin.
 *
 * `session.create` is the bootstrap's first step — starting the server — so it
 * is what `calls.serverStarts` counts. By default it never settles, which also
 * makes the factory timing test meaningful: a factory that awaited a refresh
 * which bootstrapped would never resolve. `rejectCreate` models a bootstrap that
 * fails outright, which is how the backoff path is reached.
 */
function stubApi(options: { rejectCreate?: boolean; throwingToast?: boolean } = {}) {
  let dispose: (() => void) | null = null
  let slots: { slots: { sidebar_content: () => El } } | null = null
  let confirm: { onConfirm?: () => void; title?: string; message?: string } | null = null
  let dialogTree: El | null = null
  const calls = {
    slots: 0,
    serverStarts: 0,
    dialogs: 0,
    confirms: 0,
    toasts: [] as string[],
  }
  const sidebar = () => must(slots).slots.sidebar_content()
  return {
    calls,
    disposeNow: () => dispose?.(),
    /** The rendered sidebar tree, rebuilt from the plugin's current state. */
    sidebar,
    /** The props the plugin handed to the most recent confirm dialog. */
    confirmProps: () => confirm,
    /** The rendered tree of the most recent dialog, or null before one opened. */
    dialogElement: () => dialogTree,
    /** Ask for a start: click the header, which toggles collapse. */
    clickHeader: () => {
      // The header is a row holding the toggle text first and the clear action
      // second; the toggle is what the panel binds the collapse to.
      const toggle = must(must(sidebar().children[0]).children[0])
      ;(toggle.props.onMouseDown as () => void)()
    },
    api: {
      kv: { get: (_key: string, fallback: unknown) => fallback, set: () => {} },
      slots: {
        register: (def: { slots: { sidebar_content: () => El } }) => {
          calls.slots++
          slots = def
        },
      },
      // The deprecated command API must not be used: the panel header is the only
      // start trigger. If the plugin ever reaches for it again, this throws and
      // the suite fails loudly instead of passing with a silently-registered
      // command.
      command: {
        register: () => {
          throw new Error('api.command.register must not be used')
        },
      },
      lifecycle: {
        onDispose: (fn: () => void) => {
          dispose = fn
        },
      },
      theme: { current: {} },
      ui: {
        toast: (input: { variant?: string }) => {
          calls.toasts.push(input.variant || 'info')
          // Models a host toast that throws, so the plugin's best-effort
          // handling around it is exercised rather than assumed.
          if (options.throwingToast) throw new Error('toast exploded')
        },
        DialogConfirm: (props: unknown) => {
          calls.confirms++
          confirm = props as { onConfirm?: () => void }
          return { tag: 'confirm', props: {}, children: [] }
        },
        // Counts every dialog the plugin pushes, so a test can tell a removal
        // confirm apart from the output dialog opening on the row behind a `✕`.
        // The rendered tree is kept so a test can read what the dialog says.
        dialog: {
          replace: (render: () => unknown) => {
            calls.dialogs++
            dialogTree = render() as El
          },
          clear: () => {},
          setSize: () => {},
        },
      },
      state: { session: { messages: () => [] }, path: { directory: PROJECT, worktree: PROJECT } },
      renderer: {},
      client: {
        session: {
          create: () => {
            calls.serverStarts++
            return options.rejectCreate
              ? Promise.reject(new Error('create failed'))
              : new Promise(() => {})
          },
        },
      },
    },
  }
}

/** Wait until `cond` holds, or give up. Keeps the tests free of fixed sleeps. */
async function waitFor(cond: () => boolean, ms = 750): Promise<boolean> {
  const deadline = Date.now() + ms
  while (!cond() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return cond()
}

describe('pty sidebar tui factory', () => {
  /**
   * Hang discovery deterministically: the fixture publishes an origin record for
   * this project, so the health probe it triggers never settles. A factory that
   * awaited its first refresh could therefore never resolve.
   *
   * The `probed` assertion is the point of the test. If the record is ever not
   * discovered, the refresh would finish without probing and the test would pass
   * vacuously — so it fails loudly instead, which is what makes this a real guard
   * rather than a tautology.
   */
  test('resolves without waiting for a discovery that never answers', async () => {
    const listener = Bun.serve({ hostname: '::1', port: 0, fetch: () => new Response('nope') })
    publish(listener)
    const realFetch = globalThis.fetch
    let probed = false
    globalThis.fetch = (() => {
      probed = true
      return new Promise(() => {})
    }) as unknown as typeof fetch
    const { api, calls, disposeNow } = stubApi()
    try {
      const outcome = await Promise.race([
        plugin.tui(api as never).then(() => 'resolved'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 750)),
      ])
      expect(probed).toBe(true) // the fixture listener really was discovered
      expect(outcome).toBe('resolved') // and the factory resolved anyway
      expect(calls.slots).toBe(1)
    } finally {
      globalThis.fetch = realFetch
      listener.stop(true)
      disposeNow()
    }
  })

  test('does not start the PTY server on load', async () => {
    const { api, calls, disposeNow } = stubApi()
    try {
      await plugin.tui(api as never)
      // Let the detached load-time refresh run its course.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(calls.serverStarts).toBe(0)
    } finally {
      disposeNow()
    }
  })

  test('does not adopt a healthy origin published by another process for the same project', async () => {
    let sessionRequests = 0
    const listener = Bun.serve({
      hostname: '::1',
      port: 0,
      fetch: (req) => {
        if (new URL(req.url).pathname === '/api/sessions') {
          sessionRequests++
          return Response.json([])
        }
        return Response.json({ status: 'healthy', sessions: { total: 0, active: 0 } })
      },
    })
    writeFileSync(
      join(runtimeDir, 'foreign.json'),
      JSON.stringify({
        pid: process.pid + 1,
        hostname: '::1',
        port: listener.port,
        directory: PROJECT,
      })
    )
    const realFetch = globalThis.fetch
    const { api, sidebar, disposeNow } = stubApi()
    jest.useFakeTimers()
    try {
      // Dispatch in-process so discovery settles on microtasks, not network timing.
      globalThis.fetch = (async (input) => listener.fetch(String(input))) as typeof fetch
      await plugin.tui(api as never)
      while (textNodesOf(sidebar()).includes('▶ PTY  starting…')) await Promise.resolve()
      expect(sessionRequests).toBe(0)
      expect(textNodesOf(sidebar())).toContain('▶ PTY  not running — click to start')
    } finally {
      globalThis.fetch = realFetch
      listener.stop(true)
      disposeNow()
      jest.useRealTimers()
    }
  })

  test('defers a start asked for while a refresh is in flight', async () => {
    // Hold the load refresh open so the ask lands while one is provably in
    // flight. The overlap guard must DEFER an explicit ask, never drop it — the
    // user clicks once, they do not retry in a loop.
    const listener = Bun.serve({ hostname: '::1', port: 0, fetch: () => new Response('nope') })
    publish(listener)
    const realFetch = globalThis.fetch
    let released = false
    let release: (() => void) | null = null
    globalThis.fetch = (() => {
      if (released) return Promise.reject(new Error('no'))
      return new Promise((_, reject) => {
        release = () => {
          released = true
          reject(new Error('no'))
        }
      })
    }) as unknown as typeof fetch
    const { api, calls, disposeNow, clickHeader } = stubApi()
    try {
      await plugin.tui(api as never)
      expect(release).not.toBeNull() // the load refresh really is mid-discovery
      clickHeader() // expand: asks while that refresh is still in flight
      expect(calls.serverStarts).toBe(0) // deferred, not started concurrently
      must(release as (() => void) | null)()
      expect(await waitFor(() => calls.serverStarts > 0, 1500)).toBe(true)
    } finally {
      globalThis.fetch = realFetch
      listener.stop(true)
      disposeNow()
    }
  })

  test('coalesces starts asked for while a refresh is in flight', async () => {
    // The guard's job: on a host where the server never comes up, several
    // create-session/delete-session cycles must not run at once. An ask that
    // lands mid-refresh is remembered, not started — it issues no probe of its
    // own, and N asks coalesce into ONE bootstrap when the in-flight refresh
    // finishes. Without the guard each ask probes immediately and then
    // bootstraps separately, which is what the two assertions below count.
    const listener = Bun.serve({ hostname: '::1', port: 0, fetch: () => new Response('nope') })
    publish(listener)
    const realFetch = globalThis.fetch
    let released = false
    // EVERY held probe is kept, and released together: a single-slot `release`
    // only frees the last probe, leaving earlier refreshes parked forever — and
    // then the count cannot tell one cycle from several.
    const held: Array<(reason?: unknown) => void> = []
    globalThis.fetch = (() => {
      if (released) return Promise.reject(new Error('no'))
      return new Promise((_, reject) => {
        held.push(reject as (reason?: unknown) => void)
      })
    }) as unknown as typeof fetch
    const { api, calls, disposeNow, clickHeader } = stubApi()
    try {
      await plugin.tui(api as never)
      const probing = held.length
      expect(probing).toBeGreaterThan(0) // the load refresh really is mid-discovery
      clickHeader() // expand -> asks
      clickHeader() // collapse
      clickHeader() // expand -> asks
      clickHeader() // collapse
      clickHeader() // expand -> asks
      expect(held.length).toBe(probing) // deferred: an ask starts no probe of its own
      released = true
      for (const reject of held) reject(new Error('no'))
      expect(await waitFor(() => calls.serverStarts > 0, 1500)).toBe(true)
      expect(calls.serverStarts).toBe(1) // three asks, one bootstrap
    } finally {
      globalThis.fetch = realFetch
      listener.stop(true)
      disposeNow()
    }
  })

  test('a forced refresh after a removal is deferred, never dropped', async () => {
    // The removal path asks for `refresh(false, true)`: the user is waiting, so it
    // must NOT be dropped when one is already in flight — it has to run after it,
    // or the removed row lingers until the next poll (2.5s away, outside any test
    // window). The in-flight refresh is made to answer with a SNAPSHOT taken
    // before the removal, so only the deferred refresh can clear the row.
    const { server, deletes } = ptyFixture([
      { id: 'pty_old', title: 'sleep 5', status: 'exited', exitCode: 0, lineCount: 1 },
    ])
    const realFetch = globalThis.fetch
    let holdList = false
    let releaseList: (() => void) | null = null
    globalThis.fetch = ((input: string, init?: RequestInit) => {
      const url = String(input)
      if (holdList && url.endsWith('/api/sessions')) {
        const snapshot = realFetch(input, init) // issued now, before the removal
        return new Promise((resolve) => {
          releaseList = () => {
            holdList = false
            resolve(snapshot)
          }
        })
      }
      return realFetch(input, init)
    }) as unknown as typeof fetch
    const stub = stubApi()
    const boxes = () => rowsOf(stub).filter((r) => r.tag === 'box').length
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader() // expand
      expect(await waitForRows(stub, 1)).toBe(true)
      stub.clickHeader() // collapse, so the next expand starts a refresh
      expect(boxes()).toBe(0)
      holdList = true
      stub.clickHeader() // expand -> a refresh whose list fetch is now held
      // Not synchronous: the refresh re-resolves the origin (the expand cleared
      // it, so stale state cannot skip discovery) before it reaches the list.
      expect(await waitFor(() => releaseList !== null)).toBe(true)

      const stopped = { value: false }
      clickControl(removeControl(must(rowsOf(stub)[0])).props.onMouseUp, stopped)
      expect(await waitFor(() => deletes.length > 0)).toBe(true)

      must(releaseList as (() => void) | null)()
      // The in-flight refresh answers with the pre-removal snapshot; the deferred
      // one has to follow it and clear the row.
      expect(await waitFor(() => boxes() === 0)).toBe(true)
    } finally {
      globalThis.fetch = realFetch
      server.stop(true)
      stub.disposeNow()
    }
  })

  test('starts the PTY server when the panel is expanded', async () => {
    const { api, calls, disposeNow, clickHeader } = stubApi()
    try {
      await plugin.tui(api as never)
      expect(calls.serverStarts).toBe(0)
      clickHeader() // the panel starts collapsed, so this expands it
      expect(await waitFor(() => calls.serverStarts > 0)).toBe(true)
    } finally {
      disposeNow()
    }
  })

  test('does not start the PTY server when the panel is collapsed', async () => {
    // A failing create keeps every attempt short-lived, so a spurious ask on
    // collapse would show up as a real extra attempt rather than being deferred.
    const { api, calls, disposeNow, clickHeader } = stubApi({ rejectCreate: true })
    try {
      await plugin.tui(api as never)
      clickHeader() // expand -> asks
      expect(await waitFor(() => calls.serverStarts > 0)).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 50)) // let it settle
      const afterExpand = calls.serverStarts
      clickHeader() // collapse -> must NOT ask
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(calls.serverStarts).toBe(afterExpand)
    } finally {
      disposeNow()
    }
  })

  test('bounds every probe with an abort signal', async () => {
    // The regression this guards: reverting fetchWithTimeout to a bare fetch()
    // leaves the probe unbounded, so a peer that accepts but never answers holds
    // the refresh — and the overlap guard behind it — open forever.
    const listener = Bun.serve({ hostname: '::1', port: 0, fetch: () => new Response('nope') })
    publish(listener)
    const realFetch = globalThis.fetch
    const signals: unknown[] = []
    globalThis.fetch = ((_url: string, init?: { signal?: unknown }) => {
      signals.push(init?.signal)
      return new Promise(() => {})
    }) as typeof fetch
    const { api, disposeNow } = stubApi()
    try {
      await plugin.tui(api as never)
      expect(await waitFor(() => signals.length > 0)).toBe(true) // a probe went out
      expect(signals.every((s) => s instanceof AbortSignal)).toBe(true) // and bounded
    } finally {
      globalThis.fetch = realFetch
      listener.stop(true)
      disposeNow()
    }
  })

  test('expanding retries once the bootstrap backoff has engaged', async () => {
    const { api, calls, disposeNow, clickHeader } = stubApi({ rejectCreate: true })
    try {
      await plugin.tui(api as never)
      // Three expand-triggered failures engage the backoff; the collapse clicks
      // in between are what let the next expand happen at all.
      for (let i = 0; i < 3; i++) {
        const before = calls.serverStarts
        clickHeader() // expand
        expect(await waitFor(() => calls.serverStarts > before)).toBe(true)
        clickHeader() // collapse
      }
      // Backing off must not make the panel a dead end: expanding again retries.
      const beforeRetry = calls.serverStarts
      clickHeader() // expand
      expect(await waitFor(() => calls.serverStarts > beforeRetry, 1500)).toBe(true)
    } finally {
      disposeNow()
    }
  })
})

/**
 * A stand-in for the PTY server's HTTP API: answers the health probe the
 * discovery path uses, serves the session list, and records every cleanup
 * request. Bound to `::1` and published as an origin record, so discovery finds
 * it exactly the way it finds the real server.
 */
function ptyFixture(sessions: unknown[]) {
  const deletes: string[] = []
  const server = Bun.serve({
    hostname: '::1',
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url)
      if (url.pathname === '/health') {
        return Response.json({
          status: 'healthy',
          sessions: { total: sessions.length, active: 0 },
        })
      }
      if (url.pathname === '/api/sessions' && req.method === 'GET') {
        return Response.json(sessions)
      }
      if (req.method === 'DELETE' && url.pathname.endsWith('/cleanup')) {
        deletes.push(url.pathname)
        // Serve the list WITHOUT the removed session afterwards, so a test can
        // observe that the panel's own refresh ran — the next poll is 2.5s away,
        // far outside the window a test waits.
        const id = url.pathname.split('/')[3]
        const at = sessions.findIndex((s) => (s as { id?: unknown }).id === id)
        if (at >= 0) sessions.splice(at, 1)
        return Response.json({ success: true })
      }
      return new Response('not found', { status: 404 })
    },
  })
  // Publish it the way the real server does, so the panel's discovery finds it.
  publish(server)
  return { server, deletes }
}

/** The panel's rendered rows — the sidebar's second child is the live column. */
function rowsOf(stub: ReturnType<typeof stubApi>) {
  return stub.sidebar().children[1]?.children ?? []
}

/**
 * Wait until `count` real session rows are rendered.
 *
 * Filters on `box`: an empty list renders a `text` placeholder, and waiting on
 * a bare non-empty count would match that and race every assertion behind it.
 */
function waitForRows(stub: ReturnType<typeof stubApi>, count: number) {
  return waitFor(() => rowsOf(stub).filter((r) => r.tag === 'box').length === count)
}

/** A row's `✕`: the bullet, the label, then the remove glyph. */
function removeControl(row: El) {
  return must(row.children[2])
}

/** The header's clear-finished label as rendered ("" when there is none). */
function clearLabelOf(stub: ReturnType<typeof stubApi>) {
  const clear = must(must(stub.sidebar().children[0]).children[1])
  return clear.children[0]?.text ?? ''
}

/** Fire a control's mouse handler with a fake event that records the stop. */
function clickControl(handler: unknown, stopped: { value: boolean }) {
  ;(handler as (evt: unknown) => void)({
    stopPropagation: () => {
      stopped.value = true
    },
  })
}

/** Every text node's content in a rendered element tree. */
function textNodesOf(element: El | null): string[] {
  if (!element) return []
  const found: string[] = []
  const walk = (node: El) => {
    if (node.text !== undefined) found.push(node.text)
    for (const child of node.children) walk(child)
  }
  walk(element)
  return found
}

describe('pty sidebar session removal', () => {
  test('✕ on a finished session removes it without opening the dialog', async () => {
    const { server, deletes } = ptyFixture([
      { id: 'pty_aaaa', title: 'sleep 300', status: 'exited', exitCode: 0, lineCount: 3 },
    ])
    const stub = stubApi()
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader() // expand; the panel starts collapsed
      expect(await waitForRows(stub, 1)).toBe(true)
      // Discovery reached the fixture, so no throwaway bootstrap session ran.
      expect(stub.calls.serverStarts).toBe(0)

      const stopped = { value: false }
      clickControl(removeControl(must(rowsOf(stub)[0])).props.onMouseUp, stopped)
      expect(stopped.value).toBe(true)
      expect(await waitFor(() => deletes.length > 0)).toBe(true)
      expect(deletes[0]).toBe('/api/sessions/pty_aaaa/cleanup')

      // The removal's own refresh must land promptly: the fixture now serves the
      // list without that session, so the row going away inside this window is
      // the observable proof the refresh ran (the poll is 2.5s off).
      expect(await waitFor(() => rowsOf(stub).filter((r) => r.tag === 'box').length === 0)).toBe(
        true
      )

      // The finished branch must push no dialog at all — neither the removal
      // confirm nor the output dialog. (That the event was actually suppressed is
      // proven above by the stopPropagation call-check; this mock does not
      // simulate bubbling, so this assertion cannot prove it.)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(stub.calls.dialogs).toBe(0)
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })

  test('✕ on a running session asks first, then removes', async () => {
    const { server, deletes } = ptyFixture([
      { id: 'pty_bbbb', title: 'make test', status: 'running', lineCount: 12 },
    ])
    const stub = stubApi()
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader()
      expect(await waitForRows(stub, 1)).toBe(true)

      clickControl(removeControl(must(rowsOf(stub)[0])).props.onMouseUp, { value: false })
      // A live process: the dialog is up and nothing has been killed yet.
      expect(stub.calls.confirms).toBe(1)
      expect(deletes).toEqual([])

      must(must(stub.confirmProps()).onConfirm)()
      expect(await waitFor(() => deletes.length > 0)).toBe(true)
      expect(deletes[0]).toBe('/api/sessions/pty_bbbb/cleanup')
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })

  test('clear finished removes every stopped session and no other', async () => {
    const { server, deletes } = ptyFixture([
      { id: 'pty_run', title: 'make test', status: 'running', lineCount: 1 },
      { id: 'pty_end', title: 'sleep 60', status: 'exited', exitCode: 0, lineCount: 2 },
      { id: 'pty_kil', title: 'sleep 5', status: 'killed', lineCount: 4 },
      // Transient, not finished: a clear that raced the process teardown would
      // be a bug, so it must be left alone.
      { id: 'pty_ing', title: 'stopping', status: 'killing', lineCount: 0 },
    ])
    const stub = stubApi()
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader()
      expect(await waitForRows(stub, 4)).toBe(true)

      const clear = must(must(stub.sidebar().children[0]).children[1])
      // The header offers the action only while something can be cleared.
      expect(clearLabelOf(stub)).toBe('(clear finished)')
      const stopped = { value: false }
      clickControl(clear.props.onMouseDown, stopped)
      expect(stopped.value).toBe(true) // the click must not also collapse the panel
      expect(await waitFor(() => deletes.length === 2)).toBe(true)
      expect(deletes.sort()).toEqual([
        '/api/sessions/pty_end/cleanup',
        '/api/sessions/pty_kil/cleanup',
      ])
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })

  test('a throwing success toast is not reported as a failed removal', async () => {
    const { server, deletes } = ptyFixture([
      { id: 'pty_zzzz', title: 'sleep 5', status: 'exited', exitCode: 0, lineCount: 1 },
    ])
    const stub = stubApi({ throwingToast: true })
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader()
      expect(await waitForRows(stub, 1)).toBe(true)

      clickControl(removeControl(must(rowsOf(stub)[0])).props.onMouseUp, { value: false })
      expect(await waitFor(() => deletes.length > 0)).toBe(true)
      // The success toast threw. The removal still succeeded, so it must NOT be
      // followed by a failure toast — reporting it as failed is the regression
      // this pins.
      expect(stub.calls.toasts).toEqual(['info'])
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })

  test('clear finished touches nothing while every session is still live', async () => {
    const { server, deletes } = ptyFixture([
      { id: 'pty_run', title: 'make test', status: 'running', lineCount: 1 },
    ])
    const stub = stubApi()
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader()
      expect(await waitForRows(stub, 1)).toBe(true)

      const clear = must(must(stub.sidebar().children[0]).children[1])
      // Nothing is finished, so the header must offer no clear action at all.
      expect(clearLabelOf(stub)).toBe('')
      clickControl(clear.props.onMouseDown, { value: false })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(deletes).toEqual([])
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })
})

describe('pty sidebar output dialog', () => {
  test('shows how long the process has run, fixed once it exits', async () => {
    // Fixed timestamps, so the expected label does not depend on the clock: the
    // finished session ran exactly one minute; the running one is still going.
    const base = Date.now()
    const { server } = ptyFixture([
      {
        id: 'pty_done',
        title: 'build',
        status: 'exited',
        exitCode: 0,
        lineCount: 1,
        createdAt: new Date(base - 65_000).toISOString(),
        exitAt: new Date(base - 5_000).toISOString(),
      },
      {
        id: 'pty_live',
        title: 'dev server',
        status: 'running',
        lineCount: 3,
        createdAt: new Date(base - 90_000).toISOString(),
      },
    ])
    const stub = stubApi()
    try {
      await plugin.tui(stub.api as never)
      stub.clickHeader() // expand
      expect(await waitForRows(stub, 2)).toBe(true)

      // A finished session: 65s - 5s before the fixture base = one minute, shown
      // as a fixed figure in the header's bottom-right corner.
      clickControl(must(rowsOf(stub)[0]).props.onMouseUp, { value: false })
      expect(await waitFor(() => stub.dialogElement() !== null)).toBe(true)
      const finished = textNodesOf(stub.dialogElement())
      expect(finished).toContain('esc to close')
      expect(finished).toContain('1m 00s')

      // A running one has no end yet, so it is measured from its start to now.
      clickControl(must(rowsOf(stub)[1]).props.onMouseUp, { value: false })
      expect(await waitFor(() => textNodesOf(stub.dialogElement()).includes('1m 30s'))).toBe(true)
    } finally {
      server.stop(true)
      stub.disposeNow()
    }
  })
})
