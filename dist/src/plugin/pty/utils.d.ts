export declare function buildSessionNotFoundError(id: string): Error;
/**
 * Helper to DRY up session-get/null-check logic
 * - manager: object with a getSession(id) or similar method
 * - id: session id
 * - fn: function called with session if found
 * - defaultValue: what to return if not found (default null)
 */
export declare function withSession<TSession, TResult>(manager: {
    getSession(id: string): TSession | null;
}, id: string, fn: (session: TSession) => TResult, defaultValue: TResult): TResult;
//# sourceMappingURL=utils.d.ts.map