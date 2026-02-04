/**
 * Response helper classes for consistent JSON responses
 */

export class JsonResponse extends Response {
  constructor(data: unknown, status = 200, headers: Record<string, string> = {}) {
    super(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  }
}

export class ErrorResponse extends Response {
  constructor(message: string, status = 500, headers: Record<string, string> = {}) {
    super(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })
  }
}
