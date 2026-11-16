/**
 * Extract the newest origin found in a single text, or null.
 *
 * Newest within the text, not first, because the PTY server binds a fresh
 * random port on every start — an earlier mention is a dead port.
 */
export declare function matchServerUrl(text: unknown): string | null;
/**
 * Extract the newest origin across an ordered list of texts (oldest first), or
 * null. This is the function the plugin actually uses: it maps the session's
 * message texts through here and takes the result as the live origin.
 */
export declare function latestServerUrl(texts: unknown): string | null;
/**
 * The error the PTY plugin's command handler throws to signal it handled the
 * command itself.
 *
 * It is NOT a failure: the handler throws only after it has already started the
 * PTY server and posted the URL, using the throw to stop opencode running the
 * command's template. Reading it as an error is what made a working server look
 * unavailable.
 */
export declare const PTY_COMMAND_SENTINEL = "Command handled by PTY plugin";
export declare function isPtyCommandSentinel(error: unknown): boolean;
/**
 * The message worth remembering as the bootstrap's failure cause, or null when
 * there is nothing to report.
 *
 * The sentinel is not a failure — the plugin throws it only after it has started
 * the server and posted the URL — so recording it would report a working server
 * as unavailable.
 */
export declare function bootstrapFailureCause(error: unknown): string | null;
/**
 * Decode a `/api/sessions/:id/buffer/plain` response into displayable text.
 *
 * The endpoint returns a JSON envelope — `{ plain, byteLength }` — not a raw
 * body, and the content is CRLF-terminated (it is a terminal buffer).
 */
export declare function decodeBuffer(raw: unknown): string;
/** Every row carries the same bullet, matching the built-in sidebar items
 *  (MCP, File Tree, Todo); the colour carries the state instead. */
export declare const ROW_BULLET = "\u2022 ";
/**
 * A row's text WITHOUT its bullet, so the caller can colour the bullet
 * separately — the built-in sidebar items style the glyph and leave the label
 * in the normal text colour.
 */
export declare function rowLabel(session: unknown): string;
/**
 * Which theme colour a row's bullet should take.
 *
 * Returns a semantic key rather than a colour so it stays pure and testable —
 * the palette lookup belongs to the caller, which has the theme.
 */
export declare function rowTone(session: unknown): 'success' | 'error' | 'muted';
/**
 * Whether a session has stopped.
 *
 * `killing` is deliberately NOT finished: it is the transient state between the
 * kill request and the exit callback that reports `killed`, so treating it as
 * finished would let a clear race the process teardown.
 */
export declare function isFinished(session: unknown): boolean;
/** The sessions a "clear finished" acts on, kept in their list order. */
export declare function finishedSessions(list: unknown): Array<Record<string, unknown>>;
/**
 * The header's clear-action label, or null when there is nothing to clear.
 *
 * Returns null rather than a disabled label so the header never offers a control
 * that would delete nothing — and so it can never read as touching live sessions.
 */
export declare function clearActionLabel(list: unknown): string | null;
/** The collapsible header's text: chevron, panel name, status. */
export declare function headerLabel(input: {
    collapsed?: unknown;
    status?: unknown;
}): string;
/** Header block for the output dialog — the detail that does not fit a row.
 *
 *  Capped at TWO lines on purpose: every line spent here is a line unavailable
 *  to the output, and a taller header pushes the dialog past the screen bottom.
 */
export declare function formatDetail(session: unknown): string;
/**
 * Does this look like the PTY server's `/health` payload?
 *
 * Each published record is only a hint about where to look, so a candidate is
 * confirmed by this shape: another local service can answer on a loopback port
 * too — CUPS owns `[::1]:631` on the machine this was built on and returns an
 * HTML error page.
 */
export declare function isPtyHealth(value: unknown): boolean;
/**
 * The last `lines` lines of `text`, prefixed with `…` when anything was cut.
 *
 * Lives here rather than in the plugin so it can be tested: it decides what the
 * dialog shows, and an off-by-one would silently hide the newest output.
 */
export declare function tail(text: unknown, lines: number): string;
/**
 * How long a session has been running, as a compact label.
 *
 * Seconds zero-padded below an hour (`1m 05s`), minutes above it (`2h 07m`) —
 * the unit that matters is the leading one, and a bare `0s` beats a `NaN` or an
 * empty cell for a session whose timestamps are missing or inverted (a clock can
 * move backwards between the server and the panel).
 */
export declare function formatDuration(ms: unknown): string;
//# sourceMappingURL=lib.d.ts.map