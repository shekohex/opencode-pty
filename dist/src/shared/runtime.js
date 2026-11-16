// Runtime discovery: the PTY server publishes its origin to a small file, so the
// sidebar can find it without /proc (Linux-only) and without scraping the chat.
//
// A file is used rather than an advisory lock because Bun exposes no flock API
// and Windows has no equivalent — but no lock is needed: `/health` is the
// liveness test, so the file only has to carry the address. Nothing here treats a
// record as authority; a reader validates every candidate by probing it.
//
// Two deliberate consequences of that:
//   - a reader NEVER deletes a record. PID liveness is namespace-sensitive (a
//     container's pid is not visible from the host) and a partial read looks like
//     corruption, so a reader cannot prove a record is stale. The owner removes
//     its own record on dispose; anything left over is simply ignored.
//   - writes are atomic (temp + rename), so a reader never sees a half-written
//     record.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const RUNTIME_DIR_NAME = 'opencode-pty';
/**
 * Where origin records live: per-user, and overridable so tests (and embedders)
 * can redirect it.
 *
 * `XDG_RUNTIME_DIR` is preferred on Linux — per-user, 0700, tmpfs-backed — while
 * macOS and Windows already hand out a per-user `tmpdir()`.
 */
export function runtimeDir() {
    const override = process.env.PTY_RUNTIME_DIR;
    if (override)
        return override;
    const xdg = process.env.XDG_RUNTIME_DIR;
    if (xdg)
        return join(xdg, RUNTIME_DIR_NAME);
    return join(tmpdir(), RUNTIME_DIR_NAME);
}
/** A stable, filename-safe key for a project path. */
export function projectKey(path) {
    return createHash('sha256').update(path).digest('hex').slice(0, 16);
}
/**
 * A path as it will be compared: symlinks resolved, so the server's view of a
 * project and the TUI's agree even when one went through a link. Falls back to
 * the literal path when it cannot be resolved (e.g. it no longer exists).
 */
function canonical(path) {
    if (typeof path !== 'string' || path === '')
        return undefined;
    try {
        return realpathSync(path);
    }
    catch (_) {
        return path;
    }
}
/**
 * Publish this process's origin for a project. Returns the file written, or null
 * when no usable project path was supplied — an unkeyed record could not be
 * attributed to an instance, so it is not written at all.
 */
export function writeOrigin(input) {
    try {
        // Accept only strings: the host's `worktree` is a domain object on the V2
        // API, and a non-string here used to reach createHash and throw.
        const directory = canonical(typeof input.directory === 'string' ? input.directory : undefined);
        const worktree = canonical(typeof input.worktree === 'string' ? input.worktree : undefined);
        const key = directory ?? worktree;
        if (!key)
            return null;
        const file = join(runtimeDir(), `${projectKey(key)}-${process.pid}.json`);
        const record = {
            pid: process.pid,
            hostname: input.hostname,
            port: input.port,
            ...(directory ? { directory } : {}),
            ...(worktree ? { worktree } : {}),
            startedAt: Date.now(),
        };
        mkdirSync(runtimeDir(), { recursive: true, mode: 0o700 });
        // Temp + rename: a reader either sees the whole record or does not see it.
        const temp = `${file}.tmp`;
        writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
        renameSync(temp, file);
        return file;
    }
    catch (_) {
        /* discovery is best-effort: never break the server over a temp file */
        return null;
    }
}
/** Remove a published origin. Best-effort, and safe on null. */
export function removeOrigin(file) {
    if (!file)
        return;
    try {
        rmSync(file, { force: true });
    }
    catch (_) {
        /* already gone */
    }
}
function isOriginRecord(value) {
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    return typeof v.pid === 'number' && typeof v.hostname === 'string' && typeof v.port === 'number';
}
/**
 * Every well-formed origin record.
 *
 * Records are never deleted here (see the header): a malformed or foreign file
 * is skipped, and whether a record is *live* is decided by the caller probing
 * it, not by this function.
 */
export function readOrigins() {
    let names;
    try {
        names = readdirSync(runtimeDir());
    }
    catch (_) {
        return []; // no runtime dir yet — nothing has been published
    }
    const records = [];
    for (const name of names) {
        if (!name.endsWith('.json'))
            continue;
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(join(runtimeDir(), name), 'utf8'));
        }
        catch (_) {
            continue; // half-written or foreign — ignore, never delete
        }
        if (isOriginRecord(parsed))
            records.push(parsed);
    }
    return records;
}
/**
 * The records for this project, most specific match first.
 *
 * Both sides know the project directory (V1 `PluginInput.directory`/`worktree`;
 * V2 `ctx.location.directory`; TUI `state.path.directory`/`worktree`), which is
 * what lets a record be attributed to the instance that wrote it — the job
 * `/proc` used to do by process ownership.
 *
 * `directory` is the precise key (two instances of one worktree differ by it),
 * so an exact directory match wins outright; `worktree` is only a fallback for a
 * host that could not supply one. Returning both kinds together would make two
 * instances in different subdirectories of one worktree ambiguous.
 */
export function originsForProject(directory, worktree) {
    const wantedDirectory = canonical(directory);
    const wantedWorktree = canonical(worktree);
    const records = readOrigins();
    if (wantedDirectory) {
        const exact = records.filter((record) => canonical(record.directory) === wantedDirectory);
        if (exact.length > 0)
            return exact;
    }
    if (wantedWorktree) {
        return records.filter((record) => canonical(record.worktree) === wantedWorktree);
    }
    return [];
}
/**
 * Origins to probe for a record.
 *
 * A wildcard bind (`0.0.0.0`/`::`) is not a connectable address, so loopback is
 * probed instead; an IPv6 literal needs brackets in a URL.
 */
export function candidateOrigins(record) {
    const wildcard = record.hostname === '0.0.0.0' || record.hostname === '::' || record.hostname === '';
    const hosts = wildcard
        ? ['[::1]', '127.0.0.1']
        : [record.hostname.includes(':') ? `[${record.hostname}]` : record.hostname];
    return hosts.map((host) => `http://${host}:${record.port}`);
}
//# sourceMappingURL=runtime.js.map