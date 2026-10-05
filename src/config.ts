/** Central place for everything that depends on the environment. */
export const config = {
  appName: 'Luo Plays',
  spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
  spotifyScopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
  ],
  seedCatalogUrl: `${import.meta.env.BASE_URL}seed-catalog.json`,
  /** Longest starter list we will resolve at startup. */
  maxSeedTracks: 30,
  /** Longest list a share link will carry. */
  maxShareSongs: 40,
} as const;

/**
 * Spotify only accepts redirect URIs registered in the dashboard, character
 * for character. Locally that is http://127.0.0.1:5173/ and in production
 * it is the public URL of the site with a trailing slash.
 */
export function spotifyRedirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
