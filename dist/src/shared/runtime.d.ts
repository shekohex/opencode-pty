export declare const RUNTIME_DIR_NAME = "opencode-pty";
/**
 * Where origin records live: per-user, and overridable so tests (and embedders)
 * can redirect it.
 *
 * `XDG_RUNTIME_DIR` is preferred on Linux — per-user, 0700, tmpfs-backed — while
 * macOS and Windows already hand out a per-user `tmpdir()`.
 */
export declare function runtimeDir(): string;
export interface OriginRecord {
    pid: number;
    hostname: string;
    port: number;
    directory?: string;
    worktree?: string;
    startedAt: number;
}
/** A stable, filename-safe key for a project path. */
export declare function projectKey(path: string): string;
/**
 * Publish this process's origin for a project. Returns the file written, or null
 * when no usable project path was supplied — an unkeyed record could not be
 * attributed to an instance, so it is not written at all.
 */
export declare function writeOrigin(input: {
    directory?: unknown;
    worktree?: unknown;
    hostname: string;
    port: number;
}): string | null;
/** Remove a published origin. Best-effort, and safe on null. */
export declare function removeOrigin(file: string | null): void;
/**
 * Every well-formed origin record.
 *
 * Records are never deleted here (see the header): a malformed or foreign file
 * is skipped, and whether a record is *live* is decided by the caller probing
 * it, not by this function.
 */
export declare function readOrigins(): OriginRecord[];
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
export declare function originsForProject(directory?: string, worktree?: string): OriginRecord[];
/**
 * Origins to probe for a record.
 *
 * A wildcard bind (`0.0.0.0`/`::`) is not a connectable address, so loopback is
 * probed instead; an IPv6 literal needs brackets in a URL.
 */
export declare function candidateOrigins(record: {
    hostname: string;
    port: number;
}): string[];
//# sourceMappingURL=runtime.d.ts.map