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
 * Sends a request without a body and reads its JSON answer, sending `token` as
 * a bearer token when one is given. Failures carry the API's own `{ error }`
 * message when it sent one.
 */
async function request<T>(method: 'GET' | 'PUT', path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${BASE_URL}${path}`, { method, headers })
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

/** PUTs a resource whose path says it all, such as an enrollment, and reads back what the API made of it. */
export const apiPut = <T>(path: string, token?: string) => request<T>('PUT', path, token)
