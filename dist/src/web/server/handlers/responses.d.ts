/**
 * Response helper classes for consistent JSON responses
 */
export declare class JsonResponse extends Response {
    constructor(data: unknown, status?: number, headers?: Record<string, string>);
}
export declare class ErrorResponse extends Response {
    constructor(message: string, status?: number, headers?: Record<string, string>);
}
//# sourceMappingURL=responses.d.ts.map