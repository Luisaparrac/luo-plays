const TOKENS_KEY = 'luo-plays.spotify.tokens';
const VERIFIER_KEY = 'luo-plays.spotify.verifier';
const STATE_KEY = 'luo-plays.spotify.state';
const HASH_KEY = 'luo-plays.spotify.pending-hash';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SpotifyProfile {
  displayName: string;
  product: string;
}

export type LoginOutcome = 'none' | 'ok' | 'denied' | 'error';

/** Thrown when Spotify answers with an HTTP error. */
export class SpotifyHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Handles the Spotify login with the "Authorization Code + PKCE" flow.
 * Everything happens in the browser and no client secret is involved.
 */
export class SpotifyAuth {
  private tokens: StoredTokens | null;

  constructor(
    private readonly clientId: string | undefined,
    private readonly redirectUri: string,
    private readonly scopes: readonly string[],
  ) {
    this.tokens = this.readTokens();
  }

  get isConfigured(): boolean {
    return Boolean(this.clientId);
  }

  get hasSession(): boolean {
    return this.tokens !== null;
  }

  /** Sends the visitor to Spotify's login page. */
  async startLogin(): Promise<void> {
    if (!this.clientId) {
      throw new Error('Falta el Client ID de Spotify (VITE_SPOTIFY_CLIENT_ID).');
    }
    const verifier = randomString(96);
    const challenge = toBase64Url(await sha256(verifier));
    const state = randomString(16);

    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);
    // A shared playlist link lives in the hash; keep it through the round trip.
    sessionStorage.setItem(HASH_KEY, window.location.hash);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: this.scopes.join(' '),
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  /** Call once at startup: finishes the login if we just came back from Spotify. */
  async completeLoginIfReturning(): Promise<LoginOutcome> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return 'none';

    const state = params.get('state');
    const expectedState = localStorage.getItem(STATE_KEY);
    const verifier = localStorage.getItem(VERIFIER_KEY);
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    this.restoreCleanUrl();

    if (error) return 'denied';
    if (!code || !state || state !== expectedState || !verifier || !this.clientId) return 'error';

    try {
      await this.requestTokens(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          code_verifier: verifier,
        }),
      );
      return 'ok';
    } catch {
      return 'error';
    }
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens) throw new Error('No hay sesión de Spotify.');
    if (Date.now() >= this.tokens.expiresAt) await this.refresh();
    return (this.tokens as StoredTokens).accessToken;
  }

  /** Trades the refresh token for a new access token. */
  async refresh(): Promise<void> {
    if (!this.tokens || !this.tokens.refreshToken || !this.clientId) {
      this.logout();
      throw new Error('La sesión de Spotify expiró.');
    }
    await this.requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id: this.clientId,
      }),
    );
  }

  logout(): void {
    this.tokens = null;
    localStorage.removeItem(TOKENS_KEY);
  }

  /** Reads the account and tells whether it is Premium. */
  async fetchProfile(): Promise<SpotifyProfile> {
    const token = await this.getAccessToken();
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new SpotifyHttpError(response.status, await response.text());
    }
    const data = (await response.json()) as { display_name?: string; id?: string; product?: string };
    return {
      displayName: data.display_name || data.id || 'tu cuenta',
      product: data.product ?? 'unknown',
    };
  }

  private async requestTokens(body: URLSearchParams): Promise<void> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      if (body.get('grant_type') === 'refresh_token') this.logout();
      throw new SpotifyHttpError(response.status, await response.text());
    }
    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens?.refreshToken ?? '',
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    localStorage.setItem(TOKENS_KEY, JSON.stringify(this.tokens));
  }

  private readTokens(): StoredTokens | null {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      return raw ? (JSON.parse(raw) as StoredTokens) : null;
    } catch {
      return null;
    }
  }

  private restoreCleanUrl(): void {
    const hash = sessionStorage.getItem(HASH_KEY) ?? '';
    sessionStorage.removeItem(HASH_KEY);
    window.history.replaceState(null, '', window.location.pathname + hash);
  }
}

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

function toBase64Url(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
