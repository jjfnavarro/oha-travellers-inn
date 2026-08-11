export const apiUrl =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const method = options?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && !navigator.onLine) {
    throw new Error(
      'The system is offline. Reconnect before saving any changes.',
    );
  }
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch {
    throw new Error(
      'The server could not be reached. Check the connection and try again.',
    );
  }
  const body: unknown =
    response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : 'The request could not be completed.';
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('oha:unauthorized'));
    }
    throw new Error(message);
  }
  return body as T;
}
