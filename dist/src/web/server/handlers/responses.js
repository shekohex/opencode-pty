/**
 * Response helper classes for consistent JSON responses
 */
export class JsonResponse extends Response {
    constructor(data, status = 200, headers = {}) {
        super(JSON.stringify(data), {
            status,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        });
    }
}
export class ErrorResponse extends Response {
    constructor(message, status = 500, headers = {}) {
        super(JSON.stringify({ error: message }), {
            status,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        });
    }
}
//# sourceMappingURL=responses.js.map