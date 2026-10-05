import type { Song, SongSource } from '../../domain/Song';

export interface SharedEntry {
  source: SongSource;
  id: string;
  title: string;
  artist: string;
}

const PARAM = 'p';

/**
 * Builds and reads share links. A link carries only a source, an id, a title
 * and an artist per song, so it stays short. The receiver looks the full
 * details up again in whichever source they are using.
 */
export class ShareService {
  buildUrl(songs: Song[]): string {
    const entries = songs.map((song) => [song.source === 'spotify' ? 's' : 'p', song.id, song.title, song.artist]);
    const token = toBase64Url(JSON.stringify(entries));
    return `${window.location.origin}${window.location.pathname}#${PARAM}=${token}`;
  }

  /** Reads the playlist from the current address, if there is one. */
  readFromLocation(): SharedEntry[] | null {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const token = params.get(PARAM);
    if (!token) return null;
    try {
      const rows = JSON.parse(fromBase64Url(token)) as unknown;
      if (!Array.isArray(rows)) return null;
      const entries: SharedEntry[] = [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const [kind, id, title, artist] = row as [string, string, string, string];
        entries.push({ source: kind === 's' ? 'spotify' : 'preview', id: String(id), title: String(title), artist: String(artist) });
      }
      return entries;
    } catch {
      return null;
    }
  }

  /** Removes the share data from the address bar once it has been loaded. */
  clearFromLocation(): void {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
