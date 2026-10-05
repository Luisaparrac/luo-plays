import { SpotifyAuth, SpotifyHttpError } from './SpotifyAuth';

/** Thin wrapper around fetch that adds the token and retries once on 401. */
export class SpotifyApi {
  constructor(private readonly auth: SpotifyAuth) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  put<T = void>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown, canRetry = true): Promise<T> {
    const token = await this.auth.getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && canRetry) {
      await this.auth.refresh();
      return this.request<T>(method, path, body, false);
    }
    if (!response.ok) {
      throw new SpotifyHttpError(response.status, await response.text());
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
