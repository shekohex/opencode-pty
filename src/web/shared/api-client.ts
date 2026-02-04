// Type-safe API client for making HTTP requests with compile-time validation
// Uses the structured routes to ensure correct methods and parameters

import type { HealthResponse, PTYSessionInfo } from 'opencode-pty/web/shared/types'
import { routes } from './routes'

// Extract path parameters from route pattern at compile time
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- infer _ is intentional for type pattern matching
type ExtractParams<T extends string> = T extends `${infer _}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof ExtractParams<Rest>]: string | number }
  : // eslint-disable-next-line @typescript-eslint/no-unused-vars -- infer _ is intentional for type pattern matching
    T extends `${infer _}:${infer Param}`
    ? { [K in Param]: string | number }
    : Record<string, never>

// Get allowed methods for a route
type AllowedMethods<T> = T extends { methods: readonly string[] } ? T['methods'][number] : never

// Type-safe fetch options
type ApiFetchOptions<
  Route extends { path: string; methods: readonly string[] },
  Method extends AllowedMethods<Route>,
> = {
  method: Method
  params?: ExtractParams<Route['path']>
  body?: Method extends 'POST' ? unknown : never
  baseUrl?: string
}

// Build URL by replacing path parameters
function buildUrl(path: string, params?: Record<string, string | number>): string {
  if (!params) return path

  let result = path
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, String(value))
  }
  return result
}

// Type-safe fetch function
export async function apiFetch<
  Route extends { path: string; methods: readonly string[] },
  Method extends AllowedMethods<Route>,
>(route: Route, options: ApiFetchOptions<Route, Method>): Promise<Response> {
  const baseUrl = options.baseUrl || `${location.protocol}//${location.host}`
  const url = baseUrl + buildUrl(route.path, options.params)

  const fetchOptions: RequestInit = {
    method: options.method,
    headers: { 'Content-Type': 'application/json' },
  }

  if (options.body && options.method === 'POST') {
    fetchOptions.body = JSON.stringify(options.body)
  }

  return fetch(url, fetchOptions)
}

// Type-safe JSON fetch with response parsing
export async function apiFetchJson<
  Route extends { path: string; methods: readonly string[] },
  Method extends AllowedMethods<Route>,
  T = unknown,
>(route: Route, options: ApiFetchOptions<Route, Method>): Promise<T> {
  const response = await apiFetch(route, options)
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

// Factory function to create API client with fixed baseUrl (for tests)
export function createApiClient(baseUrl: string) {
  return {
    sessions: {
      list: () =>
        apiFetchJson<typeof routes.sessions, 'GET', PTYSessionInfo[]>(routes.sessions, {
          method: 'GET',
          baseUrl,
        }),

      create: (body: {
        command: string
        args?: string[]
        description?: string
        workdir?: string
      }) =>
        apiFetchJson<typeof routes.sessions, 'POST', PTYSessionInfo>(routes.sessions, {
          method: 'POST',
          body,
          baseUrl,
        }),

      clear: () =>
        apiFetchJson<typeof routes.sessions, 'DELETE', { success: boolean }>(routes.sessions, {
          method: 'DELETE',
          baseUrl,
        }),
    },

    session: {
      get: (params: { id: string }) =>
        apiFetchJson<typeof routes.session, 'GET', PTYSessionInfo>(routes.session, {
          method: 'GET',
          params,
          baseUrl,
        }),

      kill: (params: { id: string }) =>
        apiFetchJson<typeof routes.session, 'DELETE', { success: boolean }>(routes.session, {
          method: 'DELETE',
          params,
          baseUrl,
        }),

      input: (params: { id: string }, body: { data: string }) =>
        apiFetchJson<typeof routes.session.input, 'POST', { success: boolean }>(
          routes.session.input,
          { method: 'POST', params, body, baseUrl }
        ),

      cleanup: (params: { id: string }) =>
        apiFetchJson<typeof routes.session.cleanup, 'DELETE', { success: boolean }>(
          routes.session.cleanup,
          { method: 'DELETE', params, baseUrl }
        ),

      buffer: {
        raw: (params: { id: string }) =>
          apiFetchJson<
            typeof routes.session.buffer.raw,
            'GET',
            { raw: string; byteLength: number }
          >(routes.session.buffer.raw, { method: 'GET', params, baseUrl }),

        plain: (params: { id: string }) =>
          apiFetchJson<
            typeof routes.session.buffer.plain,
            'GET',
            { plain: string; byteLength: number }
          >(routes.session.buffer.plain, { method: 'GET', params, baseUrl }),
      },
    },

    health: () =>
      apiFetchJson<typeof routes.health, 'GET', HealthResponse>(routes.health, {
        method: 'GET',
        baseUrl,
      }),
  } as const
}

// Convenience API for browser use (auto-detects baseUrl from location)
export const api = createApiClient('')
