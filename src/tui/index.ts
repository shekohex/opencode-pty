// =============================================================================
// src/tui/index.ts
// PTY sidebar TUI plugin: lists the plugin's sessions in the sidebar and shows
// a session's live output in a dialog.
//
// Design notes, each learned the hard way:
//
//  - **Default-export an object `{ id, tui }`.** Named exports fail to load with
//    "Plugin export is not a function".
//  - **Build elements lazily, inside a render pass.** `createElement` resolves
//    its renderer from a Solid context, so constructing one outside a render
//    throws "No renderer found". Never precompute elements.
//  - **`sidebar_content` is additive** (with an `order`), so this panel sits
//    alongside the built-ins rather than replacing them.
//  - **Present output in a dialog**, not a route and not a mirror session: a
//    route replaces the entire view, and child-session views have no sidebar.
//  - **Take the LATEST posted URL.** The PTY server binds a random port on every
//    start, so an older message holds a dead origin.
//  - **`/buffer/plain` returns JSON** (`{ plain, byteLength }`), CRLF-terminated.
//  - **Stop propagation at a control nested in a row or the header.** opentui
//    bubbles a mouse event to the parent only while `propagationStopped` is
//    false, so the row's `✕` and the header's clear action must swallow the
//    event or they also open the dialog / collapse the panel.
//  - **Fail loudly.** A silent no-op is indistinguishable from a bug, so every
//    failure path surfaces a status line and a toast.
//
// The PTY server is a hard dependency: its HTTP API is the only window onto PTY
// sessions. It publishes its bound address for discovery, and is started on
// demand through the plugin's own `pty-show-server-url` command.
// =============================================================================

import { appendFileSync, mkdirSync } from 'node:fs'
import type { TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui'
import {
  createElement,
  createTextNode,
  insert,
  insertNode,
  setProp,
  type JSX,
} from '@opentui/solid'
import { createSignal } from 'solid-js'
import { candidateOrigins, originsForProject } from '../shared/runtime.ts'
import {
  bootstrapFailureCause,
  clearActionLabel,
  decodeBuffer,
  finishedSessions,
  formatDetail,
  formatDuration,
  headerLabel,
  isPtyHealth,
  latestServerUrl,
  ROW_BULLET,
  rowLabel,
  rowTone,
  tail,
} from './lib.ts'

const POLL_MS = 2500
const TAIL_LINES = 300
const SLOT_ORDER = 450
const BOOTSTRAP_TITLE = 'opencode-pty sidebar bootstrap'

/** The per-row remove control. Leading space so it does not crowd the label. */
const REMOVE_GLYPH = ' \u2715'

/** Consecutive bootstrap failures before the poll stops retrying by itself. */
const MAX_BOOTSTRAP_FAILURES = 3

/**
 * Collapse state — persisted in kv, deliberately NOT scoped per process: it is a
 * user preference that should hold across every opencode instance. Defaults to
 * collapsed so the panel stays out of the way until asked for.
 */
const KV_COLLAPSED = 'opencode-pty.sidebar.collapsed'

/**
 * The resolved origin, cached in MEMORY rather than in kv.
 *
 * `api.kv` is shared by every opencode process while the PTY server is
 * per-process, and kv has no delete API — so a per-PID key would leave one stale
 * entry behind on every single opencode start, forever. In-memory is
 * per-process by construction and needs no cleanup.
 */
let cachedOrigin: string | null = null

/**
 * The reason the last bootstrap failed, kept so the panel can report the CAUSE
 * rather than just "server unavailable". The most common one is real and
 * actionable: `command not found: pty-show-server-url` means the PTY server
 * plugin is not registered in opencode.jsonc, which makes retrying pointless and
 * is otherwise invisible.
 */
let lastBootstrapError: string | null = null

/** A PTY session as the panel reads it — mirroring the server's session shape. */
type PtySession = {
  id: string
  title?: string
  status?: string
  lineCount?: number
  exitCode?: number
  pid?: number
  command?: string
  args?: string[]
  workdir?: string
  /** ISO timestamps from the server: when the process started, and when it ended. */
  createdAt?: string
  exitAt?: string
}

/**
 * The server's session endpoints, pinned in one place.
 *
 * Typed locally rather than taken from the SDK: the panel uses three calls of
 * one surface, and this keeps the plugin compiling across SDK minor versions
 * that reshuffle the generated client.
 */
type SessionClient = {
  create: (input: { title: string }) => Promise<unknown>
  command: (input: { sessionID: string; command: string; arguments: string }) => Promise<unknown>
  delete: (input: { sessionID: string }) => Promise<unknown>
}

function sessionClient(api: TuiPluginApi): SessionClient {
  return (api.client as unknown as { session: SessionClient }).session
}

/** The renderer bits the panel probes, guarded because the host owns them. */
type RendererView = {
  height?: number
  width?: number
  clearSelection?: () => void
}

function rendererView(api: TuiPluginApi): RendererView {
  return api.renderer as unknown as RendererView
}

/**
 * The sidebar status while the PTY server cannot be reached.
 *
 * Reports the CAUSE once the retries have been exhausted. `command not found:
 * pty-show-server-url` in particular means the server plugin this depends on is
 * not registered in the project's opencode.jsonc, so the panel says that instead
 * of inviting a retry that cannot possibly work.
 */
function bootstrapFailureStatus(failures: number): string {
  if (failures < MAX_BOOTSTRAP_FAILURES) return 'starting server…'
  if (!lastBootstrapError) return 'server unavailable — toggle the panel to retry'
  return `unavailable: ${String(lastBootstrapError).split('\n')[0]?.slice(0, 44)}`
}

/**
 * The sidebar status while nothing is listening and no request to start the
 * server has been made.
 *
 * Starting it is not free: it goes through the plugin's command, which runs
 * server initialisation and creates and deletes a throwaway session. That does
 * not belong on the startup path, so it happens only on an explicit request —
 * which is why the text names the click: it renders in the panel header, where
 * the click lives.
 */
const IDLE_STATUS = 'not running — click to start'

// A TUI plugin has no console, so a small event log on disk is the only way to
// diagnose interaction problems. OFF BY DEFAULT: it appends unboundedly, and
// shipping a plugin that quietly grows a file in /tmp forever is not acceptable.
// Set PTY_TUI_DEBUG=1 to turn it on when diagnosing.
const LOG_DIR = '/tmp/opencode'
const LOG = `${LOG_DIR}/opencode-pty-tui.log`
const DEBUG_ENABLED =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.PTY_TUI_DEBUG !== undefined &&
  process.env.PTY_TUI_DEBUG !== '' &&
  process.env.PTY_TUI_DEBUG !== '0'

function debug(event: string, detail?: unknown): void {
  if (!DEBUG_ENABLED) return
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(
      LOG,
      `${new Date().toISOString()} ${event} ${detail ? JSON.stringify(detail) : ''}\n`
    )
  } catch (_) {
    /* logging must never break the plugin */
  }
}

// ── host helpers (no elements) ────────────────────────────────────────────────

/** Every text-bearing part of a session's messages, oldest first. */
function messageTexts(api: TuiPluginApi, sessionID: string): string[] {
  const out: string[] = []
  let messages: ReadonlyArray<unknown> = []
  try {
    messages = api.state.session.messages(sessionID) ?? []
  } catch (_) {
    return out
  }
  for (const m of messages) {
    const message = m as { parts?: unknown; id?: unknown }
    let parts = message?.parts
    if (!parts && message && typeof message.id === 'string') {
      try {
        parts = api.state.part(message.id)
      } catch (_) {
        parts = null
      }
    }
    for (const p of Array.isArray(parts) ? parts : []) {
      const part = p as { text?: unknown; state?: { output?: unknown } }
      const body = part && (part.text || part.state?.output)
      if (typeof body === 'string') out.push(body)
    }
  }
  return out
}

/**
 * Every probe is bounded. A stopped-but-listening loopback peer accepts the
 * connection and then never answers, which without a timeout would hold a
 * refresh — and with it the overlap guard, and the poll behind it — open
 * indefinitely.
 */
const FETCH_TIMEOUT_MS = 2000

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

/**
 * Stop a mouse event from reaching the row or header handler behind a control.
 *
 * Defensive about the event being absent: the handlers are unit-invoked in tests
 * without an event object.
 */
function stopPropagation(evt: unknown): void {
  const event = evt as { stopPropagation?: () => void } | null
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
}

// Liveness of a *known* origin. Checks the payload, not merely res.ok, so it
// agrees with the discovery path about what the PTY server looks like — an
// unrelated service that happens to answer 200 must not be mistaken for it.
async function isHealthy(origin: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${origin}/health`)
    if (!res.ok) return false
    return isPtyHealth(await res.json())
  } catch (_) {
    return false
  }
}

/**
 * Origins this process published for the project, confirmed healthy.
 *
 * Worker threads share process.pid; an attached TUI needs the instance-scoped scrape.
 *
 * A record is only a hint about where to look: `/health` decides whether
 * anything is actually serving there. That also covers a server that died
 * without cleaning up and an unrelated service squatting the port.
 */
async function healthyRuntimeOrigins(api: TuiPluginApi): Promise<string[]> {
  let directory: string | undefined
  let worktree: string | undefined
  try {
    directory = api.state.path.directory
    worktree = api.state.path.worktree
  } catch (_) {
    return [] // host state not ready yet — no candidates this tick
  }
  const healthy: string[] = []
  for (const record of originsForProject(directory, worktree)) {
    if (record.pid !== process.pid) continue
    for (const origin of candidateOrigins(record)) {
      if (await isHealthy(origin)) {
        healthy.push(origin)
        break
      }
    }
  }
  return healthy
}

/**
 * Start the PTY server without leaving a trace in the user's session.
 *
 * The server is only ever created as a side effect of one of the plugin's two
 * commands: `pty-show-server-url` (which POSTS THE URL AS A CHAT MESSAGE) or
 * `pty-open-background-spy` (which opens a browser). Neither is acceptable to
 * fire into the user's own transcript, and the server cannot be started any
 * other way.
 *
 * So the message-posting command is run inside a THROWAWAY session: the URL lands
 * there instead, the origin is scraped from that private session, and the
 * session is deleted. The server survives — it is a plugin-level object, not
 * per-session — so the panel then works and the user's chat stays clean.
 *
 * It doubles as the tie-breaker when several servers advertise for the same
 * project: only the caller's own opencode server can say which is its own.
 */
async function bootstrapOrigin(api: TuiPluginApi): Promise<string | null> {
  const client = sessionClient(api)
  let scratchID: string | null = null
  try {
    const created = await client.create({ title: BOOTSTRAP_TITLE })
    const data = (created as { data?: unknown }).data ?? created
    const info = data as { id?: string; info?: { id?: string } }
    scratchID = info?.id || info?.info?.id || null
    if (!scratchID) {
      debug('bootstrap.failed', { reason: 'session.create returned no id' })
      return null
    }
  } catch (e) {
    debug('bootstrap.failed', { step: 'create', error: String(e) })
    return null
  }

  try {
    await client.command({
      sessionID: scratchID,
      command: 'pty-show-server-url',
      arguments: '',
    })
  } catch (e) {
    // Only a REAL error is worth remembering: opencode's message is the
    // difference between "the server is slow" and "the plugin you depend on is
    // not installed". The sentinel is the plugin's normal completion signal,
    // thrown after it has already started the server and posted the URL.
    lastBootstrapError = bootstrapFailureCause(e)
    if (lastBootstrapError === null) debug('bootstrap.command.handled', {})
    else debug('bootstrap.command.failed', { error: lastBootstrapError })
  }

  let origin: string | null = null
  for (let attempt = 0; attempt < 20 && !origin; attempt++) {
    await new Promise((r) => setTimeout(r, 300))
    // The scrape is the only instance-correct source: it goes through the
    // caller's own opencode server, so a sibling instance's origin can never be
    // mistaken for ours.
    origin = latestServerUrl(messageTexts(api, scratchID))
    if (origin && !(await isHealthy(origin))) origin = null
  }

  try {
    await client.delete({ sessionID: scratchID })
  } catch (e) {
    debug('bootstrap.cleanup.failed', { scratchID, error: String(e) })
  }

  debug('bootstrap.done', { origin, scratchID })
  return origin
}

/**
 * Resolve the PTY server origin, cheapest and quietest first:
 *
 *  1. cached, while it still answers
 *  2. an origin record this process published for this project, confirmed by
 *     `/health` — the same-process case, and it costs no session
 *  3. the instance-scoped scrape through a throwaway session — when nothing is
 *     advertised (starting one, if asked) or when several records match and only
 *     the caller's own opencode server can say which is ours
 *
 * A cached origin that stops answering is re-resolved, because the server is
 * bound a new random port every time it starts.
 */
async function resolveOrigin(api: TuiPluginApi, allowBootstrap: boolean): Promise<string | null> {
  if (cachedOrigin && (await isHealthy(cachedOrigin))) return cachedOrigin

  const advertised = await healthyRuntimeOrigins(api)
  if (advertised.length === 1) {
    const only = advertised[0] ?? null
    debug('origin.runtime-file', { origin: only })
    cachedOrigin = only
    return only
  }

  // Only an explicit request may reach the scrape: it runs a command, so on an
  // unattended poll it is reserved for the one case where guessing would attach
  // the panel to a sibling instance's sessions (several records, no way to tell
  // them apart). Everything else waits for the user, who resolves it by clicking.
  if (!allowBootstrap) return null

  const viaScrape = await bootstrapOrigin(api)
  if (viaScrape) cachedOrigin = viaScrape
  return viaScrape
}

async function listSessions(origin: string): Promise<PtySession[]> {
  const res = await fetchWithTimeout(`${origin}/api/sessions`)
  const body = await res.json()
  const arr = Array.isArray(body) ? body : body?.sessions
  return Array.isArray(arr) ? (arr as PtySession[]) : []
}

async function readBuffer(origin: string, id: string): Promise<string> {
  const res = await fetchWithTimeout(`${origin}/api/sessions/${id}/buffer/plain`)
  return decodeBuffer(await res.json())
}

/**
 * Drop a session from the server's store, killing it first when it is still
 * running. CLEANUP — not a plain kill — is what deletes the entry; a plain kill
 * keeps the session around for log access, which is why the list only ever grew.
 */
async function cleanupSession(origin: string, id: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${origin}/api/sessions/${id}/cleanup`, {
    method: 'DELETE',
  })
  return res.ok
}

// ── element helpers — call ONLY inside a render pass ──────────────────────────

function text(content: unknown) {
  const el = createElement('text')
  insertNode(el, createTextNode(String(content)))
  return el
}

/** A text element whose content tracks an accessor (reactive). */
function textLive(accessor: () => unknown) {
  const el = createElement('text')
  insert(el, () => String(accessor()))
  return el
}

function column(children: unknown[]) {
  const box = createElement('box')
  setProp(box, 'flexDirection', 'column')
  for (const child of children) {
    if (child) insertNode(box, child as ReturnType<typeof createElement>)
  }
  return box
}

/** A column whose children follow an accessor (reactive list). */
function columnLive(accessor: () => unknown) {
  const box = createElement('box')
  setProp(box, 'flexDirection', 'column')
  insert(box, () => accessor())
  return box
}

/**
 * A scrollable holder for the output.
 *
 * A scrollbox only scrolls if it has a BOUNDED height, so one is supplied in
 * rows. `stickyScroll` + `stickyStart: "bottom"` keep the view pinned to the
 * newest output, which is what you want when watching a live process — the
 * same idiom opencode-user-timeline uses for its list.
 */
function scrollboxFor(child: unknown, rows: number) {
  const box = createElement('scrollbox')
  setProp(box, 'width', '100%')
  setProp(box, 'height', rows)
  setProp(box, 'scrollY', true)
  setProp(box, 'stickyScroll', true)
  setProp(box, 'stickyStart', 'bottom')
  insertNode(box, child as ReturnType<typeof createElement>)
  return box
}

/**
 * opentui's imperative `createElement` returns a `BaseRenderable`, but the slot
 * and dialog render callbacks are typed in terms of solid's DOM `JSX.Element`.
 * The runtime accepts the renderable — only the types disagree — so the bridge
 * is one documented cast instead of `any` at each call site.
 */
function slotElement(node: ReturnType<typeof createElement>): JSX.Element {
  return node as unknown as JSX.Element
}

// ── plugin ────────────────────────────────────────────────────────────────────

const tui = async (api: TuiPluginApi): Promise<void> => {
  const [sessions, setSessions] = createSignal<PtySession[]>([])
  const [status, setStatus] = createSignal<string>('starting…')
  // Restored from kv so the panel remembers its state across restarts, matching
  // how the built-in sidebar items (MCP, File Tree, Todo) behave.
  const [collapsed, setCollapsed] = createSignal<boolean>(Boolean(api.kv.get(KV_COLLAPSED, true)))

  let origin: string | null = null
  let disposed = false
  let rootTimer: ReturnType<typeof setInterval> | null = null
  let refreshing = false
  let bootstrapFailures = 0
  let bootstrapPending = false
  let refreshPending = false

  /**
   * `force` marks a refresh the user is waiting on (after a removal). A plain
   * poll tick that lands mid-refresh can be dropped — the in-flight one is
   * already refreshing the list — but a forced one must never be, because that
   * in-flight fetch still carries the pre-removal list and the row the user just
   * removed would linger until the next tick.
   */
  const refresh = async (allowBootstrap = false, force = false): Promise<void> => {
    if (disposed) return
    // Guard against overlap: a bootstrap can take ~6s while the poll ticks every
    // 2.5s, so without this a host where the server never comes up would run
    // several create-session/delete-session cycles at once, forever.
    if (refreshing) {
      // An explicit ask must never be dropped — the user clicks once, they do
      // not retry in a loop. Remember it and run it when this refresh finishes.
      if (allowBootstrap) bootstrapPending = true
      else if (force) refreshPending = true
      return
    }
    refreshing = true
    try {
      // Checked BEFORE the attempt, so "backed off" actually means no further
      // create-session/delete-session cycles until the user retries.
      if (!origin && allowBootstrap && bootstrapFailures >= MAX_BOOTSTRAP_FAILURES) {
        setStatus(bootstrapFailureStatus(bootstrapFailures))
        return
      }
      if (!origin) origin = await resolveOrigin(api, allowBootstrap)
      if (!origin) {
        // Nothing is listening. Only an explicit request may start the server,
        // so without one there is no attempt to count down — just an idle panel.
        if (allowBootstrap) {
          bootstrapFailures++
          debug('refresh.bootstrap-failed', { bootstrapFailures })
          setStatus(bootstrapFailureStatus(bootstrapFailures))
        } else {
          setStatus(IDLE_STATUS)
        }
        setSessions([])
        return
      }
      bootstrapFailures = 0
      const list = await listSessions(origin)
      setSessions(list)
      setStatus(list.length === 1 ? '1 session' : `${list.length} sessions`)
    } catch (_) {
      // Force re-discovery next tick: the server may have restarted on a new port.
      origin = null
      setStatus('server unreachable')
      setSessions([])
    } finally {
      refreshing = false
      if (bootstrapPending) {
        // A bootstrap refresh re-lists too, so it supersedes a queued plain one.
        bootstrapPending = false
        refreshPending = false
        refresh(true).catch(() => {})
      } else if (refreshPending) {
        refreshPending = false
        refresh().catch(() => {})
      }
    }
  }

  const openOutput = async (session: PtySession): Promise<void> => {
    if (!origin) {
      api.ui.toast({ variant: 'warning', title: 'opencode-pty', message: 'PTY server unavailable' })
      return
    }
    // Captured for the lifetime of this dialog. `origin` is shared state and
    // refresh() nulls it on a transient failure — reading the shared variable
    // here would then report a buffer-read failure for a session that is fine.
    const dialogOrigin = origin
    const [buf, setBuf] = createSignal<string>('loading…')
    let timer: ReturnType<typeof setInterval> | null = null
    // The run timer: `now` drives it while the process is going, and the panel's
    // own poll keeps `sessions()` fresh — so a process that exits while the
    // dialog is open freezes the figure without another API call. Reading the
    // live session also covers a status the snapshot predates.
    const [now, setNow] = createSignal(Date.now())
    let tick: ReturnType<typeof setInterval> | null = null
    const liveSession = () => sessions().find((s) => s.id === session.id) ?? session
    const elapsedMs = (): number | null => {
      const started = Date.parse(liveSession().createdAt ?? '')
      if (!Number.isFinite(started)) return null
      const ended = Date.parse(liveSession().exitAt ?? '')
      return (Number.isFinite(ended) ? ended : now()) - started
    }
    const load = async (): Promise<void> => {
      try {
        setBuf(await readBuffer(dialogOrigin, session.id))
      } catch (_) {
        setBuf('(failed to read buffer — the session may have been cleaned up)')
      }
    }
    await load()
    // The host dismisses the dialog on a mouse-up on its overlay, but ignores
    // that release when a text selection was active on the preceding mouse-down
    // (so you can drag-select without the dialog vanishing) — which is what made
    // closing take two outside clicks. Clearing any stale selection first means
    // the very next click finds nothing to protect and closes on the first one.
    try {
      const renderer = rendererView(api)
      if (typeof renderer.clearSelection === 'function') renderer.clearSelection()
    } catch (_) {
      /* best effort — clearing is an optimisation, not a requirement */
    }
    // The host renders the dialog as a full-screen overlay with
    // `alignItems:center` (horizontal only) and `paddingTop = terminalHeight/4`,
    // so the dialog's top edge is pinned a QUARTER of the screen down and it
    // grows downward from there. For its midpoint to land on the screen's
    // midpoint its total height must therefore be exactly HALF the screen: any
    // row beyond that pushes the bottom down without lifting the top. Width is
    // capped independently at 116 columns by size "xlarge", so HEIGHT is the
    // only shape lever available — and it is spent here filling downward to the
    // screen edge (the tallest the host will show), which trades away the
    // centring that a half-screen box would give.
    const renderer = rendererView(api)
    const screenRows = typeof renderer.height === 'number' ? renderer.height : 40
    const cols = typeof renderer.width === 'number' ? renderer.width : 80
    const topOffset = Math.floor(screenRows / 4)
    // Header (4 lines incl. the hint + its 2-row border), the output frame's
    // border (2), and the host's own chrome are all subtracted so the box cannot
    // run past the screen edge.
    const rows = Math.max(6, screenRows - topOffset - 12)
    debug('dialog.metrics', { screenRows, cols, topOffset, rows })
    const palette = api.theme.current

    const dialogHeaderFor = () => {
      // A tinted bar, matching how the built-ins band their section headers. The
      // hint lives INSIDE the band so the whole header reads as one block, and
      // the bar carries the same border as the output frame below it.
      const bar = createElement('box')
      setProp(bar, 'flexDirection', 'column')
      setProp(bar, 'width', '100%')
      setProp(bar, 'border', true)
      setProp(bar, 'borderStyle', 'single')
      if (palette.border) setProp(bar, 'borderColor', palette.border)
      if (palette.backgroundElement) setProp(bar, 'backgroundColor', palette.backgroundElement)
      insertNode(bar, text(`⟡ ${session.title || session.id}`))
      insertNode(bar, text(formatDetail(session)))
      // The run timer sits in the band's bottom-right corner: a growing spacer
      // pushes it there, and as the last row it reads as the footer.
      const foot = createElement('box')
      setProp(foot, 'flexDirection', 'row')
      const hint = createElement('text')
      setProp(hint, 'flexGrow', 1)
      if (palette.textMuted) setProp(hint, 'fg', palette.textMuted)
      insertNode(hint, createTextNode('esc to close'))
      insertNode(foot, hint)
      const runTime = textLive(() => {
        const ms = elapsedMs()
        return ms === null ? '' : formatDuration(ms)
      })
      if (palette.textMuted) setProp(runTime, 'fg', palette.textMuted)
      insertNode(foot, runTime)
      insertNode(bar, foot)
      return bar
    }

    const framedOutput = () => {
      // A small inner border around the output area, so the scrollable region is
      // visually distinct from the surrounding dialog.
      const frame = createElement('box')
      setProp(frame, 'width', '100%')
      setProp(frame, 'border', true)
      setProp(frame, 'borderStyle', 'single')
      if (palette.border) setProp(frame, 'borderColor', palette.border)
      insertNode(
        frame,
        scrollboxFor(
          textLive(() => tail(buf(), TAIL_LINES)),
          rows
        )
      )
      return frame
    }

    api.ui.dialog.replace(
      () => slotElement(column([dialogHeaderFor(), framedOutput()])),
      () => {
        debug('dialog.closed', { id: session.id })
        if (timer) clearInterval(timer)
        timer = null
        if (tick) clearInterval(tick)
        tick = null
      }
    )
    // setSize must come AFTER replace: replace resets the size as part of
    // pushing the entry, so calling it before is silently overridden.
    // Size is a WIDTH (xlarge = 116 cols), so pick it from the terminal width —
    // the same thresholds opencode's own plugin manager uses, otherwise the
    // dialog is wider than a narrow terminal.
    api.ui.dialog.setSize(cols >= 128 ? 'xlarge' : cols >= 96 ? 'large' : 'medium')
    debug('dialog.opened', { id: session.id, size: api.ui.dialog.size, cols })
    timer = setInterval(load, POLL_MS)
    // A finished session's figure is fixed, so only a running one needs waking.
    if (!Number.isFinite(Date.parse(liveSession().exitAt ?? ''))) {
      tick = setInterval(() => setNow(Date.now()), 1000)
    }
  }

  /**
   * Drop one session, then refresh at once — waiting up to a poll interval for
   * the list to catch up would read as a click that did nothing.
   */
  const removeSession = async (session: PtySession): Promise<void> => {
    if (!origin) {
      api.ui.toast({ variant: 'warning', title: 'opencode-pty', message: 'PTY server unavailable' })
      return
    }
    const label = session.title || session.id
    let failure: unknown = null
    try {
      if (!(await cleanupSession(origin, String(session.id)))) {
        throw new Error('the server refused the request')
      }
      debug('remove.done', { id: session.id })
    } catch (e) {
      failure = e
      debug('remove.failed', { id: session.id, error: String(e) })
    }
    // Both toasts sit OUTSIDE that try, and both are best-effort: a throw from
    // the success toast must not be mistaken for a failed removal and reported
    // as one.
    try {
      if (failure) {
        api.ui.toast({
          variant: 'error',
          title: 'opencode-pty',
          message: `Could not remove ${label}: ${String(failure)}`,
        })
      } else {
        api.ui.toast({ variant: 'info', title: 'opencode-pty', message: `Removed ${label}` })
      }
    } catch (_) {
      /* toast is best-effort */
    }
    // force: the user is waiting on this one, so it must not be dropped.
    refresh(false, true).catch(() => {})
  }

  /**
   * Removing a RUNNING session kills a live process, so it is confirmed first; a
   * finished one is only a record, so its ✕ acts at once. DialogConfirm clears
   * itself after a choice, so neither branch touches the dialog stack.
   */
  const confirmRemove = (session: PtySession): void => {
    debug('row.remove', { id: session.id, status: session.status })
    // Only a healthy live process earns a confirmation. A `killing` session has
    // already been asked to die — cleanup merely drops the record — so gating on
    // anything but `running` would ask a question with one sane answer. This is
    // also why `isFinished`, which drives clear-finished, excludes `killing`:
    // that path must not race the process teardown.
    if (session.status !== 'running') {
      removeSession(session).catch(() => {})
      return
    }
    api.ui.dialog.replace(() =>
      api.ui.DialogConfirm({
        title: 'Remove PTY session',
        message:
          'Kill the running session \u201c' +
          (session.title || session.id) +
          '\u201d and remove it?',
        onConfirm: () => removeSession(session).catch(() => {}),
      })
    )
  }

  /**
   * Drop every finished session. Only ever touches non-running ones, so it needs
   * no confirmation; a partial failure is reported rather than hidden.
   */
  const clearFinished = async (): Promise<void> => {
    if (!origin) {
      api.ui.toast({ variant: 'warning', title: 'opencode-pty', message: 'PTY server unavailable' })
      return
    }
    const targets = finishedSessions(sessions())
    debug('clear-finished.start', { count: targets.length })
    const results = await Promise.all(
      targets.map((s) => cleanupSession(origin as string, String(s.id)).catch(() => false))
    )
    const failed = results.filter((ok) => !ok).length
    if (failed) {
      api.ui.toast({
        variant: 'error',
        title: 'opencode-pty',
        message: `Could not remove ${failed} of ${targets.length} finished sessions`,
      })
    }
    // force: the user is waiting on this one, so it must not be dropped.
    refresh(false, true).catch(() => {})
  }

  const rowFor = (session: PtySession) => {
    // Bullet and label are SEPARATE text elements in a row box, because `fg` is
    // only proven to work on text elements (opencode-tabs colours its labels
    // that way). Nesting a `span` inside a `text` and colouring the span — my
    // first attempt — silently rendered uncoloured.
    const row = createElement('box')
    setProp(row, 'flexDirection', 'row')
    const palette = api.theme.current
    const tone = rowTone(session)
    const toneColor =
      tone === 'success' ? palette.success : tone === 'error' ? palette.error : palette.textMuted
    const bullet = createElement('text')
    if (toneColor) setProp(bullet, 'fg', toneColor)
    insertNode(bullet, createTextNode(ROW_BULLET))
    insertNode(row, bullet)
    const label = createElement('text')
    if (palette.text) setProp(label, 'fg', palette.text)
    // Grow so the remove glyph is pushed to the panel's right edge.
    setProp(label, 'flexGrow', 1)
    insertNode(label, createTextNode(rowLabel(session)))
    insertNode(row, label)
    // The row opens the dialog on mouse UP, so the glyph must swallow BOTH
    // events, not just the one it acts on — otherwise the removal would also
    // open the dialog for the session the user just removed.
    const remove = createElement('text')
    if (palette.textMuted) setProp(remove, 'fg', palette.textMuted)
    insertNode(remove, createTextNode(REMOVE_GLYPH))
    setProp(remove, 'onMouseDown', (evt: unknown) => {
      stopPropagation(evt)
      debug('row.remove.mousedown', { id: session.id })
    })
    setProp(remove, 'onMouseUp', (evt: unknown) => {
      stopPropagation(evt)
      confirmRemove(session)
    })
    insertNode(row, remove)
    // Diagnose the mousedown-vs-mouseup ordering (see activate below).
    setProp(row, 'onMouseDown', () => debug('row.mousedown', { id: session.id }))
    setProp(row, 'onMouseUp', () => activate(session))
    return row
  }

  // Open the dialog on mouse UP, deferred one tick.
  //
  // Opening on mouse DOWN meant the dialog's click-outside dismissal then saw
  // the still-pending mouseup/click land outside the brand-new modal and closed
  // it in the same gesture. Waiting for mouseup and letting the trailing click
  // event pass before opening avoids that entirely.
  const activate = (session: PtySession): void => {
    debug('row.mouseup', { id: session.id })
    setTimeout(() => {
      debug('row.open', { id: session.id })
      openOutput(session).catch((e) => {
        // A click that silently does nothing is indistinguishable from a broken
        // panel, so say so out loud rather than only to the debug log.
        debug('row.open.failed', { error: String(e) })
        try {
          api.ui.toast({
            variant: 'error',
            title: 'opencode-pty',
            message: `Could not open ${session.title || session.id}: ${String(e)}`,
          })
        } catch (_) {
          /* toast is best-effort */
        }
      })
    }, 0)
  }

  // A collapsible header, matching the built-in sidebar items (MCP, File Tree,
  // Todo): chevron glyph, click to toggle, state persisted in kv. The count
  // stays visible while collapsed so the panel is still informative. It carries
  // the clear-finished action too — rendered only when something can be cleared.
  const headerFor = () => {
    const palette = api.theme.current
    const row = createElement('box')
    setProp(row, 'flexDirection', 'row')
    const toggle = createElement('text')
    // Grow so the clear action is pushed to the panel's right edge.
    setProp(toggle, 'flexGrow', 1)
    insert(toggle, () => headerLabel({ collapsed: collapsed(), status: status() }))
    setProp(toggle, 'onMouseDown', () => {
      const next = !collapsed()
      setCollapsed(next)
      api.kv.set(KV_COLLAPSED, next)
      // Expanding is the user asking to see the sessions, so it is the trigger
      // for starting the server — the only one. Dropping the resolved origin is
      // what makes the click a real retry: without it, refresh() would reuse a
      // stale origin instead of re-resolving. The cached origin is kept, because
      // resolveOrigin re-validates that one with a health probe. Clearing the
      // backoff and the remembered cause keeps a failure recoverable by clicking.
      // The panel defaults to collapsed, which keeps a start off the load path.
      if (!next) {
        origin = null
        bootstrapFailures = 0
        lastBootstrapError = null
        refresh(true).catch(() => {})
      }
    })
    insertNode(row, toggle)
    const clear = createElement('text')
    if (palette.textMuted) setProp(clear, 'fg', palette.textMuted)
    // Empty when nothing is finished: a zero-width element presents no hit
    // target, so the header never offers an action that would delete nothing.
    insert(clear, () => clearActionLabel(sessions()) || '')
    setProp(clear, 'onMouseDown', (evt: unknown) => {
      // Without this the click would also toggle the panel shut, hiding the very
      // list it is cleaning.
      stopPropagation(evt)
      clearFinished().catch(() => {})
    })
    insertNode(row, clear)
    return row
  }

  // ── sidebar panel ─────────────────────────────────────────────────────────
  api.slots.register({
    order: SLOT_ORDER,
    slots: {
      sidebar_content() {
        return slotElement(
          column([
            headerFor(),
            columnLive(() => {
              if (collapsed()) return []
              const list = sessions()
              if (!list.length) return [text('   (none)')]
              return list.map((s) => rowFor(s))
            }),
          ])
        )
      },
    },
  })

  api.lifecycle.onDispose(() => {
    disposed = true
    if (rootTimer) clearInterval(rootTimer)
    rootTimer = null
  })

  // Deliberately not awaited: opencode's TUI plugin loader awaits this factory
  // before the TUI is usable, so the factory must never wait on a refresh.
  refresh().catch(() => {})
  rootTimer = setInterval(() => {
    refresh().catch(() => {})
  }, POLL_MS)
}

export default { id: 'opencode-pty', tui } satisfies TuiPluginModule
