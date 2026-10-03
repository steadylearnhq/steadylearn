/** The API's base URL, without a trailing slash. */
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** A response the API answered with an error status. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Sends a request, with `body` as JSON when there is one, and reads its JSON
 * answer, sending `token` as a bearer token when one is given. Failures carry
 * the API's own `{ error }` message when it sent one.
 */
async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : response.statusText
    throw new ApiError(response.status, message)
  }
  return (await response.json()) as T
}

/** GETs a JSON resource. */
export const apiGet = <T>(path: string, token?: string) => request<T>('GET', path, token)

/** POSTs an action, with `body` when it takes one, and reads back what the API answered. */
export const apiPost = <T>(path: string, token?: string, body?: unknown) => request<T>('POST', path, token, body)

/** PUTs a resource, with `body` when the path doesn't say it all, and reads back what the API made of it. */
export const apiPut = <T>(path: string, token?: string, body?: unknown) => request<T>('PUT', path, token, body)

/** DELETEs a resource and reads back what the API answered. */
export const apiDelete = <T>(path: string, token?: string) => request<T>('DELETE', path, token)
