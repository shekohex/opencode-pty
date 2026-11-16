export function buildSessionNotFoundError(id) {
    return new Error(`PTY session '${id}' not found. Use pty_list to see active sessions.`);
}
/**
 * Helper to DRY up session-get/null-check logic
 * - manager: object with a getSession(id) or similar method
 * - id: session id
 * - fn: function called with session if found
 * - defaultValue: what to return if not found (default null)
 */
export function withSession(manager, id, fn, defaultValue) {
    const session = manager.getSession(id);
    if (!session)
        return defaultValue;
    return fn(session);
}
//# sourceMappingURL=utils.js.map